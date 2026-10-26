import * as THREE from 'three';

const COPY_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COPY_FRAG = `
uniform sampler2D uBackBuffer;
varying vec2 vUv;
void main(void) { gl_FragColor = texture2D(uBackBuffer, vUv); }`;

/**
 * 折射用的背景快照。
 *
 * 手法取自原站：一个零尺寸、不参与视锥剔除的哨兵网格，renderOrder 固定 100。
 * three 按 renderOrder 排序绘制，轮到它时「渲染目标里已经画好的内容」正好是
 * 全部背景（renderOrder < 100），于是在 onBeforeRender 里把当前 RT 拷进一张
 * 512×512 缓冲。字标的 renderOrder 是 101，采样这张缓冲就拿到了「自己身后的画面」。
 *
 * 好处是单趟渲染即可，不需要为折射多渲一遍场景。
 */
export class TransparentBuffer extends THREE.Mesh {
  #rt = null;
  #bufferUniform = { value: null };
  #uniformSet;
  #copyScene;
  #copyCamera;
  #copyMaterial;

  constructor() {
    super(new THREE.PlaneGeometry(0, 0), new THREE.ShaderMaterial({ transparent: true }));

    this.#uniformSet = {
      uTrnsTex: this.#bufferUniform,
      uTrnsWinRes: { value: new THREE.Vector2(1, 1) },
    };
    this.renderOrder = 100;
    this.frustumCulled = false;

    this.#copyMaterial = new THREE.ShaderMaterial({
      vertexShader: COPY_VERT,
      fragmentShader: COPY_FRAG,
      uniforms: { uBackBuffer: { value: null } },
      depthTest: false,
      depthWrite: false,
    });
    this.#copyScene = new THREE.Scene();
    this.#copyCamera = new THREE.Camera();
    this.#copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#copyMaterial));

    this.onBeforeRender = (renderer) => {
      const current = renderer.getRenderTarget();
      if (!current) return;                       // 直接画到画布时没有可读的纹理
      if (!this.#rt) {
        this.#rt = new THREE.WebGLRenderTarget(512, 512, {
          depthBuffer: false,
          stencilBuffer: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        });
        this.#bufferUniform.value = this.#rt.texture;
      }
      this.#copyMaterial.uniforms.uBackBuffer.value = current.texture;
      renderer.setRenderTarget(this.#rt);
      renderer.render(this.#copyScene, this.#copyCamera);
      renderer.setRenderTarget(current);
    };
  }

  get uniformSet() {
    return this.#uniformSet;
  }

  get renderOrderBase() {
    return this.renderOrder;
  }

  /** uTrnsWinRes 是窗口分辨率，片元里用 gl_FragCoord/它 求屏幕 UV。 */
  resize(size) {
    this.#uniformSet.uTrnsWinRes.value.copy(size);
  }

  dispose() {
    this.#rt?.dispose();
    this.#rt = null;
    this.#copyMaterial.dispose();
  }
}
