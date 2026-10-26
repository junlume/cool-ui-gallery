import * as THREE from 'three';

import { animator, Easings } from './animator.js';
import { lerper } from '../core/lerper.js';
import { topScrollManager } from '../core/top-scroll-manager.js';
import { ProceduralTexture } from './procedural-texture.js';
import {
  bgQuadVert, bgQuadFrag, pattern1Frag, pattern2Frag, pattern3Frag,
} from './shaders/index.js';

/**
 * 背景砖墙。这是整站「空间感」的另一半 —— 字标是主体，它是主体所处的空间。
 *
 * 三件事叠在一起：
 *  1. 几何是递归四叉树：从一个正方形开始细分，深度 >2 时有一半概率停止，
 *     最深 3 层。于是砖块大小不均，看起来像被随机切碎的墙面。
 *  2. 顶点着色器把这面平墙沿 x 卷成圆柱（roundTheta = pos.x·PI），
 *     所以它其实是一圈包住观者的环，不是一张平面背景。
 *  3. 表面贴的是三套程序化图案之一，配三组互不同步的随机定时器：
 *     黑屏闪烁、UV 抖动、图案切换。这些定时器的间隔本身也是随机的，
 *     所以墙面永远不会走进可辨认的循环。
 */

const QUAD_MAX_DEPTH = 3;

/**
 * 递归四叉树。每个叶子节点变成一个实例，带位置、尺寸、四个随机数和深度。
 * 那四个随机数（instanceID）在着色器里被反复用来做每块砖的差异化：
 * 隐藏时机、图案选择、logo 滚动速度、works 图的偏移，全靠它。
 */
function createQuadTreeGeometry() {
  const box = new THREE.BoxGeometry(1, 1, 0.005, 4, 4, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', box.attributes.position);
  geo.setAttribute('uv', box.attributes.uv);
  geo.setAttribute('normal', box.attributes.normal);
  geo.setIndex(box.index);

  const positions = [];
  const scales = [];
  const ids = [];
  const depths = [];

  const subdivide = (center, depth) => {
    const size = 1 / 2 ** depth;
    if ((depth > 2 && Math.random() < 0.5) || depth > QUAD_MAX_DEPTH) {
      positions.push(center.x, center.y, 0);
      scales.push(size, size);
      ids.push(Math.random(), Math.random(), Math.random(), Math.random());
      depths.push(depth);
      return;
    }
    for (let i = 0; i < 2; i += 1) {
      const dx = (i * 2 - 1) * 0.5;
      for (let j = 0; j < 2; j += 1) {
        const dy = (j * 2 - 1) * 0.5;
        subdivide(new THREE.Vector2(center.x + (dx * size) / 2, center.y + (dy * size) / 2), depth + 1);
      }
    }
  };
  subdivide(new THREE.Vector2(0, 0), 0);

  geo.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 2));
  geo.setAttribute('instanceID', new THREE.InstancedBufferAttribute(new Float32Array(ids), 4));
  geo.setAttribute('instanceDepth', new THREE.InstancedBufferAttribute(new Float32Array(depths), 1));
  return geo;
}

/**
 * 三套图案。各自的参数决定它上墙后的「脾气」：
 *   1 号 分辨率比 0.3（故意糊），不闪不抖 —— 安静的底色
 *   2/3 号 分辨率比 0.8，黑屏随机 0.5、UV 抖动 0.5，间隔 0.1±5 秒 —— 躁动
 */
const PATTERN_SPECS = [
  {
    frag: pattern1Frag,
    resolutionRatio: 0.3,
    param: {
      blackOut: 0, blackOutRandom: 0, blackOutInterval: 1, blackOutIntervalRandom: 0,
      uvShift: 0, uvShiftRandom: 0, uvShiftInterval: 0.2, uvShiftIntervalRandom: 0.5,
    },
  },
  {
    frag: pattern2Frag,
    resolutionRatio: 0.8,
    param: {
      blackOut: 0, blackOutRandom: 0.5, blackOutInterval: 1, blackOutIntervalRandom: 0,
      uvShift: 0.5, uvShiftRandom: 0, uvShiftInterval: 0.1, uvShiftIntervalRandom: 5,
    },
  },
  {
    frag: pattern3Frag,
    resolutionRatio: 0.8,
    param: {
      blackOut: 0, blackOutRandom: 0.5, blackOutInterval: 1, blackOutIntervalRandom: 0,
      uvShift: 0.5, uvShiftRandom: 0, uvShiftInterval: 0.1, uvShiftIntervalRandom: 5,
    },
  },
];

class BGQuadTreePatterns {
  list = [];
  current = null;
  next = null;

  constructor(renderer, commonUniforms, noiseTexture) {
    this.list = PATTERN_SPECS.map(({ frag, resolutionRatio, param }) => {
      const tex = new ProceduralTexture({
        renderer,
        resolution: new THREE.Vector2(1, 1),
        fragmentShader: frag,
        uniforms: { ...commonUniforms, uNoiseTex: { value: noiseTexture } },
      });
      tex.resolutionRatio = resolutionRatio;
      tex.userData.param = param;
      return tex;
    });
    [this.current] = this.list;
    [this.next] = this.list;
  }

  changeRandom() {
    let i = Math.floor(Math.random() * this.list.length);
    if (this.list[i] === this.next) i = (i + 1) % this.list.length;
    return this.change(i);
  }

  change(i) {
    this.current = this.next;
    this.next = this.list[i];
  }

  getCurrentParams() {
    return this.next?.userData.param ?? PATTERN_SPECS[0].param;
  }

  update() {
    this.current?.render();
    this.next?.render();
  }

  resize(sceneResolution) {
    this.list.forEach((t) => t.resize(sceneResolution.clone().multiplyScalar(0.5)));
  }

  dispose() {
    this.list.forEach((t) => t.dispose());
    this.list = [];
  }
}

/** works 段：把作品图按滚动进度推上墙面。原站还做了高斯模糊，这里先用原图。 */
class BGQuadWorks {
  uniforms;
  #animator = new (Object.getPrototypeOf(animator).constructor)();
  #textures = new Map();
  #count = 0;
  #onChangeWorks = null;
  #onChangeCount = null;
  currentWorksIndex = 0;
  currentDisplayIndex = 0;

  constructor() {
    this.uniforms = {
      uScroll: { value: 0 },
      uScrollPage: { value: 0 },
      uScrollPageLerp: { value: 0 },
      uWorks1Tex: { value: null },
      uWorks1Loaded: { value: 0 },
      uWorks1Aspect: { value: 1 },
      uWorks2Tex: { value: null },
      uWorks2Loaded: { value: 0 },
      uWorks2Aspect: { value: 1 },
    };
  }

  get worksCount() {
    return this.#count;
  }

  onChangeWorks(fn) { this.#onChangeWorks = fn; }
  onChangeCount(fn) { this.#onChangeCount = fn; }

  setElement(items) {
    this.#count = items.length;
    this.#onChangeCount?.(items.length);
    const loader = new THREE.TextureLoader();
    items.forEach((src, i) => {
      const name = `worksTexLoaded${i}quad`;
      const loaded = this.#animator.add({ name, initValue: 0 });
      const aspect = { value: 1 };
      const tex = loader.load(src, (t) => {
        this.#animator.animate(name, 1, 0.5);
        aspect.value = t.image.width / t.image.height;
      });
      this.#textures.set(i, { texture: tex, loaded, aspect });
    });
  }

  update({ deltaTime }) {
    this.#animator.update(deltaTime);
    const trigger = topScrollManager.getTrigger('works_progress');
    if (!trigger) return;

    const progress = trigger.progress || 0;
    this.uniforms.uScroll.value = progress;

    // 阻尼 0.7 后按「作品数 + 1」展开，整数部分是当前页，小数部分是页内进度
    const paged = lerper.set('bgQuadProgress', progress, 0.7) * (this.#textures.size + 1);
    const frac = paged % 1;
    const page = Math.floor(paged);
    const display = Math.floor(Math.max(0, Math.min(this.worksCount - 1, paged - 0.5)));

    this.uniforms.uScrollPage.value = frac;
    this.uniforms.uScrollPageLerp.value = frac;

    if (this.currentDisplayIndex !== display) this.#onChangeWorks?.(display);
    this.currentWorksIndex = page;
    this.currentDisplayIndex = display;

    const prev = this.#textures.get(Math.max(0, page - 1));
    if (prev) {
      this.uniforms.uWorks1Tex.value = prev.texture;
      this.uniforms.uWorks1Loaded.value = prev.loaded.value;
      this.uniforms.uWorks1Aspect.value = prev.aspect.value;
    }
    const cur = this.#textures.get(page);
    if (cur) {
      this.uniforms.uWorks2Tex.value = cur.texture;
      this.uniforms.uWorks2Loaded.value = cur.loaded.value;
      this.uniforms.uWorks2Aspect.value = cur.aspect.value;
    }
  }
}

export class BGQuadTree extends THREE.Mesh {
  #commonUniforms;
  #patterns;
  #geoList = [];
  #currentSection = null;
  #alive = true;
  #timers = [];
  works;

  constructor({ renderer, commonUniforms, noiseTexture, logoTexture, worksTitleTexture, worksImages }) {
    const works = new BGQuadWorks();

    const uniforms = {
      ...commonUniforms,
      ...works.uniforms,
      uPatternCurrent: { value: null },
      uPatternNext: { value: null },
      uPatternSelect: animator.add({ name: 'bgQuad_pattern', initValue: 0, easing: Easings.linear }),
      uLogoTex: { value: logoTexture ?? null },
      uPatternSelectType: { value: 0 },
      uPatternType: { value: 0 },
      uUVShift: animator.add({ name: 'bgQuad_uvShift', initValue: 0, easing: Easings.linear }),
      uUVShiftPower: animator.add({ name: 'bgQuad_uvShift_power', initValue: 0, easing: Easings.easeOutCubic }),
      uUVShiftHash: animator.add({ name: 'bgQuad_uvShift_hash', initValue: 0, easing: Easings.linear }),
      uBlackOut: animator.add({ name: 'bgQuad_blackOut', initValue: 0, easing: Easings.linear }),
      uBlackOutHash: animator.add({ name: 'bgQuad_blackOut_hash', initValue: 0, easing: Easings.linear }),
      uTileRotate: animator.add({ name: 'bgQuad_tileRotate', initValue: 0, easing: Easings.linear }),
      uLogoDisplayType: { value: 0 },
      uDark: animator.add({ name: 'bgQuad_dark', initValue: 0, easing: Easings.linear }),
      uHide: animator.add({ name: 'bgQuad_hide', initValue: 0, easing: Easings.cubicBezier(0.06, 0.59, 0.04, 0.99) }),
      uWorksBlockAnim: animator.add({ name: 'bgQuad_worksBlockAnim', initValue: 0, easing: Easings.cubicBezier(0.01, 0.68, 0.19, 1) }),
      uWOrksBlockAnimHash1: { value: 0 },
      uWOrksBlockAnimHash2: { value: 0 },
      uWorksTitleTex: { value: worksTitleTexture ?? null },
      uWorksTitleProgress: { value: 0 },
      uScale: { value: new THREE.Vector3(1, 1, 1) },
      // uFluidsTex 来自 commonUniforms（上面的展开）—— 这里绝不能再写一个
      // { value: null } 覆盖掉它，否则砖墙永远读不到速度场，
      // vEmitSide 恒为 0，鼠标划过时窗格不会亮。
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: bgQuadVert,
      fragmentShader: bgQuadFrag,
      uniforms,
      defines: { WORKS_NUM: String(Math.max(1, worksImages?.length || 1)) },
      transparent: true,
      depthWrite: false,
    });

    super(undefined, material);

    this.#commonUniforms = uniforms;
    this.works = works;
    this.#patterns = new BGQuadTreePatterns(renderer, uniforms, noiseTexture);

    works.onChangeCount((n) => {
      material.defines.WORKS_NUM = String(Math.max(1, n));
      material.needsUpdate = true;
    });
    works.onChangeWorks(() => this.#kickWorksBlockAnim());

    // 四份几何轮换。同一份用久了砖块布局会被认出来
    for (let i = 0; i < 4; i += 1) this.#geoList.push(createQuadTreeGeometry());
    this.geometry = this.#geoList[0];

    if (worksImages?.length) works.setElement(worksImages);

    this.#startTimers();
    this.changePattern();
  }

  /**
   * 三组互不同步的随机定时器。间隔本身带随机量，所以墙面不会走进可辨认的循环。
   * 几何轮换只在 KV 段发生 —— 往下滚之后墙面要稳定，不能在读正文时抽换布局。
   */
  #startTimers() {
    const swapGeometry = (first) => {
      if (!this.#alive) return;
      if (first || this.#currentSection === 'kv') {
        this.geometry = this.#geoList[Math.floor(Math.random() * this.#geoList.length)];
      }
      this.#timers.push(setTimeout(() => swapGeometry(false), 4000));
    };
    swapGeometry(true);

    const randomizeLogoType = () => {
      this.#commonUniforms.uLogoDisplayType.value = Math.floor(Math.random() * 3);
    };
    randomizeLogoType();

    const blackOutTick = () => {
      if (!this.#alive) return;
      randomizeLogoType();
      const p = this.#patterns.getCurrentParams();
      animator.setValue('bgQuad_blackOut', p.blackOut + Math.random() * p.blackOutRandom);
      animator.animate('bgQuad_blackOut_hash', Math.random(), 0.3);
      this.#timers.push(setTimeout(blackOutTick, (p.blackOutInterval + p.blackOutIntervalRandom * Math.random()) * 1000));
    };
    blackOutTick();

    const uvShiftTick = () => {
      if (!this.#alive) return;
      const p = this.#patterns.getCurrentParams();
      animator.setValue('bgQuad_uvShift', p.uvShift + p.uvShiftRandom * Math.random());
      animator.animate('bgQuad_uvShift_power', Math.random(), 0.8);
      animator.animate('bgQuad_uvShift_hash', Math.random(), 0.3);
      this.#timers.push(setTimeout(uvShiftTick, (p.uvShiftInterval + p.uvShiftIntervalRandom * Math.random()) * 1000));
    };
    uvShiftTick();

    const patternTick = () => {
      if (!this.#alive) return;
      const { fadeDuration } = this.changePattern();
      this.#timers.push(setTimeout(patternTick, (Math.random() + fadeDuration + 1) * 1000));
    };
    this.#timers.push(setTimeout(patternTick, 2000));
  }

  #kickWorksBlockAnim() {
    if (!this.#alive) return;
    this.#commonUniforms.uWOrksBlockAnimHash1.value = this.#commonUniforms.uWOrksBlockAnimHash2.value;
    this.#commonUniforms.uWOrksBlockAnimHash2.value = Math.random();
    animator.setValue('bgQuad_worksBlockAnim', 0);
    animator.animate('bgQuad_worksBlockAnim', 1, 2);
  }

  /**
   * 图案切换有三种过渡方式（uPatternSelectType 0/1/2），对应 0 / 0.3 / 3 秒。
   * 只有 KV 段才随机取；往下滚之后固定用 0 —— 硬切，不做长过渡。
   */
  changePattern(index) {
    if (index === undefined) this.#patterns.changeRandom();
    else this.#patterns.change(index);

    this.#commonUniforms.uPatternCurrent.value = this.#patterns.current.texture;
    this.#commonUniforms.uPatternNext.value = this.#patterns.next.texture;

    let type = Math.floor(Math.random() * 3);
    if (this.#currentSection !== 'kv') type = 0;
    const fadeDuration = [0, 0.3, 3][type];

    this.#commonUniforms.uPatternSelectType.value = type;
    animator.setValue('bgQuad_pattern', 0);
    animator.animate('bgQuad_pattern', 1, fadeDuration);
    return { fadeDuration };
  }

  /** 开发期：把随机 UV 偏移那几个量露出来，用于和原站对表。 */
  debugShift() {
    const u = this.#commonUniforms;
    return {
      shift: +u.uUVShift.value.toFixed(3),
      power: +u.uUVShiftPower.value.toFixed(3),
      patternType: u.uPatternType?.value ?? -1,
      title: +u.uWorksTitleProgress.value.toFixed(3),
    };
  }

  changeSection(name) {
    this.#currentSection = name;
  }

  update(ctx) {
    /**
     * 背景那行巨大的 WORKS。原站有个 WorksTitle 对象专门做这件事：
     *   lerper.set('works_title_visibility', works_intro 触发器进度, 0.3)
     * 我只读不写，lerper 里根本没这个键 → uWorksTitleProgress 恒为 0 →
     * 片元里 wtVisibility = smoothstep(0.1,0.3,0)·… = 0 → 字永远不显示。
     */
    const introTrigger = topScrollManager.getTrigger('works_intro');
    this.#commonUniforms.uWorksTitleProgress.value = lerper.set(
      'works_title_visibility', introTrigger?.progress || 0, 0.3,
    );
    this.#patterns.update(ctx);
    this.works.update(ctx);
  }

  /** 砖墙要正好铺满视口：按相机的基准 fov / 基准距离反算可视尺寸，取长边。 */
  resize({ camera, sceneResolution }) {
    const fov = camera.userData.baseFov || camera.fov;
    const basePos = camera.userData.basePos || camera.position;
    const dist = Math.abs(basePos.z);
    const visibleH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const visibleW = visibleH * camera.aspect;
    const s = Math.max(visibleH, visibleW);
    this.#commonUniforms.uScale.value.set(s, s, 1);
    this.#patterns.resize(sceneResolution);
  }

  dispose() {
    this.#alive = false;
    this.#timers.forEach(clearTimeout);
    this.#timers = [];
    this.#patterns.dispose();
  }
}
