import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const RAD = Math.PI / 180;
// Low-precision solar ephemeris (good to ~0.5°), azimuth clockwise from north.
export function solarPosition(date, lat = 41.703, lng = -86.239) {
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 864e5;
  const g = ((357.529 + 0.98560028 * d) % 360) * RAD;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const ha = ((gmst * 15 + lng) * RAD - ra);
  const la = lat * RAD;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { alt, az: (az + 2 * Math.PI) % (2 * Math.PI) };
}
// A Date for a given South Bend local wall-clock hour on a given month/day (handles EDT/EST).
export function localDate(year, month, day, hour) {
  const dst = (month > 3 && month < 11) || (month === 3 && day >= 10) || (month === 11 && day < 3);
  const off = dst ? 4 : 5; const h = Math.floor(hour), m = Math.round((hour - h) * 60);
  return new Date(Date.UTC(year, month - 1, day, h + off, m));
}

export function createSky(scene, renderer, tier) {
  const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 6; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;

  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x4a4632, 0.75); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.castShadow = true;
  const ms = tier === 'cinematic' ? 4096 : tier === 'balanced' ? 2048 : 1024;
  sun.shadow.mapSize.set(ms, ms); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 5000;
  scene.add(sun); scene.add(sun.target);

  // Stars
  const N = 3000, sp = new Float32Array(N * 3), ss = new Float32Array(N);
  for (let i = 0; i < N; i++) { const u = Math.random(), v = Math.random() * 0.95; const th = 2 * Math.PI * u, ph = Math.acos(1 - v); sp[i * 3] = 8000 * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = 8000 * Math.cos(ph); sp[i * 3 + 2] = 8000 * Math.sin(ph) * Math.sin(th); ss[i] = Math.random(); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aS', new THREE.BufferAttribute(ss, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uNight: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute float aS; varying float vS; uniform float uTime; void main(){ vS = aS; gl_PointSize = 1.0 + aS*aS*2.2; vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; }`,
    fragmentShader: `uniform float uNight, uTime; varying float vS; void main(){ float d = length(gl_PointCoord-0.5); float tw = 0.75+0.25*sin(uTime*2.0+vS*50.0); gl_FragColor = vec4(vec3(0.92,0.95,1.0), smoothstep(0.5,0.0,d)*uNight*tw*(0.4+vS)); }`,
  });
  const stars = new THREE.Points(sg, starMat); stars.frustumCulled = false; scene.add(stars);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky);
  let envRT = null, lastEnvKey = '';

  const state = { sunDir: new THREE.Vector3(0, 1, 0), alt: 0.6, night: 0, golden: 0 };
  function update({ date, season, cloud = 0.2, target, viewDist }) {
    const { alt, az } = solarPosition(date);
    state.alt = alt;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)).normalize();
    state.sunDir.copy(dir);
    su.sunPosition.value.copy(dir);
    const winter = season === 'winter', summer = season === 'summer';
    su.turbidity.value = (winter ? 3.5 : summer ? 7 : 5.5) + cloud * 8;
    su.rayleigh.value = (winter ? 1.2 : 1.7) + cloud * 1.2;
    const elev = alt / RAD;
    const night = THREE.MathUtils.smoothstep(-elev, -1, 9); // 0 day .. 1 night
    const golden = 1 - THREE.MathUtils.smoothstep(elev, 2, 18);
    state.night = night; state.golden = golden;
    const sunCol = new THREE.Color().setHSL(0.09 - golden * 0.04, 0.55 + golden * 0.35, 0.92 - golden * 0.25);
    const lightDir = night > 0.6 ? new THREE.Vector3(-0.35, 0.8, -0.4).normalize() : dir.clone().setY(Math.max(dir.y, 0.03)).normalize();
    sun.color.copy(night > 0.6 ? new THREE.Color(0x9fb6ff) : sunCol);
    sun.intensity = THREE.MathUtils.lerp(3.4 * (1 - cloud * 0.55), 0.22, night) * (winter ? 0.9 : 1);
    hemi.intensity = THREE.MathUtils.lerp(0.85 - cloud * 0.1, 0.12, night);
    hemi.color.set(night > 0.5 ? 0x3d4f7a : (winter ? 0xe4ecff : 0xdfe9ff));
    hemi.groundColor.set(winter ? 0x8a8f99 : 0x4a4632);
    const R = THREE.MathUtils.clamp(viewDist * 0.95, 160, 1300);
    const cam = sun.shadow.camera; cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.updateProjectionMatrix();
    sun.target.position.copy(target); sun.position.copy(target).addScaledVector(lightDir, 2500);
    starMat.uniforms.uNight.value = night;
    // environment map (reflections on the dome) when the sun moves enough
    const key = `${Math.round(elev / 3)}|${Math.round(az / RAD / 10)}|${season}`;
    if (key !== lastEnvKey) {
      lastEnvKey = key;
      const eu = envSky.material.uniforms; eu.sunPosition.value.copy(dir); eu.turbidity.value = su.turbidity.value; eu.rayleigh.value = su.rayleigh.value; eu.mieCoefficient.value = 0.005; eu.mieDirectionalG.value = 0.8;
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(envScene, 0, 1, 2000);
      scene.environment = envRT.texture;
      scene.environmentIntensity = THREE.MathUtils.lerp(1.0, 0.12, night);
    }
    return state;
  }
  return { sky, sun, hemi, stars, starMat, update, state };
}
