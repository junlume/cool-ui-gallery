import * as THREE from 'three';

const QUAD_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * 把一段片元着色器渲染成贴图。
 *
 * 原站的噪声贴图不是素材文件，是运行时用 simplex 3D 噪声现算的 ——
 * 64×64、FloatType、四个通道各取不同的噪声域，并随 uTime 缓慢流动。
 * 玻璃材质的粗糙度扰动和 service 屏幕的畸变都吃它，所以它必须逐帧重绘。
 */
export class ProceduralTexture {
  #rt;
  #scene;
  #camera;
  #material;
  #renderer;
  resolutionRatio = 1;
  userData = {};

  constructor({ renderer, fragmentShader, uniforms = {}, resolution = new THREE.Vector2(64, 64) }) {
    this.#renderer = renderer;
    this.#rt = new THREE.WebGLRenderTarget(resolution.x, resolution.y, {
      type: THREE.FloatType,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    this.#material = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });

    this.#scene = new THREE.Scene();
    this.#camera = new THREE.Camera();
    this.#scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#material));
  }

  render() {
    const prev = this.#renderer.getRenderTarget();
    this.#renderer.setRenderTarget(this.#rt);
    this.#renderer.render(this.#scene, this.#camera);
    this.#renderer.setRenderTarget(prev);
  }

  /**
   * 图案贴图按屏幕分辨率的一个比例来渲。原站三套图案分别用 0.3 / 0.8 / 0.8 ——
   * 第一套故意渲得糊，砖墙上就成了大块柔和色斑；后两套细一些。
   */
  resize(resolution) {
    const r = this.resolutionRatio ?? 1;
    this.#rt.setSize(
      Math.max(1, Math.floor(resolution.x * r)),
      Math.max(1, Math.floor(resolution.y * r)),
    );
  }

  get texture() {
    return this.#rt.texture;
  }

  dispose() {
    this.#rt.dispose();
    this.#material.dispose();
  }
}

/**
 * 环境贴图。
 *
 * 原站用 /envmap/ 下六张 512² PNG（Alche 的素材，不复制）。但它们的光照结构
 * 是可以测量的 —— 逐面统计 R 通道后得到：
 *
 *   +X 192   −X  40      主光在右
 *   −Y 183   +Y  37      次光在下，上方压暗
 *   +Z 131   −Z  96
 *
 * 也就是「右侧 + 下方打光、顶部压暗」的反常布光，正是这块玻璃看起来会
 * 从底缘泛光的原因。这里按同一组均值与高对比度重建，不抄图。
 */
const FACE_PROFILE = [
  { key: 'px', hi: 250, lo: 134, band: 0.30 },
  { key: 'nx', hi: 72,  lo: 8,   band: null },
  { key: 'py', hi: 62,  lo: 12,  band: null },
  { key: 'ny', hi: 232, lo: 134, band: 0.62 },
  { key: 'pz', hi: 202, lo: 60,  band: null },
  { key: 'nz', hi: 152, lo: 40,  band: null },
];

export function createStudioEnvMap(renderer, size = 128) {
  const faces = FACE_PROFILE.map(({ hi, lo, band }) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');

    // 线性渐变的均值就是 (hi+lo)/2，用它对齐实测均值
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, `rgb(${hi},${hi},${hi})`);
    g.addColorStop(1, `rgb(${lo},${lo},${lo})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    // 主光面加一条高光带 —— 玻璃的锐利反光来自它，而非漫反射
    if (band !== null) {
      const bandG = ctx.createLinearGradient(0, size * (band - 0.12), 0, size * (band + 0.12));
      bandG.addColorStop(0, 'rgba(255,255,255,0)');
      bandG.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      bandG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bandG;
      ctx.fillRect(0, 0, size, size);
    }
    return c;
  });

  const tex = new THREE.CubeTexture(faces);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
