import * as THREE from 'three';

import { Animator } from './animator.js';
import { lerper } from '../core/lerper.js';
import { topScrollManager } from '../core/top-scroll-manager.js';
import { worksThumbnailVert, worksThumbnailFrag } from './shaders/works-thumbnail.js';
import { createScreenGeometry } from './screen-geometry.js';

/**
 * WORKS 段那一圈**环绕的屏幕**。
 *
 * 这是之前整块缺掉的东西。我原来以为作品图只是贴在背景砖墙上（那一层确实也有，
 * 由 bg-quad-tree 的 uWorks1Tex/uWorks2Tex 负责），但录屏里那三块带厚度、
 * 带边框、一块正对、两块斜着卡在画面左右边缘的板子不是墙 —— 它们是独立的一组网格，
 * 沿一条椭圆轨道**绕着相机**排列：
 *
 *   x        = index + 1 − u          u 是滚动位置
 *   position = ( sin(x)·9.2, −x, cos(x)·5 − 6 )  侧屏外沿贴近人物画框
 *   rotation.y = x·0.6
 *   scale      = 0.8 × (0.9 + 0.2·(1 − min(1,|x|)))
 *   alpha      = 1 − smoothstep(|x|, 0.8, 2.5)  |x|>2.5 完全隐掉
 *
 * 滚动时整圈转过去，当前那块转到正前方并放大 —— 就是"环绕的屏幕"。
 *
 * 它渲进一张独立的 RT，再由合成按 alpha 叠到主画面上（原站 uThumbnailSceneTex）。
 *
 * 网格：原站从 GLB 取 ThumbnailScreen，取不到时回落到
 * BoxGeometry(8, 8/(16/9), 0.1, 16, 16)。我们没有 GLB，直接用它自己写的这个回落 ——
 * 顶点着色器里 `pos.z += cos(pos.x/4·π/2·0.5)·1.5 − 1.0` 会把这块板压成弧面，
 * 所以 16×16 的细分不是浪费，是弧度需要的。
 */

const MESH_W = 8;
const MESH_H = 8 / (16 / 9);
const ORBIT_SCREEN_SCALE = 0.8;
const ORBIT_RADIUS_X = 9.2;

class WorksThumbnail extends THREE.Object3D {
  #animator = new Animator();
  #uniforms;
  #mesh;

  #video = null;
  #ready;
  #resolveReady;
  #disposed = false;

  constructor(src, commonUniforms, envMap, { preload = 'metadata' } = {}) {
    super();
    this.#ready = new Promise((resolve) => { this.#resolveReady = resolve; });
    this.#uniforms = {
      ...commonUniforms,
      uTex: { value: null },
      uLoaded: this.#animator.add({ name: 'loaded', initValue: 0 }),
      uTexAspect: { value: 1 },
      uPosX: { value: 0 },
      uAlpha: { value: 0 },
      uEnvMap: { value: envMap ?? null },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: worksThumbnailVert,
      fragmentShader: worksThumbnailFrag,
      uniforms: this.#uniforms,
      transparent: true,
      side: THREE.FrontSide,
    });

    // 板身见 screen-geometry.js：厚度 / 斜切亮边都是从原站录屏量出来的。
    // 原来这里是 BoxGeometry(8, 4.5, 0.1, 16, 16) —— 那是原站取不到 GLB 时的
    // 兜底，一张纸，着色器里整支侧面分支落在不到一个像素上，等于没写。
    this.#mesh = new THREE.Mesh(
      createScreenGeometry({ width: MESH_W, height: MESH_H }),
      material,
    );
    this.#mesh.frustumCulled = false;
    this.#mesh.visible = false;
    this.add(this.#mesh);
    this.visible = false;

    if (!src) { this.#resolveReady(false); return; }
    if (/\.(mp4|webm|mov)$/i.test(src)) this.#loadVideo(src, preload);
    else this.#loadImage(src);
  }

  #loadImage(src) {
    new THREE.TextureLoader().load(src, (tex) => {
      if (this.#disposed) { tex.dispose(); return; }
      tex.wrapS = THREE.MirroredRepeatWrapping;
      tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.#uniforms.uTex.value = tex;
      this.#uniforms.uTexAspect.value = tex.image.width / tex.image.height;
      this.#animator.animate('loaded', 1, 1);
      this.#resolveReady(true);
    }, undefined, () => this.#resolveReady(false));
  }

  /**
   * 开场会露出的前三块屏幕提前加载；其余只预取 metadata，
   * 等 setAlpha 让它们可见时再继续缓冲，避免五块同时占满首屏带宽。
   */
  #loadVideo(src, preload) {
    const v = document.createElement('video');
    v.src = src;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.preload = preload;
    this.#video = v;
    v.addEventListener('loadeddata', () => {
      if (this.#disposed) return;
      const tex = new THREE.VideoTexture(v);
      tex.colorSpace = THREE.SRGBColorSpace;
      // 必须是 MirroredRepeat，和静帧那条路径一致。
      // 着色器里 cuv 先乘 1.3（x 再乘 0.9），采样范围因此撑到
      // uv.x −0.085…1.085、uv.y −0.15…1.15 —— 画面四周有一圈**取不到图**的余量。
      // 原站靠镜像把这圈余量填成画面自身的倒影，再被色散和暗角一压，
      // 就是卡片那圈发白的"玻璃边框"。我先前给视频设了 ClampToEdge，
      // 这圈余量变成边缘像素的横向拖影 —— 边框没了，还多了一片条纹。
      // （ClampToEdge 是 WebGL1 对非二次幂纹理的限制；这里是 WebGL2，不需要。）
      tex.wrapS = THREE.MirroredRepeatWrapping;
      tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      // A paused video's first frame may precede the frame callback registration.
      tex.needsUpdate = true;
      this.#uniforms.uTex.value = tex;
      this.#uniforms.uTexAspect.value = v.videoWidth / v.videoHeight;
      this.#animator.animate('loaded', 1, 1);
      this.#resolveReady(true);
    }, { once: true });
    v.addEventListener('error', () => {
      console.warn(`作品视频未就位：${src}`);
      this.#resolveReady(false);
    }, { once: true });
  }

  /** Decode and upload while hidden, so the reveal does not pay the first-use cost. */
  async prepareFirstFrame(renderer, timeoutMs = 8000) {
    if (this.#disposed) return false;
    let timer;
    if (this.#video && this.#video.readyState < 2) {
      // Some mobile browsers defer decoding until play, even with preload=auto.
      this.#video.play().catch(() => {});
    }
    try {
      const ready = await Promise.race([
        this.#ready,
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
      // 换页可发生在 loadeddata 与 Promise 续执行之间，不上传已释放的纹理。
      if (this.#disposed) return false;
      const texture = this.#uniforms.uTex.value;
      if (ready && texture) renderer.initTexture(texture);
      return ready;
    } finally {
      clearTimeout(timer);
      if (this.#video && !this.visible) this.#video.pause();
    }
  }

  setAlpha(a) {
    this.#uniforms.uAlpha.value = a;
    // 完全透明时连网格一起关掉 —— 全部板子全程参与绘制是白花的开销
    const wasVisible = this.visible;
    this.visible = a > 0.01;
    this.#mesh.visible = this.visible;
    // 只有转到画面里的那几块才解码。看不见的板子继续播是纯粹的 CPU 浪费，
    // 而且它们转回来时会从当前时间继续，比从头播更自然。
    if (this.#video && this.visible !== wasVisible) {
      if (this.visible) this.#video.play().catch(() => {});
      else this.#video.pause();
    }
  }

  setPosX(x) { this.#uniforms.uPosX.value = x; }

  update(deltaTime) { this.#animator.update(deltaTime); }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#resolveReady(false);
    if (this.#video) { this.#video.pause(); this.#video.removeAttribute('src'); this.#video.load(); }
    this.#uniforms.uTex.value?.dispose();
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
  }
}

export class WorksThumbnails extends THREE.Object3D {
  #uniforms;
  #items = [];
  #trigger = null;
  #envMap;
  #coinOrbitIntro = null;

  constructor(commonUniforms, envMap) {
    super();
    this.name = 'WorksThumbnails';
    this.#envMap = envMap;
    this.#uniforms = {
      ...commonUniforms,
      uNumWorks: { value: 0 },
      uCurrentIndex: { value: 0 },
      uScrollVelocity: { value: 0 },
    };
  }

  /** 从 DOM 里的 [data-top_works_item] 取图，顺序即作品顺序。 */
  in() {
    this.out();
    const nodes = [...document.querySelectorAll('[data-top_works_item]')];
    nodes.forEach((node, index) => {
      // 有视频就用视频，没有就退回静帧
      const src = node.getAttribute('data-top_works_video')
        || node.getAttribute('data-top_works_item');
      const item = new WorksThumbnail(src, this.#uniforms, this.#envMap, {
        preload: index < 3 ? 'auto' : 'metadata',
      });
      this.#items.push(item);
      this.add(item);
    });
    this.#uniforms.uNumWorks.value = this.#items.length;
    this.#trigger = topScrollManager.getTrigger('works_progress');
  }

  out() {
    this.#items.forEach((i) => { this.remove(i); i.dispose(); });
    this.#items = [];
    this.#trigger = null;
  }

  /** 0→1 drives the opening orbit; null hands it back to the existing scroll. */
  setCoinOrbitIntro(progress) {
    this.#coinOrbitIntro = progress == null
      ? null
      : THREE.MathUtils.clamp(Number(progress) || 0, 0, 1);
  }

  prepareCoinWorks(renderer) {
    // u 从 0→1 时前 3 块参与渐显，包括侧面那块半透明屏幕。
    return Promise.all(this.#items.slice(0, 3).map((item) => item.prepareFirstFrame(renderer)));
  }

  update({ deltaTime }) {
    if (!this.#trigger || !this.#items.length) return;
    const n = this.#items.length;

    // 连续、对称的弱磁吸：正反拖动都跟手，跨过两件中点也不会突然跳档。
    const raw = lerper.set('works_progress', this.#trigger.progress, 1) * (n + 1);
    const magnetic = raw - Math.sin(raw * Math.PI * 2) * 0.045;
    // Keep the real scroll dampers warm while the opening controls only the drawing.
    const scrollU = lerper.set('works_current_index', magnetic, 0.75);
    const u = this.#coinOrbitIntro ?? scrollU;
    this.#uniforms.uCurrentIndex.value = u;
    this.#uniforms.uScrollVelocity.value = lerper.set(
      'works_progress_velocity', lerper.get('works_progress')?.velocity || 0, 0.5,
    );

    // 头尾各留一段渐显，免得第一块和最后一块是突然出现的
    const fadeIn = Math.min(1, u * 2);
    const fadeOut = Math.min(1, (n + 1 - u) * 2);
    const layoutScale = Math.min(1, this.#uniforms.uScreenAspectRatio.value / 1.5);

    this.#items.forEach((item, i) => {
      const x = i + 1 - u;
      // 中央尺寸保持，侧屏恢复比例并展开至画框两侧；窄屏同步适应画幅。
      item.position.set(Math.sin(x) * ORBIT_RADIUS_X * layoutScale, -x * layoutScale, Math.cos(x) * 5 - 6);
      item.rotation.y = x * 0.6;
      item.scale.setScalar(layoutScale * ORBIT_SCREEN_SCALE
        * (0.9 + 0.2 * (1 - Math.min(1, Math.abs(x)))));
      item.setPosX(x);
      item.setAlpha((1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.8, 2.5)) * fadeIn * fadeOut);
      item.update(deltaTime);
    });
  }
}

/**
 * 承载那一圈屏幕的独立场景。它用**主场景的相机**渲染（原站
 * `setRenderCamera(topPageMainScene.camera)`），所以鼠标带动主字标偏转时，
 * 这一圈也跟着一起偏 —— 两者共享同一套透视。
 */
export class ThumbnailScene extends THREE.Scene {
  #works;

  constructor(commonUniforms, envMap) {
    super();
    this.#works = new WorksThumbnails(commonUniforms, envMap);
    this.add(this.#works);
  }

  in() { this.#works.in(); }

  out() { this.#works.out(); }

  setCoinOrbitIntro(progress) { this.#works.setCoinOrbitIntro(progress); }

  prepareCoinWorks(renderer) { return this.#works.prepareCoinWorks(renderer); }

  update(ctx) { this.#works.update(ctx); }
}
