import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// Film grade applied in linear HDR before tone mapping. Drives the history eras and seasons.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 },
    uSepia: { value: 0 }, uMono: { value: 0 }, uFade: { value: 0 },
    uSat: { value: 1.0 }, uWarm: { value: 0 }, uVignette: { value: 0.28 }, uGrain: { value: 0.025 },
    uExposure: { value: 1.0 }, uLift: { value: new THREE.Vector3(0, 0, 0) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uSepia, uMono, uFade, uSat, uWarm, uVignette, uGrain, uExposure; uniform vec3 uLift;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uExposure;
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, uSat);
      col *= vec3(1.0 + uWarm*0.08, 1.0, 1.0 - uWarm*0.08);
      // silver gelatin: neutral mono with a touch of cool shadow
      vec3 mono = vec3(l) * vec3(0.98, 1.0, 1.04);
      col = mix(col, mono, uMono);
      // albumen print: warm brown highlights, deep umber shadows
      vec3 sep = vec3(l*1.12 + 0.012, l*0.92 + 0.006, l*0.66);
      col = mix(col, sep, uSepia);
      // faded Kodachrome: lifted blacks, warm mids, slightly crushed blues
      vec3 fade = col * vec3(1.06, 0.98, 0.86) + vec3(0.018, 0.012, 0.0);
      col = mix(col, fade, uFade);
      col += uLift;
      vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.2, length(d * vec2(1.25, 1.0)));
      col *= mix(1.0, v, uVignette + (uSepia + uMono) * 0.25);
      float g = (h(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5) * (uGrain + (uSepia + uMono + uFade) * 0.05);
      col += g * (0.25 + l);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const gl = renderer.getContext();
  const caps = {
    maxTex: renderer.capabilities.maxTextureSize,
    mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent)),
    renderer: (() => { try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch { return ''; } })(),
  };
  caps.tier = caps.mobile ? 'balanced' : (/SwiftShader|llvmpipe|Software/i.test(caps.renderer) ? 'battery' : 'cinematic');
  return { renderer, caps };
}

export function createComposer(renderer, scene, camera, tier) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: tier === 'battery' ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (tier === 'cinematic') {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.4, thickness: 4, scale: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.6, 0.92);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return { composer, bloom, grade, gtao };
}
