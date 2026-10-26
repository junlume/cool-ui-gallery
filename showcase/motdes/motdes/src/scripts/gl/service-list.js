import * as THREE from 'three';

import { lerper } from '../core/lerper.js';
import { topScrollManager } from '../core/top-scroll-manager.js';
import { serviceListVert, thumbnailFrag, serviceTitleFrag } from './shaders/service.js';
import { gridFrag, crossFrag } from './shaders/index.js';
import { SERVICE_CASES } from '../../lib/service-cases.js';
import { serviceScrollForProgress, serviceIndexFromScroll } from '../../lib/service-presentation.js';
import { projectServiceVideoFrame } from './service-video-frame.js';

/**
 * SERVICE 段那面卷起来的视频墙。
 *
 * 案例视频面板横向排开，整条带子在 Z 方向被折成一道波：
 *
 *   theta     = localPos.x·π + (1−uServiceIn)·8 − uStelllaIn·2
 *   curvedPos.z = −sin(theta) · 4·uServiceIn·(1−uStelllaIn)
 *
 * uServiceIn 从 0 走到 1 的过程里，theta 的相位偏移从 8 弧度退到 0 ——
 * 看起来就是那面墙"从远处卷着转过来、逐渐摊平正对镜头"。
 * 法线也跟着 cos(theta) 转，所以每块板的受光是跟着弯的，不是贴片。
 *
 * 面板本身：单位平面 ×0.3，宽再乘 (16/9)·0.85，按 uThumbnailScroll 横移。
 * 最后一块带 IS_STELLLA —— 滚到 stellla 时它会脱离波面，铺成全屏。
 *
 * 素材由 service-cases.js 管理，与页面介绍共用顺序，静音循环。
 */

const SOURCES = SERVICE_CASES.map((item) => item.video);
const NUM_THUMBNAILS = SOURCES.length;

class ServiceThumbnail extends THREE.Mesh {
  #video;
  #texture = null;
  #active = false;
  #blocked = false;
  #playPending = false;
  #disposed = false;
  #activation = 0;

  constructor(index, src, commonUniforms, isStellla) {
    const material = new THREE.ShaderMaterial({
      vertexShader: serviceListVert,
      fragmentShader: thumbnailFrag,
      uniforms: {
        ...commonUniforms,
        uInstanceId: { value: index },
        uTextureA: { value: null },
        uTextureB: { value: null },
        uTextureAlpha: { value: 1 },
        uMixWeight: { value: 0 },
        uCanvasAspect: { value: 1 },
        uVideoAspect: { value: 16 / 9 },
      },
      defines: isStellla ? { IS_THUMBNAIL: '', IS_STELLLA: '' } : { IS_THUMBNAIL: '' },
      transparent: true,
      depthTest: false,
    });
    super(new THREE.PlaneGeometry(1, 1, 16, 8), material);
    this.frustumCulled = false;
    const video = document.createElement('video');
    this.#video = video;
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    // 不在硬币开场时同时解码所有案例；快进入视频墙时再启动相邻屏幕。
    video.preload = 'metadata';
    video.addEventListener('loadeddata', this.#onLoaded, { once: true });
    video.addEventListener('canplay', this.#retryPlayback);
    document.addEventListener('pointerdown', this.#retryPlayback);
    document.addEventListener('keydown', this.#retryPlayback);
    document.addEventListener('visibilitychange', this.#onVisibility);
    video.src = src;
  }

  #onLoaded = () => {
    if (this.#disposed || this.#texture) return;
    const video = this.#video;
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.#texture = tex;
    // 前景与放大的背景共用这张动态纹理，不创建第二路解码。
    this.material.uniforms.uTextureA.value = tex;
    this.material.uniforms.uTextureB.value = tex;
    this.material.uniforms.uVideoAspect.value = video.videoWidth / (video.videoHeight || 1);
    if (this.#active) this.#play();
  };

  async #play() {
    if (this.#disposed || !this.#active || document.hidden || this.#blocked || this.#playPending || !this.#video.paused) return;
    const activation = this.#activation;
    this.#playPending = true;
    try {
      await this.#video.play();
    } catch {
      if (activation === this.#activation && !this.#disposed && this.#active && !document.hidden) this.#blocked = true;
    } finally {
      this.#playPending = false;
      // play() 可能在换页、切后台之后才完成，不能把已隐藏的视频重新播起来。
      if (this.#disposed || !this.#active || document.hidden) this.#video.pause();
      else if (activation !== this.#activation) this.#play();
    }
  }

  #retryPlayback = () => {
    if (!this.#active || document.hidden || this.#disposed) return;
    this.#blocked = false;
    this.#play();
  };

  #onVisibility = () => {
    this.#activation += 1;
    if (document.hidden) this.#video.pause();
    else this.#retryPlayback();
  };

  get firstTexture() { return this.#texture; }

  get videoElement() { return this.#video; }

  setActive(active) {
    if (this.#disposed || this.#active === active) return;
    this.#activation += 1;
    this.#active = active;
    if (active) {
      this.#video.preload = 'auto';
      this.#blocked = false;
      if (this.#video.readyState >= 2) this.#onLoaded();
      this.#play();
    } else this.#video.pause();
  }

  update() {
    // 恢复浏览器主动暂停的视频；被策略拒绝后等待下一次交互，不逐帧重试。
    if (this.#active) this.#play();
  }

  resize(canvasAspect) {
    this.material.uniforms.uCanvasAspect.value = canvasAspect;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    document.removeEventListener('pointerdown', this.#retryPlayback);
    document.removeEventListener('keydown', this.#retryPlayback);
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#video.removeEventListener('loadeddata', this.#onLoaded);
    this.#video.removeEventListener('canplay', this.#retryPlayback);
    this.#video.pause();
    this.#video.removeAttribute('src');
    this.#video.load();
    this.#texture?.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}

export class ServiceList extends THREE.Mesh {
  #uniforms;
  #cross;
  #thumbnails = [];
  #title;
  #triggers = {};

  constructor(commonUniforms, serviceTitleTexture) {
    const grid = new THREE.Vector2(15, 10).multiplyScalar(5);
    const uniforms = {
      ...commonUniforms,
      uServiceIn: { value: 0 },
      uGrid: { value: grid },
      uScale: { value: new THREE.Vector3(1, 1, 1) },
      uThumbnailScroll: { value: 0 },
      uStelllaIn: { value: 0 },
      uStelllaView: { value: 0 },
    };

    super(new THREE.PlaneGeometry(1, 1, 64, 64), new THREE.ShaderMaterial({
      name: 'ServiceListMaterial',
      uniforms,
      vertexShader: serviceListVert,
      fragmentShader: gridFrag,
      transparent: true,
      defines: { IS_GRID: '' },
      depthWrite: false,
      depthTest: false,
    }));
    this.renderOrder = -999;
    this.frustumCulled = false;
    this.#uniforms = uniforms;

    // 十字标记：沿波面铺一层，随时间与滚动缓慢左移（loopPos 那段 mod 1.0）
    const crossCount = new THREE.Vector2(grid.x / 5, grid.y / 5);
    const ids = [];
    for (let y = 0; y <= crossCount.y; y += 1) {
      for (let x = 0; x <= crossCount.x; x += 1) ids.push(x / crossCount.x, y / crossCount.y);
    }
    const base = new THREE.PlaneGeometry(1, 1, 8, 8);
    const inst = new THREE.InstancedBufferGeometry();
    inst.setAttribute('position', base.getAttribute('position'));
    inst.setAttribute('uv', base.getAttribute('uv'));
    inst.setAttribute('instanceId', new THREE.InstancedBufferAttribute(new Float32Array(ids), 2));
    inst.setIndex(base.getIndex());
    this.#cross = new THREE.Mesh(inst, new THREE.ShaderMaterial({
      name: 'ServiceListCrossMaterial',
      uniforms: { ...uniforms, uGridCross: { value: crossCount } },
      vertexShader: serviceListVert,
      fragmentShader: crossFrag,
      transparent: true,
      defines: { IS_CROSS: '' },
      depthWrite: false,
      depthTest: false,
    }));
    this.#cross.renderOrder = -999;
    this.#cross.frustumCulled = false;
    this.add(this.#cross);

    for (let i = 0; i < NUM_THUMBNAILS; i += 1) {
      const t = new ServiceThumbnail(i, SOURCES[i], uniforms, i === NUM_THUMBNAILS - 1);
      this.add(t);
      this.#thumbnails.push(t);
    }

    this.#title = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 64, 1), new THREE.ShaderMaterial({
      uniforms: {
        ...uniforms,
        uServiceTitleTex: { value: serviceTitleTexture ?? null },
        uPrevTexture: { value: null },
        uNextTexture: { value: null },
        uTextureBlend: { value: 0 },
        uHasPrevTexture: { value: 0 },
        uHasNextTexture: { value: 0 },
      },
      vertexShader: serviceListVert,
      fragmentShader: serviceTitleFrag,
      depthWrite: false,
      defines: { IS_TITLE: '' },
    }));
    this.#title.renderOrder = -999;
    this.#title.frustumCulled = false;
    this.add(this.#title);
  }

  in() {
    this.#triggers = {
      serviceIn: topScrollManager.getTrigger('service_in'),
      serviceProgress: topScrollManager.getTrigger('service_progress'),
      stelllaIn: topScrollManager.getTrigger('stellla_in'),
      stellla: topScrollManager.getTrigger('stellla'),
    };
  }

  out() {
    this.#triggers = {};
    this.#thumbnails.forEach((t) => t.setActive(false));
  }

  /** Read the currently rendered surface without advancing scroll or playback. */
  getVideoFrame(index, camera, rect) {
    const thumbnail = Number.isInteger(index) ? this.#thumbnails[index] : null;
    if (!thumbnail || !this.visible || !camera) return null;
    camera.updateWorldMatrix(true, false);
    thumbnail.updateWorldMatrix(true, false);
    const corners = projectServiceVideoFrame({
      uniforms: thumbnail.material.uniforms,
      matrixWorld: thumbnail.matrixWorld,
      camera,
      rect,
      isStellla: 'IS_STELLLA' in thumbnail.material.defines,
    });
    if (!corners) return null;
    const video = thumbnail.videoElement;
    return {
      corners,
      video,
      aspect: video.videoWidth > 0 && video.videoHeight > 0
        ? video.videoWidth / video.videoHeight : thumbnail.material.uniforms.uVideoAspect.value,
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : null,
    };
  }

  /**
   * 滚动映射。这段是原站的字面搬运，几个数看着莫名其妙但都有用：
   *
   *   scroll = (progress·(2N+1) + 1) / 2，按案例数量扩展，N=3 时保持原值 7
   *   scroll < 1 时再往回退一点          让第一块进场时"先探个头"
   *   round 之后按 0.4 的比例往整数吸     面板会轻轻吸附到位，不是自由漂
   */
  update({ deltaTime }) {
    const T = this.#triggers;
    if (!T.serviceIn || !T.serviceProgress || !T.stelllaIn) return;

    this.#uniforms.uServiceIn.value = lerper.set('serviceList_serviceIn', T.serviceIn.progress, 0.3);
    this.visible = this.#uniforms.uServiceIn.value > 0.01;

    let scroll = serviceScrollForProgress(lerper.set('serviceList_thumbnailScroll', T.serviceProgress.progress, 1), NUM_THUMBNAILS);
    if (scroll < 1) scroll -= (1 - (lerper.get('service_renderer')?.current || 0)) * 0.4;
    const snapped = Math.round(scroll);
    const eased = lerper.set('serviceList_current_index', snapped - (snapped - scroll) * 0.4, 0.5);
    this.#uniforms.uThumbnailScroll.value = Math.min(NUM_THUMBNAILS, eased);

    this.#uniforms.uStelllaIn.value = lerper.set('serviceList_stelllaIn', T.stelllaIn.progress, 0.7);
    this.#uniforms.uStelllaView.value = lerper.set(
      'serviceList_stelllaView',
      Math.max(0, Math.min(1, this.#uniforms.uThumbnailScroll.value - (NUM_THUMBNAILS - 0.5))),
      0.7,
    ) + this.#uniforms.uStelllaIn.value * 0.5;

    const center = serviceIndexFromScroll(this.#uniforms.uThumbnailScroll.value, NUM_THUMBNAILS);
    this.#thumbnails.forEach((t, i) => {
      t.setActive(T.serviceIn.progress > 0.01 && Math.abs(i - center) <= 1);
      t.update();
    });
    this.#updateTitleBlend();

    // Text follows the video actually being rendered, including both damping stages.
    // Keep the sixth case readable until its full-screen introduction takes over.
    const serviceVisible = (lerper.get('service_renderer')?.current ?? 0) >= 0.9999;
    const featuredFade = 1 - Math.max(0, Math.min(1, T.stellla.progress * 3));
    topScrollManager.emit('service/frame', {
      index: center,
      opacity: serviceVisible ? featuredFade : 0,
    });
  }

  /** 标题带左侧那层若隐若现的画面：按当前滚到第几块，在相邻两块之间过渡。 */
  #updateTitleBlend() {
    const u = this.#title.material.uniforms;
    const s = Math.max(0, Math.min(NUM_THUMBNAILS, this.#uniforms.uThumbnailScroll.value));
    const tex = this.#thumbnails.map((t) => t.firstTexture);
    const i = Math.max(0, Math.min(NUM_THUMBNAILS - 1, Math.floor(s)));
    const prev = i > 0 ? tex[i - 1] : null;
    const next = tex[i] ?? null;
    u.uPrevTexture.value = prev;
    u.uNextTexture.value = next;
    u.uHasPrevTexture.value = prev ? 1 : 0;
    u.uHasNextTexture.value = next ? 1 : 0;
    // 终点 s=N 时仍停在最后案例，不能把小数重置为 0 又跳回上一张背景。
    u.uTextureBlend.value = Math.max(0, Math.min(1, s - i));
  }

  resize(camera) {
    const dist = Math.abs(camera.position.z);
    const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const w = h * camera.aspect;
    const s = Math.max(h, w);
    this.#uniforms.uScale.value.set(s, s, 1);
    const canvasAspect = Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight);
    this.#thumbnails.forEach((t) => t.resize(canvasAspect));
  }

  dispose() {
    this.#thumbnails.forEach((t) => t.dispose());
    this.#cross.geometry.dispose();
    this.#cross.material.dispose();
    this.#title.geometry.dispose();
    this.#title.material.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
