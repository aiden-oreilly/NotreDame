// Local tangent-plane projection centered on the Golden Dome. +x = east, -z = north, meters.
export const ORIGIN = { lat: 41.70305, lng: -86.23898 };
export const KX = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
export const KZ = 110540;
export const toWorld = (lat, lng) => ({ x: (lng - ORIGIN.lng) * KX, z: -(lat - ORIGIN.lat) * KZ });
export const toLatLng = (x, z) => ({ lat: ORIGIN.lat - z / KZ, lng: ORIGIN.lng + x / KX });

// Web Mercator tile math
export const lon2tile = (lon, z) => (lon + 180) / 360 * 2 ** z;
export const lat2tile = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };
export const tile2lon = (x, z) => x / 2 ** z * 360 - 180;
export const tile2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

// Core campus box (imagery at full resolution) and context box (lower resolution, to the horizon)
export const CORE = { s: 41.6918, n: 41.7122, w: -86.2575, e: -86.2265 };
export const CONTEXT = { s: 41.676, n: 41.728, w: -86.282, e: -86.200 };

// Polygon helpers on flat [x0,z0,x1,z1,...] arrays (meters)
export function signedArea(p) { let a = 0; for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1]; return a / 2; }
export function centroid(p) { let x = 0, z = 0; const n = p.length / 2; for (let i = 0; i < p.length; i += 2) { x += p[i]; z += p[i + 1]; } return { x: x / n, z: z / n }; }
export function pointInPoly(x, z, p) { let c = false; const n = p.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }
// Minimum-area oriented bounding box (tests each edge direction)
export function obb(p) {
  const n = p.length / 2; let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n; const dx = p[j * 2] - p[i * 2], dz = p[j * 2 + 1] - p[i * 2 + 1]; const L = Math.hypot(dx, dz); if (L < 0.5) continue;
    const ux = dx / L, uz = dz / L; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (let k = 0; k < n; k++) { const x = p[k * 2], z = p[k * 2 + 1]; const a = x * ux + z * uz, b = -x * uz + z * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) best = { area, ux, uz, a0, a1, b0, b1 };
  }
  if (!best) return null;
  const { ux, uz, a0, a1, b0, b1 } = best; const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
  let L = a1 - a0, W = b1 - b0, ax = ux, az = uz;
  if (W > L) { [L, W] = [W, L]; ax = -uz; az = ux; } // long axis first
  return { cx: ca * ux - cb * uz, cz: ca * uz + cb * ux, L, W, ax, az, area: best.area };
}
export const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
