import * as THREE from 'three';
import { OUTLINE, W, H } from '../../lib/glyph.js';

// The un-beveled glyph height used by createLogoGeometry. The container supplies
// all actual M scale/position; these points never have a separate layout scale.
export const PROFILE_PARTICLE_GLYPH_HEIGHT = 0.3620;
export const PROFILE_PARTICLE_COUNT = 1800;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = (a, b, value) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Scroll alone drives the cloud, so stopping and reversing preserve its pose. */
export function profileParticleFrame(progress) {
  const p = clamp01(progress);
  return {
    aggregate: smooth(0.84, 0.91, p),
    opacity: smooth(0.84, 0.858, p) * (1 - smooth(0.94, 0.985, p)),
  };
}

/** Test a point in SVG units against the brand's single, closed M polygon. */
export function pointInProfileGlyph(x, y) {
  let inside = false;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i];
    const [xj, yj] = OUTLINE[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Fixed-seed rejection sampling retains the real glyph's diagonal cutouts. */
export function sampleProfileGlyph(count = PROFILE_PARTICLE_COUNT, seed = 0x4d4f5444) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const positions = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const scale = PROFILE_PARTICLE_GLYPH_HEIGHT / H;
  for (let i = 0; i < count; i += 1) {
    let x; let y;
    do { x = random() * W; y = random() * H; } while (!pointInProfileGlyph(x, y));
    positions.set([(x - W / 2) * scale, -(y - H / 2) * scale, (random() - 0.5) * 0.055], i * 3);
    scatter.set([(random() - 0.5) * W * scale * 3.8, (random() - 0.5) * PROFILE_PARTICLE_GLYPH_HEIGHT * 2.5,
      (random() - 0.5) * PROFILE_PARTICLE_GLYPH_HEIGHT * 1.4], i * 3);
    phases[i] = random();
  }
  return { positions, scatter, phases };
}

export const profileParticleVert = `
  attribute vec3 aScatter;
  attribute float aPhase;
  uniform float uParticleAggregate;
  uniform float uParticlePixelRatio;
  uniform float uProfileYaw;
  uniform float uProfilePitch;
  varying float vPhase;
  mat2 rotate(float rad) { return mat2(cos(rad), sin(rad), -sin(rad), cos(rad)); }
  void main() {
    float form = smoothstep(aPhase * 0.20, 1.0, uParticleAggregate);
    vec3 pos = mix(aScatter, position, form);
    pos.xz *= rotate(uProfileYaw);
    pos.yz *= rotate(uProfilePitch);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (1.3 + aPhase * 1.7) * uParticlePixelRatio;
    vPhase = aPhase;
  }
`;

export const profileParticleFrag = `
  uniform float uParticleOpacity;
  varying float vPhase;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (radius >= 1.0 || uParticleOpacity <= 0.0001) discard;
    float soft = (1.0 - smoothstep(0.12, 1.0, radius)) * exp(-radius * radius * 3.0);
    vec3 gray = mix(vec3(0.12), vec3(0.30), vPhase);
    gl_FragColor = vec4(gray, soft * uParticleOpacity * (0.45 + vPhase * 0.55));
  }
`;

export class ProfileParticles extends THREE.Points {
  constructor(commonUniforms = {}) {
    const samples = sampleProfileGlyph();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(samples.positions, 3));
    geometry.setAttribute('aScatter', new THREE.BufferAttribute(samples.scatter, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(samples.phases, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: profileParticleVert,
      fragmentShader: profileParticleFrag,
      uniforms: {
        ...commonUniforms,
        uProfileYaw: commonUniforms.uProfileYaw || { value: 0 },
        uProfilePitch: commonUniforms.uProfilePitch || { value: 0 },
        uParticleAggregate: { value: 0 },
        uParticleOpacity: { value: 0 },
        uParticlePixelRatio: { value: 1 },
      },
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    super(geometry, material);
    this.name = 'profile-particles';
    this.renderOrder = 9;
    this.frustumCulled = false;
    this.visible = false;
  }

  updateProfile(progress, { active = true, reducedMotion = false, pixelRatio = 1 } = {}) {
    const frame = profileParticleFrame(progress);
    this.material.uniforms.uParticleAggregate.value = frame.aggregate;
    this.material.uniforms.uParticleOpacity.value = active && !reducedMotion ? frame.opacity : 0;
    this.material.uniforms.uParticlePixelRatio.value = Math.max(1, Math.min(2, Number(pixelRatio) || 1));
    this.visible = this.material.uniforms.uParticleOpacity.value > 0.0001;
  }

  out() { this.updateProfile(0, { active: false }); }

  get debugState() {
    return { visible: this.visible, opacity: +this.material.uniforms.uParticleOpacity.value.toFixed(4),
      aggregate: +this.material.uniforms.uParticleAggregate.value.toFixed(4), count: this.geometry.getAttribute('position').count };
  }
}
