import * as THREE from 'three';

/**
 * 辉光。原站在最终合成前叠三级模糊，参数全部取自 .ref/app.js：
 *
 *   亮部提取  threshold 0.9，输出 c * max(0, c − 0.9)（逐通道）
 *             —— 是乘法不是减法，所以过阈越多亮得越快，暗部完全不参与
 *   模糊      可分离高斯，3 抽头，步长 2 像素，权重由
 *             exp(−0.5·(2i+1)²/100) 归一化得到 → [0.213, 0.205, 0.189]
 *   分辨率    1/4、1/8、1/16 三级，后一级吃前一级的结果（所以半径是累进的）
 *   合成      三级分别按 0.075 / 0.15 / 0.225 相加
 *
 * 少了这一层，玻璃字标和亮起来的窗格都是"干"的 —— 有亮度没有光晕。
 */

const VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * 亮部提取。原站是 `c * max(0, c − 0.9)`，逐通道、**二次**。
 *
 * ⚠️ 多了一道 min(…, uCeiling)，这是对原站的第二处有意偏离，理由是实测的：
 * 场景 RT 换成半精度浮点之后，KV 段实测出现过 ≥8 的像素（字标平面自带
 * o.xyz *= 1.5，砖墙退场那一下还有 ×20）。8 过一遍二次曲线就是 8×7.1 = 57，
 * 再被下面那个 3 抽头、支撑域是方形的核摊到 1/16 分辨率上，
 * 升采样回来就是一块**边缘发圆的白方块**贴在画面上 —— 用户两次截图里
 * 那个白斑就是它。
 *
 * 封顶取 2：低于 2 的部分一点不动（正常辉光完全保留），
 * 只掐掉那种能把方形核暴露出来的极端值。
 */
const BRIGHT_FRAG = `
uniform sampler2D uTex;
uniform float uThreshold;
uniform float uCeiling;
varying vec2 vUv;
void main(void) {
  vec4 c = texture2D(uTex, vUv);
  vec3 f = max(vec3(0.0), c.rgb - uThreshold);
  gl_FragColor = vec4(min(c.rgb * f, vec3(uCeiling)), 1.0);
}`;

const BLUR_FRAG = `
#define TAPS 3
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform bool uIsVertical;
uniform float uWeights[TAPS];
varying vec2 vUv;
void main(void) {
  vec3 sum = uWeights[0] * texture2D(uTex, vUv).rgb;
  for (int i = 1; i < TAPS; i++) {
    vec2 offset = (uIsVertical ? vec2(0.0, float(i)) : vec2(float(i), 0.0)) * 2.0;
    sum += uWeights[i] * texture2D(uTex, vUv + offset / uResolution).rgb;
    sum += uWeights[i] * texture2D(uTex, vUv - offset / uResolution).rgb;
  }
  gl_FragColor = vec4(sum, 1.0);
}`;

/** 原站 _guassWeight()：σ² = 100，采样点取奇数位 1、3、5。 */
function gaussWeights(n) {
  const w = new Array(n);
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const m = 1 + 2 * i;
    const g = Math.exp((-0.5 * (m * m)) / 100);
    w[i] = g;
    total += i > 0 ? g * 2 : g;
  }
  return w.map((v) => v / total);
}

const LEVELS = 3;
const THRESHOLD = 0.9;
/** 亮部提取的封顶值。见 BRIGHT_FRAG 的说明 —— 防的是单个爆亮像素糊成白方块。 */
const CEILING = 2.0;
/** 合成权重 (0.5 + i*0.5) * 0.15 —— 越糊的一级加得越重，光晕才铺得开。 */
export const BLOOM_WEIGHTS = Array.from({ length: LEVELS }, (_, i) => (0.5 + i * 0.5) * 0.15);

export class Bloom {
  #renderer;
  #scene = new THREE.Scene();
  #camera = new THREE.Camera();
  #quad;
  #bright;
  #brightRT;
  #passes = [];
  #ratios = [];
  #textures = [];

  constructor(renderer) {
    this.#renderer = renderer;
    this.#quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.#scene.add(this.#quad);

    // 整条链都走半精度浮点：亮部提取的输出天然大于 1，8 位存不下。
    const rt = () => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
    });

    this.#brightRT = rt();
    this.#bright = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: { uTex: { value: null }, uThreshold: { value: THRESHOLD }, uCeiling: { value: CEILING } },
      depthTest: false,
      depthWrite: false,
    });

    const weights = gaussWeights(LEVELS);
    let ratio = 4;
    for (let i = 0; i < LEVELS; i += 1) {
      const mkPass = (vertical) => ({
        rt: rt(),
        material: new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: BLUR_FRAG,
          uniforms: {
            uTex: { value: null },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uIsVertical: { value: vertical },
            uWeights: { value: weights },
          },
          depthTest: false,
          depthWrite: false,
        }),
      });
      const v = mkPass(true);
      const h = mkPass(false);
      this.#passes.push(v, h);
      this.#ratios.push(ratio, ratio);
      this.#textures.push(h.rt.texture);
      ratio *= 2;
    }
  }

  /** 三级模糊结果，按由清晰到最糊的顺序。 */
  get textures() { return this.#textures; }

  resize(width, height) {
    // 亮部提取跑**全分辨率**（原站的 _bloomBright 没设 resolutionRatio）。
    // 我原来跑 1/2，第一级模糊再从 1/2 降到 1/4、偏移量却是按 1/4 的纹素算的，
    // 等于跳着采样 —— 本来就容易把点状高光留成硬块。
    this.#brightRT.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
    this.#passes.forEach((p, i) => {
      const r = this.#ratios[i];
      const w = Math.max(1, Math.floor(width / r));
      const h = Math.max(1, Math.floor(height / r));
      p.rt.setSize(w, h);
      p.material.uniforms.uResolution.value.set(w, h);
    });
  }

  /** 输入一张已合成好的场景贴图，跑完整条链。 */
  render(sourceTexture) {
    const prev = this.#renderer.getRenderTarget();

    this.#bright.uniforms.uTex.value = sourceTexture;
    this.#quad.material = this.#bright;
    this.#renderer.setRenderTarget(this.#brightRT);
    this.#renderer.render(this.#scene, this.#camera);

    let src = this.#brightRT.texture;
    for (const pass of this.#passes) {
      pass.material.uniforms.uTex.value = src;
      this.#quad.material = pass.material;
      this.#renderer.setRenderTarget(pass.rt);
      this.#renderer.render(this.#scene, this.#camera);
      src = pass.rt.texture;
    }

    this.#renderer.setRenderTarget(prev);
  }

  dispose() {
    this.#quad.geometry.dispose();
    this.#bright.dispose();
    this.#brightRT.dispose();
    this.#passes.forEach((p) => { p.rt.dispose(); p.material.dispose(); });
  }
}
