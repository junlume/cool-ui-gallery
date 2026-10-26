import * as THREE from 'three';

import {
  computeVert, passThroughFrag, curlFrag, divergenceFrag,
  velocityFrag, gradientSubtractFrag, pressureFrag, advectFrag,
} from './shaders/fluid.js';

/**
 * 指针驱动的稳定流体解算（原站 StableFluids）。
 *
 * 这一层是「鼠标在页面上滑动时那种拖尾感」的来源，之前整个缺失。
 * 它本身不画任何东西 —— 只维护一张 256 见方的速度场纹理，然后被四处采样：
 *
 *   场景合成    mainScene 取 uv + fluids.xy*0.01，并按 1+len*0.8 提亮
 *   最终合成    整屏再取 uv − fluids.xy*0.001
 *   图纸网格    col.xy −= fluids.xy*0.005
 *   砖墙顶点    vEmitSide = length(fluids.xy) —— 鼠标划过哪块窗，哪块就亮
 *
 * 所以指针一动，画面会被"推"着走、亮度跟着起伏、背景的窗格沿着轨迹点亮。
 * 单看任何一处都很轻微，叠在一起就是原站那种"整面墙有质感地回应你"的手感。
 *
 * 解算按 Navier–Stokes 的标准分步：涡量约束 → 施力 → 求散度 →
 * 迭代解压力（4 次）→ 减梯度 → 平流。参数全部取自原站字面量。
 * 移动端不跑（原站同样 `this._isMobile || ...`）。
 */

const PARAM = {
  solverIteration: 4,
  pointerSize: 0.1,
  curl: 0.02,
  velocityAttenuation: 0.99,
  pressureAttenuation: 0,
};

/** 乒乓缓冲。计算永远写进临时 RT，再和数据 RT 交换 —— 不能读写同一张。 */
class ComputeController {
  #renderer;
  #size;
  #scene = new THREE.Scene();
  #camera = new THREE.Camera();
  #mesh;
  #targets = [];
  #tempLinear;
  #tempNear;
  #materials = [];

  constructor(renderer, size) {
    this.#renderer = renderer;
    this.#size = size.clone();
    this.#mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.#scene.add(this.#mesh);
    this.#tempLinear = this.createData({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.#tempNear = this.createData({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  }

  get dataSize() { return this.#size; }

  createData(opts = {}) {
    const rt = new THREE.WebGLRenderTarget(this.#size.x, this.#size.y, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: opts.minFilter ?? THREE.NearestFilter,
      magFilter: opts.magFilter ?? THREE.NearestFilter,
      format: THREE.RGBAFormat,
      // 原站在 iOS/Safari 上退到半精度。这里同样判断 —— 全精度浮点在
      // 某些移动 GPU 上不可渲染，拿不到就整张图是黑的。
      type: isHalfFloatDevice() ? THREE.HalfFloatType : THREE.FloatType,
      stencilBuffer: false,
      depthBuffer: false,
    });
    this.#targets.push(rt);
    return { buffer: rt };
  }

  createKernel({ fragmentShader, uniforms }) {
    const merged = { ...uniforms, dataSize: { value: this.#size } };
    const material = new THREE.ShaderMaterial({ vertexShader: computeVert, fragmentShader, uniforms: merged });
    this.#materials.push(material);
    return { material, uniforms: merged };
  }

  compute(kernel, data) {
    const temp = data.buffer.texture.magFilter === THREE.LinearFilter ? this.#tempLinear : this.#tempNear;
    this.#mesh.material = kernel.material;
    const prev = this.#renderer.getRenderTarget();
    this.#renderer.setRenderTarget(temp.buffer);
    this.#renderer.render(this.#scene, this.#camera);
    const swap = data.buffer;
    data.buffer = temp.buffer;
    temp.buffer = swap;
    this.#renderer.setRenderTarget(prev);
  }

  resize(size) {
    this.#size.copy(size);
    this.#targets.forEach((rt) => rt.setSize(size.x, size.y));
  }

  dispose() {
    this.#mesh.geometry.dispose();
    this.#materials.forEach((m) => m.dispose());
    this.#targets.forEach((rt) => rt.dispose());
  }
}

function isHalfFloatDevice() {
  const ua = navigator.userAgent;
  return ua.includes('iPhone') || ua.includes('iPad') || navigator.platform === 'iPad'
    || (navigator.platform === 'MacIntel' && ua.includes('Safari') && !ua.includes('Chrome')
      && navigator.standalone !== undefined);
}

export class StableFluids {
  #controller;
  #kernels;
  #fluidData;
  #curlData;
  #screenAspect = 1;
  #tmp = new THREE.Vector2();

  constructor(renderer, commonUniforms) {
    const size = new THREE.Vector2(1, 1);
    this.#controller = new ComputeController(renderer, size);
    const k = (fragmentShader, uniforms) => this.#controller.createKernel({ fragmentShader, uniforms });

    this.#kernels = {
      curl: k(curlFrag, { dataTex: { value: null }, curl: { value: PARAM.curl } }),
      divergence: k(divergenceFrag, { dataTex: { value: null } }),
      velocity: k(velocityFrag, {
        ...commonUniforms,
        dataTex: { value: null },
        curlTex: { value: null },
        pointerPos: { value: new THREE.Vector2() },
        pointerVec: { value: new THREE.Vector2() },
        screenAspect: { value: 1 },
        pointerSize: { value: PARAM.pointerSize },
        // 着色器里声明了 5 个元素槽（原站给 DOM 元素预留的），未使用但必须有值
        uElmListPos: { value: Array.from({ length: 5 }, () => new THREE.Vector2()) },
        uElmListVel: { value: Array.from({ length: 5 }, () => new THREE.Vector2()) },
        uElmListSize: { value: Array.from({ length: 5 }, () => new THREE.Vector2()) },
      }),
      gradientSubtract: k(gradientSubtractFrag, { dataTex: { value: null } }),
      pressure: k(pressureFrag, { dataTex: { value: null }, alpha: { value: 1 }, beta: { value: 1 } }),
      advect: k(advectFrag, {
        dataTex: { value: null },
        velocityAttenuation: { value: PARAM.velocityAttenuation },
        pressureAttenuation: { value: PARAM.pressureAttenuation },
      }),
    };

    const linear = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.#fluidData = this.#controller.createData(linear);
    this.#curlData = this.#controller.createData(linear);
  }

  getTexture() { return this.#fluidData.buffer.texture; }

  /**
   * pos 是 −1..1 的指针位置，vec 是它的（已阻尼的）速度。
   * 速度先过 1.6 次幂 —— 慢速几乎不起波澜，快速甩才推得动，
   * 这一条是手感的关键，不是可省的整形。
   */
  setPointer(pos, vec) {
    const u = this.#kernels.velocity.uniforms;
    u.pointerPos.value.set(pos.x * 0.5 + 0.5, pos.y * 0.5 + 0.5);
    this.#tmp.copy(vec);
    this.#tmp.x = Math.sign(this.#tmp.x) * Math.abs(this.#tmp.x) ** 1.6;
    this.#tmp.y = Math.sign(this.#tmp.y) * Math.abs(this.#tmp.y) ** 1.6;
    u.pointerVec.value.x += this.#tmp.x;
    u.pointerVec.value.y -= this.#tmp.y;
    u.pointerVec.value.min({ x: 1, y: 1 });
    u.pointerVec.value.max({ x: -1, y: -1 });
  }

  update() {
    const K = this.#kernels;
    K.velocity.uniforms.screenAspect.value = this.#screenAspect;

    K.curl.uniforms.dataTex.value = this.#fluidData.buffer.texture;
    this.#controller.compute(K.curl, this.#curlData);

    K.velocity.uniforms.dataTex.value = this.#fluidData.buffer.texture;
    K.velocity.uniforms.curlTex.value = this.#curlData.buffer.texture;
    this.#controller.compute(K.velocity, this.#fluidData);

    K.divergence.uniforms.dataTex.value = this.#fluidData.buffer.texture;
    this.#controller.compute(K.divergence, this.#fluidData);

    for (let i = 0; i < PARAM.solverIteration; i += 1) {
      K.pressure.uniforms.dataTex.value = this.#fluidData.buffer.texture;
      this.#controller.compute(K.pressure, this.#fluidData);
    }

    K.gradientSubtract.uniforms.dataTex.value = this.#fluidData.buffer.texture;
    this.#controller.compute(K.gradientSubtract, this.#fluidData);

    K.advect.uniforms.dataTex.value = this.#fluidData.buffer.texture;
    this.#controller.compute(K.advect, this.#fluidData);

    // 每帧把注入的指针速度砍半 —— 手停下来，涟漪自己散掉
    K.velocity.uniforms.pointerVec.value.multiplyScalar(0.5);
  }

  /** 长边固定 256，短边按比例。原站字面量。 */
  resize(width, height) {
    const aspect = width / height;
    this.#screenAspect = aspect;
    const s = new THREE.Vector2(256, 256);
    if (aspect < 1) s.x = Math.floor(s.y * aspect);
    else s.y = Math.floor(s.x / aspect);
    this.#controller.resize(s);
  }

  dispose() { this.#controller.dispose(); }
}
