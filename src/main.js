import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CORE, CONTEXT, toWorld } from './geo.js';
import { ERAS, metaFor } from './data/meta.js';
import { createRenderer, createComposer } from './engine/renderer.js';
import { createSky, localDate } from './engine/sky.js';
import { stitchImagery, paintHistoricGround, createGround } from './engine/ground.js';
import { buildCampus } from './engine/buildings.js';
import { buildLandmarks } from './engine/landmarks.js';
import { detectTrees, createTrees } from './engine/trees.js';
import { createWater, createWeather, createLamps } from './engine/environment.js';
import { buildWalkGraph, entranceNode, shortestPath, createRouteLayer } from './engine/route.js';
import { createCamera } from './engine/camera.js';
import { initStore, store } from './app/store.js';
import { initUI } from './app/ui.js';

const $ = s => document.querySelector(s);
const canvas = $('#gl');
const { renderer, caps } = createRenderer(canvas);
let tier = (() => { try { return localStorage.getItem('domer.quality') || caps.tier; } catch { return caps.tier; } })();
$('#quality').value = tier;
if (tier === 'battery') renderer.setPixelRatio(1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb9cde0, 2600, 9000);
const cam = createCamera(canvas); const { camera, controls } = cam;
const { composer, grade, bloom, gtao } = createComposer(renderer, scene, camera, tier);

const shared = {
  uEra: { value: 2026 }, uNight: { value: 0 }, uSnow: { value: 0 }, uHist: { value: 0 }, uSeason: { value: new THREE.Vector4(0, 0, 1, 0) },
  uSel: { value: -1 }, uHover: { value: -1 }, uSatTex: { value: null }, uHasSat: { value: 0 }, uSatBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
  uTime: { value: 0 }, uWind: { value: 1 },
};
const sky = createSky(scene, renderer, tier);
const ground = createGround(scene, shared);
const weather = createWeather(scene);
const route = createRouteLayer(scene);

// ---------- world state ----------
const world = {
  THREE, scene, camera, controls, cam, renderer, shared, caps, tier,
  data: null, recs: [], directory: [], bySlug: new Map(), graph: null, landmarks: null,
  eraTarget: 2026, eraFrom: 2026, eraT: 1, season: 'live', tod: null, weatherNow: null,
  liveSeason: seasonFor(new Date()),
};
window.__domer = world; // handy for debugging in the console

function seasonFor(d) { const m = d.getMonth() + 1; return m >= 3 && m <= 5 ? 'spring' : m <= 8 && m >= 6 ? 'summer' : m >= 9 && m <= 11 ? 'fall' : 'winter'; }
const SEASON_VEC = { spring: [1, 0, 0, 0], summer: [0, 1, 0, 0], fall: [0, 0, 1, 0], winter: [0, 0, 0, 1] };
const SEASON_DATE = { spring: [4, 22], summer: [7, 15], fall: [10, 18], winter: [1, 20] };
// Live mode blends seasons by calendar day so late November reads as mostly bare, not peak color.
function liveVec(d = new Date()) {
  const doy = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5;
  const k = [[0,0,0,0,1],[75,0,0,0,1],[110,1,0,0,0],[150,0,1,0,0],[245,0,1,0,0],[275,0,0.15,0.85,0],[300,0,0,1,0],[318,0,0,0.35,0.65],[335,0,0,0,1],[366,0,0,0,1]];
  for (let i = 1; i < k.length; i++) if (doy <= k[i][0]) { const a = k[i-1], b = k[i], f = (doy - a[0]) / (b[0] - a[0] || 1); return [1,2,3,4].map(j => a[j] + (b[j] - a[j]) * f); }
  return [0,0,0,1];
}
SEASON_VEC.live = liveVec();
const seasonTarget = new THREE.Vector4(...SEASON_VEC.live);
let snowTarget = 0, weatherMode = 0, weatherAmt = 0, cloud = 0.25;

function effectiveSeason() { return world.season === 'live' ? world.liveSeason : world.season; }
function sunDate() {
  const now = new Date();
  if (world.season === 'live' && world.tod == null) return now;
  const s = effectiveSeason();
  const y = now.getFullYear();
  const [m, d] = world.season === 'live' ? [now.getMonth() + 1, now.getDate()] : SEASON_DATE[s];
  const hour = world.tod ?? (() => { const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now); const o = Object.fromEntries(f.map(p => [p.type, p.value])); return (+o.hour % 24) + (+o.minute) / 60; })();
  return localDate(y, m, d, hour);
}
world.setSeason = (s) => {
  world.season = s; const e = effectiveSeason(); seasonTarget.set(...(s === 'live' ? SEASON_VEC.live : SEASON_VEC[e]));
  const live = world.weatherNow; const code = live?.weather_code ?? -1;
  const snowing = (code >= 71 && code <= 77) || code === 85 || code === 86; const raining = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  if (s === 'live') { snowTarget = snowing ? 0.85 : e === 'winter' && (live?.temperature_2m ?? 30) < 34 ? 0.55 : 0; weatherMode = snowing ? 1 : raining ? 2 : e === 'fall' ? 3 : 0; weatherAmt = snowing || raining ? 0.75 : e === 'fall' ? 0.12 : 0; cloud = (live?.cloud_cover ?? 25) / 100; }
  else { snowTarget = e === 'winter' ? 0.9 : 0; weatherMode = e === 'winter' ? 1 : e === 'spring' ? 2 : e === 'fall' ? 3 : 4; weatherAmt = e === 'winter' ? 0.8 : e === 'spring' ? 0.35 : e === 'fall' ? 0.25 : 0.5; cloud = e === 'spring' ? 0.45 : e === 'winter' ? 0.35 : 0.15; }
  ground.skirt.material.color.set(e === 'winter' ? 0xd7dce4 : e === 'fall' ? 0x5a5332 : e === 'spring' ? 0x52683a : 0x3e5530);
  world.emit?.('season');
};
world.setEra = (year) => {
  world.eraFrom = shared.uEra.value; world.eraTarget = year; world.eraT = 0;
  world.eraDur = Math.min(4.2, 1.2 + Math.abs(year - world.eraFrom) / 45);
  const era = ERAS.find(e => e.year === year);
  const g = era?.grade || 'none';
  world.gradeTarget = { sepia: g === 'albumen' ? 1 : 0, mono: g === 'silver' ? 1 : 0, fade: g === 'kodachrome' ? 1 : 0, sat: g === 'kodachrome' ? 0.82 : 1, hist: year < 2000 ? 1 : 0 };
  world.emit?.('era', era);
};
world.gradeTarget = { sepia: 0, mono: 0, fade: 0, sat: 1, hist: 0 };
world.setTod = (h) => { world.tod = h; };
world.setQuality = (q) => { try { localStorage.setItem('domer.quality', q); } catch { /* ignore */ } if ((q === 'cinematic') !== !!gtao || q !== tier) location.reload(); };

// ---------- picking ----------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
function pick(ev) {
  if (!world.mesh) return null; const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(world.mesh, false);
  for (const h of hits) { const id = world.mesh.geometry.attributes.aB.getX(h.face.a); const rec = world.recs[id]; if (rec && shared.uEra.value >= rec.built - 0.5 && shared.uEra.value < rec.demo) return { rec, point: h.point }; }
  return null;
}
let down = null, hoverT = 0;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || performance.now() - down.t > 600; down = null; if (moved) return;
  const p = pick(e); world.select(p ? p.rec : null, { fly: false });
});
canvas.addEventListener('pointermove', e => { if (e.buttons || performance.now() - hoverT < 70) return; hoverT = performance.now(); const p = pick(e); shared.uHover.value = p ? p.rec.id : -1; canvas.style.cursor = p ? 'pointer' : ''; });

world.select = (rec, { fly = true } = {}) => {
  world.selected = rec || null; shared.uSel.value = rec ? rec.id : -1;
  if (rec && fly) cam.flyTo(new THREE.Vector3(rec.cx, Math.min(rec.h, 40) * 0.4, rec.cz), { dist: Math.max(170, Math.sqrt(polyAreaAbs(rec.ring)) * 3.2 + rec.h * 2), el: 30 });
  world.emit?.('select', rec);
};
const polyAreaAbs = p => { let a = 0; for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1]; return Math.abs(a / 2); };
world.overview = () => cam.flyTo(new THREE.Vector3(60, 0, 140), { az: 200, el: 38, dist: 1500, dur: 3 });
world.walk = (fromRec, toRec) => {
  if (!world.graph || !fromRec || !toRec) return null;
  const a = entranceNode(world.graph, fromRec), b = entranceNode(world.graph, toRec); if (a < 0 || b < 0) return null;
  const r = shortestPath(world.graph, a, b); if (!r) return null;
  route.set(r.path); world.routeInfo = { ...r, from: fromRec, to: toRec };
  const xs = r.path.map(p => p[0]), zs = r.path.map(p => p[1]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  cam.flyTo(new THREE.Vector3(cx, 0, cz), { dist: Math.max(260, span * 1.5), el: 52 });
  world.emit?.('route', world.routeInfo); return r;
};
world.clearRoute = () => { route.clear(); world.routeInfo = null; world.emit?.('route', null); };
world.walkMinutes = (fromRec, toRec) => { if (!world.graph) return null; const a = entranceNode(world.graph, fromRec), b = entranceNode(world.graph, toRec); if (a < 0 || b < 0) return null; const r = shortestPath(world.graph, a, b); return r ? r.minutes : null; };
world.findBuilding = (text) => {
  if (!text || !world.index) return null; const t = ' ' + text.toLowerCase().replace(/[’]/g, "'") + ' ';
  let best = null, bl = 0; for (const [term, rec, re] of world.index) { if (term.length > bl && (re ? re.test(t) : t.includes(term))) { best = rec; bl = term.length; } }
  return best;
};

// ---------- intro ----------
const steps = $('#introSteps'); const bar = $('#introBar');
const step = (txt, val, p) => { const li = document.createElement('li'); li.innerHTML = `<span>${txt}</span><b>${val ?? ''}</b>`; steps.appendChild(li); while (steps.children.length > 5) steps.firstChild.remove(); if (p != null) bar.style.width = (p * 100) + '%'; };

// ---------- boot ----------
async function boot() {
  camera.position.set(-2200, 1700, 2600); controls.target.set(0, 0, 120);
  initStore().catch(e => console.warn(e));
  fetch(CONFIG.weatherUrl).then(r => r.json()).then(j => { world.weatherNow = j.current; world.setSeason(world.season); world.emit?.('weather', j.current); }).catch(() => { /* offline */ });
  step('Surveying 1,261 acres', '', 0.06);
  let data;
  try { const r = await fetch(CONFIG.campusUrl); data = await r.json(); }
  catch (e) { step('Campus data unreachable', 'retrying', 0.1); await new Promise(r => setTimeout(r, 1500)); const r = await fetch(CONFIG.campusUrl); data = await r.json(); }
  world.data = data;
  step('Footprints from OpenStreetMap', data.buildings.length.toLocaleString(), 0.22);

  const { mesh, recs } = buildCampus(data, shared); scene.add(mesh); world.mesh = mesh; world.recs = recs;
  world.directory = recs.filter(r => r.name && r.campus && !r.part).sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set(); world.directory = world.directory.filter(r => !seen.has(r.name) && seen.add(r.name));
  for (const r of world.directory) world.bySlug.set(r.slug, r);
  world.index = [];
  for (const r of world.directory) {
    const terms = new Set([r.name.toLowerCase(), r.name.toLowerCase().replace(/ hall$| center$| building$/, ''), ...((r.meta?.codes) || [])]);
    for (const t of terms) if (t && t.length >= 2) world.index.push([t, r, t.length < 6 ? new RegExp(`[^a-z]${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`) : null]);
  }
  step('Raising the Golden Dome', '1882', 0.34);
  world.landmarks = buildLandmarks(scene, recs, data, shared);
  const water = createWater(scene, data, shared); world.water = water;
  step('Filling St. Mary’s and St. Joseph’s lakes', data.water.length, 0.42);
  const lamps = createLamps(scene, data, caps.mobile ? 500 : 1400); world.lamps = lamps;
  world.graph = buildWalkGraph(data);
  step('Mapping walks and quads', world.graph.nodes.length.toLocaleString() + ' nodes', 0.5);

  const cb = toWorld(CORE.n, CORE.w), ce = toWorld(CORE.s, CORE.e);
  const coreBounds = { minX: cb.x, maxX: ce.x, minZ: cb.z, maxZ: ce.z };
  ground.setHistoric(paintHistoricGround(data, coreBounds, 'old'), coreBounds);
  shared.uSatBounds.value.set(coreBounds.minX, coreBounds.minZ, coreBounds.maxX, coreBounds.maxZ);
  ground.setCore(null, coreBounds);
  world.emit?.('data');

  // aerial imagery: quick pass first, sharper pass after
  const big = !caps.mobile && caps.maxTex >= 8192 && tier !== 'battery';
  step('Streaming aerial imagery', '', 0.56);
  let first;
  try {
    first = await stitchImagery(CORE, 17, p => { bar.style.width = (56 + p * 30) + '%'; }, Math.min(caps.maxTex, 4096));
    if (first.failed > first.total * 0.5) throw new Error('imagery blocked');
    applySat(first);
    step('Aerial photography', `${first.total} tiles`, 0.88);
  } catch (e) {
    console.warn('imagery unavailable, using painted ground', e);
    const modern = paintHistoricGround(data, coreBounds, 'modern'); const t = new THREE.CanvasTexture(modern); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    applySat({ canvas: modern, bounds: coreBounds, tex: t }); step('Painted campus ground', 'offline', 0.88);
  }
  // trees from the canopy in the photograph
  try {
    const trees = detectTrees(first?.canvas || document.createElement('canvas'), first?.bounds || coreBounds, data, recs, caps.mobile ? 3500 : tier === 'battery' ? 4500 : 9000);
    world.trees = createTrees(scene, trees, shared, tier === 'cinematic');
    step('Planting trees where they stand', world.trees.count.toLocaleString(), 0.96);
  } catch (e) { console.warn('trees', e); }
  finishIntro();
  stitchImagery(CONTEXT, 15, null, 4096).then(ctx => { const t = new THREE.CanvasTexture(ctx.canvas); t.colorSpace = THREE.SRGBColorSpace; ground.setContext(t, ctx.bounds); }).catch(() => { /* context is decorative */ });
  if (big && first && first.failed < first.total * 0.5) stitchImagery(CORE, 18, null, Math.min(caps.maxTex, (navigator.deviceMemory || 8) >= 8 ? 6144 : 4096)).then(hi => { if (hi.failed < hi.total * 0.3) { applySat(hi); world.emit?.('toast', 'Full-resolution imagery loaded'); } }).catch(() => { /* keep z17 */ });
}
function applySat(img) {
  const tex = img.tex || new THREE.CanvasTexture(img.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const old = shared.uSatTex.value; shared.uSatTex.value = tex; shared.uHasSat.value = 1;
  shared.uSatBounds.value.set(img.bounds.minX, img.bounds.minZ, img.bounds.maxX, img.bounds.maxZ);
  ground.setCore(tex, img.bounds);
  if (old && old !== tex) old.dispose();
}
let introDone = false;
function finishIntro() {
  if (introDone) return; introDone = true; bar.style.width = '100%';
  setTimeout(() => { $('#intro').classList.add('done'); cam.flyTo(new THREE.Vector3(-10, 10, 40), { az: 196, el: 24, dist: 520, dur: 5.5, arc: 0.05 }); world.emit?.('ready'); }, 500);
}
setTimeout(() => { if (!introDone && world.mesh) finishIntro(); }, 15000);

// ---------- loop ----------
const clock = new THREE.Clock(); let time = 0; let last = 0;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 0.25); const dt = Math.min(raw, 0.05); time += dt; shared.uTime.value = time;
  cam.update(raw);
  // era time-lapse
  if (world.eraT < 1) { world.eraT = Math.min(1, world.eraT + raw / world.eraDur); shared.uEra.value = world.eraFrom + (world.eraTarget - world.eraFrom) * ease(world.eraT); world.emit?.('eraTick', shared.uEra.value); }
  const k = 1 - Math.exp(-dt * 2.2), gt = world.gradeTarget, gu = grade.uniforms;
  gu.uSepia.value += (gt.sepia - gu.uSepia.value) * k; gu.uMono.value += (gt.mono - gu.uMono.value) * k; gu.uFade.value += (gt.fade - gu.uFade.value) * k; gu.uSat.value += (gt.sat - gu.uSat.value) * k; gu.uTime.value = time;
  shared.uHist.value += (gt.hist - shared.uHist.value) * k;
  shared.uSeason.value.lerp(seasonTarget, k); shared.uSnow.value += (snowTarget - shared.uSnow.value) * k * 0.7;
  const viewDist = camera.position.distanceTo(controls.target);
  const st = sky.update({ date: sunDate(), season: effectiveSeason(), cloud, target: controls.target, viewDist });
  shared.uNight.value = st.night;
  bloom.strength = 0.22 + st.night * 0.75; bloom.threshold = st.night > 0.5 ? 0.6 : 0.92;
  gu.uWarm.value = st.golden * 0.8 + (effectiveSeason() === 'fall' ? 0.25 : effectiveSeason() === 'winter' ? -0.35 : 0);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(0.62, 0.95, st.night) * (shared.uSnow.value > 0.5 ? 0.88 : 1);
  scene.fog.color.setHSL(0.6, 0.35, THREE.MathUtils.lerp(0.78, 0.06, st.night)); scene.fog.near = 1800 + cloud * -600; scene.fog.far = 8000 - cloud * 2500;
  if (world.water) { const u = world.water.mat.uniforms; u.uTime.value = time; u.uSun.value.copy(st.sunDir); u.uIce.value = shared.uSnow.value > 0.3 ? Math.min(1, shared.uSnow.value * 1.1) : 0; u.uNight.value = st.night; }
  if (world.landmarks) world.landmarks.update({ era: shared.uEra.value, night: st.night, time });
  if (world.lamps) world.lamps.update(st.night);
  const wu = weather.mat.uniforms; wu.uTime.value = time; wu.uMode.value = weatherMode; wu.uAmt.value += (weatherAmt - wu.uAmt.value) * k; wu.uCenter.value.copy(controls.target); wu.uNight.value = st.night; wu.uPx.value = renderer.getPixelRatio();
  weather.points.visible = wu.uAmt.value > 0.01 && viewDist < 2600;
  route.update(dt, time);
  world.emit?.('frame', { dt, time, night: st.night });
  composer.render(dt);
}
function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();
world.setSeason('live'); world.setEra(2026); world.eraT = 1; shared.uEra.value = 2026;
initUI(world, store);
frame();
boot().catch(e => { console.error(e); step('Something went wrong loading the campus', 'reload', 1); });
