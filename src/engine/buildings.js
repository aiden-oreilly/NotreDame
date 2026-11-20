import * as THREE from 'three';
import { metaFor, slug, LOST } from '../data/meta.js';
import { centroid, obb, pointInPoly, hash } from '../geo.js';

const STYLE = { brick: 0, limestone: 1, modern: 2, concrete: 3, house: 4, log: 5, dome: 6 };

// Shared vertex-side era animation, injected into both the color and depth materials.
const ERA_VS_PARS = `attribute vec4 aB; attribute vec4 aI; attribute float aU; uniform float uEra; varying float vVis; varying vec4 vB; varying vec4 vI; varying float vU; varying vec3 vWPos;`;
const ERA_VS_BODY = `
  float vis = smoothstep(aB.y - 0.5, aB.y + 3.0, uEra) * (1.0 - smoothstep(aB.z - 0.5, aB.z + 3.0, uEra));
  vVis = vis; vB = aB; vI = aI; vU = aU;
  transformed.y = aI.y + (transformed.y - aI.y) * vis;
  if (vis < 0.002) transformed.y = -50.0;`;

export function buildCampus(data, shared) {
  const recs = [];          // building records for UI, routing and picking
  const P = [], N = [], U = [], BI = [], II = [];
  let bid = 0;
  const push = (x, y, z, nx, ny, nz, u, b, info) => { P.push(x, y, z); N.push(nx, ny, nz); U.push(u); BI.push(...b); II.push(...info); };

  const all = [...data.buildings.map(b => ({ ...b, part: false })), ...(data.parts || []).map(b => ({ ...b, part: true }))];
  for (const b of all) {
    const ring = []; for (let i = 0; i < b.o.length; i += 2) ring.push(b.o[i] / 10, b.o[i + 1] / 10);
    if (ring.length >= 4 && ring[0] === ring[ring.length - 2] && ring[1] === ring[ring.length - 1]) ring.length -= 2;
    if (ring.length < 6) continue;
    const holes = (b.holes || []).map(h => { const r = []; for (let i = 0; i < h.length; i += 2) r.push(h[i] / 10, h[i + 1] / 10); if (r[0] === r[r.length - 2] && r[1] === r[r.length - 1]) r.length -= 2; return r; }).filter(r => r.length >= 6);
    const meta = metaFor(b.n);
    const yr = parseInt(String(b.y || '').match(/\d{4}/)?.[0] || '0', 10);
    const c = centroid(ring);
    const campus = !!b.c;
    let built = meta?.built ?? (yr || (campus ? (b.k === 'house' ? 1925 : 1960) : 1925));
    const demo = meta?.demolished ?? 9999;
    let top = b.part ? b.h : (meta?.h ?? b.h);
    if (!campus && b.est) top = /garage|shed/.test(b.k || '') ? 3.2 : 6.5 + hash(c.x * 0.13 + c.z) * 1.5;
    const base = b.mh || 0;
    const styleName = meta?.style || (campus ? (b.k === 'house' ? 'house' : (b.bm === 'glass' ? 'modern' : 'brick')) : 'house');
    const style = STYLE[styleName] ?? 0;
    const id = bid++;
    const seed = hash(id * 3.17 + 1.3);
    const info = (kind) => [kind, base, top, seed];
    const B = [id, built, demo, style];
    const isStadium = /^Notre Dame Stadium$/.test(b.n || '') && holes.length;
    const rec = { id, name: b.n || null, slug: b.n ? slug(b.n) : null, osm: b.id, cx: c.x, cz: c.z, h: top, base, built, demo, campus, meta, ring, holes, kind: b.k || null, part: b.part };
    recs.push(rec);

    const inMaterial = (x, z) => pointInPoly(x, z, ring) && !holes.some(h => pointInPoly(x, z, h));
    const walls = (r, from, to) => {
      const n = r.length / 2; let u = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n; const ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1];
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.05) continue;
        let nx = dz / L, nz = -dx / L;
        if (inMaterial((ax + bx) / 2 + nx * 0.4, (az + bz) / 2 + nz * 0.4)) { nx = -nx; nz = -nz; }
        // face normal of (A,B,C) is (-dz,0,dx); choose winding so the front face points outward
        const flip = (-dz * nx + dx * nz) < 0;
        const A = [ax, from, az, u], Bv = [bx, from, bz, u + L], C = [bx, to, bz, u + L], D = [ax, to, az, u];
        const tri = flip ? [A, C, Bv, A, D, C] : [A, Bv, C, A, C, D];
        for (const v of tri) push(v[0], v[1], v[2], nx, 0, nz, v[3], B, info(0));
        u += L;
      }
    };
    const flatRoof = (y) => {
      const contour = []; for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i], ring[i + 1]));
      const hv = holes.map(h => { const a = []; for (let i = 0; i < h.length; i += 2) a.push(new THREE.Vector2(h[i], h[i + 1])); return a; });
      let faces; try { faces = THREE.ShapeUtils.triangulateShape(contour, hv); } catch { return; }
      const pts = contour.concat(...hv);
      for (const f of faces) {
        const a = pts[f[0]], bb = pts[f[1]], cc = pts[f[2]];
        const ny = (bb.y - a.y) * (cc.x - a.x) - (bb.x - a.x) * (cc.y - a.y); // y of (b-a)x(c-a) in xz
        const order = ny >= 0 ? [a, bb, cc] : [a, cc, bb];
        for (const p of order) push(p.x, y, p.y, 0, 1, 0, 0, B, info(1));
      }
    };
    const quad = (p0, p1, p2, p3, kind) => { // planar quad, normal from geometry, front facing outward/up
      const e1 = new THREE.Vector3().subVectors(p1, p0), e2 = new THREE.Vector3().subVectors(p2, p0); const n = e1.cross(e2).normalize();
      if (n.y < -0.01) { [p1, p3] = [p3, p1]; n.negate(); }
      for (const p of [p0, p1, p2, p0, p2, p3]) push(p.x, p.y, p.z, n.x, n.y, n.z, 0, B, info(kind));
    };
    const tri = (p0, p1, p2, kind) => { const e1 = new THREE.Vector3().subVectors(p1, p0), e2 = new THREE.Vector3().subVectors(p2, p0); const n = e1.cross(e2).normalize(); if (n.y < -0.01) { [p1, p2] = [p2, p1]; n.negate(); } for (const p of [p0, p1, p2]) push(p.x, p.y, p.z, n.x, n.y, n.z, 0, B, info(kind)); };

    if (isStadium) { stadiumBowl(ring, holes[0], top, B, seed, push); continue; }

    walls(ring, base, top); for (const h of holes) walls(h, base, top);
    const box = obb(ring);
    const rect = box ? Math.abs(polyArea(ring)) / box.area : 0;
    const rs = (b.rs || '').toLowerCase();
    const wantsPitch = (!campus && style === STYLE.house && box && box.W < 22) || /gabled|hipped|pyramidal|gambrel|mansard/.test(rs);
    if (/dome|onion/.test(rs) || styleName === 'dome') {
      flatRoof(top); domeRoof(box, top, b.rh, B, info, push);
    } else if (wantsPitch && box && rect > 0.82 && !holes.length) {
      const rh = b.rh || Math.min(box.W * 0.42, 6.5);
      pitchedRoof(box, top, rh, /hipped|pyramidal/.test(rs) || (!campus && hash(id) > 0.6), quad, tri, B, info);
    } else flatRoof(top);
  }

  // Lost buildings (only appear in the eras they stood)
  for (const L of LOST) {
    if (L.kind !== 'hall') continue;
    const id = bid++; const B = [id, L.built, L.demolished, STYLE.brick]; const seed = hash(id);
    const info = k => [k, 0, L.h, seed];
    const hw = L.w / 2, hd = L.d / 2; const r = [L.x - hw, L.z - hd, L.x + hw, L.z - hd, L.x + hw, L.z + hd, L.x - hw, L.z + hd];
    recs.push({ id, name: L.name, slug: slug(L.name), cx: L.x, cz: L.z, h: L.h, base: 0, built: L.built, demo: L.demolished, campus: true, meta: { blurb: L.blurb, cat: 'lost' }, ring: r, holes: [], lost: true });
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; const ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1]; const dx = bx - ax, dz = bz - az, Ln = Math.hypot(dx, dz); const nx = -dz / Ln, nz = dx / Ln; for (const v of [[ax, 0, az, 0], [bx, L.h, bz, Ln], [bx, 0, bz, Ln], [ax, 0, az, 0], [ax, L.h, az, 0], [bx, L.h, bz, Ln]]) push(v[0], v[1], v[2], nx, 0, nz, v[3], B, info(0)); }
    const box = { cx: L.x, cz: L.z, L: L.w, W: L.d, ax: 1, az: 0 };
    const quad = (p0, p1, p2, p3, kind) => { const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize(); if (n.y < 0) { [p1, p3] = [p3, p1]; n.negate(); } for (const p of [p0, p1, p2, p0, p2, p3]) push(p.x, p.y, p.z, n.x, n.y, n.z, 0, B, info(kind)); };
    const tri = (p0, p1, p2, kind) => { const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize(); if (n.y < 0) { [p1, p2] = [p2, p1]; n.negate(); } for (const p of [p0, p1, p2]) push(p.x, p.y, p.z, n.x, n.y, n.z, 0, B, info(kind)); };
    pitchedRoof(box, L.h, 9, false, quad, tri, B, info);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('aU', new THREE.Float32BufferAttribute(U, 1));
  geo.setAttribute('aB', new THREE.Float32BufferAttribute(BI, 4));
  geo.setAttribute('aI', new THREE.Float32BufferAttribute(II, 4));
  geo.computeBoundingSphere();

  const mat = makeBuildingMaterial(shared);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.customDepthMaterial = makeDepthMaterial(shared);
  mesh.frustumCulled = false;
  return { mesh, recs, material: mat };
}

function polyArea(p) { let a = 0; for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1]; return a / 2; }

function pitchedRoof(box, h, rh, hipped, quad, tri, B, info) {
  const { cx, cz, L, W, ax, az } = box; const px = -az, pz = ax;
  const P = (a, b, y) => new THREE.Vector3(cx + ax * a + px * b, y, cz + az * a + pz * b);
  const hl = L / 2, hw = W / 2, r = hipped ? Math.max(0, hl - hw) : hl;
  const e = [P(-hl, -hw, h), P(hl, -hw, h), P(hl, hw, h), P(-hl, hw, h)];
  const r0 = P(-r, 0, h + rh), r1 = P(r, 0, h + rh);
  quad(e[0], e[1], r1, r0, 1); quad(e[2], e[3], r0, r1, 1);
  if (hipped) { tri(e[1], e[2], r1, 1); tri(e[3], e[0], r0, 1); }
  else { tri(e[1], e[2], r1, 0); tri(e[3], e[0], r0, 0); }
}

function domeRoof(box, h, rh, B, info, push) {
  if (!box) return;
  const { cx, cz, L, W, ax, az } = box; const px = -az, pz = ax; const ry = rh || Math.min(L, W) * 0.38;
  const S = 28, R = 9; const v = (i, j) => { const th = i / S * Math.PI * 2, ph = j / R * Math.PI / 2; const a = Math.cos(th) * Math.cos(ph) * L / 2, b = Math.sin(th) * Math.cos(ph) * W / 2; return new THREE.Vector3(cx + ax * a + px * b, h + Math.sin(ph) * ry, cz + az * a + pz * b); };
  for (let i = 0; i < S; i++) for (let j = 0; j < R; j++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    for (const [p0, p1, p2] of [[a, c, b], [a, d, c]]) { const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize(); if (n.y < 0) n.negate(); for (const p of [p0, p1, p2]) push(p.x, p.y, p.z, n.x, n.y, n.z, 0, B, info(1)); }
  }
}

// Stadium: brick outer wall, raked seating bowl from the field wall up to the rim.
function stadiumBowl(outer, inner, H, B, seed, push) {
  const c = centroid(inner); const S = 180;
  const sample = (r, ang) => { // ray-cast from centroid to ring at angle
    const dx = Math.cos(ang), dz = Math.sin(ang); let best = 0; const n = r.length / 2;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; const x1 = r[i * 2] - c.x, z1 = r[i * 2 + 1] - c.z, x2 = r[j * 2] - c.x, z2 = r[j * 2 + 1] - c.z; const ex = x2 - x1, ez = z2 - z1; const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue; const t = (x1 * ez - z1 * ex) / den, s = (x1 * dz - z1 * dx) / den; if (t > 0 && s >= 0 && s <= 1) best = Math.max(best, t); }
    return { x: c.x + dx * best, z: c.z + dz * best };
  };
  const O = [], I = []; for (let k = 0; k <= S; k++) { const a = k / S * Math.PI * 2; O.push(sample(outer, a)); I.push(sample(inner, a)); }
  const info = k => [k, 0, H, seed]; let u = 0;
  for (let k = 0; k < S; k++) {
    const o0 = O[k], o1 = O[k + 1], i0 = I[k], i1 = I[k + 1];
    const L = Math.hypot(o1.x - o0.x, o1.z - o0.z);
    // outer facade
    let nx = (o0.z - o1.z), nz = (o1.x - o0.x); const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    if ((o0.x - c.x) * nx + (o0.z - c.z) * nz < 0) { nx = -nx; nz = -nz; }
    const fa = [[o0.x, 0, o0.z, u], [o1.x, 0, o1.z, u + L], [o1.x, H, o1.z, u + L], [o0.x, H, o0.z, u]];
    const fl = (-(o1.z - o0.z) * nx + (o1.x - o0.x) * nz) < 0;
    for (const v of (fl ? [fa[0], fa[2], fa[1], fa[0], fa[3], fa[2]] : [fa[0], fa[1], fa[2], fa[0], fa[2], fa[3]])) push(v[0], v[1], v[2], nx, 0, nz, v[3], B, info(0));
    // seating rake (kind 2) from field wall (y=4) up to rim
    const a = new THREE.Vector3(i0.x, 4, i0.z), b = new THREE.Vector3(i1.x, 4, i1.z), cc = new THREE.Vector3(o1.x, H - 1, o1.z), d = new THREE.Vector3(o0.x, H - 1, o0.z);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize(); const up = n.y < 0 ? n.negate() : n;
    const order = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(cc, a)).y >= 0 ? [a, b, cc, a, cc, d] : [a, cc, b, a, d, cc];
    for (const p of order) push(p.x, p.y, p.z, up.x, up.y, up.z, u, B, info(2));
    // field wall
    let wx = (i1.z - i0.z), wz = -(i1.x - i0.x); const wl = Math.hypot(wx, wz) || 1; wx /= wl; wz /= wl; if ((i0.x - c.x) * wx + (i0.z - c.z) * wz > 0) { wx = -wx; wz = -wz; }
    const wa = [[i0.x, 0, i0.z], [i1.x, 0, i1.z], [i1.x, 4, i1.z], [i0.x, 4, i0.z]];
    const wf = (-(i1.z - i0.z) * wx + (i1.x - i0.x) * wz) < 0;
    for (const v of (wf ? [wa[0], wa[2], wa[1], wa[0], wa[3], wa[2]] : [wa[0], wa[1], wa[2], wa[0], wa[2], wa[3]])) push(v[0], v[1], v[2], wx, 0, wz, 0, B, info(3));
    // rim cap
    const r0 = new THREE.Vector3(o0.x, H, o0.z), r1 = new THREE.Vector3(o1.x, H, o1.z), r2 = new THREE.Vector3(o1.x * 0.985 + c.x * 0.015, H, o1.z * 0.985 + c.z * 0.015), r3 = new THREE.Vector3(o0.x * 0.985 + c.x * 0.015, H, o0.z * 0.985 + c.z * 0.015);
    const ro = new THREE.Vector3().subVectors(r1, r0).cross(new THREE.Vector3().subVectors(r2, r0)).y >= 0 ? [r0, r1, r2, r0, r2, r3] : [r0, r2, r1, r0, r3, r2];
    for (const p of ro) push(p.x, p.y, p.z, 0, 1, 0, 0, B, info(1));
    u += L;
  }
}

function makeBuildingMaterial(shared) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uEra: shared.uEra, uNight: shared.uNight, uSnow: shared.uSnow, uHist: shared.uHist, uSel: shared.uSel, uHover: shared.uHover, uSatTex: shared.uSatTex, uHasSat: shared.uHasSat, uSatBounds: shared.uSatBounds, uTime: shared.uTime });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + ERA_VS_PARS + '\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + ERA_VS_BODY)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vVis; varying vec4 vB; varying vec4 vI; varying float vU; varying vec3 vWPos; varying vec3 vWN;
        uniform float uNight, uSnow, uHist, uSel, uHover, uHasSat, uTime; uniform sampler2D uSatTex; uniform vec4 uSatBounds;
        float bh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
        vec3 styleColor(float s, float seed){
          if (s < 0.5) return srgb(mix(vec3(0.80,0.70,0.52), vec3(0.86,0.76,0.58), seed));   // Notre Dame buff brick
          if (s < 1.5) return srgb(mix(vec3(0.82,0.78,0.69), vec3(0.88,0.84,0.75), seed));   // Indiana limestone
          if (s < 2.5) return srgb(vec3(0.62,0.66,0.70));                                    // glass and steel
          if (s < 3.5) return srgb(vec3(0.72,0.70,0.66));                                    // concrete
          if (s < 4.5) { vec3 a = seed < 0.2 ? vec3(0.88,0.86,0.80) : seed < 0.4 ? vec3(0.62,0.66,0.66) : seed < 0.6 ? vec3(0.66,0.47,0.36) : seed < 0.8 ? vec3(0.76,0.73,0.64) : vec3(0.48,0.53,0.60); return srgb(a); }
          if (s < 5.5) return srgb(vec3(0.42,0.30,0.19));
          return srgb(vec3(0.80,0.81,0.82));
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vVis < 0.01) discard;
        float kind = vI.x, style = vB.w, seed = vI.w;
        vec3 col = styleColor(style, seed);
        float winMask = 0.0; float lit = 0.0;
        if (kind < 0.5 && style != 6.0) {
          float floorH = style > 3.5 ? 3.0 : 3.7; float colW = style == 2.0 ? 2.2 : style == 1.0 ? 3.0 : style > 3.5 ? 4.2 : 3.4;
          float ly = vWPos.y - vI.y; float fy = ly / floorH; float fu = vU / colW;
          vec2 cell = vec2(floor(fu), floor(fy));
          float wx = fract(fu), wy = fract(fy);
          float ww = style == 2.0 ? 0.42 : 0.24; float wt = style == 2.0 ? 0.92 : 0.80;
          // anti-aliased window grid: fades to an average tone where cells get smaller than a few pixels
          vec2 fw = vec2(fwidth(fu), fwidth(fy)); float aa = 1.0 - smoothstep(0.08, 0.35, max(fw.x, fw.y));
          vec2 e2 = max(fw * 1.5, vec2(0.002));
          float inWin = smoothstep(ww - e2.x, ww + e2.x, wx) * (1.0 - smoothstep(1.0 - ww - e2.x, 1.0 - ww + e2.x, wx)) * smoothstep(0.28 - e2.y, 0.28 + e2.y, wy) * (1.0 - smoothstep(wt - e2.y, wt + e2.y, wy));
          inWin *= step(0.6, ly) * step(ly, (vI.z - vI.y) - 1.0);
          if (style > 3.5) inWin *= step(0.45, bh(cell + seed));
          winMask = inWin;
          // brick/stone coursing
          float course = smoothstep(0.0, 0.08, abs(fract(ly / 0.62) - 0.5)) * 0.06;
          col *= 0.94 + course + (bh(floor(vec2(vU * 2.0, ly * 3.0)) + seed) - 0.5) * 0.05;
          // cornice and plinth
          col *= mix(0.78, 1.0, smoothstep(0.0, 1.2, ly));
          col *= 1.0 + 0.10 * smoothstep(vI.z - vI.y - 1.0, vI.z - vI.y - 0.4, ly);
          vec3 glass = mix(vec3(0.05,0.065,0.08), vec3(0.16,0.19,0.22), bh(cell * 1.7 + seed));
          float cover = (1.0 - 2.0 * ww) * (wt - 0.28);
          vec3 avg = mix(col, glass, cover * 0.75);
          col = mix(avg, mix(col, glass, inWin), aa);
          inWin *= aa;
          lit = inWin * step(0.48, bh(cell + seed * 7.0 + 3.0)) * uNight;
        } else if (kind > 0.5 && kind < 1.5) {
          // roofs: the actual aerial photograph of each roof when available, slate otherwise
          vec2 uv = (vWPos.xz - uSatBounds.xy) / (uSatBounds.zw - uSatBounds.xy);
          vec3 sat = texture2D(uSatTex, vec2(uv.x, 1.0 - uv.y)).rgb;
          vec3 slate = style > 3.5 ? srgb(vec3(0.33,0.31,0.30)) : srgb(mix(vec3(0.30,0.33,0.36), vec3(0.40,0.47,0.42), step(0.8, seed)));
          col = mix(slate, sat, uHasSat * (1.0 - uHist));
          col = mix(col, vec3(0.88,0.9,0.95), uSnow * smoothstep(0.2, 0.9, vWN.y) * 0.95);
        } else if (kind > 1.5 && kind < 2.5) {
          float row = fract(vU * 0.0 + vWPos.y * 1.25);
          col = srgb(mix(vec3(0.22,0.24,0.28), vec3(0.36,0.38,0.42), step(0.5, row)));
          col = mix(col, vec3(0.85,0.88,0.93), uSnow * 0.8);
        } else { col = srgb(vec3(0.20,0.28,0.45)); }
        // era patina
        col = mix(col, col * vec3(1.02, 0.97, 0.9), uHist * 0.4);
        diffuseColor.rgb = col;
        float sel = 1.0 - step(0.5, abs(vB.x - uSel));
        float hov = 1.0 - step(0.5, abs(vB.x - uHover));
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.12, winMask);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.6, winMask);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * lit * (0.6 + 0.6 * bh(vec2(seed, 3.1)));
        totalEmissiveRadiance += vec3(0.85, 0.62, 0.15) * sel * (0.10 + 0.05 * sin(uTime * 3.0));
        totalEmissiveRadiance += vec3(0.6, 0.6, 0.6) * hov * 0.05;`);
  };
  mat.customProgramCacheKey = () => 'bldg-v3';
  return mat;
}

function makeDepthMaterial(shared) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = sh => {
    sh.uniforms.uEra = shared.uEra;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + ERA_VS_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + ERA_VS_BODY);
  };
  m.customProgramCacheKey = () => 'bldg-depth-v3';
  return m;
}
