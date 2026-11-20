import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';

// Find tree canopies in the aerial photo and plant a 3D tree on each one.
export function detectTrees(satCanvas, bounds, data, recs, max = 9000) {
  const cell = 2.2; const W = bounds.maxX - bounds.minX, H = bounds.maxZ - bounds.minZ;
  const gw = Math.min(2200, Math.round(W / cell)), gh = Math.min(2200, Math.round(H / cell));
  const sx = W / gw, sz = H / gh;
  const sc = document.createElement('canvas'); sc.width = gw; sc.height = gh; const sg = sc.getContext('2d', { willReadFrequently: true });
  sg.drawImage(satCanvas, 0, 0, gw, gh); const img = sg.getImageData(0, 0, gw, gh).data;
  const mc = document.createElement('canvas'); mc.width = gw; mc.height = gh; const mg = mc.getContext('2d', { willReadFrequently: true });
  const px = x => (x - bounds.minX) / sx, pz = z => (z - bounds.minZ) / sz;
  const fillRing = (r) => { mg.beginPath(); for (let i = 0; i < r.length; i += 2) i ? mg.lineTo(px(r[i]), pz(r[i + 1])) : mg.moveTo(px(r[i]), pz(r[i + 1])); mg.closePath(); mg.fill(); };
  mg.fillStyle = '#fff';
  for (const r of recs) fillRing(r.ring);
  for (const w of data.water || []) { const r = []; for (let i = 0; i < w.o.length; i++) r.push(w.o[i] / 10); fillRing(r); }
  for (const a of data.areas || []) if (/parking|pitch|stadium|track/.test(a.k)) { const r = []; for (let i = 0; i < a.o.length; i++) r.push(a.o[i] / 10); fillRing(r); }
  mg.strokeStyle = '#fff'; mg.lineCap = 'round';
  for (const p of data.paths || []) { const road = /primary|secondary|tertiary|residential|unclassified|service/.test(p.k); mg.lineWidth = (road ? 8 : 3) / sx; mg.beginPath(); for (let i = 0; i < p.p.length; i += 2) { const x = px(p.p[i] / 10), y = pz(p.p[i + 1] / 10); i ? mg.lineTo(x, y) : mg.moveTo(x, y); } mg.stroke(); }
  const mask = mg.getImageData(0, 0, gw, gh).data;
  const cands = [];
  const L = (i) => img[i] * 0.3 + img[i + 1] * 0.55 + img[i + 2] * 0.15;
  for (let y = 2; y < gh - 2; y++) for (let x = 2; x < gw - 2; x++) {
    const i = (y * gw + x) * 4; if (mask[i] > 40) continue;
    const r = img[i], g = img[i + 1], b = img[i + 2]; const l = L(i);
    if (!(g > r + 4 && g >= b && l < 92 && l > 14)) continue;
    // canopy is textured; lawns are smooth
    const v = Math.abs(l - L(i - 8)) + Math.abs(l - L(i + 8)) + Math.abs(l - L(i - gw * 4 * 2)) + Math.abs(l - L(i + gw * 4 * 2));
    if (v < 16 && l > 55) continue;
    let k = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = ((y + dy) * gw + x + dx) * 4; if (img[j + 1] > img[j] + 2 && L(j) < 95) k++; }
    if (k < 9) continue;
    cands.push([x, y, k, b > r + 2 && l < 50 ? 1 : 0]);
  }
  // shuffle then thin with a spacing grid
  for (let i = cands.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [cands[i], cands[j]] = [cands[j], cands[i]]; }
  const sp = 5.2, grid = new Map(); const out = [];
  const key = (gx, gz) => gx * 100000 + gz;
  for (const [x, y, k, conifer] of cands) {
    if (out.length >= max) break;
    const wx = bounds.minX + (x + Math.random()) * sx, wz = bounds.minZ + (y + Math.random()) * sz;
    const gx = Math.floor(wx / sp), gz = Math.floor(wz / sp); let ok = true;
    for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) { const arr = grid.get(key(gx + a, gz + b)); if (arr) for (const t of arr) if (Math.hypot(t[0] - wx, t[1] - wz) < sp) { ok = false; break; } }
    if (!ok) continue;
    const t = [wx, wz, 2.6 + (k / 25) * 3.6 + Math.random() * 1.2, conifer]; out.push(t);
    const kk = key(gx, gz); (grid.get(kk) || grid.set(kk, []).get(kk)).push(t);
  }
  for (const t of data.trees || []) if (out.length < max + 400) out.push([t[0] / 10, t[1] / 10, 3.5 + Math.random() * 2, /Picea|Pinus|Abies|Thuja|Taxus|spruce|pine/i.test(t[2] || '') || t[3] === 'needleleaved' ? 1 : 0]);
  return out;
}

const CANOPY_VS = `
  attribute float aSeed; varying float vSeed; varying vec3 vWorldN; varying vec3 vObjP; uniform float uTime, uWind;
`;
export function createTrees(scene, trees, shared, castShadow) {
  const group = new THREE.Group(); scene.add(group);
  const dec = trees.filter(t => !t[3]), con = trees.filter(t => t[3]);
  const seeds = n => new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: n }, () => Math.random())), 1);

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 1, 6).translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2e, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);

  let blob = new THREE.IcosahedronGeometry(1, 3); blob.deleteAttribute('normal'); blob.deleteAttribute('uv'); blob = mergeVertices(blob); const pos = blob.attributes.position;
  for (let i = 0; i < pos.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pos, i); const n = 1 + 0.16 * Math.sin(v.x * 5.1 + v.y * 3.3) * Math.cos(v.z * 4.7 - v.y * 2.1) + 0.08 * Math.sin(v.x * 11 + v.z * 9); v.multiplyScalar(n); pos.setXYZ(i, v.x, v.y, v.z); }
  blob.computeVertexNormals();
  const cone = mergeCones();

  const canopyMat = (kind) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, flatShading: false });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uTime: shared.uTime, uSeason: shared.uSeason, uSnow: shared.uSnow, uWind: shared.uWind });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + CANOPY_VS)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vSeed = aSeed; vObjP = position * 3.0 + aSeed * 17.0;
          float sway = sin(uTime * (1.1 + aSeed) + aSeed * 30.0) * 0.06 * uWind * (position.y + 1.0);
          transformed.x += sway; transformed.z += sway * 0.6;`)
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWorldN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying float vSeed; varying vec3 vWorldN; varying vec3 vObjP; uniform vec4 uSeason; uniform float uSnow;
          float th(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 c;
          ${kind === 'con' ? `
            c = pow(mix(vec3(0.13,0.24,0.15), vec3(0.18,0.30,0.18), vSeed), vec3(2.2));
          ` : `
            vec3 spr = vSeed > 0.86 ? (vSeed > 0.93 ? vec3(0.96,0.80,0.86) : vec3(0.97,0.95,0.92)) : mix(vec3(0.46,0.66,0.22), vec3(0.58,0.74,0.30), vSeed);
            vec3 sum = mix(vec3(0.20,0.36,0.14), vec3(0.30,0.44,0.18), vSeed);
            vec3 fal = vSeed < 0.16 ? vec3(0.52,0.16,0.07) : vSeed < 0.40 ? vec3(0.68,0.36,0.12) : vSeed < 0.64 ? vec3(0.72,0.56,0.20) : vSeed < 0.82 ? vec3(0.44,0.30,0.14) : vec3(0.30,0.38,0.17);
            vec3 win = vec3(0.27,0.24,0.21);
            c = pow(spr, vec3(2.2)) * uSeason.x + pow(sum, vec3(2.2)) * uSeason.y + pow(fal, vec3(2.2)) * uSeason.z + pow(win, vec3(2.2)) * uSeason.w;
            // bare branches in winter: alpha-hashed sparse canopy
            if (uSeason.w > 0.5 && th(floor(vObjP * 2.0)) > 0.34) discard;
          `}
          c *= 0.85 + 0.3 * th(floor(vObjP));
          c = mix(c, vec3(0.86,0.89,0.94), uSnow * smoothstep(0.35, 0.9, vWorldN.y) * ${kind === 'con' ? '0.85' : '0.6'});
          diffuseColor.rgb = c;`);
    };
    m.customProgramCacheKey = () => 'canopy-' + kind;
    return m;
  };
  const decMesh = new THREE.InstancedMesh(blob, canopyMat('dec'), dec.length);
  const conMesh = new THREE.InstancedMesh(cone, canopyMat('con'), con.length);
  decMesh.geometry.setAttribute('aSeed', seeds(dec.length));
  conMesh.geometry.setAttribute('aSeed', seeds(con.length));
  const d = new THREE.Object3D(); let ti = 0;
  dec.forEach((t, i) => {
    const r = t[2], h = r * 2.6 + 3;
    d.position.set(t[0], 0, t[1]); d.rotation.set(0, Math.random() * 6, 0); d.scale.set(1, h * 0.5, 1); d.updateMatrix(); trunks.setMatrixAt(ti++, d.matrix);
    d.position.set(t[0], h * 0.5 + r * 0.8, t[1]); d.scale.set(r, r * 0.86, r); d.updateMatrix(); decMesh.setMatrixAt(i, d.matrix);
  });
  con.forEach((t, i) => {
    const r = t[2] * 0.8, h = r * 4 + 4;
    d.position.set(t[0], 0, t[1]); d.rotation.set(0, Math.random() * 6, 0); d.scale.set(0.8, h * 0.25, 0.8); d.updateMatrix(); trunks.setMatrixAt(ti++, d.matrix);
    d.position.set(t[0], h * 0.18, t[1]); d.scale.set(r, h * 0.42, r); d.updateMatrix(); conMesh.setMatrixAt(i, d.matrix);
  });
  trunks.count = ti;
  for (const m of [trunks, decMesh, conMesh]) { m.castShadow = castShadow; m.receiveShadow = true; m.frustumCulled = false; group.add(m); }
  return { group, count: trees.length };
}
function mergeCones() {
  const parts = [[1.0, 0.0, 1.0], [0.78, 0.55, 0.9], [0.55, 1.05, 0.8]];
  const geos = parts.map(([r, y, h]) => new THREE.ConeGeometry(r, h * 1.3, 8, 1, true).translate(0, y + h * 0.65, 0).toNonIndexed());
  const total = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3); let o = 0;
  for (const g of geos) { g.computeVertexNormals(); P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); return geo;
}
