// Runs in the Vercel sandbox (open internet). Fetches real Notre Dame geometry from OpenStreetMap,
// projects it to local meters around the Golden Dome, and uploads campus.json to Supabase Storage.
import fs from 'node:fs';

const SUPA = process.env.SUPA_URL, KEY = process.env.SUPA_KEY;
const S = 41.6895, W = -86.2585, N = 41.7135, E = -86.2185;
const BB = `(${S},${W},${N},${E})`;
const LAT0 = 41.70305, LNG0 = -86.23898; // Golden Dome
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
const P = (lat, lng) => [Math.round((lng - LNG0) * KX * 10), Math.round(-(lat - LAT0) * KZ * 10)]; // decimeters

const q = `[out:json][timeout:180];(
 way["building"]${BB}; relation["building"]${BB}; way["building:part"]${BB}; relation["building:part"]${BB};
 way["natural"="water"]${BB}; relation["natural"="water"]${BB};
 way["highway"]${BB};
 node["natural"="tree"]${BB}; way["natural"="tree_row"]${BB};
 way["leisure"~"pitch|park|stadium|track|garden"]${BB};
 way["amenity"="parking"]${BB};
 way["natural"~"wood|scrub|wetland"]${BB}; relation["natural"="wood"]${BB};
 way["landuse"~"grass|forest|meadow|cemetery"]${BB};
 way["amenity"="university"]["name"~"Notre Dame"]; relation["amenity"="university"]["name"~"Notre Dame"];
 node["historic"]${BB}; node["tourism"~"artwork|attraction"]${BB}; node["amenity"~"place_of_worship|fountain"]${BB};
);out geom;`;

async function overpass() {
  for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const r = await fetch(host, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'domer-os/1.0 (campus visualization)' } });
      if (!r.ok) { console.log(host, r.status); continue; }
      const j = await r.json(); console.log('overpass ok', host, j.elements.length); return j;
    } catch (e) { console.log(host, e.message); }
  }
  throw new Error('all overpass mirrors failed');
}

const num = v => { if (v == null) return null; const m = String(v).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
function dp(pts, tol) { // Douglas-Peucker on [[x,z],...] (decimeters)
  if (pts.length < 4) return pts;
  if (pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) { let m = 1, md = -1; for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > md) { md = d; m = i; } } return dp(pts.slice(0, m + 1), tol).concat(dp(pts.slice(m), tol).slice(1)); }
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b]; const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const ringOf = geom => dp(geom.map(g => P(g.lat, g.lon)), 3);
function joinWays(ways) { // join open member ways into closed rings
  const segs = ways.map(w => w.slice()); const rings = [];
  while (segs.length) {
    let cur = segs.shift(); let guard = 0;
    while ((cur[0][0] !== cur.at(-1)[0] || cur[0][1] !== cur.at(-1)[1]) && guard++ < 500) {
      const end = cur.at(-1); const i = segs.findIndex(s => (s[0][0] === end[0] && s[0][1] === end[1]) || (s.at(-1)[0] === end[0] && s.at(-1)[1] === end[1]));
      if (i < 0) break; let s = segs.splice(i, 1)[0]; if (s[0][0] !== end[0] || s[0][1] !== end[1]) s = s.reverse(); cur = cur.concat(s.slice(1));
    }
    if (cur.length >= 4) rings.push(cur);
  }
  return rings;
}
function polys(el) { // -> [{outer, holes}]
  if (el.type === 'way' && el.geometry) return [{ outer: el.geometry.map(g => P(g.lat, g.lon)), holes: [] }];
  if (el.type === 'relation' && el.members) {
    const outers = joinWays(el.members.filter(m => m.role !== 'inner' && m.geometry).map(m => m.geometry.map(g => P(g.lat, g.lon))));
    const inners = joinWays(el.members.filter(m => m.role === 'inner' && m.geometry).map(m => m.geometry.map(g => P(g.lat, g.lon))));
    return outers.map(o => ({ outer: o, holes: inners.filter(h => pip(h[0], o)) }));
  }
  return [];
}
function pip([x, z], ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }
const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2) / 100; }; // m²
const cen = r => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };

const osm = await overpass();
const els = osm.elements;
const campusPolys = els.filter(e => e.tags && e.tags.amenity === 'university' && /Notre Dame/.test(e.tags.name || '') && !/Saint Mary|Holy Cross/.test(e.tags.name || '')).flatMap(polys).map(p => p.outer);
console.log('campus polys', campusPolys.length);
const [cx0, cz0] = P(41.7115, -86.2560), [cx1, cz1] = P(41.6925, -86.2275);
const inCampus = c => (c[0] >= cx0 && c[0] <= cx1 && c[1] >= cz0 && c[1] <= cz1) || campusPolys.some(r => pip(c, r));

const DEF = { house: 7, detached: 7, garage: 3, garages: 3, shed: 3, university: 15, college: 15, school: 12, church: 18, cathedral: 22, chapel: 9, dormitory: 15, residential: 12, apartments: 14, commercial: 11, retail: 7, hotel: 18, stadium: 30, sports_centre: 16, parking: 12, roof: 5, service: 6, greenhouse: 5, hospital: 18, office: 14, yes: 10 };
const out = { origin: { lat: LAT0, lng: LNG0, kx: KX, kz: KZ }, generated: new Date().toISOString(), attribution: '© OpenStreetMap contributors (ODbL)', campus: campusPolys.map(r => dp(r, 5).flat()), buildings: [], parts: [], water: [], paths: [], trees: [], areas: [], pois: [] };
let named = [];
for (const e of els) {
  const t = e.tags || {};
  if (t.building || t['building:part']) {
    if (t.building === 'construction') continue;
    for (const p of polys(e)) {
      const outer = dp(p.outer, 3); if (outer.length < 4) continue;
      const a = area(outer); if (a < 6) continue;
      const c = cen(outer); const camp = inCampus(c);
      const lv = num(t['building:levels']); const mlv = num(t['building:min_level']);
      let h = num(t.height) ?? (lv != null ? lv * 3.6 + (t['roof:shape'] && t['roof:shape'] !== 'flat' ? 2 : 0.8) : null);
      const hSrc = h != null;
      if (h == null) { h = DEF[t.building] ?? 10; if (camp && a > 2500) h = Math.max(h, 16); if (camp && a > 8000) h = Math.max(h, 20); }
      const mh = num(t.min_height) ?? (mlv != null ? mlv * 3.6 : 0);
      const b = { id: e.type[0] + e.id, o: outer.flat(), h: +h.toFixed(1) };
      if (mh) b.mh = +mh.toFixed(1);
      if (p.holes.length) b.holes = p.holes.map(hh => dp(hh, 3).flat());
      if (t.name) b.n = t.name; if (t.start_date) b.y = t.start_date; if (camp) b.c = 1; if (!hSrc) b.est = 1;
      const k = t.building || t['building:part']; if (k && k !== 'yes') b.k = k;
      for (const [src, dst] of [['roof:shape', 'rs'], ['roof:height', 'rh'], ['roof:colour', 'rc'], ['building:colour', 'bc'], ['building:material', 'bm'], ['roof:material', 'rm'], ['amenity', 'am']]) if (t[src]) b[dst] = src === 'roof:height' ? num(t[src]) : t[src];
      (t['building:part'] && !t.building ? out.parts : out.buildings).push(b);
      if (t.name && camp) named.push(`${t.name}|${t.start_date || ''}|${t['building:levels'] || ''}|${t.height || ''}|${Math.round(a)}`);
    }
  } else if (t.natural === 'water') {
    for (const p of polys(e)) out.water.push({ n: t.name, o: dp(p.outer, 6).flat(), holes: p.holes.map(h => dp(h, 6).flat()) });
  } else if (t.highway && e.geometry) {
    const keep = /footway|path|pedestrian|service|residential|primary|secondary|tertiary|cycleway|steps|unclassified|living_street|track/.test(t.highway); if (!keep) continue;
    out.paths.push({ k: t.highway, w: num(t.width), s: t.surface, p: dp(e.geometry.map(g => P(g.lat, g.lon)), 4).flat(), a: t.area === 'yes' ? 1 : 0 });
  } else if (t.natural === 'tree' && e.type === 'node') {
    const tr = P(e.lat, e.lon); tr.push(t.genus || t.species || t.taxon || '', t.leaf_type || '', num(t.height) || 0); out.trees.push(tr);
  } else if (t.natural === 'tree_row' && e.geometry) {
    const g = e.geometry; for (let i = 0; i < g.length - 1; i++) { const a = P(g[i].lat, g[i].lon), b = P(g[i + 1].lat, g[i + 1].lon); const L = Math.hypot(b[0] - a[0], b[1] - a[1]) / 10; const n = Math.max(1, Math.floor(L / 9)); for (let k = 0; k < n; k++) out.trees.push([Math.round(a[0] + (b[0] - a[0]) * k / n), Math.round(a[1] + (b[1] - a[1]) * k / n), '', '', 0]); }
  } else if (t.leisure || t.amenity === 'parking' || t.natural || t.landuse) {
    const kind = t.leisure || (t.amenity === 'parking' ? 'parking' : t.natural || t.landuse);
    for (const p of polys(e)) out.areas.push({ k: kind, sp: t.sport, n: t.name, o: dp(p.outer, 6).flat() });
  } else if (e.type === 'node' && t.name) {
    out.pois.push({ n: t.name, k: t.historic || t.tourism || t.amenity, p: P(e.lat, e.lon) });
  }
}
console.log('buildings', out.buildings.length, 'parts', out.parts.length, 'campus bldgs', out.buildings.filter(b => b.c).length, 'water', out.water.length, 'paths', out.paths.length, 'trees', out.trees.length, 'areas', out.areas.length, 'pois', out.pois.length);
const s = JSON.stringify(out); fs.writeFileSync('campus.json', s); console.log('bytes', s.length);
fs.writeFileSync('named.txt', [...new Set(named)].sort().join('\n'));
const r = await fetch(`${SUPA}/storage/v1/object/campus/v1/campus.json`, { method: 'POST', headers: { apikey: KEY, authorization: 'Bearer ' + KEY, 'content-type': 'application/json', 'x-upsert': 'true', 'cache-control': '86400' }, body: s });
console.log('upload', r.status, await r.text());
