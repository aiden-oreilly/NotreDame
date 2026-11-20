import * as THREE from 'three';
import { obb, centroid } from '../geo.js';
import { LOST } from '../data/meta.js';

const srgb = (hex) => new THREE.Color(hex);
const GOLD = () => new THREE.MeshPhysicalMaterial({ color: 0xe9b949, metalness: 1, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1.6, emissive: 0x6b4a00, emissiveIntensity: 0 });

export function buildLandmarks(scene, recs, data, shared) {
  const group = new THREE.Group(); scene.add(group);
  const byName = n => recs.find(r => r.name === n);
  const items = []; // {obj, from, to}
  const add = (obj, from = 0, to = 9999) => { group.add(obj); items.push({ obj, from, to }); return obj; };
  const golds = [];
  const anchors = {};

  // ---------- Golden Dome on the Main Building ----------
  const mb = byName('Main Building');
  if (mb) {
    const box = obb(mb.ring); const cx = box ? box.cx : mb.cx, cz = box ? box.cz : mb.cz; const base = mb.h;
    const g = new THREE.Group(); g.position.set(cx, 0, cz);
    const cream = new THREE.MeshStandardMaterial({ color: srgb('#dccaa0'), roughness: 0.75 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.3, metalness: 0.4, emissive: 0xffb55a, emissiveIntensity: 0 });
    // stepped base and drum with a colonnade
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 12.5, 3, 32), cream); plinth.position.y = base + 1.5; g.add(plinth);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 9.6, 10, 48), cream); drum.position.y = base + 8; g.add(drum);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 8.6, 10), cream); col.position.set(Math.cos(a) * 10.1, base + 7.6, Math.sin(a) * 10.1); g.add(col);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.2), dark); win.position.set(Math.cos(a + Math.PI / 16) * 9.25, base + 8, Math.sin(a + Math.PI / 16) * 9.25); win.lookAt(Math.cos(a + Math.PI / 16) * 30, base + 8, Math.sin(a + Math.PI / 16) * 30); g.add(win);
    }
    const cornice = new THREE.Mesh(new THREE.CylinderGeometry(10.8, 10.8, 1.1, 48), cream); cornice.position.y = base + 12.6; g.add(cornice);
    // the dome: a slightly elongated hemisphere in gold leaf with raised ribs
    const gold = GOLD(); golds.push(gold);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9.6, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.scale.set(1, 1.28, 1); dome.position.y = base + 13.1; dome.castShadow = true; g.add(dome);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2; const pts = [];
      for (let k = 0; k <= 20; k++) { const p = k / 20 * Math.PI / 2; pts.push(new THREE.Vector3(Math.cos(a) * Math.cos(p) * 9.68, Math.sin(p) * 9.6 * 1.28, Math.sin(a) * Math.cos(p) * 9.68)); }
      const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.14, 5), gold); rib.position.y = base + 13.1; g.add(rib);
    }
    // lantern, cupola and Mary
    const lanternY = base + 13.1 + 9.6 * 1.28 - 0.4;
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 3.6, 16), gold); lantern.position.y = lanternY + 1.8; g.add(lantern);
    const cup = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold); cup.position.y = lanternY + 3.6; g.add(cup);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 1.2, 12), gold); ped.position.y = lanternY + 5.6; g.add(ped);
    const robe = [[0, 0], [0.85, 0], [0.8, 0.6], [0.62, 1.8], [0.55, 2.9], [0.62, 3.3], [0.42, 3.75], [0.0, 3.8]].map(([x, y]) => new THREE.Vector2(x, y));
    const mary = new THREE.Mesh(new THREE.LatheGeometry(robe, 20), gold); mary.position.y = lanternY + 6.2; g.add(mary);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), gold); head.position.y = lanternY + 10.2; g.add(head);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), gold); halo.position.y = lanternY + 10.65; halo.rotation.x = Math.PI / 2; g.add(halo);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), gold); st.position.set(Math.cos(a) * 0.62, lanternY + 10.65, Math.sin(a) * 0.62); g.add(st); }
    const glow = new THREE.PointLight(0xffc56b, 0, 220, 1.4); glow.position.set(0, base + 4, 0); g.add(glow);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData = { glow, dark };
    add(g, 1882);
    anchors.dome = new THREE.Vector3(cx, lanternY + 11, cz);
  }

  // ---------- Basilica of the Sacred Heart: nave roof, tower and spire ----------
  const bas = byName('Basilica of the Sacred Heart');
  if (bas) {
    const box = obb(bas.ring);
    if (box) {
      // tower at the south end of the long axis
      let ax = box.ax, az = box.az; if (az < 0) { ax = -ax; az = -az; }
      const tx = box.cx + ax * (box.L / 2 - 6), tz = box.cz + az * (box.L / 2 - 6);
      const brick = new THREE.MeshStandardMaterial({ color: srgb('#c9ad7c'), roughness: 0.8 });
      const slate = new THREE.MeshStandardMaterial({ color: srgb('#4f565e'), roughness: 0.65 });
      const g = new THREE.Group(); g.position.set(tx, 0, tz); g.rotation.y = Math.atan2(ax, az);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(9, 36, 9), brick); tower.position.y = 18; g.add(tower);
      const belfry = new THREE.Mesh(new THREE.BoxGeometry(9.2, 6, 9.2), new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.6 })); belfry.position.y = 30; belfry.scale.set(1.001, 1, 0.6); g.add(belfry);
      const belfry2 = belfry.clone(); belfry2.scale.set(0.6, 1, 1.001); g.add(belfry2);
      for (const [px, pz] of [[-4.2, -4.2], [4.2, -4.2], [4.2, 4.2], [-4.2, 4.2]]) { const pin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 8), slate); pin.position.set(px, 39, pz); g.add(pin); }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(4.6, 32, 8), slate); spire.position.y = 52; g.add(spire);
      const gold = GOLD(); golds.push(gold);
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), gold); cross1.position.y = 69.3; g.add(cross1);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.22), gold); cross2.position.y = 69.8; g.add(cross2);
      // nave roof along the long axis
      const nave = new THREE.Group(); nave.position.set(box.cx, 0, box.cz); nave.rotation.y = Math.atan2(box.ax, box.az);
      const len = box.L - 14; const w = Math.min(box.W * 0.55, 20);
      const roofGeo = new THREE.BufferGeometry();
      const hb = bas.h, rh = 8.5, hl = len / 2, hw = w / 2;
      const v = [-hw, hb, -hl, hw, hb, -hl, 0, hb + rh, -hl, -hw, hb, hl, hw, hb, hl, 0, hb + rh, hl];
      roofGeo.setAttribute('position', new THREE.Float32BufferAttribute([...v.slice(0, 3), ...v.slice(9, 12), ...v.slice(15, 18), ...v.slice(0, 3), ...v.slice(15, 18), ...v.slice(6, 9), ...v.slice(3, 6), ...v.slice(6, 9), ...v.slice(15, 18), ...v.slice(3, 6), ...v.slice(15, 18), ...v.slice(12, 15)], 3));
      roofGeo.computeVertexNormals();
      const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: srgb('#59616a'), roughness: 0.6, side: THREE.DoubleSide })); nave.add(roof);
      const gables = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-hw, hb, -hl, hw, hb, -hl, 0, hb + rh, -hl, -hw, hb, hl, 0, hb + rh, hl, hw, hb, hl], 3)), brick); gables.geometry.computeVertexNormals(); gables.material.side = THREE.DoubleSide; nave.add(gables);
      for (const o of [g, nave]) o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      add(g, 1888); add(nave, 1871);
      anchors.spire = new THREE.Vector3(tx, 70, tz);
    }
  }

  // ---------- Hesburgh Library: Word of Life wall on the south face of the tower ----------
  const tower = recs.filter(r => r.part && r.h > 50).sort((a, b) => b.h - a.h)[0] || byName('Hesburgh Library');
  if (tower) {
    const r = tower.ring; const n = r.length / 2; let best = null;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; const mx = (r[i * 2] + r[j * 2]) / 2, mz = (r[i * 2 + 1] + r[j * 2 + 1]) / 2; const L = Math.hypot(r[j * 2] - r[i * 2], r[j * 2 + 1] - r[i * 2 + 1]); if (L > 12 && (!best || mz > best.mz)) best = { i, j, mx, mz, L }; }
    if (best) {
      const dx = r[best.j * 2] - r[best.i * 2], dz = r[best.j * 2 + 1] - r[best.i * 2 + 1]; let nx = dz, nz = -dx; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl; if (nz < 0) { nx = -nx; nz = -nz; }
      const w = Math.min(best.L * 0.8, 21), h = Math.min(41, tower.h - 22);
      const tex = new THREE.CanvasTexture(mosaicCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const mural = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05, emissive: 0xffe2b0, emissiveMap: tex, emissiveIntensity: 0 }));
      mural.position.set(best.mx + nx * 0.25, 20 + h / 2 + 1, best.mz + nz * 0.25); mural.lookAt(best.mx + nx * 10, 20 + h / 2 + 1, best.mz + nz * 10);
      mural.receiveShadow = true; mural.userData.night = true;
      add(mural, 1964);
      anchors.library = new THREE.Vector3(best.mx, tower.h, best.mz);
    }
  }

  // ---------- The Grotto: rock alcove with a field of candles ----------
  const gp = (data.pois || []).find(p => /Grotto/.test(p.n));
  if (gp) {
    const x = gp.p[0] / 10, z = gp.p[1] / 10; const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -0.6;
    const rock = new THREE.MeshStandardMaterial({ color: 0x6d675e, roughness: 0.95, flatShading: true });
    let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 46; i++) { const a = Math.PI * (i / 45); const rr = 4.6 + rnd() * 1.6; const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + rnd() * 1.0, 0), rock); m.position.set(Math.cos(a) * rr, Math.sin(a) * rr * 1.25, -rnd() * 2.2); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); g.add(m); }
    const niche = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.35, 0], [0.3, 1.0], [0.18, 1.5], [0, 1.6]].map(([a, b]) => new THREE.Vector2(a, b)), 12), new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5 })); niche.position.set(1.6, 4.3, -1.2); g.add(niche);
    const cand = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 5), new THREE.MeshStandardMaterial({ color: 0xc23a2a, emissive: 0xff9a3c, emissiveIntensity: 0, roughness: 0.4 }), 420);
    const d = new THREE.Object3D(); for (let i = 0; i < 420; i++) { const row = i % 7, col = Math.floor(i / 7); d.position.set(-3.2 + col * 0.11, 0.5 + row * 0.22, 0.6 + row * 0.12); d.updateMatrix(); cand.setMatrixAt(i, d.matrix); }
    g.add(cand); g.userData.candles = cand;
    const flame = new THREE.PointLight(0xffa04a, 0, 25, 1.6); flame.position.set(-1, 1.6, 1.8); g.add(flame); g.userData.flame = flame;
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    add(g, 1896); anchors.grotto = new THREE.Vector3(x, 6, z);
  }

  // ---------- Sacred Heart statue on Main Quad ----------
  if (mb) {
    const g = new THREE.Group(); g.position.set(mb.cx + 2, 0, mb.cz + 88);
    const stone = new THREE.MeshStandardMaterial({ color: 0xbdb6a8, roughness: 0.8 });
    const ped = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 2.4), stone); ped.position.y = 1.6; g.add(ped);
    const fig = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.7, 0], [0.62, 1.4], [0.5, 2.3], [0.55, 2.6], [0.3, 2.9], [0, 3.0]].map(([a, b]) => new THREE.Vector2(a, b)), 16), new THREE.MeshStandardMaterial({ color: 0x8a8f8e, roughness: 0.4, metalness: 0.6 })); fig.position.y = 3.2; g.add(fig);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    add(g, 1893);
  }

  // ---------- Stadium turf ----------
  const st = byName('Notre Dame Stadium');
  if (st && st.holes[0]) {
    const inner = st.holes[0]; const box = obb(inner);
    const shape = new THREE.Shape(); for (let i = 0; i < inner.length; i += 2) i ? shape.lineTo(inner[i], -inner[i + 1]) : shape.moveTo(inner[i], -inner[i + 1]);
    const apron = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: srgb('#3f6e33'), roughness: 0.9 })); apron.position.y = 0.25; apron.receiveShadow = true;
    const tex = new THREE.CanvasTexture(fieldCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const field = new THREE.Mesh(new THREE.PlaneGeometry(109.7, 48.8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    field.position.set(box.cx, 0.32, box.cz); field.rotation.y = -Math.atan2(box.az, box.ax); field.receiveShadow = true;
    add(apron, 1930); add(field, 1930);
    anchors.stadium = new THREE.Vector3(box.cx, 0, box.cz);
  }

  // ---------- Lost places ----------
  for (const L of LOST) {
    if (L.kind !== 'field') continue;
    const g = new THREE.Group(); g.position.set(L.x, 0.3, L.z);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: srgb('#55783d'), roughness: 0.95 })); grass.receiveShadow = true; g.add(grass);
    const track = new THREE.Mesh(new THREE.RingGeometry(L.d * 0.36, L.d * 0.44, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: srgb('#9c7b5a'), roughness: 1 })); track.scale.x = L.w / L.d * 0.9; track.position.y = 0.05; g.add(track);
    const wood = new THREE.MeshStandardMaterial({ color: srgb('#7a5b3c'), roughness: 0.9 });
    for (const side of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(L.w * 0.6, 4, 6), wood); b.position.set(0, 2, side * (L.d / 2 + 4)); b.rotation.x = side * 0.5; b.castShadow = true; g.add(b); }
    add(g, L.built, L.demolished);
  }

  function update({ era, night, time }) {
    for (const it of items) it.obj.visible = era >= it.from - 0.5 && era < it.to;
    for (const m of golds) m.emissiveIntensity = night * 0.55;
    group.traverse(o => {
      if (o.userData.glow) o.userData.glow.intensity = night * 900;
      if (o.userData.dark) o.userData.dark.emissiveIntensity = night * 1.2;
      if (o.userData.night && o.material) o.material.emissiveIntensity = night * 0.28;
      if (o.userData.candles) o.userData.candles.material.emissiveIntensity = 0.6 + night * (2.4 + Math.sin(time * 9) * 0.3);
      if (o.userData.flame) o.userData.flame.intensity = night * (60 + Math.sin(time * 13) * 8);
    });
  }
  return { group, update, anchors };
}

// Abstract warm-granite mosaic (evokes a stone mural without reproducing any artwork)
function mosaicCanvas() {
  const W = 512, H = 1024; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#8d7a62'; g.fillRect(0, 0, W, H);
  const pal = ['#6e5a45', '#a48d70', '#c8b38f', '#5b4a3a', '#8b6f52', '#b79d78', '#3f3a35', '#cdbb9b', '#7f6a55', '#9a8a77'];
  for (let y = 0; y < H; y += 14) for (let x = 0; x < W; x += 14) { g.fillStyle = pal[(Math.random() * pal.length) | 0]; g.fillRect(x + 1, y + 1, 12 + (Math.random() * 3 | 0), 12); }
  const grad = g.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.45, 420); grad.addColorStop(0, 'rgba(230,214,180,0.55)'); grad.addColorStop(1, 'rgba(60,50,40,0.25)'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(30,25,20,0.35)'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  return c;
}
function fieldCanvas() {
  const W = 2048, H = 912; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const yd = W / 120;
  for (let i = 0; i < 24; i++) { g.fillStyle = i % 2 ? '#3f7a37' : '#468440'; g.fillRect(i * 5 * yd, 0, 5 * yd + 1, H); }
  g.fillStyle = '#2f5f2c'; g.fillRect(0, 0, 10 * yd, H); g.fillRect(110 * yd, 0, 10 * yd, H);
  g.strokeStyle = '#f4f4f0'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
  for (let y = 10; y <= 110; y += 5) { g.lineWidth = y % 10 === 0 ? 5 : 3; g.beginPath(); g.moveTo(y * yd, 0); g.lineTo(y * yd, H); g.stroke(); }
  g.fillStyle = '#f4f4f0'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center';
  for (let y = 20; y <= 100; y += 10) { const n = y <= 60 ? y - 10 : 110 - y; g.fillText(String(n), y * yd, 150); g.save(); g.translate(y * yd, H - 150); g.rotate(Math.PI); g.fillText(String(n), 0, 0); g.restore(); }
  for (let y = 11; y < 110; y++) { g.fillRect(y * yd - 1, H * 0.39, 3, 14); g.fillRect(y * yd - 1, H * 0.59, 3, 14); }
  return c;
}
