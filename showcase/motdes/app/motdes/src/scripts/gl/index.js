import * as THREE from 'three';

import { CameraController } from './camera-controller.js';
import { MainLogo } from './main-logo.js';
import { Logo2D } from './logo-2d.js';
import { Grid } from './grid.js';
import { BGQuadTree } from './bg-quad-tree.js';
import { TransparentBuffer } from './transparent-buffer.js';
import { ProceduralTexture, createStudioEnvMap } from './procedural-texture.js';
import { createLogoTexture, createWorksTitleTexture } from './text-textures.js';
import { animator, Animator, Easings } from './animator.js';
import { StableFluids } from './fluids.js';
import { MissionVisionScene } from './mission-vision-scene.js';
import { ServiceScene } from './service-scene.js';
import { ThumbnailScene } from './works-thumbnails.js';
import { createLoadingSVGTexture } from './loading-texture.js';
import { noiseFrag } from './shaders/index.js';
import { compositeVert, compositeFrag, finalFrag } from './shaders/composite.js';
import { Bloom, BLOOM_WEIGHTS } from './bloom.js';
import { lerper } from '../core/lerper.js';
import { topScrollManager } from '../core/top-scroll-manager.js';
import { deviceManager } from '../core/device-manager.js';
import { profileBackdropFrame } from '../../lib/profile-timeline.js';

/**
 * 字标外层缩放。原站字面量 4.3（× MainLogo 内部的 3 = 12.9）。
 *
 * 之前收到 3.1 是因为当时模型穿模、看着像涨满了屏；穿模修好之后再对录屏，
 * 3.1 明显小了一圈。既然目标是一比一，这里回到原站的 4.3。
 * 觉得还是大，改这一个数即可 —— 相机、构图都不用动。
 */
const LOGO_SCALE = 4.3;

/**
 * WebGL 层的总装。
 *
 * 渲染必须先进 RT 再贴回画布，不能直接画到画布：
 *   1. 整个场景渲进一张全屏 RT
 *   2. renderOrder 100 的哨兵在中途把已画部分拷进 512² 缓冲
 *   3. renderOrder 101 的字标采样那张缓冲做折射
 *   4. 最后把 RT 贴回画布
 * 少了第 1 步，第 2 步无纹理可读，玻璃会变纯黑。
 *
 * 场景里的层次（由远及近）：
 *   BGQuadTree  renderOrder −1000   卷成圆柱的四叉树砖墙
 *   Grid        renderOrder  −999   图纸网格与十字标记
 *   Logo2D          z = −15         远处的平面字标
 *   MainLogo    renderOrder   101   玻璃 M（scale 4.3 × 网格自身 3 = 12.9）
 */
class GL {
  #renderer = null;
  #scene = null;
  #camera = null;
  #cameraController = null;
  #mainLogo = null;
  #logo2D = null;
  #grid = null;
  #bgQuadTree = null;
  #transparentBuffer = null;
  #noise = null;
  #fluids = null;
  #pointer = new THREE.Vector2();
  #pointerVec = new THREE.Vector2();
  #loadedAnimator = new Animator();
  #sceneRT = null;
  #mvScene = null;
  #mvRT = null;
  #serviceScene = null;
  #serviceRT = null;
  #thumbScene = null;
  #thumbRT = null;
  #missionTrigger = null;
  #serviceTrigger = null;
  #profileTrigger = null;
  #visibleMV = 0;
  #visibleMVBlur = 0;
  #lenis = null;
  #dragPointerId = null;
  #dragLast = new THREE.Vector2();
  #cursor = '';
  #debugRT = null;
  #metricRT = null;
  #probeScene = null;
  #probeMaterial = null;
  #hdrRT = null;
  #mvStats = null;
  #bloom = null;
  #compositeRT = null;
  #finalScene = null;
  #finalMaterial = null;
  #blitScene = null;
  #blitCamera = null;
  #blitMaterial = null;
  #commonUniforms = null;
  #clock = new THREE.Clock();
  #started = false;
  #sceneStats = null;
  #coinVideo = null;
  #coinVideoTexture = null;
  #coinVideoTextures = new Map();
  #coinOrbitIntro = null;
  #loadingCompletedImmediately = false;
  #coinVideoUniforms = {
    uCoinVideoTex: { value: null },
    uCoinVideoAspect: { value: 1 },
    uCoinVideoMix: { value: 0 },
  };

  init(container) {
    if (this.#started || !container) return false;

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    try {
      this.#renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,          // 折射本身在做多重采样，MSAA 只是白花开销
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      container.removeChild(canvas);
      return false;               // 无 WebGL 时静默退场，DOM 层照常工作
    }

    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.setClearColor(0x000000, 0);

    this.#scene = new THREE.Scene();
    this.#camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.#cameraController = new CameraController(this.#camera);

    this.#commonUniforms = {
      uTime: { value: 0 },
      uScreenAspectRatio: { value: 1 },
      uScreenResolution: { value: new THREE.Vector2(1, 1) },
      uHideQuad: { value: 0 },
      uKvOutVisibility: { value: 1 },
      uScrollOutro: { value: 0 },
      uFluidsTex: { value: null },
      uLoaded: this.#loadedAnimator.add({
        name: 'loaded', initValue: this.#loadingCompletedImmediately ? 1 : 0,
        easing: Easings.easeOutCubic,
      }),
    };

    // 指针驱动的速度场。砖墙、图纸网格、最终合成都要采样它 ——
    // 必须在建这些之前就位，否则它们拿到的是 null 贴图。
    if (!deviceManager.isSPLayout) {
      this.#fluids = new StableFluids(this.#renderer, this.#commonUniforms);
      this.#commonUniforms.uFluidsTex.value = this.#fluids.getTexture();
    }

    // 噪声贴图：64² FloatType，逐帧重绘。玻璃的粗糙度扰动与三套图案都吃它
    this.#noise = new ProceduralTexture({
      renderer: this.#renderer,
      fragmentShader: noiseFrag,
      uniforms: this.#commonUniforms,
      resolution: new THREE.Vector2(64, 64),
    });

    const logoTexture = createLogoTexture();
    const worksTitleTexture = createWorksTitleTexture();

    // 砖墙最先加进场景，renderOrder −1000 保证它永远在最底
    this.#bgQuadTree = new BGQuadTree({
      renderer: this.#renderer,
      commonUniforms: this.#commonUniforms,
      noiseTexture: this.#noise.texture,
      logoTexture,
      worksTitleTexture,
      worksImages: [...document.querySelectorAll('[data-top_works_item]')]
        .map((e) => e.getAttribute('data-top_works_item'))
        .filter(Boolean),
    });
    this.#bgQuadTree.renderOrder = -1000;
    // 原始几何只有单位大小，靠顶点着色器撑到 ±13 单位 —— three 用未变形的
    // 包围球做视锥剔除，会在相机稍一偏移时把整面墙判成不可见。必须关掉。
    this.#bgQuadTree.frustumCulled = false;
    this.#scene.add(this.#bgQuadTree);

    this.#grid = new Grid('light', 'round', this.#commonUniforms);
    this.#grid.frustumCulled = false;
    this.#scene.add(this.#grid);

    this.#transparentBuffer = new TransparentBuffer();
    this.#scene.add(this.#transparentBuffer);

    // 环境贴图两处共用：玻璃字标的折射、环绕屏幕的反射
    const envMap = createStudioEnvMap(this.#renderer);

    this.#mainLogo = new MainLogo({
      commonUniforms: this.#commonUniforms,
      transparentBuffer: this.#transparentBuffer,
      envMap,
      noiseTexture: this.#noise.texture,
      serviceSceneTexture: null,
      renderOrderBase: this.#transparentBuffer.renderOrder,
    });
    // 原站是外层 4.3 × 内层网格 3 = 12.9，字标占屏高 67%。
    // 那个体量在我们的构图里压得太满（尤其窄窗口会顶到上下边），
    // 收到 3.1 —— 占屏高约 48%，留出呼吸又不失主体感。
    this.#mainLogo.scale.setScalar(LOGO_SCALE);
    this.#mainLogo.position.set(0, -0.3, 0);
    this.#scene.add(this.#mainLogo);
    this.#scene.add(this.#mainLogo.outlineContainer);

    this.#logo2D = new Logo2D(this.#commonUniforms, logoTexture);
    this.#logo2D.position.set(0, 0, -15);
    this.#scene.add(this.#logo2D);

    // MISSION / VISION 是独立的一张亮底场景，单独渲一张 RT 再由合成擦上来。
    // 注意 add() 会把描边容器从主场景里**摘走** —— 原站就是这么做的，
    // 所以玻璃字标在 KV / works 段是没有勾边的，勾边只在亮底那一段出现。
    this.#mvScene = new MissionVisionScene(this.#commonUniforms);
    this.#mvScene.add(this.#mainLogo.outlineContainer);
    this.#serviceScene = new ServiceScene(this.#commonUniforms);
    this.#thumbScene = new ThumbnailScene(this.#commonUniforms, envMap);
    this.#thumbScene.setCoinOrbitIntro(this.#coinOrbitIntro);

    /**
     * 场景 RT 必须是**半精度浮点**（原站 rtMainScene / rtServiceScene 同款）。
     *
     * 这不是精度洁癖，是辉光的前提：亮部提取算的是 c * max(0, c − 0.9)。
     * 用默认的 UnsignedByte，一切在 1.0 被夹掉，过阈部分最多只有 0.1，
     * 再一模糊就没了 —— 实测辉光对画面的贡献只有 **0.5%**，等于白做。
     * 而场景里本来就有明确超过 1 的量：字标平面的 o.xyz *= 1.5、
     * 砖墙退场那一下的 (o.xyz+0.1)*20.0。HDR 存下来，辉光才有东西可抓。
     *
     * MISSION/VISION 那张保持 8 位 —— 原站 rtMissionVisionScene 也是 {}，
     * 那是一张平光的亮底场景，没有高动态。
     */
    const HDR = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.#sceneRT = new THREE.WebGLRenderTarget(1, 1, HDR);
    this.#mvRT = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.#serviceRT = new THREE.WebGLRenderTarget(1, 1, HDR);
    // 这张要带 alpha —— 合成靠 thumb.a 决定哪里盖住主画面
    this.#thumbRT = new THREE.WebGLRenderTarget(1, 1, HDR);
    // 侧屏采样服务场景 —— 必须等这张 RT 建出来才能接上
    this.#mainLogo.setServiceSceneTexture(this.#serviceRT.texture);
    this.#blitMaterial = new THREE.ShaderMaterial({
      vertexShader: compositeVert,
      fragmentShader: compositeFrag,
      uniforms: {
        ...this.#coinVideoUniforms,
        uSceneTex: { value: this.#sceneRT.texture },
        uMissionVisionTex: { value: this.#mvRT.texture },
        uServiceTex: { value: this.#serviceRT.texture },
        uThumbnailTex: { value: this.#thumbRT.texture },
        uFluidsTex: this.#commonUniforms.uFluidsTex,
        uResolution: this.#commonUniforms.uScreenResolution,
        uVisibleMissionVision: { value: 0 },
        uVisibleMissionVisionMotionBlur: { value: 0 },
        uVisibleService: { value: 0 },
        uLoadingSVGTex: { value: null },
        uLoaded: this.#commonUniforms.uLoaded,
        uScreenAspectRatio: this.#commonUniforms.uScreenAspectRatio,
      },
      depthTest: false,
      depthWrite: false,
    });
    this.#blitScene = new THREE.Scene();
    this.#blitCamera = new THREE.Camera();
    this.#blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#blitMaterial));

    // 合成结果先落一张 RT —— 辉光要拿它做亮部提取，不能直接冲画布
    this.#compositeRT = new THREE.WebGLRenderTarget(1, 1, {
      ...HDR, depthBuffer: false, stencilBuffer: false,
    });
    this.#bloom = new Bloom(this.#renderer);
    this.#finalMaterial = new THREE.ShaderMaterial({
      vertexShader: compositeVert,
      fragmentShader: finalFrag,
      uniforms: {
        uTex: { value: this.#compositeRT.texture },
        uFluidsTex: this.#commonUniforms.uFluidsTex,
        uBloom0: { value: this.#bloom.textures[0] },
        uBloom1: { value: this.#bloom.textures[1] },
        uBloom2: { value: this.#bloom.textures[2] },
        uBloomWeights: { value: new THREE.Vector3(...BLOOM_WEIGHTS) },
        uCoinVideoMix: this.#coinVideoUniforms.uCoinVideoMix,
        uCoinVideoAspect: this.#coinVideoUniforms.uCoinVideoAspect,
        uScreenAspectRatio: this.#commonUniforms.uScreenAspectRatio,
        uVisibleMissionVision: this.#blitMaterial.uniforms.uVisibleMissionVision,
        uVisibleMissionVisionMotionBlur: this.#blitMaterial.uniforms.uVisibleMissionVisionMotionBlur,
        uResolution: this.#commonUniforms.uScreenResolution,
      },
      depthTest: false,
      depthWrite: false,
    });
    this.#finalScene = new THREE.Scene();
    this.#finalScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#finalMaterial));

    window.addEventListener('pointermove', this.#onPointerMove);
    // 挂 window 而不是 canvas：GL 画布压在所有 DOM 之下，指针事件到不了它身上。
    window.addEventListener('pointerdown', this.#onPointerDown);
    window.addEventListener('pointerup', this.#onPointerUp);
    window.addEventListener('pointercancel', this.#onPointerUp);
    this.#started = true;   // resize() 有 started 守卫，必须先置位再调
    this.resize();
    return true;
  }

  #onPointerMove = (e) => {
    if (this.#coinVideoUniforms.uCoinVideoMix.value === 0) this.#mainLogo?.hover(e);
    // 归一化到 −1..1，y 轴朝上 —— 流体着色器按这个约定写的
    this.#pointer.set(
      (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1,
      -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1),
    );

    if (this.#dragPointerId !== null) {
      if (e.pointerId !== this.#dragPointerId) return;
      this.#mainLogo?.dragBy(
        this.#pointer.x - this.#dragLast.x,
        this.#pointer.y - this.#dragLast.y,
        this.#camera,
      );
      this.#dragLast.copy(this.#pointer);
      return;
    }
    // 没在拖：光标提示这块能抓。只在状态变化时写 style，别每次移动都触发重算。
    this.#setCursor(this.#coinVideoUniforms.uCoinVideoMix.value === 0
      && this.#mainLogo?.canGrab(this.#pointer, this.#camera) ? 'grab' : '');
  };

  #onPointerDown = (e) => {
    if (this.#coinVideoUniforms.uCoinVideoMix.value > 0) return;
    if (e.button !== 0 || this.#dragPointerId !== null) return;
    // 字标背后压着链接/按钮时，让 DOM 先拿走这一下
    if (e.target instanceof Element && e.target.closest('a,button,input,textarea,select,[role="button"]')) return;
    const ndc = new THREE.Vector2(
      (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1,
      -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1),
    );
    if (!this.#mainLogo?.canGrab(ndc, this.#camera)) return;
    this.#dragPointerId = e.pointerId;
    this.#dragLast.copy(ndc);
    this.#mainLogo.grab();
    this.#setCursor('grabbing');
    // 触屏上按住转字标不该同时把页面翻走
    this.#lenis?.stop();
  };

  #onPointerUp = (e) => {
    if (this.#dragPointerId === null || e.pointerId !== this.#dragPointerId) return;
    this.#dragPointerId = null;
    this.#mainLogo?.release();
    this.#setCursor('');
    this.#lenis?.start();
  };

  #setCursor(v) {
    if (this.#cursor === v) return;
    this.#cursor = v;
    document.body.style.cursor = v;
  }

  /** Prepare both opening videos while the loading layer still covers the scene. */
  prepareCoinVideo(video) {
    if (!video) return null;
    let texture = this.#coinVideoTextures.get(video);
    if (!texture) {
      texture = new THREE.VideoTexture(video);
      // These custom shaders write display RGB directly, just like the HTML video.
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      this.#coinVideoTextures.set(video, texture);
      this.#renderer?.initTexture(texture);
    }
    return texture;
  }

  /** Swap prepared textures without allocating at the hand movement. */
  setCoinVideo(video) {
    if (video && video === this.#coinVideo) return;
    this.#coinVideo = video ?? null;
    this.#coinVideoTexture = video ? this.prepareCoinVideo(video) : null;
    if (!video) {
      for (const texture of this.#coinVideoTextures.values()) texture.dispose();
      this.#coinVideoTextures.clear();
    }
    this.#coinVideoUniforms.uCoinVideoTex.value = this.#coinVideoTexture;
    this.#coinVideoUniforms.uCoinVideoAspect.value = video?.videoWidth && video?.videoHeight
      ? video.videoWidth / video.videoHeight : 1;
  }

  /** Only replace the main backdrop; ABOUT keeps its separate M and scroll animation. */
  setCoinVideoMix(value) {
    const mix = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
    this.#coinVideoUniforms.uCoinVideoMix.value = mix;
    if (mix > 0) {
      if (this.#dragPointerId !== null) {
        this.#dragPointerId = null;
        this.#mainLogo?.release();
      }
      this.#setCursor('');
    }
  }

  setCoinOrbitIntro(progress) {
    this.#coinOrbitIntro = progress == null
      ? null : THREE.MathUtils.clamp(Number(progress) || 0, 0, 1);
    this.#thumbScene?.setCoinOrbitIntro(this.#coinOrbitIntro);
  }

  /** Warm the opening's visible video textures before the throw (bounded decoding wait). */
  prepareCoinWorks() {
    return this.#thumbScene?.prepareCoinWorks(this.#renderer) ?? Promise.resolve([]);
  }

  /** Skip the original construction-paper reveal, including its three-second zoom. */
  completeLoadingImmediately() {
    this.#loadingCompletedImmediately = true;
    this.#loadedAnimator.setValue('loaded', 1);
  }

  /**
   * 加载结束。原站 onLoadingComplete()：uLoaded 用 easeOutCubic 走 3 秒。
   * 这 3 秒里场景从 2 倍放大缩回原大，一个圆从中心长开把构造图纸擦掉 ——
   * 也就是录屏开头那一下"玻璃字标涨满整屏再退回来"。
   */
  async onLoadingComplete(immediate = false) {
    if (!this.#started) return;
    if (this.#loadingCompletedImmediately) return;
    try {
      this.#blitMaterial.uniforms.uLoadingSVGTex.value = await createLoadingSVGTexture();
    } catch {
      // 烤图失败就直接进场，不要卡住 —— 顶多少一段擦除
    }
    if (this.#loadingCompletedImmediately) this.#loadedAnimator.setValue('loaded', 1);
    else this.#loadedAnimator.animate('loaded', 1, immediate ? 0 : 3);
  }

  in(lenis) {
    if (!this.#started) return;
    this.#lenis = lenis;
    this.#mainLogo.setLenis(lenis);
    this.#mainLogo.in();
    this.#cameraController.in();
    // 触发器名字照抄原站 GL 层的取法，别想当然按区段名取：
    //   亮底的推进用 mission_in（top bottom → top top）
    //   服务场景的接管用 service_in（top bottom+=150% → top center）
    // 取成 'mission' / 'service' 的话，前者进度曲线不对，后者根本不存在 ——
    // 于是 uVisibleService 恒为 0，亮底会一路白到页脚。
    this.#serviceScene.in();
    this.#thumbScene.in();
    this.#missionTrigger = topScrollManager.getTrigger('mission_in');
    this.#serviceTrigger = topScrollManager.getTrigger('service_in');
    this.#profileTrigger = topScrollManager.getTrigger('profile_progress');
  }

  out() {
    if (!this.#started) return;
    this.#serviceScene.out();
    this.#thumbScene.out();
    this.#mainLogo.out();
    this.#cameraController.out();
    this.#profileTrigger = null;
    this.#mvScene.setProfileBackdrop(0);
  }

  changeTopSection(name) {
    if (!this.#started) return;
    this.#mainLogo.changeSection(name);
    this.#logo2D.changeSection(name);
    this.#cameraController.changeSection(name);
    this.#bgQuadTree.changeSection(name);
  }

  resize() {
    if (!this.#started) return;
    // 面板折叠 / 后台标签页时 innerWidth 可能是 0，aspect 会变 NaN，
    // 之后 fov、投影矩阵、乃至所有 uniform 全部污染成 NaN。兜住下限。
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = this.#renderer.getPixelRatio();
    this.#renderer.setSize(w, h, false);
    this.#sceneRT.setSize(w * dpr, h * dpr);
    this.#mvRT.setSize(w * dpr, h * dpr);
    this.#mvScene.resize(w / h);
    this.#serviceRT.setSize(w * dpr, h * dpr);
    this.#thumbRT.setSize(w * dpr, h * dpr);
    this.#compositeRT.setSize(w * dpr, h * dpr);
    this.#bloom.resize(w * dpr, h * dpr);
    this.#serviceScene.resize(w / h);
    this.#commonUniforms.uScreenAspectRatio.value = w / h;
    this.#commonUniforms.uScreenResolution.value.set(w * dpr, h * dpr);
    this.#transparentBuffer.resize(new THREE.Vector2(w * dpr, h * dpr));
    this.#cameraController.resize({ aspectRatio: w / h });
    this.#grid.resize(this.#camera);
    this.#bgQuadTree.resize({
      camera: this.#camera,
      sceneResolution: new THREE.Vector2(w * dpr, h * dpr),
    });
    this.#fluids?.resize(w, h);
  }

  /**
   * @param {number} [dtOverride] 仅供开发期泵帧使用。同步循环里 Clock.getDelta()
   *   恒返回 ≈0，动画器与自转都不会推进，必须喂合成时间才能验证。
   */
  update(dtOverride) {
    if (!this.#started) return;
    const raw = dtOverride ?? this.#clock.getDelta();
    const deltaTime = Math.min(raw, 0.1);   // 切标签页回来时别让 dt 爆掉
    const ctx = { deltaTime };

    if (this.#coinVideo?.videoWidth && this.#coinVideo?.videoHeight) {
      this.#coinVideoUniforms.uCoinVideoAspect.value = this.#coinVideo.videoWidth / this.#coinVideo.videoHeight;
    }

    this.#commonUniforms.uTime.value += deltaTime;
    animator.update(deltaTime);             // 砖墙那十几个 uniform 挂在全局动画器上
    this.#loadedAnimator.update(deltaTime);
    this.#noise.render();

    // 指针位置先阻尼一层，速度再阻尼一层（原站 multiplier 1 / 2）。
    // 直接用原始 pointermove 的差分会又跳又噪，流体会炸出方块状的涡。
    if (this.#fluids) {
      const px = lerper.set('pointerPosX', this.#pointer.x, 1);
      const py = lerper.set('pointerPosY', this.#pointer.y, 1);
      const vx = lerper.set('pointerVelocityX', lerper.get('pointerPosX')?.velocity || 0, 2);
      const vy = lerper.set('pointerVelocityY', -(lerper.get('pointerPosY')?.velocity || 0), 2);
      this.#pointerVec.set(vx, vy);
      this.#fluids.setPointer(this.#pointer.set(px, py), this.#pointerVec);
      this.#fluids.update();
    }

    this.#cameraController.update(ctx);
    this.#serviceScene.update(ctx);
    this.#thumbScene.update(ctx);
    this.#mainLogo.update(ctx);
    this.#logo2D.update(ctx);
    this.#bgQuadTree.update(ctx);

    /**
     * 擦除进度用两级跟随：
     *   visible      追 mission 触发器的进度（每帧走剩余量的一半）
     *   visibleBlur  再追 visible 的"每帧增量"—— 也就是速度
     * 于是 Blur 只在擦除**正在移动**时非零，停住就归零。合成里拿它同时
     * 控制边缘的模糊宽度和那道弧的深浅，一个量顶两用，是原站的写法。
     */
    const missionProgress = this.#missionTrigger
      ? lerper.set('mission_progress', this.#missionTrigger.progress, 1.5) : 0;
    const serviceProgress = this.#serviceTrigger
      ? lerper.set('service_renderer', this.#serviceTrigger.progress, 0.5) : 0;
    const profileProgress = this.#profileTrigger?.progress ?? 0;
    this.#mvScene.setProfileBackdrop(profileBackdropFrame(profileProgress).dark);
    const dMV = missionProgress - this.#visibleMV;
    this.#visibleMVBlur += (dMV - this.#visibleMVBlur) * 0.5;
    this.#visibleMV += dMV * 0.5;
    const cu = this.#blitMaterial.uniforms;
    cu.uVisibleMissionVision.value = this.#visibleMV;
    cu.uVisibleMissionVisionMotionBlur.value = this.#visibleMVBlur;
    cu.uVisibleService.value = serviceProgress;

    this.#renderer.setRenderTarget(this.#sceneRT);
    this.#renderer.clear();
    const renderMain = this.#visibleMV < 0.99 && this.#coinVideoUniforms.uCoinVideoMix.value < 0.999;
    if (renderMain) {
      this.#renderer.render(this.#scene, this.#camera);
    }
    // 场景这一趟的统计要在 blit 覆盖它之前抓走
    this.#sceneStats = {
      calls: renderMain ? this.#renderer.info.render.calls : 0,
      triangles: renderMain ? this.#renderer.info.render.triangles : 0,
    };

    // 亮底那一层只在真的要用时才渲 —— 完全没露出来时白渲一整帧不值。
    if (this.#visibleMV > 0.01 && serviceProgress < 0.9999) {
      this.#mvScene.setScroll(lerper.set('missionVisionScroll', (this.#lenis?.scroll || 0) / Math.max(1, window.innerHeight), 0.5));
      this.#renderer.setRenderTarget(this.#mvRT);
      this.#renderer.clear();
      this.#renderer.render(this.#mvScene, this.#camera);
      this.#mvStats = { calls: this.#renderer.info.render.calls, tris: this.#renderer.info.render.triangles };
    }

    if (serviceProgress > 0.01) {
      this.#renderer.setRenderTarget(this.#serviceRT);
      this.#renderer.clear();
      this.#renderer.render(this.#serviceScene, this.#serviceScene.camera);
    }

    // 环绕屏幕：清成全透明再渲，alpha 才是"这里有没有板子"的真值
    this.#renderer.setRenderTarget(this.#thumbRT);
    this.#renderer.setClearColor(0x000000, 0);
    this.#renderer.clear();
    this.#renderer.render(this.#thumbScene, this.#camera);

    this.#renderer.setRenderTarget(this.#compositeRT);
    this.#renderer.clear();
    this.#renderer.render(this.#blitScene, this.#blitCamera);

    this.#bloom.render(this.#compositeRT.texture);

    this.#renderer.setRenderTarget(null);
    this.#renderer.render(this.#finalScene, this.#blitCamera);
  }

  /**
   * 着色器预编译。原站把加载进度的后半段（0.5→1）交给它 ——
   * 因为玻璃材质那几个着色器编译要几百毫秒，不先编译完就进页面，
   * 首次出现字标时会卡一下。
   */
  async precompile(onProgress) {
    if (!this.#started) return;
    onProgress?.(0);
    if (this.#renderer.compileAsync) {
      await this.#renderer.compileAsync(this.#scene, this.#camera);
    } else {
      this.#renderer.compile(this.#scene, this.#camera);
    }
    onProgress?.(0.45);
    // The opening hides these meshes, but their shaders still need warming before
    // the throw. Three's compile traversal includes invisible meshes.
    if (this.#renderer.compileAsync) {
      await this.#renderer.compileAsync(this.#thumbScene, this.#camera);
    } else {
      this.#renderer.compile(this.#thumbScene, this.#camera);
    }
    // ABOUT 的描边和展开屏幕在独立场景中，提前编译，避免首次入场时卡顿。
    if (this.#renderer.compileAsync) {
      await this.#renderer.compileAsync(this.#mvScene, this.#camera);
      await this.#renderer.compileAsync(this.#serviceScene, this.#serviceScene.camera);
    } else {
      this.#renderer.compile(this.#mvScene, this.#camera);
      this.#renderer.compile(this.#serviceScene, this.#serviceScene.camera);
    }
    onProgress?.(0.85);
    // 再空跑一帧，把 RT、拷贝缓冲这些惰性资源也建起来
    this.update(1 / 60);
    onProgress?.(1);
  }

  get isRunning() {
    return this.#started;
  }

  /** Current SERVICE foreground screen in CSS client pixels, for its modal. */
  getServiceVideoFrame(index) {
    if (!this.#started || !this.#renderer || !this.#serviceScene?.visible) return null;
    return this.#serviceScene.list.getVideoFrame(
      index,
      this.#serviceScene.camera,
      this.#renderer.domElement.getBoundingClientRect(),
    );
  }

  /**
   * 开发期像素探针。读默认帧缓冲会因为没开 preserveDrawingBuffer 而恒返回 0，
   * 所以这里读场景 RT —— 它的内容在两次渲染之间是持久的。
   */
  debugReadPixel(fx, fy) {
    if (!this.#started) return null;
    const buf = new Uint8Array(4);
    this.#renderer.readRenderTargetPixels(
      this.#sceneRT,
      Math.round(this.#sceneRT.width * fx),
      Math.round(this.#sceneRT.height * fy),
      1, 1, buf,
    );
    return [...buf];
  }

  /** 把一个物体的包围盒投影到屏幕，返回占屏比例。用来和原站的实测值对表。 */
  debugScreenCoverage(obj) {
    if (!this.#started || !obj) return null;
    const box = new THREE.Box3().setFromObject(obj);
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i += 1) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      v.project(this.#camera);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    return { w: +((x1 - x0) / 2).toFixed(4), h: +((y1 - y0) / 2).toFixed(4) };
  }

  /** 开发期：把开场擦除倒带到 0 再重放，用来逐帧核对那 3 秒。 */
  debugReplayIntro() {
    this.#loadedAnimator.setValue('loaded', 0);
    this.#loadedAnimator.animate('loaded', 1, 3);
  }

  debugLoaded() {
    return +(this.#commonUniforms.uLoaded.value).toFixed(4);
  }

  /**
   * 开发期：把合成结果渲进一张可读 RT，再取样成一张 24×12 的字符缩略图。
   *
   * 为什么不用截图：面板隐藏时 rAF 不触发，浏览器不重绘，截出来永远是黑的。
   * debugReadPixel 读的又是**合成前**的场景 RT，看不到流体位移、开场擦除、
   * MISSION 亮底那几层。只有把最后那趟合成单独渲一次才能验到真东西。
   */
  /**
   * 开场比对用的四个标量。指标定义和我在原站录屏上跑的那套**逐条对齐**，
   * 否则两边的数字没法比：
   *
   *   center  画面中心 7.85% 宽的方块均值 —— 玻璃字标涨大时最先动的就是它
   *   full    全屏均值
   *   bright  亮度 >200 的像素占比 —— 字标铺满屏幕那一下的强度
   *   radius  从中心向右扫，第一次跌破 60 的位置（占视口宽的比例）
   *           —— 擦除圆的边界，直接对应 uLoaded
   *
   * 用它而不是逐帧截图：Playwright 截一张要上百毫秒，采不到 30fps；
   * 这个在 rAF 里跑，一帧的开销只是一次 160×76 的 readPixels。
   */
  /** 开发期：辉光权重的读写，用来量它到底贡献了多少。 */
  debugBloomWeights() {
    const v = this.#finalMaterial.uniforms.uBloomWeights.value;
    return { x: v.x, y: v.y, z: v.z };
  }

  debugSetBloomWeights(x, y, z) {
    this.#finalMaterial.uniforms.uBloomWeights.value.set(x, y, z);
  }

  /**
   * 开发期：找出画面里最亮的那一小块，并回答"它来自哪一层"。
   *
   * 排查亮斑时最怕的就是靠猜。这里先把最终合成扫出热点坐标，再拿同一坐标
   * 去各张来源 RT 上取样 —— 谁的值超标，就是谁的锅。
   *
   * ⚠️ 来源 RT 是 HalfFloat 的，不能直接用 Uint8Array 去 readRenderTargetPixels
   * （类型不匹配，读回来全是 0，会误导成"哪一层都没问题"）。
   * 所以先用一个只做取样的着色器把它 blit 进一张 8 位 RT，顺便把超过 1 的
   * 部分按 /8 压回可读范围 —— 读到的值 ×8 才是真实亮度。
   */
  debugHotspot() {
    if (!this.#started) return null;
    const W = 160;
    const H = 76;
    if (!this.#metricRT) {
      this.#metricRT = new THREE.WebGLRenderTarget(W, H, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: false, stencilBuffer: false,
      });
    }
    if (!this.#probeScene) {
      this.#probeMaterial = new THREE.ShaderMaterial({
        vertexShader: compositeVert,
        // 取 5×5 邻域的**最大值**再压缩，而不是直接取样。
        // 直接取样等于在 1920×908 上每 64 个像素只看 1 个 —— 孤立的爆亮点
        // 会被整个漏掉，读出来一片正常，把人引向错误结论。
        fragmentShader: 'uniform sampler2D uTex; uniform vec2 uTexel; varying vec2 vUv;'
          + 'void main(){ vec3 m = vec3(0.0);'
          + ' for (int j = -2; j <= 2; j++) { for (int i = -2; i <= 2; i++) {'
          + '   m = max(m, texture2D(uTex, vUv + vec2(float(i), float(j)) * uTexel).rgb); } }'
          + ' gl_FragColor = vec4(m / 8.0, 1.0); }',
        uniforms: { uTex: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 908) } },
        depthTest: false,
        depthWrite: false,
      });
      this.#probeScene = new THREE.Scene();
      this.#probeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#probeMaterial));
    }

    this.#renderer.setRenderTarget(this.#metricRT);
    this.#renderer.render(this.#finalScene, this.#blitCamera);
    const buf = new Uint8Array(W * H * 4);
    this.#renderer.readRenderTargetPixels(this.#metricRT, 0, 0, W, H, buf);

    let best = -1;
    let bx = 0;
    let by = 0;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const o = (y * W + x) * 4;
        const l = buf[o] * 0.3 + buf[o + 1] * 0.6 + buf[o + 2] * 0.1;
        if (l > best) { best = l; bx = x; by = y; }
      }
    }
    const fx = (bx + 0.5) / W;
    const fy = (by + 0.5) / H;

    const px = new Uint8Array(4);
    const sample = (tex) => {
      this.#probeMaterial.uniforms.uTex.value = tex;
      this.#renderer.setRenderTarget(this.#metricRT);
      this.#renderer.render(this.#probeScene, this.#blitCamera);
      this.#renderer.readRenderTargetPixels(this.#metricRT, bx, by, 1, 1, px);
      // ×8 还原被压缩的量程，再归一成"多少倍白"
      return [...px].slice(0, 3).map((v) => +((v / 255) * 8).toFixed(2));
    };

    const out = {
      screenPx: [Math.round(fx * window.innerWidth), Math.round((1 - fy) * window.innerHeight)],
      composite: best.toFixed(0),
      scene: sample(this.#sceneRT.texture),
      thumbnail: sample(this.#thumbRT.texture),
      service: sample(this.#serviceRT.texture),
      missionVision: sample(this.#mvRT.texture),
    };
    this.#renderer.setRenderTarget(null);
    return out;
  }

  /**
   * 开发期：扫出场景 RT 里最大的 HDR 值，并定位它。
   * 辉光的亮部提取是 c·max(0,c−0.9)，**二次**的 —— 值到 5 就放大成 20，
   * 再被三级模糊摊成一个方块。所以"场景里到底有多亮的点"是判断
   * 白斑成因的关键数字，不是靠看。
   */
  debugMaxHDR() {
    if (!this.#started) return null;
    const W = 240;
    const H = 114;
    if (!this.#hdrRT) {
      this.#hdrRT = new THREE.WebGLRenderTarget(W, H, {
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        depthBuffer: false, stencilBuffer: false,
      });
    }
    if (!this.#probeScene) this.debugHotspot();
    const scan = (tex, label) => {
      this.#probeMaterial.uniforms.uTex.value = tex;
      this.#probeMaterial.uniforms.uTexel.value.set(
        1 / Math.max(1, this.#sceneRT.width), 1 / Math.max(1, this.#sceneRT.height),
      );
      this.#renderer.setRenderTarget(this.#hdrRT);
      this.#renderer.render(this.#probeScene, this.#blitCamera);
      const buf = new Uint8Array(W * H * 4);
      this.#renderer.readRenderTargetPixels(this.#hdrRT, 0, 0, W, H, buf);
      let mx = 0;
      let at = [0, 0];
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const o = (y * W + x) * 4;
          const v = Math.max(buf[o], buf[o + 1], buf[o + 2]);
          if (v > mx) { mx = v; at = [x, y]; }
        }
      }
      return {
        label,
        max: +((mx / 255) * 8).toFixed(2),      // 探针里除了 8，这里还原
        at: [Math.round(at[0] / W * window.innerWidth), Math.round((1 - at[1] / H) * window.innerHeight)],
      };
    };
    const out = [scan(this.#sceneRT.texture, '主场景'), scan(this.#thumbRT.texture, '环绕屏')];
    this.#renderer.setRenderTarget(null);
    return out;
  }

  debugMetrics() {
    if (!this.#started) return null;
    const W = 160;
    const H = 76;
    if (!this.#metricRT) {
      this.#metricRT = new THREE.WebGLRenderTarget(W, H, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: false, stencilBuffer: false,
      });
    }
    this.#renderer.setRenderTarget(this.#metricRT);
    this.#renderer.render(this.#finalScene, this.#blitCamera);
    const buf = new Uint8Array(W * H * 4);
    this.#renderer.readRenderTargetPixels(this.#metricRT, 0, 0, W, H, buf);
    this.#renderer.setRenderTarget(null);

    const lum = (i) => buf[i] * 0.3 + buf[i + 1] * 0.6 + buf[i + 2] * 0.1;
    let full = 0;
    let bright = 0;
    for (let i = 0; i < W * H; i += 1) {
      const l = lum(i * 4);
      full += l;
      if (l > 200) bright += 1;
    }
    const cx = W / 2;
    const cy = H / 2;
    const half = Math.round(W * 0.0785 / 2);
    let center = 0;
    let n = 0;
    for (let y = Math.round(cy - half); y < cy + half; y += 1) {
      for (let x = Math.round(cx - half); x < cx + half; x += 1) { center += lum((y * W + x) * 4); n += 1; }
    }
    let radius = 0;
    for (let x = Math.round(cx); x < W; x += 1) {
      if (lum((Math.round(cy) * W + x) * 4) < 60) break;
      radius = x - cx;
    }
    return {
      center: +(center / n).toFixed(1),
      full: +(full / (W * H)).toFixed(1),
      bright: +(bright / (W * H) * 100).toFixed(2),
      radius: +(radius / W).toFixed(4),
      loaded: this.debugLoaded(),
    };
  }

  debugComposite(cols = 24, rows = 12) {
    if (!this.#started) return null;
    if (!this.#debugRT) {
      this.#debugRT = new THREE.WebGLRenderTarget(cols * 4, rows * 4, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      });
    }
    this.#renderer.setRenderTarget(this.#debugRT);
    this.#renderer.render(this.#finalScene, this.#blitCamera);
    const buf = new Uint8Array(this.#debugRT.width * this.#debugRT.height * 4);
    this.#renderer.readRenderTargetPixels(this.#debugRT, 0, 0, this.#debugRT.width, this.#debugRT.height, buf);
    this.#renderer.setRenderTarget(null);
    const ramp = ' .:-=+*#%@';
    const out = [];
    let sum = 0;
    for (let j = rows - 1; j >= 0; j -= 1) {
      let line = '';
      for (let i = 0; i < cols; i += 1) {
        const x = Math.floor((i + 0.5) * 4);
        const y = Math.floor((j + 0.5) * 4);
        const o = (y * this.#debugRT.width + x) * 4;
        const l = buf[o] * 0.3 + buf[o + 1] * 0.6 + buf[o + 2] * 0.1;
        sum += l;
        line += ramp[Math.min(9, Math.floor(l / 26))];
      }
      out.push(line);
    }
    return { avg: +(sum / (cols * rows)).toFixed(1), art: out.join('\n') };
  }

  /** 开发期：亮底那一段的字标描边到底在不在、可不可见。 */
  debugOutline() {
    const c = this.#mainLogo?.outlineContainer;
    if (!c) return null;
    const kids = [];
    c.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      kids.push({
        name: o.name || o.type,
        visible: o.visible,
        renderOrder: o.renderOrder,
        transparent: !!m?.transparent,
        opacityUniform: m?.uniforms?.uAlpha?.value ?? m?.uniforms?.uOpacity?.value ?? m?.opacity ?? null,
        pos: o.position.toArray().map((v) => +v.toFixed(3)),
        scale: o.scale.toArray().map((v) => +v.toFixed(3)),
      });
    });
    return {
      parentIsMV: c.parent?.type === 'Scene' && c.parent !== this.#scene,
      parentType: c.parent?.type ?? null,
      containerVisible: c.visible,
      worldPos: new THREE.Vector3().setFromMatrixPosition(c.matrixWorld).toArray().map((v) => +v.toFixed(3)),
      worldScale: new THREE.Vector3().setFromMatrixScale(c.matrixWorld).toArray().map((v) => +v.toFixed(3)),
      children: kids,
    };
  }

  /** 开发用：给一对 CSS 像素坐标，看抓取命中与否，顺带回报两个门控值。 */
  debugCanGrab(cx, cy) {
    const ndc = new THREE.Vector2(
      (cx / Math.max(1, window.innerWidth)) * 2 - 1,
      -((cy / Math.max(1, window.innerHeight)) * 2 - 1),
    );
    return {
      ndc: ndc.toArray().map((v) => +v.toFixed(3)),
      hit: !!this.#mainLogo?.canGrab(ndc, this.#camera),
      uVisionRotate: +(this.#commonUniforms.uVisionRotate?.value ?? -1).toFixed(4),
      uServiceRotate: +(this.#commonUniforms.uServiceRotate?.value ?? -1).toFixed(4),
    };
  }

  debugLogoState() { return this.#mainLogo?.debugState ?? null; }

  debugProfileBackdrop() { return this.#mvScene?.debugState ?? null; }

  debugTrigger(name) { return topScrollManager.getTrigger(name)?.progress ?? -1; }

  debugScreen(force) { return this.#mainLogo?.debugScreen(force) ?? null; }

  debugPinTransition(v) { return this.#mainLogo?.debugPinTransition(v); }

  debugSolidScreen() { return this.#mainLogo?.debugSolidScreen(); }

  /** 开发用：在 JS 里重算侧屏四个顶点的裁剪坐标，看 orthoPos / screenPos 各是多少。 */
  debugClip() {
    const m = this.#mainLogo?.screenMesh;
    if (!m) return null;
    const asp = this.#commonUniforms.uScreenAspectRatio.value;
    const mv = new THREE.Matrix4().multiplyMatrices(this.#camera.matrixWorldInverse, m.matrixWorld);
    const pos = m.geometry.attributes.position;
    const rows = [];
    for (let i = 0; i < pos.count; i += 1) {
      const v = new THREE.Vector4(pos.getX(i), pos.getY(i), pos.getZ(i), 1).applyMatrix4(mv).applyMatrix4(this.#camera.projectionMatrix);
      const ortho = [v.x / v.w, v.y / v.w, v.z / v.w];
      const sx = pos.getZ(i);                       // scPos.xz *= rotate(HPI) → x 变成原来的 z
      const sy = pos.getY(i);
      const screen = [sx * (20.5 + (1 / asp) * 3), sy * (7 + asp * 8) - 0.22];
      rows.push({ i, w: +v.w.toFixed(4), ortho: ortho.map((x) => +x.toFixed(4)), screen: screen.map((x) => +x.toFixed(4)) });
    }
    return { aspect: +asp.toFixed(4), rows };
  }

  debugUniformIdentity() { return this.#mainLogo?.debugUniformIdentity() ?? null; }

  debugInfo() {
    if (!this.#started) return null;
    const mesh = this.#mainLogo?.children[0];
    return {
      rt: [this.#sceneRT.width, this.#sceneRT.height],
      cameraPos: this.#camera.position.toArray().map((v) => +v.toFixed(3)),
      cameraFov: +this.#camera.fov.toFixed(2),
      sceneDraws: this.#sceneStats?.calls,
      sceneTriangles: this.#sceneStats?.triangles,
      sceneChildren: this.#scene.children.length,
      logoWorldScale: this.#mainLogo ? this.#mainLogo.scale.x * (mesh?.scale.x ?? 1) : null,
      logoQuat: mesh ? mesh.quaternion.toArray().map((v) => +v.toFixed(6)) : null,
      geometry: (() => {
        if (!mesh?.geometry) return null;
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        return { min: bb.min.toArray().map((v) => +v.toFixed(4)), max: bb.max.toArray().map((v) => +v.toFixed(4)) };
      })(),
      uHideQuad: +this.#commonUniforms.uHideQuad.value.toFixed(4),
      bgShift: this.#bgQuadTree.debugShift?.() ?? null,
      mvStats: this.#mvStats,
      visibleMV: +this.#visibleMV.toFixed(4),
      visibleMVBlur: +this.#visibleMVBlur.toFixed(4),
      visibleService: +this.#blitMaterial.uniforms.uVisibleService.value.toFixed(4),
      uLoaded: this.debugLoaded(),
      logoCoverage: this.debugScreenCoverage(this.#mainLogo),
      wordmarkCoverage: this.debugScreenCoverage(this.#logo2D),
      screenMeshSize: (() => {
        const sm = this.#mainLogo?.outlineContainer?.children?.[2];
        if (!sm?.geometry) return null;
        sm.geometry.computeBoundingBox();
        const bb = sm.geometry.boundingBox;
        return [+(bb.max.x - bb.min.x).toFixed(4), +(bb.max.y - bb.min.y).toFixed(4), +(bb.max.z - bb.min.z).toFixed(4)];
      })(),
      bgInstances: this.#bgQuadTree?.geometry?.attributes?.instancePosition?.count ?? null,
      bg: this.#bgQuadTree ? {
        visible: this.#bgQuadTree.visible,
        frustumCulled: this.#bgQuadTree.frustumCulled,
        indexCount: this.#bgQuadTree.geometry?.index?.count ?? null,
        posCount: this.#bgQuadTree.geometry?.attributes?.position?.count ?? null,
        inScene: this.#scene.children.includes(this.#bgQuadTree),
        defines: this.#bgQuadTree.material?.defines,
        scale: this.#bgQuadTree.material?.uniforms?.uScale?.value?.toArray?.().map((v) => +v.toFixed(2)),
        patCur: !!this.#bgQuadTree.material?.uniforms?.uPatternCurrent?.value,
      } : null,
      grid: this.#grid ? {
        visible: this.#grid.visible,
        frustumCulled: this.#grid.frustumCulled,
        scale: this.#grid.material?.uniforms?.uScale?.value?.toArray?.().map((v) => +v.toFixed(2)),
      } : null,
    };
  }
}

export const gl = new GL();
