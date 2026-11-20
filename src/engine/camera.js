import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function createCamera(canvas) {
  const camera = new THREE.PerspectiveCamera(42, 1, 1.5, 30000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.screenSpacePanning = false; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 25; controls.maxDistance = 4200;
  controls.zoomSpeed = 0.9; controls.rotateSpeed = 0.55; controls.panSpeed = 0.9;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' }; controls.listenToKeyEvents(window);

  let flight = null; let tour = null;
  // camera pose from a target point + azimuth/elevation/distance (degrees, azimuth clockwise from north)
  const pose = (target, az, el, dist) => {
    const a = az * Math.PI / 180, e = el * Math.PI / 180;
    return new THREE.Vector3(target.x + Math.sin(a) * Math.cos(e) * dist, target.y + Math.sin(e) * dist, target.z - Math.cos(a) * Math.cos(e) * dist);
  };
  function flyTo(target, { az, el = 28, dist = 320, dur = 2.6, arc = 0.25 } = {}) {
    const from = camera.position.clone(), fromT = controls.target.clone();
    if (az === undefined) { const d = from.clone().sub(fromT); az = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360; }
    const to = pose(target, az, el, dist);
    const lift = Math.max(0, from.distanceTo(to) * arc);
    return new Promise(res => { flight = { from, to, fromT, toT: target.clone(), t: 0, dur, lift, res }; });
  }
  function update(dt) {
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur); const k = ease(flight.t);
      camera.position.lerpVectors(flight.from, flight.to, k); camera.position.y += Math.sin(Math.PI * k) * flight.lift;
      controls.target.lerpVectors(flight.fromT, flight.toT, k);
      if (flight.t >= 1) { const r = flight.res; flight = null; r(); }
    } else if (tour && tour.orbiting) {
      // slow cinematic drift around the current stop
      const off = camera.position.clone().sub(controls.target); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.045); camera.position.copy(controls.target).add(off);
    }
    controls.update();
    if (camera.position.y < 6) camera.position.y = 6;
  }
  const cancel = () => { if (flight) { const r = flight.res; flight = null; r(); } };
  controls.addEventListener('start', () => { if (tour) tour.stop(); cancel(); });
  function setTour(t) { tour = t; }
  return { camera, controls, flyTo, update, pose, setTour, get flying() { return !!flight; } };
}
