import * as THREE from 'three';

import { Animator } from './animator.js';
import { lerper } from '../core/lerper.js';
import { topScrollManager } from '../core/top-scroll-manager.js';
import { createLogoGeometry, createLogoOutlineGeometry, createSideScreenGeometry, SIDE_SCREEN_DEPTH } from './logo-geometry.js';
import { mainLogoVert, mainLogoFrag, mainLogoOutlineFrag, mainLogoScreenFrag } from './shaders/index.js';
import { profileLogoFrame, portfolioLogoFrame, profileLogoLayout } from '../../lib/profile-timeline.js';
import { deviceManager } from '../core/device-manager.js';

/**
 * 每个区段的旋转性格。原站字面量，整表照搬 —— 这张表就是全站「空间感」的定义。
 *
 *   kv        静止，但跟鼠标（hover 1）；回正力 2，手一停立刻归位
 *   works_*   自由翻滚：自转 0.5、回正力只有 0.1、还耦合滚动速度
 *   mission   彻底锁死
 *   vision    锁死，回正力略松（1.5）
 *   service   锁死但重新跟鼠标
 */
export const SECTION_ROTATION = {
  default:     { animationIntensity: 0, baseRotationSpeed: 0,   returnToOriginForce: 2,   velocityMultiplier: 0,    scrollSpeedRotationFactor: 0,     hoverRotationMultiplier: 0 },
  kv:          { animationIntensity: 0, baseRotationSpeed: 0,   returnToOriginForce: 2,   velocityMultiplier: 0,    scrollSpeedRotationFactor: 0,     hoverRotationMultiplier: 1 },
  works_intro: { animationIntensity: 1, baseRotationSpeed: 0.5, returnToOriginForce: 0.4, velocityMultiplier: 0.01, scrollSpeedRotationFactor: 0.001, hoverRotationMultiplier: 0.2 },
  works:       { animationIntensity: 1, baseRotationSpeed: 0.5, returnToOriginForce: 0.1, velocityMultiplier: 0.01, scrollSpeedRotationFactor: 0.001, hoverRotationMultiplier: 0.2 },
  mission:     { animationIntensity: 0, baseRotationSpeed: 0,   returnToOriginForce: 2,   velocityMultiplier: 0,    scrollSpeedRotationFactor: 0,     hoverRotationMultiplier: 0 },
  vision:      { animationIntensity: 0, baseRotationSpeed: 0,   returnToOriginForce: 1.5, velocityMultiplier: 0,    scrollSpeedRotationFactor: 0,     hoverRotationMultiplier: 0 },
  service:     { animationIntensity: 0, baseRotationSpeed: 0,   returnToOriginForce: 1.8, velocityMultiplier: 0,    scrollSpeedRotationFactor: 0,     hoverRotationMultiplier: 1 },
};

/**
 * 鼠标跟随。
 *
 * 这一版回到原站的模型 —— 之前我改成"位置驱动"是判断失误。
 * 拿录屏对了一遍：原站调试面板里的四元数在 t=2.0s 是 (−.42,−.06,.02,.90)，
 * 也就是 51.7°；t=5.0s 是 22.9°。原站根本不"迟钝"，它甩得比我那版
 * （封顶 18°）还大。当初觉得不跟手，是因为我自己那套实现在漂。
 *
 * 原站的模型是**速度驱动**：吃 lerper 的速度而非位置，每帧把一点转角
 * premultiply 上去，同时 tmpEuler 按 (1 − dt) 衰减、姿态再 slerp 回原点。
 * 它不会失控，靠的是一条我上一版漏掉的关键项：
 *
 *   m = 0.01 · max(0, 1 − |pos| · 1.5) · hoverRotationMultiplier
 *                     ~~~~~~~~~~~~~~~~
 * 增益随指针离屏幕中心的距离线性衰减，到 |pos| = 0.667 就**归零**。
 * 也就是说只有在画面中央那块区域划动才推得动字标，甩到边上完全不加力。
 * 少了这一项，快速横扫会一路累积（实测能到 140°），停手后还在自己转 ——
 * 这正是"移动起来不灵敏可靠"的来源，不是增益太小。
 */
const HOVER_GAIN = 0.01;          // 原站字面量
const HOVER_FALLOFF = 1.5;        // 增益归零于 |pos| = 1/1.5 ≈ 0.667

/**
 * 抓取拖动 —— **这是对原站的有意增补，原站没有这个交互**。
 *
 * 上面那套是"甩"：吃指针速度，手一停就衰减回正，你推不到一个想要的角度。
 * 这里叠一层轨迹球：按住时姿态完全交给手，松手再把最后那一下的速度
 * 还给上面那套惯性，于是甩一下会继续转一会儿、再慢慢归位 —— 也就是
 * "不抓的时候还是老样子"。
 *
 * DRAG_GAIN = π：指针横扫整屏（归一化坐标跨度 2）正好转一整圈。
 */
const DRAG_GAIN = Math.PI;
const DRAG_FLICK = 0.3;           // 松手时把末速交回惯性的比例
const FLICK_MAX = 0.08;           // 单帧转角上限（≈4.6°），防甩出去失控

const MATERIAL_DEFAULTS = { roughness: 0.1, noiseScale: 9, color: new THREE.Vector3(255, 255, 255) };

export class MainLogo extends THREE.Object3D {
  #commonUniforms;
  #animator = new Animator();
  #config = SECTION_ROTATION.default;
  #logoMesh = null;
  #outlineContainer = new THREE.Object3D();
  #outlineBase = null;
  #outlineLine = null;
  #screenMesh = null;
  #tmpEuler = new THREE.Euler();      // 速度累积（works 段用）
  #mouseRotQua = new THREE.Quaternion();
  #identityQua = new THREE.Quaternion();
  #dragging = false;
  #raycaster = new THREE.Raycaster();
  #dragQua = new THREE.Quaternion();
  #dragAxis = new THREE.Vector3();
  #lastDrag = new THREE.Vector2();
  #visionTrigger = null;
  #serviceInTrigger = null;
  #missionInTrigger = null;
  #profileTrigger = null;
  #motionQuery = null;
  #lenis = null;

  constructor({ commonUniforms, transparentBuffer, envMap, noiseTexture, serviceSceneTexture, renderOrderBase }) {
    super();

    this.#animator.add({ name: 'worksRotate', initValue: 0 });
    this.#commonUniforms = {
      ...commonUniforms,
      uVisionRotate: { value: 0 },
      uServiceIn: { value: 0 },
      uServiceRotate: { value: 0 },
      uProfileYaw: { value: 0 },
      uProfilePitch: { value: 0 },
      uProfileReveal: { value: 1 },
    };

    this.#outlineContainer.matrixAutoUpdate = false;
    /**
     * ⚠️ 这一行不能少。update() 末尾把 #logoMesh 的 matrixWorld 手抄给容器，
     * 但 three 在 render 前会跑 scene.updateMatrixWorld()，只要
     * matrixWorldAutoUpdate 还是 true，就会用 parent.matrixWorld × this.matrix
     * 把手抄的结果覆盖掉 —— 而 this.matrix 因为 matrixAutoUpdate=false 从没被
     * 合成过，恒为单位阵。结果是描边和侧屏缩到 1 倍、缩在原点，肉眼等于消失。
     * 之前亮底那一段看不到字标描边，就是这一行的事。原站同样两行都写了。
     */
    this.#outlineContainer.matrixWorldAutoUpdate = false;

    const glassMaterial = new THREE.ShaderMaterial({
      vertexShader: mainLogoVert,
      fragmentShader: mainLogoFrag,
      uniforms: {
        ...this.#commonUniforms,
        ...transparentBuffer.uniformSet,
        uEnvMap: { value: envMap },
        uNoiseTex: { value: noiseTexture },
        uRoughness: { value: MATERIAL_DEFAULTS.roughness },
        uNoiseScale: { value: MATERIAL_DEFAULTS.noiseScale },
        uMaterialColor: { value: MATERIAL_DEFAULTS.color.clone() },
      },
      transparent: true,
    });

    // 基底：颜色 #D7DBDC 但 alpha 0 —— 只写深度，用来把描边网格的背面挡住
    const outlineBaseMaterial = new THREE.ShaderMaterial({
      vertexShader: mainLogoVert,
      fragmentShader: mainLogoOutlineFrag,
      uniforms: { ...this.#commonUniforms },
      defines: { IS_BASE: '' },
      transparent: true,
    });

    /**
     * 反向外壳法勾边：壳在 XY 上比基底大一圈，但只画**背面**。
     *
     * 原站那层壳是 GLB 里单独的一个网格，用 DoubleSide；我这边是参数化重建的，
     * 正面会和基底抢深度（差 0.0008 就整片盖住字标）。只画背面就没这个问题：
     * 字身范围内，背面在基底之后 → 深度测试失败 → 被挡掉；
     * 只有超出基底轮廓的那一圈背面留得下来，那一圈就是勾边。
     */
    const outlineLineMaterial = new THREE.ShaderMaterial({
      vertexShader: mainLogoVert,
      fragmentShader: mainLogoOutlineFrag,
      uniforms: { ...this.#commonUniforms },
      side: THREE.BackSide,
      defines: { IS_OUTLINE: '' },
      transparent: true,
    });

    const screenMaterial = new THREE.ShaderMaterial({
      vertexShader: mainLogoVert,
      fragmentShader: mainLogoScreenFrag,
      uniforms: {
        ...this.#commonUniforms,
        // 原站是 rtServiceScene.texture。给 null 的话 three 会绑一张默认白图，
        // 片元里 sceneCol 恒为 1，再乘 (1 + serviceInInv*3) = ×4 → HDR 4.0，
        // 远超辉光阈值 0.9，糊成一个圆角白斑糊在画面上。
        uSceneTex: { value: serviceSceneTexture },
        uNoiseTex: { value: noiseTexture },
        uScreenNoiseScale: { value: 1 },
        // 侧屏张开时的铰点：板厚的**近**侧面。见 shaders/index.js 手改 ③
        uSideHinge: { value: SIDE_SCREEN_DEPTH / 2 },
      },
      defines: { IS_SCREEN: '' },
      transparent: true,
      depthWrite: false,   // 纯叠加层，写深度会把后画的玻璃剔除掉
      /**
       * 下面两行都是让 vision→service 那道擦除**能出现**的必要条件，
       * 各自对应一个查了很久的 bug：
       *
       * ① side —— 顶点着色器在 uServiceRotate→1 时把这块窄条**改写成一张全屏
       *    四边形**（screenPos 绕过 modelViewMatrix，用属性坐标硬算裁剪空间坐标）。
       *    改写之后三角形的绕序不再由原几何决定，FrontSide 会把它整片剔掉。
       *
       * ② depthTest —— 改写之后深度值仍是 mix(orthoPos.z, orthoPos.z, t) ≈ 字标
       *    自己的深度（实测 0.98），而这块四边形已经跑到全屏了，跟场景里的网格
       *    抢深度。实测覆盖率随进度是 1.99% → 1.26% → 0.89% → 0.75% → 0% → 87%
       *    ——一路被网格挡掉，只有走到 1.0 那一格才钻到网格前面。
       *    它是屏幕空间的覆盖层（renderOrder 12、不写深度），深度本来就没意义。
       */
      side: THREE.DoubleSide,
      depthTest: false,
    });

    const logoGeo = createLogoGeometry();
    logoGeo.computeBoundingBox();

    this.#logoMesh = new THREE.Mesh(logoGeo, glassMaterial);
    this.#logoMesh.scale.setScalar(3);
    this.#logoMesh.renderOrder = renderOrderBase + 1;
    this.add(this.#logoMesh);

    // 基底与实体共用同一份几何（原站也是），描边用外扩过的那份
    this.#outlineBase = new THREE.Mesh(logoGeo, outlineBaseMaterial);
    this.#outlineBase.matrixAutoUpdate = false;
    this.#outlineBase.renderOrder = 10;
    this.#outlineContainer.add(this.#outlineBase);

    this.#outlineLine = new THREE.Mesh(createLogoOutlineGeometry(), outlineLineMaterial);
    this.#outlineLine.matrixAutoUpdate = false;
    this.#outlineLine.renderOrder = 11;
    this.#outlineContainer.add(this.#outlineLine);

    this.#screenMesh = new THREE.Mesh(createSideScreenGeometry(), screenMaterial);
    this.#screenMesh.matrixAutoUpdate = false;
    this.#screenMesh.renderOrder = 12;
    this.#outlineContainer.add(this.#screenMesh);

  }

  get screenMesh() { return this.#screenMesh; }

  get outlineContainer() {
    return this.#outlineContainer;
  }

  /** 服务场景的 RT 要等渲染管线建好才有，所以晚一步注入。 */
  setServiceSceneTexture(tex) {
    if (this.#screenMesh) this.#screenMesh.material.uniforms.uSceneTex.value = tex;
  }

  setLenis(lenis) {
    this.#lenis = lenis;
  }

  /**
   * 鼠标带动的姿态。吃的是 lerper 的「速度」而非位置 ——
   * 所以是"甩"出来的转动：手停下来转动就衰减，而不是锁在某个角度。
   * 增益在画面中央最大，到 2/3 半径处归零。
   */
  hover(e) {
    if (!this.#logoMesh?.visible || this.#isProfileSequence()) return;
    if (this.#dragging) return;      // 抓住的时候姿态归手管，别再叠鼠标推力
    const p = new THREE.Vector2(
      (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1,
      -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1),
    );

    lerper.set('mainLogo_hover_x', p.x, 1);
    const vx = lerper.get('mainLogo_hover_x')?.velocity || 0;
    lerper.set('mainLogo_hover_y', p.y, 1);
    const vy = lerper.get('mainLogo_hover_y')?.velocity || 0;

    const m = HOVER_GAIN
      * Math.max(0, 1 - p.length() * HOVER_FALLOFF)
      * this.#config.hoverRotationMultiplier;
    const worksRotate = this.#animator.get('worksRotate') || 0;
    this.#tmpEuler.set(
      this.#tmpEuler.x - vy * m * (1 - worksRotate * 0.7),
      this.#tmpEuler.y + vx * m,
      0,
    );
    this.#mouseRotQua.setFromEuler(this.#tmpEuler);
  }

  get dragging() { return this.#dragging; }

  /** 开发用：侧屏（虹彩缎带 / 全息擦除那块）的状态，可临时改写以便定位。 */
  debugScreen(force) {
    const m = this.#screenMesh;
    if (!m) return null;
    const u = m.material.uniforms;
    if (force !== undefined) {
      // 换成**新的** uniform 对象，脱开 update() 每帧的回写，否则压不住
      m.material.uniforms.uServiceRotate = { value: force };
      m.material.uniforms.uServiceIn = { value: force };
      m.material.uniforms.uVisionRotate = { value: 1 };
      m.material.needsUpdate = true;
      return this.debugScreen();
    }
    return {
      visible: m.visible,
      parent: m.parent?.parent?.type ?? null,
      inMV: !!m.parent?.parent && m.parent.parent.type === 'Scene',
      renderOrder: m.renderOrder,
      depthTest: m.material.depthTest,
      hasScene: !!u.uSceneTex.value,
      hasNoise: !!u.uNoiseTex.value,
      noiseScale: u.uScreenNoiseScale.value,
      screenRes: u.uScreenResolution?.value?.toArray?.() ?? null,
      visionRotate: +u.uVisionRotate.value.toFixed(3),
      serviceIn: +u.uServiceIn.value.toFixed(3),
      serviceRotate: +u.uServiceRotate.value.toFixed(3),
      mw: m.matrixWorld.elements.slice(12, 15).map((v) => +v.toFixed(3)),
    };
  }

  /**
   * 开发用：把 vision→service 那段过渡**钉死**在某个进度上，方便逐格看。
   *
   * 为什么需要它：这段过渡只在滚动吸附的那零点几秒里存在，停下来就已经到位了；
   * 而截图本身要 100ms 以上，读到的值和拍到的画面对不上。钉死之后才谈得上比对。
   *
   * ⚠️ 它把四个材质的 uniform **换成各自独立的新对象**，从此脱离每帧回写 ——
   * 调过就回不去了，看完刷新页面。
   */
  debugPinTransition(v) {
    const meshes = [this.#logoMesh, this.#outlineBase, this.#outlineLine, this.#screenMesh];
    meshes.forEach((m) => {
      if (!m) return;
      m.material.uniforms.uServiceRotate = { value: v };
      m.material.uniforms.uServiceIn = { value: v };
      m.material.uniforms.uVisionRotate = { value: 1 };
    });
    return v;
  }

  /** 开发用：把侧屏换成纯红，区分"几何没到位"和"片元算出来接近背景色"。 */
  debugSolidScreen() {
    if (!this.#screenMesh) return false;
    this.#screenMesh.material.fragmentShader = 'void main(){ gl_FragColor = vec4(1.0,0.0,0.0,1.0); }';
    this.#screenMesh.material.needsUpdate = true;
    return true;
  }

  /** 开发用：确认四个材质的 uServiceRotate 是不是同一个对象。 */
  debugUniformIdentity() {
    const shared = this.#commonUniforms.uServiceRotate;
    const of = (m) => m?.material?.uniforms?.uServiceRotate;
    return {
      shared: shared?.value,
      screenSame: of(this.#screenMesh) === shared,
      screenVal: of(this.#screenMesh)?.value,
      glassSame: of(this.#logoMesh) === shared,
      lineSame: of(this.#outlineLine) === shared,
      baseSame: of(this.#outlineBase) === shared,
      profileRevealShared: [this.#logoMesh, this.#outlineBase, this.#outlineLine, this.#screenMesh]
        .every((mesh) => mesh?.material?.uniforms?.uProfileReveal === this.#commonUniforms.uProfileReveal),
    };
  }

  /** 开发用：三个驱动字标形态的量。 */
  get debugState() {
    const u = this.#commonUniforms;
    return {
      visionRotate: +(u.uVisionRotate?.value ?? -1).toFixed(4),
      serviceIn: +(u.uServiceIn?.value ?? -1).toFixed(4),
      serviceRotate: +(u.uServiceRotate?.value ?? -1).toFixed(4),
      profileYaw: +(u.uProfileYaw?.value ?? 0).toFixed(4),
      profilePitch: +(u.uProfilePitch?.value ?? 0).toFixed(4),
      profileReveal: +(u.uProfileReveal?.value ?? 1).toFixed(4),
      logoVisible: this.#logoMesh?.visible ?? false,
      outlineVisible: this.#outlineContainer.visible,
      screenVisible: this.#screenMesh?.visible ?? false,
      profileScale: +(this.#logoMesh?.scale.x ?? 3).toFixed(4),
      profilePositionY: +(this.#logoMesh?.position.y ?? 0).toFixed(4),
      profileParticles: null,
    };
  }

  /**
   * 指针是否落在字标上。ndc 是 −1..1 的归一化屏幕坐标。
   *
   * ⚠️ 只在 kv / works / mission 段成立。顶点着色器在 vision/service 段会再转一次
   * 字标（`pos.xz *= rotate(uVisionRotate*0.15 + uServiceRotate*0.5 …)`），
   * CPU 这边的几何看不到那一层，射线会打偏；何况那两段字标正被滚动动画甩走，
   * 本来也不该让人抓住跟它较劲。
   */
  canGrab(ndc, camera) {
    if (!this.#logoMesh || !camera) return false;
    if (!this.#logoMesh.visible || this.#isProfileSequence()) return false;
    if (this.#profileTrigger?.progress >= 1 && (this.#visionTrigger?.progress ?? 0) < 1) return false;
    if ((this.#commonUniforms.uVisionRotate?.value || 0) > 0.05) return false;
    if ((this.#commonUniforms.uServiceRotate?.value || 0) > 0.05) return false;
    this.#raycaster.setFromCamera(ndc, camera);
    return this.#raycaster.intersectObject(this.#logoMesh, false).length > 0;
  }

  grab() {
    this.#dragging = true;
    this.#lastDrag.set(0, 0);
  }

  /**
   * 拖一帧。dx/dy 是指针在归一化屏幕坐标里的位移（y 轴朝上）。
   *
   * 转轴取 (−dy, dx, 0) 再变换到世界系 —— 也就是**屏幕平面内**的垂直轴。
   * 这样不管字标当前转到什么姿态，手往哪推它就往哪翻，而不是绕自己的
   * 局部轴打转。左乘（premultiply）也是同一个理由：新转动要发生在世界系。
   * 符号跟上面 hover 一致（右移 → 绕 +Y，上移 → 顶部向后），
   * 所以松手交接的时候不会突然反向。
   */
  dragBy(dx, dy, camera) {
    if (!this.#dragging || !this.#logoMesh) return;
    const angle = Math.hypot(dx, dy) * DRAG_GAIN;
    if (angle < 1e-6) return;
    this.#dragAxis.set(-dy, dx, 0).normalize().applyQuaternion(camera.quaternion);
    this.#dragQua.setFromAxisAngle(this.#dragAxis, angle);
    this.#logoMesh.quaternion.premultiply(this.#dragQua);
    this.#lastDrag.set(dx, dy);
  }

  /** 松手：把最后那一下的速度交回上面那套惯性，甩一下能继续转一会儿。 */
  release() {
    if (!this.#dragging) return;
    this.#dragging = false;
    const k = DRAG_GAIN * DRAG_FLICK;
    this.#tmpEuler.set(
      THREE.MathUtils.clamp(this.#tmpEuler.x - this.#lastDrag.y * k, -FLICK_MAX, FLICK_MAX),
      THREE.MathUtils.clamp(this.#tmpEuler.y + this.#lastDrag.x * k, -FLICK_MAX, FLICK_MAX),
      0,
    );
    this.#lastDrag.set(0, 0);
  }

  #isProfileSequence() {
    const profile = this.#profileTrigger;
    const missionIn = this.#missionInTrigger;
    return Boolean(profile && profile.progress < 1
      && (profile.isActive || missionIn?.isActive || (missionIn?.progress ?? 0) >= 1));
  }

  update({ deltaTime }) {
    this.#animator.update(deltaTime);
    if (!this.#logoMesh) return;

    const profile = this.#profileTrigger;
    // The final ABOUT exit starts growth; PORTFOLIO completes it before turning.
    const profileSequence = this.#isProfileSequence();
    const profileProgress = profileSequence
      ? topScrollManager.getProfileProgress()
      : profile?.progress ?? 1;
    const portfolioSequence = Boolean(profile && profile.progress >= 1);
    let portfolioProgress = 0;
    if (portfolioSequence) {
      const target = Math.max(0, Math.min(1, this.#visionTrigger?.progress ?? 0));
      portfolioProgress = lerper.set('mainLogo_portfolio', target, 0.7);
      const state = lerper.get('mainLogo_portfolio');
      if (this.#motionQuery?.matches || Math.abs(portfolioProgress - target) < 0.00001) {
        state.current = target;
        state.velocity = 0;
        portfolioProgress = target;
      }
    } else {
      lerper.remove('mainLogo_portfolio');
    }
    const frame = profileSequence ? profileLogoFrame(profileProgress)
      : portfolioSequence ? portfolioLogoFrame(portfolioProgress)
        : { reveal: 1, layout: 0, yaw: 0, pitch: 0 };
    const holdClosed = profileSequence || (portfolioSequence && frame.turn === 0);
    if (holdClosed && this.#dragging) this.release();

    // 姿态衰减：每帧乘 (1 − dt)，手一停就慢慢回落
    const decay = 1 - deltaTime;
    this.#tmpEuler.x *= decay;
    this.#tmpEuler.y *= decay;
    this.#mouseRotQua.setFromEuler(this.#tmpEuler);

    const cfg = this.#config;
    const worksRotate = this.#animator.get('worksRotate') || 0;
    const velocity = this.#lenis
      ? lerper.set('mainLogo_lenisVelocity', Math.max(Math.min(this.#lenis.velocity, 30), -30), 0.5)
      : 0;

    const spin = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -deltaTime * cfg.baseRotationSpeed * worksRotate - velocity * cfg.scrollSpeedRotationFactor,
    );

    // 每帧把鼠标推力和自转 premultiply 上去，再往原点 slerp。
    // 回正力在翻滚时被削弱到 20%，所以 works 段能一直转下去。
    //
    // 抓住的时候这三样全停：不自转、不受鼠标推力、也不回正 ——
    // 否则手停在某个角度上，回正力还在把它往回拽，就成了拔河。
    if (holdClosed) {
      this.#tmpEuler.set(0, 0, 0);
      this.#mouseRotQua.identity();
      this.#logoMesh.quaternion.copy(this.#identityQua);
    } else if (!this.#dragging) {
      this.#logoMesh.quaternion.premultiply(this.#mouseRotQua);
      this.#logoMesh.quaternion.premultiply(spin);
      const force = cfg.returnToOriginForce * (1 - worksRotate * 0.8);
      this.#logoMesh.quaternion.slerp(this.#identityQua, deltaTime * force);
    }

    const visionRotate = lerper.set('mainLogo_vision', holdClosed ? 0 : portfolioSequence ? frame.turn : this.#visionTrigger?.progress || 0, 0.5);
    const serviceRotate = lerper.set('mainLogo_serviceRotate', holdClosed ? 0 : this.#serviceInTrigger?.progress || 0, 1);
    this.#commonUniforms.uVisionRotate.value = holdClosed ? 0 : visionRotate;
    this.#commonUniforms.uServiceIn.value = holdClosed ? 0 : lerper.get('service_renderer')?.current || 0;
    this.#commonUniforms.uServiceRotate.value = holdClosed ? 0 : serviceRotate;
    const reveal = frame.reveal;
    const visible = reveal > 0.0001;
    this.#commonUniforms.uProfileReveal.value = reveal;
    this.#commonUniforms.uProfileYaw.value = profileSequence && !this.#motionQuery?.matches ? frame.yaw : 0;
    this.#commonUniforms.uProfilePitch.value = profileSequence && !this.#motionQuery?.matches ? frame.pitch : 0;
    this.#logoMesh.visible = visible;
    this.#outlineContainer.visible = visible;
    this.#outlineBase.visible = visible;
    this.#outlineLine.visible = visible;
    this.#screenMesh.visible = visible;
    // Move from the bottom reading mark to the original full-sized pose during
    // PORTFOLIO growth. The same damped progress gates rotation after arrival.
    const mobileProfile = deviceManager.isSPLayout;
    const layout = frame.layout;
    const aspect = Math.max(0.25, window.innerWidth / Math.max(1, window.innerHeight));
    const halfHeight = Math.tan(THREE.MathUtils.degToRad((35 + 18 / aspect) / 2)) * 10;
    const bounds = this.#logoMesh.geometry.boundingBox;
    const modelHeight = (bounds.max.y - bounds.min.y) * 3 * this.scale.y;
    const modelWidth = (bounds.max.x - bounds.min.x) * 3 * this.scale.x;
    const profileLayout = profileLogoLayout(mobileProfile, window.innerHeight);
    const profileScale = Math.min(
      mobileProfile ? 0.78 : 1,
      halfHeight * 2 * profileLayout.height / modelHeight,
      halfHeight * 2 * aspect * profileLayout.width * 0.9 / modelWidth,
    );
    this.#logoMesh.scale.setScalar(3 * (1 - layout * (1 - profileScale)));
    this.#logoMesh.position.y = layout * (halfHeight * (1 - profileLayout.centerY * 2) - this.position.y) / this.scale.y;

    // The video opening and MV stages can skip rendering the main scene.
    // Refresh ancestors before copying into the separate outline scene so its
    // M keeps the parent scale and position even on a direct PORTFOLIO entry.
    this.#logoMesh.updateWorldMatrix(true, false);
    this.#outlineContainer.matrixWorld.copy(this.#logoMesh.matrixWorld);
  }

  in() {
    this.#visionTrigger = topScrollManager.getTrigger('vision');
    this.#serviceInTrigger = topScrollManager.getTrigger('service_in');
    this.#missionInTrigger = topScrollManager.getTrigger('mission_in');
    this.#profileTrigger = topScrollManager.getTrigger('profile_progress');
    this.#motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  }

  out() {
    lerper.remove('mainLogo_portfolio');
    this.#visionTrigger = null;
    this.#serviceInTrigger = null;
    this.#missionInTrigger = null;
    this.#profileTrigger = null;
    this.#motionQuery = null;
    this.#commonUniforms.uProfileYaw.value = 0;
    this.#commonUniforms.uProfilePitch.value = 0;
    this.#commonUniforms.uProfileReveal.value = 1;
    this.#outlineContainer.visible = true;
    [this.#logoMesh, this.#outlineBase, this.#outlineLine, this.#screenMesh]
      .forEach((mesh) => { if (mesh) mesh.visible = true; });
    this.#logoMesh?.scale.setScalar(3);
    if (this.#logoMesh) this.#logoMesh.position.y = 0;
  }

  changeSection(name) {
    this.#config = SECTION_ROTATION[name || 'default'] || SECTION_ROTATION.default;
    this.#animator.animate('worksRotate', this.#config.animationIntensity, 1);
  }
}
