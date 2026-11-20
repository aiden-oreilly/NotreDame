import * as THREE from 'three';

// Walking graph from OpenStreetMap paths. Junctions lost to simplification are re-stitched by proximity.
export function buildWalkGraph(data) {
  const nodes = []; const index = new Map(); const adj = [];
  const nodeAt = (x, z) => { const k = Math.round(x * 2) + ',' + Math.round(z * 2); let i = index.get(k); if (i === undefined) { i = nodes.length; nodes.push([x, z]); adj.push([]); index.set(k, i); } return i; };
  const link = (a, b, w) => { if (a === b) return; adj[a].push([b, w]); adj[b].push([a, w]); };
  for (const p of data.paths || []) {
    if (/track/.test(p.k)) continue;
    const pref = /footway|pedestrian|path|steps|cycleway|living_street/.test(p.k) ? 1.0 : /service|residential|unclassified/.test(p.k) ? 1.15 : 1.35;
    let prev = -1;
    for (let i = 0; i < p.p.length; i += 2) {
      const x = p.p[i] / 10, z = p.p[i + 1] / 10; const n = nodeAt(x, z);
      if (prev >= 0) { const [px, pz] = nodes[prev]; link(prev, n, Math.hypot(x - px, z - pz) * pref); }
      prev = n;
    }
  }
  // split segments where walks cross or where a walk ends on another walk (junction nodes lost to simplification)
  const segs = []; nodes.forEach((_, a) => { for (const [b] of adj[a]) if (a < b) segs.push([a, b]); });
  const SG = 30, sgrid = new Map();
  segs.forEach((s, i) => { const [ax, az] = nodes[s[0]], [bx, bz] = nodes[s[1]]; for (let gx = Math.floor(Math.min(ax, bx) / SG); gx <= Math.floor(Math.max(ax, bx) / SG); gx++) for (let gz = Math.floor(Math.min(az, bz) / SG); gz <= Math.floor(Math.max(az, bz) / SG); gz++) { const k = gx + ':' + gz; (sgrid.get(k) || sgrid.set(k, []).get(k)).push(i); } });
  const tested = new Set(); const splits = new Map(); const addSplit = (si, t, n) => { (splits.get(si) || splits.set(si, []).get(si)).push([t, n]); };
  for (const list of sgrid.values()) for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
    const i = list[p], j = list[q]; const key = i < j ? i * 1e6 + j : j * 1e6 + i; if (tested.has(key)) continue; tested.add(key);
    const [a, b] = segs[i], [c, d] = segs[j]; if (a === c || a === d || b === c || b === d) continue;
    const [x1, z1] = nodes[a], [x2, z2] = nodes[b], [x3, z3] = nodes[c], [x4, z4] = nodes[d];
    const den = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4); if (Math.abs(den) < 1e-6) continue;
    const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / den, u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / den;
    if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) continue;
    const x = x1 + t * (x2 - x1), z = z1 + t * (z2 - z1); const n = nodeAt(x, z);
    addSplit(i, t, n); addSplit(j, u, n);
  }
  // walk endpoints that stop on (or just short of) another walk: snap onto that segment
  nodes.forEach(([x, z], i) => {
    if (adj[i].length !== 1) return; const k = Math.floor(x / SG) + ':' + Math.floor(z / SG); let best = null;
    for (const si of sgrid.get(k) || []) { const [a, b] = segs[si]; if (a === i || b === i) continue; const [ax, az] = nodes[a], [bx, bz] = nodes[b]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (!L2) continue; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); const px = ax + t * dx, pz = az + t * dz; const dd = Math.hypot(px - x, pz - z); if (dd < 6 && (!best || dd < best.d)) best = { d: dd, px, pz, si, t }; }
    if (best) { const n = nodeAt(best.px, best.pz); addSplit(best.si, best.t, n); link(i, n, best.d + 0.5); }
  });
  // chain every split point along its segment in order
  for (const [si, list] of splits) { const [a, b] = segs[si]; list.sort((p, q) => p[0] - q[0]); let prev = a; for (const [, n] of list) { link(prev, n, Math.hypot(nodes[n][0] - nodes[prev][0], nodes[n][1] - nodes[prev][1])); prev = n; } link(prev, b, Math.hypot(nodes[b][0] - nodes[prev][0], nodes[b][1] - nodes[prev][1])); }
  // stitch near-coincident nodes (within 7 m) using a spatial grid
  const G = 8, grid = new Map(); nodes.forEach(([x, z], i) => { const k = Math.floor(x / G) + ':' + Math.floor(z / G); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  nodes.forEach(([x, z], i) => {
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get((gx + a) + ':' + (gz + b)) || []) {
      if (j <= i) continue; const d = Math.hypot(nodes[j][0] - x, nodes[j][1] - z); if (d < 7 && !adj[i].some(e => e[0] === j)) link(i, j, d * 1.2 + 1);
    }
  });
  return { nodes, adj, grid, G };
}

export function nearestNode(graph, x, z, maxR = 250) {
  let best = -1, bd = Infinity; const { nodes, grid, G } = graph; const gx = Math.floor(x / G), gz = Math.floor(z / G);
  for (let r = 0; r <= Math.ceil(maxR / G); r++) {
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue; for (const j of grid.get((gx + a) + ':' + (gz + b)) || []) { const d = Math.hypot(nodes[j][0] - x, nodes[j][1] - z); if (d < bd) { bd = d; best = j; } } }
    if (best >= 0 && bd < r * G) break;
  }
  return best;
}
// Entrance = the graph node closest to any vertex of the footprint
export function entranceNode(graph, rec) {
  let best = -1, bd = Infinity; const r = rec.ring;
  for (let i = 0; i < r.length; i += 2) { const n = nearestNode(graph, r[i], r[i + 1], 120); if (n < 0) continue; const d = Math.hypot(graph.nodes[n][0] - r[i], graph.nodes[n][1] - r[i + 1]); if (d < bd) { bd = d; best = n; } }
  return best >= 0 ? best : nearestNode(graph, rec.cx, rec.cz, 400);
}

export function shortestPath(graph, s, t) {
  const n = graph.nodes.length; const dist = new Float64Array(n).fill(Infinity); const prev = new Int32Array(n).fill(-1);
  const heap = [[0, s]]; dist[s] = 0;
  const pushH = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const popH = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = popH(); if (u === t) break; if (d > dist[u]) continue;
    for (const [v, w] of graph.adj[u]) { const nd = d + w; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; pushH([nd, v]); } }
  }
  if (!isFinite(dist[t])) return null;
  const path = []; for (let v = t; v >= 0; v = prev[v]) path.push(graph.nodes[v]); path.reverse();
  let meters = 0; for (let i = 1; i < path.length; i++) meters += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return { path, meters, minutes: meters / 1.35 / 60 };
}

// Animated route ribbon with a walker
export function createRouteLayer(scene) {
  const group = new THREE.Group(); scene.add(group);
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uLen: { value: 1 } },
    vertexShader: `attribute float aD; varying float vD; varying float vSide; void main(){ vD = aD; vSide = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uLen; varying float vD; varying float vSide;
      void main(){ float dash = smoothstep(0.35, 0.5, fract(vD / 9.0 - uTime * 0.6)); float edge = smoothstep(0.0, 0.18, vSide) * smoothstep(1.0, 0.82, vSide);
        vec3 gold = vec3(1.0, 0.78, 0.25); vec3 col = mix(gold * 0.9, vec3(1.0, 0.95, 0.8) * 2.2, dash);
        gl_FragColor = vec4(col, 0.92 * edge); }` });
  const walker = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff3d0 }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(3, 4.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.6, depthWrite: false }));
  let ribbon = null, curve = null, length = 0, t = 0;
  function set(points) {
    clear(); if (!points || points.length < 2) return;
    const v = points.map(([x, z]) => new THREE.Vector3(x, 1.2, z));
    curve = new THREE.CatmullRomCurve3(v, false, 'centripetal', 0.2); length = curve.getLength();
    const segs = Math.max(20, Math.round(length / 2)); const W = 3.2; const P = [], UV = [], D = [], I = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs; const p = curve.getPointAt(u); const tg = curve.getTangentAt(u); const nx = -tg.z, nz = tg.x; const nl = Math.hypot(nx, nz) || 1;
      P.push(p.x + nx / nl * W, 1.2, p.z + nz / nl * W, p.x - nx / nl * W, 1.2, p.z - nz / nl * W); UV.push(u, 0, u, 1); D.push(u * length, u * length);
      if (i < segs) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('aD', new THREE.Float32BufferAttribute(D, 1)); g.setIndex(I);
    ribbon = new THREE.Mesh(g, mat); ribbon.renderOrder = 5; group.add(ribbon, walker, halo); t = 0;
  }
  function clear() { if (ribbon) { group.remove(ribbon); ribbon.geometry.dispose(); ribbon = null; } group.remove(walker, halo); curve = null; }
  function update(dt, time) { mat.uniforms.uTime.value = time; if (!curve) return; t = (t + dt * 22 / length) % 1; const p = curve.getPointAt(t); walker.position.set(p.x, 3.4, p.z); halo.position.set(p.x, 1.4, p.z); halo.scale.setScalar(1 + 0.25 * Math.sin(time * 4)); }
  return { set, clear, update, get active() { return !!curve; } };
}
