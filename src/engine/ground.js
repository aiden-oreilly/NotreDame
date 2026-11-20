import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { CORE, CONTEXT, lon2tile, lat2tile, tile2lon, tile2lat, toWorld } from '../geo.js';

// Stitch slippy-map tiles for a lat/lng box into one canvas; returns canvas + world-space bounds.
export async function stitchImagery(box, z, onProgress, maxPx = 8192) {
  const x0 = Math.floor(lon2tile(box.w, z)), x1 = Math.floor(lon2tile(box.e, z));
  const y0 = Math.floor(lat2tile(box.n, z)), y1 = Math.floor(lat2tile(box.s, z));
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const scale = Math.min(1, maxPx / (Math.max(nx, ny) * 256));
  const ts = Math.floor(256 * scale);
  const cv = document.createElement('canvas'); cv.width = nx * ts; cv.height = ny * ts;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#4b5a3a'; ctx.fillRect(0, 0, cv.width, cv.height);
  const jobs = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) jobs.push([x, y]);
  // load center-out so the campus core appears first
  const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2; jobs.sort((a, b) => Math.hypot(a[0] - cxm, a[1] - cym) - Math.hypot(b[0] - cxm, b[1] - cym));
  let done = 0, failed = 0; let i = 0;
  const one = () => new Promise(res => {
    if (i >= jobs.length) return res(false);
    const [x, y] = jobs[i++];
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    img.onload = () => { ctx.drawImage(img, (x - x0) * ts, (y - y0) * ts, ts, ts); done++; onProgress && onProgress(done / jobs.length); res(true); };
    img.onerror = () => { failed++; done++; onProgress && onProgress(done / jobs.length); res(true); };
    img.src = CONFIG.imageryUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  });
  const worker = async () => { while (i < jobs.length) await one(); };
  await Promise.all(Array.from({ length: 10 }, worker));
  const nw = toWorld(tile2lat(y0, z), tile2lon(x0, z)), se = toWorld(tile2lat(y1 + 1, z), tile2lon(x1 + 1, z));
  return { canvas: cv, bounds: { minX: nw.x, maxX: se.x, minZ: nw.z, maxZ: se.z }, failed, total: jobs.length };
}

// Painted ground for eras before aerial photography and for offline fallback.
export function paintHistoricGround(data, bounds, era = 'old') {
  const S = 2048; const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  const W = bounds.maxX - bounds.minX, H = bounds.maxZ - bounds.minZ;
  const px = x => (x - bounds.minX) / W * S, pz = z => (z - bounds.minZ) / H * S;
  g.fillStyle = era === 'modern' ? '#5d7346' : '#66763f'; g.fillRect(0, 0, S, S);
  // field mottling
  for (let k = 0; k < 9000; k++) { const x = Math.random() * S, y = Math.random() * S, r = 6 + Math.random() * 40; g.fillStyle = `rgba(${70 + Math.random() * 40|0},${90 + Math.random() * 40|0},${40 + Math.random() * 20|0},0.10)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  const poly = (o, fill) => { g.beginPath(); for (let i = 0; i < o.length; i += 2) { const x = px(o[i] / 10), y = pz(o[i + 1] / 10); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fillStyle = fill; g.fill(); };
  for (const a of data.areas || []) { if (/wood|forest|scrub|wetland/.test(a.k)) poly(a.o, 'rgba(40,62,30,0.75)'); if (era === 'modern' && a.k === 'parking') poly(a.o, '#6f6f6b'); if (era === 'modern' && a.k === 'pitch') poly(a.o, '#4f7a3a'); }
  for (const w of data.water || []) poly(w.o, '#2c4a52');
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const p of data.paths || []) {
    const isRoad = /primary|secondary|tertiary|residential|unclassified|service/.test(p.k);
    if (era !== 'modern') {
      // only the historic walks of Main Quad, God Quad and the lake paths
      const mid = p.p.length >> 1; const cx = p.p[mid & ~1] / 10, cz = p.p[(mid & ~1) + 1] / 10;
      if (isRoad || Math.hypot(cx + 60, cz - 60) > 520) continue;
      g.strokeStyle = 'rgba(176,152,110,0.85)'; g.lineWidth = 2.6 / W * S * 2;
    } else { g.strokeStyle = isRoad ? '#55565a' : '#b9b2a2'; g.lineWidth = (isRoad ? 7 : 2.5) / W * S; }
    g.beginPath(); for (let i = 0; i < p.p.length; i += 2) { const x = px(p.p[i] / 10), y = pz(p.p[i + 1] / 10); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  }
  return cv;
}

// Satellite-textured ground with seasonal grading, snow cover and an era cross-fade.
export function createGround(scene, sharedUniforms) {
  const group = new THREE.Group(); scene.add(group);
  const uniforms = {
    uHistTex: { value: null }, uHist: sharedUniforms.uHist, uSeason: sharedUniforms.uSeason, uSnow: sharedUniforms.uSnow,
    uHasSat: { value: 0 }, uSatBounds: sharedUniforms.uSatBounds, uHistBounds: { value: new THREE.Vector4(0, 0, 1, 1) }, uTime: sharedUniforms.uTime,
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform sampler2D uHistTex; uniform float uHist, uSnow, uHasSat, uTime; uniform vec4 uSeason; uniform vec4 uSatBounds; uniform vec4 uHistBounds;
      float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float gn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(gh(i),gh(i+vec2(1,0)),f.x), mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*gn(p); p*=2.03; a*=0.5; } return s; }
      vec3 seasonal(vec3 c, vec2 wp){
        float mx = max(c.r, c.b); float veg = smoothstep(0.004, 0.05, c.g - mx);
        float lum = dot(c, vec3(0.2126,0.7152,0.0722));
        float canopy = veg * (1.0 - smoothstep(0.035, 0.11, lum));
        float lawn = veg * (1.0 - canopy);
        float n = fbm(wp * 0.035);
        // spring: fresh lime lawns, pale new canopy
        vec3 spring = c; spring = mix(spring, spring * vec3(1.02, 1.12, 0.82) + vec3(0.004, 0.012, 0.0), veg);
        // summer: deep, saturated
        vec3 summer = mix(c, c * vec3(0.92, 1.06, 0.86), veg);
        // fall: maples/oaks turn, lawns dry slightly
        vec3 fallTone = mix(vec3(0.28, 0.07, 0.015), vec3(0.42, 0.22, 0.02), n); fallTone = mix(fallTone, vec3(0.20, 0.13, 0.03), step(0.72, n));
        vec3 fall = mix(c, fallTone * (0.35 + lum * 5.0), canopy * 0.85);
        fall = mix(fall, fall * vec3(1.15, 1.0, 0.7), lawn * 0.6);
        // winter: bare canopy reads grey-brown before snow is applied
        vec3 bare = mix(vec3(lum) * vec3(1.05, 0.98, 0.9), vec3(0.06, 0.05, 0.045), 0.35);
        vec3 winter = mix(c * vec3(0.95, 0.97, 1.02), bare, veg * 0.85);
        return spring * uSeason.x + summer * uSeason.y + fall * uSeason.z + winter * uSeason.w;
      }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 wp = vWP.xz;
        vec3 sat = seasonal(diffuseColor.rgb, wp);
        vec2 huv = (wp - uHistBounds.xy) / (uHistBounds.zw - uHistBounds.xy);
        vec3 hist = texture2D(uHistTex, vec2(huv.x, 1.0 - huv.y)).rgb; hist = pow(hist, vec3(2.2));
        hist = seasonal(hist, wp);
        vec3 base = mix(hist, sat, uHasSat * (1.0 - uHist));
        // snow: deeper on open ground, thinner under canopy and on dark plowed pavement
        float lumB = dot(base, vec3(0.2126,0.7152,0.0722));
        float sn = uSnow * smoothstep(0.15, 0.75, fbm(wp * 0.08) * 0.5 + 0.55) * (1.0 - smoothstep(0.012, 0.004, lumB) * 0.55);
        vec3 snowCol = vec3(0.86, 0.89, 0.94) * (0.92 + 0.08 * gn(wp * 0.7));
        diffuseColor.rgb = mix(base, snowCol, clamp(sn, 0.0, 0.94));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, uSnow * 0.6);');
  };
  mat.customProgramCacheKey = () => 'ground-v1';
  let core = null, context = null;
  function setCore(tex, bounds) {
    if (core) { group.remove(core); core.geometry.dispose(); }
    const w = bounds.maxX - bounds.minX, d = bounds.maxZ - bounds.minZ;
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    mat.map = tex; mat.needsUpdate = true; uniforms.uHasSat.value = tex ? 1 : 0;
    core = new THREE.Mesh(geo, mat); core.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2); core.receiveShadow = true; group.add(core);
  }
  function setHistoric(canvas, b) { if (b) uniforms.uHistBounds.value.set(b.minX, b.minZ, b.maxX, b.maxZ); const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; uniforms.uHistTex.value = t; }
  function setContext(tex, bounds) {
    if (context) group.remove(context);
    const w = bounds.maxX - bounds.minX, d = bounds.maxZ - bounds.minZ;
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    const cm = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: 0xf0f0f0 });
    cm.onBeforeCompile = sh => { sh.uniforms.uSnow = uniforms.uSnow; sh.uniforms.uHist = uniforms.uHist; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSnow, uHist;').replace('#include <map_fragment>', '#include <map_fragment>\nfloat l = dot(diffuseColor.rgb, vec3(0.3,0.5,0.2)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85,0.88,0.93), uSnow*0.85); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16,0.2,0.1)*(0.7+l), uHist*0.9);'); };
    context = new THREE.Mesh(geo, cm); context.position.set((bounds.minX + bounds.maxX) / 2, -0.4, (bounds.minZ + bounds.maxZ) / 2); context.receiveShadow = false; group.add(context);
  }
  // Infinite-ish skirt to the horizon
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3e4a32, roughness: 1 }));
  skirt.position.y = -0.8; group.add(skirt);
  return { group, mat, uniforms, setCore, setContext, setHistoric, skirt };
}

export { CORE, CONTEXT };
