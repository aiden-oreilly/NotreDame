import * as THREE from 'three';

// ---------- Lakes: animated water in summer, ice in winter ----------
export function createWater(scene, data, shared) {
  const group = new THREE.Group(); scene.add(group);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uIce: { value: 0 }, uNight: { value: 0 }, uSkyCol: { value: new THREE.Color(0x9cc3e6) } }]),
    fog: true, transparent: false,
    vertexShader: `varying vec3 vW; #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition; #include <fog_vertex>
 }`.replace(/#include/g, '\n#include'),
    fragmentShader: `uniform float uTime, uIce, uNight; uniform vec3 uSun, uSkyCol; varying vec3 vW; #include <common> #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        vec2 g = vec2(n(p*0.35 + uTime*0.25) - n(p*0.35 - vec2(uTime*0.2, 0.0)), n(p*0.6 + vec2(0.0, uTime*0.3)) - n(p*0.6 - uTime*0.15)) * 0.35;
        vec3 N = normalize(vec3(g.x, 1.0, g.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.85 + 0.08;
        vec3 deep = vec3(0.015, 0.045, 0.05);
        vec3 sky = mix(uSkyCol, vec3(0.01,0.015,0.03), uNight);
        vec3 col = mix(deep, sky, fres);
        vec3 R = reflect(-V, N); float spec = pow(max(dot(R, normalize(uSun)), 0.0), 220.0) * (1.0 - uNight);
        col += vec3(1.0, 0.9, 0.7) * spec * 4.0;
        // ice: frosted, cracked, snow-dusted at the edges
        float cracks = smoothstep(0.02, 0.0, abs(n(p*0.08) - 0.5)) * 0.35 + smoothstep(0.015, 0.0, abs(n(p*0.21+3.0) - 0.5)) * 0.2;
        vec3 ice = mix(vec3(0.55,0.66,0.74), vec3(0.86,0.9,0.95), n(p*0.05)) - cracks * 0.25;
        col = mix(col, ice * (0.35 + 0.65 * (1.0 - uNight)), uIce);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`.replace(/ #include/g, '\n#include'),
  });
  for (const w of data.water || []) {
    const s = new THREE.Shape(); for (let i = 0; i < w.o.length; i += 2) i ? s.lineTo(w.o[i] / 10, -w.o[i + 1] / 10) : s.moveTo(w.o[i] / 10, -w.o[i + 1] / 10);
    for (const h of w.holes || []) { const hp = new THREE.Path(); for (let i = 0; i < h.length; i += 2) i ? hp.lineTo(h[i] / 10, -h[i + 1] / 10) : hp.moveTo(h[i] / 10, -h[i + 1] / 10); s.holes.push(hp); }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 4).rotateX(-Math.PI / 2), mat); m.position.y = 0.35; group.add(m);
  }
  return { group, mat };
}

// ---------- Weather particles: snow, rain, falling leaves, summer fireflies ----------
export function createWeather(scene) {
  const N = 9000, R = 520, H = 260;
  const p = new Float32Array(N * 3), s = new Float32Array(N);
  for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - 0.5) * 2 * R; p[i * 3 + 1] = Math.random() * H; p[i * 3 + 2] = (Math.random() - 0.5) * 2 * R; s[i] = Math.random(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uMode: { value: 0 }, uAmt: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uNight: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute float aS; uniform float uTime, uMode, uAmt, uPx; uniform vec3 uCenter; varying float vS; varying float vA;
      void main(){
        vS = aS; vec3 q = position;
        float speed = uMode < 1.5 ? 6.0 + aS*4.0 : uMode < 2.5 ? 70.0 + aS*30.0 : uMode < 3.5 ? 4.0 + aS*3.0 : 0.6;
        q.y = mod(q.y - uTime * speed, 260.0);
        if (uMode < 1.5 || uMode > 2.5) { q.x += sin(uTime*0.7 + aS*40.0) * (uMode > 2.5 && uMode < 3.5 ? 6.0 : 2.5); q.z += cos(uTime*0.5 + aS*30.0) * 2.5; }
        if (uMode > 3.5) q.y = mod(position.y, 18.0) + 1.0 + sin(uTime + aS*20.0)*1.5;
        vec3 c = uCenter; vec3 w = vec3(mod(q.x - c.x + 520.0, 1040.0) - 520.0 + c.x, q.y, mod(q.z - c.z + 520.0, 1040.0) - 520.0 + c.z);
        vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv;
        float size = uMode < 1.5 ? 2.2 : uMode < 2.5 ? 1.6 : uMode < 3.5 ? 3.0 : 2.5;
        gl_PointSize = size * uPx * (300.0 / -mv.z);
        vA = step(aS, uAmt);
      }`,
    fragmentShader: `uniform float uMode, uNight, uTime; varying float vS; varying float vA;
      void main(){
        if (vA < 0.5) discard;
        vec2 c = gl_PointCoord - 0.5; float a;
        vec3 col = vec3(1.0);
        if (uMode < 1.5) { a = smoothstep(0.5, 0.15, length(c)) * 0.9; }
        else if (uMode < 2.5) { a = smoothstep(0.08, 0.0, abs(c.x)) * 0.35; col = vec3(0.75,0.8,0.9); }
        else if (uMode < 3.5) { vec2 r = vec2(c.x*cos(vS*6.0)-c.y*sin(vS*6.0), c.x*sin(vS*6.0)+c.y*cos(vS*6.0)); a = step(length(r*vec2(1.0,2.0)), 0.45); col = vS < 0.3 ? vec3(0.62,0.12,0.04) : vS < 0.6 ? vec3(0.85,0.42,0.08) : vec3(0.8,0.6,0.12); }
        else { a = smoothstep(0.5, 0.0, length(c)) * uNight * (0.5 + 0.5*sin(uTime*3.0 + vS*40.0)); col = vec3(1.0, 0.9, 0.45) * 3.0; }
        gl_FragColor = vec4(col, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return { points: pts, mat };
}

// ---------- Lamp posts along campus walks (lit at night) ----------
export function createLamps(scene, data, maxN = 1400) {
  const pos = []; const step = 30;
  for (const p of data.paths || []) {
    if (!/footway|pedestrian|path/.test(p.k)) continue;
    let acc = step * 0.5;
    for (let i = 2; i < p.p.length; i += 2) {
      const ax = p.p[i - 2] / 10, az = p.p[i - 1] / 10, bx = p.p[i] / 10, bz = p.p[i + 1] / 10; const L = Math.hypot(bx - ax, bz - az);
      while (acc < L) { const t = acc / L; const x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (Math.hypot(x + 50, z - 150) < 1100) pos.push([x + 1.4, z]); acc += step; }
      acc -= L;
    }
    if (pos.length > maxN) break;
  }
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 6).translate(0, 2.1, 0), new THREE.MeshStandardMaterial({ color: 0x1d2420, roughness: 0.5, metalness: 0.6 }), pos.length);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffc77a, emissiveIntensity: 0, roughness: 0.3 });
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8).translate(0, 4.45, 0), headMat, pos.length);
  const d = new THREE.Object3D(); pos.forEach(([x, z], i) => { d.position.set(x, 0, z); d.updateMatrix(); pole.setMatrixAt(i, d.matrix); head.setMatrixAt(i, d.matrix); });
  const glowMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uNight: { value: 0 } },
    vertexShader: `uniform float uNight; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = 120.0 / -mv.z * 6.0; }`,
    fragmentShader: `uniform float uNight; void main(){ float d = length(gl_PointCoord-0.5); gl_FragColor = vec4(1.0,0.75,0.4, smoothstep(0.5,0.0,d)*0.55*uNight); }` });
  const gp = new Float32Array(pos.length * 3); pos.forEach(([x, z], i) => { gp[i * 3] = x; gp[i * 3 + 1] = 4.45; gp[i * 3 + 2] = z; });
  const glow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(gp, 3)), glowMat); glow.frustumCulled = false;
  pole.castShadow = true; scene.add(pole, head, glow);
  return { update(night) { headMat.emissiveIntensity = night * 6; glowMat.uniforms.uNight.value = night; }, count: pos.length };
}
