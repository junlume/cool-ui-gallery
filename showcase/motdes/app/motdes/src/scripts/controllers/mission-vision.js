import gsap from 'gsap';

import { lerper } from '../core/lerper.js';
import { deviceManager } from '../core/device-manager.js';
import { topScrollManager } from '../core/top-scroll-manager.js';
import { PortfolioTypeController } from './portfolio-type.js';
import { ProfileStoryController } from './profile-story.js';

/** 英文大标题化到底时的模糊半径。原站那层残影糊得比 10px 更开。 */
const TITLE_BLUR_MAX = 14;

/**
 * MISSION / VISION 两段的推进器。
 *
 * 三件事同时发生，各自吃不同的进度源：
 *   1. 标题描边       —— path 的 strokeDasharray 由 0 500 → 500 0，进度经双重阻尼
 *   2. 逐行文字与荧光笔 —— 按行错开，行淡入 0.1、笔宽推进 0.5
 *   3. 整体淡出 + 模糊  —— 吃"出场触发器"的进度，前半程内走完
 *
 * 常量取自原站字面量，不要调。
 */
const PATH_LENGTH = 500;

const CFG = {
  PATH_LERP_SPEED: 0.4,
  PATH_SMOOTH_SPEED: 0.4,
  LINE_DURATION: 0.1,
  MARKER_DURATION: 0.5,
};

class BaseMissionVisionController {
  /**
   * 退场窗口（按出场触发器的进度算）。
   *
   * 原来是"一进入下一段就开始化"（title 走 0→0.35、正文走 0→0.5），实测在
   * 字标侧壁刚张开一点点（uServiceRotate = 0.101）的时候，标题已经掉到 0.57、
   * 正文掉到 0.325 —— 侧壁真正张开成面的那个角度上，两侧文字已经没了。
   * 原站在那个角度上标题和两侧文字都还在（而且是清晰的）。
   *
   * 所以把窗口整体往后推：先**稳住**，等侧壁转开、开始往中间放大了再化。
   * 标题比正文早一点点走，保持原站那个先后次序。
   *
   * ⚠️ VISION 段的窗口不是按触发器进度算的，是按**侧壁自己的开合进度**
   *（uServiceRotate）算的 —— 见 VisionController.outProgress。触发器进度跑在
   * 侧壁前面（实测侧壁 0.245 时触发器已经 0.50 / 0.64），拿触发器当尺子，
   * "在这个角度上文字还在"这句话就永远对不准。
   */
  static TITLE_OUT = [0.45, 0.72];
  static TEXT_OUT = [0.50, 0.80];

  _el = { container: null, title: null, path: null, textEn: null, texts: [], lines: [], markers: [] };
  _timeline = null;

  setupElements() {
    const container = document.querySelector(this.containerSelector);
    if (!container) return;

    this._el = {
      container,
      title: container.querySelector(this.titleSelector),
      // 只从**标题里**取 path。原来是 container.querySelector('path')，
      // mission 段的标题拿掉之后这个宽选择器随时可能抓到别的 svg 上去。
      path: container.querySelector(`${this.titleSelector} path`),
      textEn: container.querySelector(this.textEnSelector),
      texts: Array.from(container.querySelectorAll(this.textSelector)),
      lines: Array.from(container.querySelectorAll('[data-line-index]')),
      markers: [],
    };

    this._el.lines.forEach((line, i) => {
      gsap.set(line, { opacity: 0, y: 20 });
      const marker = line.querySelector(`[data-marker-${i}]`);
      if (marker) {
        this._el.markers.push(marker);
        marker.style.backgroundSize = '0% 100%';
      }
    });

    if (this._el.path) this.setupPathAnimation();
  }

  /** 标题是描边字，用 dasharray 从 0 拉到全长来"写"出来。 */
  setupPathAnimation() {
    const { path } = this._el;
    path.style.strokeDasharray = `0 ${PATH_LENGTH}`;
    path.style.strokeDashoffset = '0';
    this._timeline = gsap.timeline({ paused: true });
    this._timeline.to(path.style, {
      strokeDasharray: `${PATH_LENGTH} 0`,
      duration: 1,
      ease: 'none',
    });
  }

  /**
   * 双重阻尼：先把原始进度阻尼一次，再朝最近的整数拉 70%，最后再阻尼一次。
   * 这一步是手感的关键 —— 让描边在两端"吸住"，中间段推进更利落。
   */
  updatePathAnimation(trigger) {
    const raw = lerper.set(`${this.lerperPrefix}_path_raw`, trigger.progress, CFG.PATH_LERP_SPEED);
    const nearest = Math.round(raw);
    const smoothed = lerper.set(
      `${this.lerperPrefix}_path`,
      nearest - (nearest - raw) * 0.7,
      CFG.PATH_SMOOTH_SPEED,
    );
    // 没有大标题的段落（照原站，MISSION 就没有）没有描边时间轴，但这条进度还要驱动正文
    this.updateTitlePath(smoothed);
    return smoothed;
  }

  updateTitlePath(progress) {
    this._timeline?.progress(progress);
  }

  updateLinesAndMarkers(progress) {
    const { lines, markers } = this._el;
    lines.forEach((line, i) => {
      const offset = (i / lines.length) * 0.8;

      const lineT = gsap.utils.clamp(0, 1, (progress - offset) / CFG.LINE_DURATION);
      const lineV = gsap.utils.interpolate(0, 1, gsap.parseEase('power3.out')(lineT));
      line.style.opacity = String(lineV);
      line.style.transform = `translateY(${(1 - lineV) * 8}px)`;

      const markerStart = offset + CFG.LINE_DURATION * 0.3;
      const markerT = gsap.utils.clamp(0, 1, (progress - markerStart) / CFG.MARKER_DURATION);
      const markerV = gsap.utils.interpolate(0, 1, gsap.parseEase('power2.out')(markerT));
      const marker = markers[i];
      if (marker) marker.style.backgroundSize = `${markerV * 100}% 100%`;
    });
  }

  /** 退场进度源。默认就是出场触发器；子类可以换成别的尺子。 */
  get outProgress() {
    return topScrollManager.getTrigger(this.outTriggerName)?.progress ?? 0;
  }

  /**
   * 出场：整体在"出场触发器"进度的前半程内淡掉并糊掉。
   *
   * 英文大标题（只有 VISION 有；mission 段照原站不放大标题）
   * **走自己一条更早的曲线**（titleLeadProgress），
   * 赶在字标侧壁那条虹彩带长起来**之前**退场。原站就是这个次序：英文出现一次、
   * 随即淡成背景色，等带子铺开时画面里已经没有英文了。
   * 之前它和正文共用 vision_out 那条，而 vision_out 推进得更晚 ——
   * 结果带子都长满了，英文还清清楚楚杵在左上角。
   */
  updateOpacityAndBlur(outTrigger, pathProgress, inProgress = 1) {
    const { title, path, texts, textEn } = this._el;
    if (!textEn) return;
    const englishGate = this.englishInGate;
    if (title) title.style.opacity = String(englishGate);
    if (deviceManager.isSPLayout) {
      if (this.hasEnglishStagger) textEn.style.opacity = String(englishGate);
      if (title) title.style.filter = 'none';
      return;
    }

    /**
     * inGate：本段**没进来**的时候整块内容必须是不可见的。
     *
     * 两段的容器都是 position:fixed 铺满屏幕、一直在 DOM 里，靠透明度分先后。
     * 原来 vision 这块只看 vision_out（它**后面**那个触发器），
     * 往回滚时 vision_out 归零 → 淡出系数回到 1，而行内透明度走的是**带阻尼的**
     * 路径进度，要一两秒才跟着掉 —— 这一两秒里 current_section 已经是 mission，
     * vision 的正文却还是 opacity 1、不带模糊，直接盖在上一屏上。
     * 实测回滚到 mission 的那一帧：vision op=1 blur(0px)，停稳 2.5 秒后才降到 0.003。
     *
     * 用**未经阻尼**的本段进度当闸门，离开本段的那一刻就关掉，不等跟随器。
     */
    const inGate = gsap.utils.clamp(0, 1, inProgress * 4);
    const win = (p, [a, b]) => 1 - gsap.utils.clamp(0, 1, (p - a) / (b - a));

    const { TITLE_OUT, TEXT_OUT } = BaseMissionVisionController;
    const outP = this.outProgress;
    const fade = win(outP, TEXT_OUT) * inGate;
    const enOpacity = fade * (this.hasEnglishStagger ? 1 : pathProgress) * englishGate;
    const blur = `blur(${(1 - fade) * 10}px)`;

    const titleFade = Math.min(fade, win(outP, TITLE_OUT));

    /**
     * 模糊走得比透明度快 —— 让它**化进背景**，而不是原地一淡就没。
     * 原站录屏第 26.8 秒（带子快铺满的前一刻）量出来还留着一层糊掉的残影，
     * 说明它主要靠模糊消失，不是靠 alpha 归零。sqrt 把透明度在中段抬起来，
     * 这时候模糊已经上到 10px，观感正是那层残影；到末端两者一起归零。
     */
    if (path) path.style.opacity = String(Math.sqrt(titleFade));
    if (title) title.style.filter = `blur(${(1 - titleFade) * TITLE_BLUR_MAX}px)`;
    textEn.style.opacity = String(enOpacity);
    textEn.style.filter = blur;
    texts.forEach((t) => {
      t.style.opacity = String(fade);
      t.style.filter = blur;
    });
  }

  update() {
    const { container, textEn } = this._el;
    if (!container || !textEn) return;   // 大标题是可选的：MISSION 段没有

    const trigger = topScrollManager.getTrigger(this.triggerName);
    const outTrigger = topScrollManager.getTrigger(this.outTriggerName);
    if (!trigger || !outTrigger) return;

    this.updateSpecificEffects(trigger);
    const pathProgress = this.updatePathAnimation(trigger);
    this.updateLinesAndMarkers(pathProgress);
    this.updateOpacityAndBlur(outTrigger, pathProgress, trigger.progress);
  }

  updateSpecificEffects() {}

  get hasEnglishStagger() { return false; }
  get englishInGate() { return 1; }

  resetElements() {
    this._el.markers.forEach((m) => {
      m.style.backgroundSize = '0% 100%';
    });
    this._el = { container: null, title: null, path: null, textEn: null, texts: [], lines: [], markers: [] };
  }

  in() {
    this._timeline?.kill();
    this._timeline = null;
    this.setupElements();
  }

  out() {
    this._timeline?.kill();
    this._timeline = null;
    this.resetElements();
  }
}

class MissionController extends BaseMissionVisionController {
  static MASK_LERP_SPEED = 1;
  static MASK_FADE = '3%';

  get containerSelector() { return '[data-mission-container]'; }
  get titleSelector() { return '[data-mission-title]'; }
  get textEnSelector() { return '[data-mission-text_en]'; }
  get textSelector() { return '[data-mission-text]'; }
  get triggerName() { return 'mission_in'; }
  get outTriggerName() { return 'vision'; }
  get lerperPrefix() { return 'mission'; }

  /** MISSION 独有：整块内容被一条自下而上的遮罩推着露出来。 */
  updateMaskEffect(trigger) {
    if (!this._el.container || deviceManager.isMobile) return;
    const h = lerper.set('mission_mask_progress', trigger.progress, MissionController.MASK_LERP_SPEED) * 100 - 1.5;
    this._el.container.style.setProperty('--mask-height', `${h}%`);
    this._el.container.style.setProperty('--mask-fade', MissionController.MASK_FADE);
  }

  updateSpecificEffects(trigger) {
    this.updateMaskEffect(trigger);
  }
}

class VisionController extends BaseMissionVisionController {
  #portfolioType = new PortfolioTypeController();
  #englishAllowed = false;
  #previousChineseObserver = null;
  #previousChinese = null;
  #mobileChineseGone = false;
  #observerGeneration = 0;
  #reducedMotion = false;

  get hasEnglishStagger() { return true; }
  get englishInGate() { return this.#englishAllowed ? 1 : 0; }

  in() {
    super.in();
    this.#observerGeneration += 1;
    this.#previousChineseObserver?.disconnect();
    this.#previousChineseObserver = null;
    this.#englishAllowed = false;
    this.#reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this._el.title) this._el.title.style.opacity = '0';
    if (this._el.textEn) this._el.textEn.style.opacity = '0';
    this.#portfolioType.in(this._el.textEn);
    const previousChinese = document.querySelector('[data-mission-text]');
    this.#previousChinese = previousChinese;
    this.#mobileChineseGone = !previousChinese;
    if (previousChinese && typeof IntersectionObserver !== 'undefined') {
      const generation = this.#observerGeneration;
      this.#previousChineseObserver = new IntersectionObserver(([entry]) => {
        if (generation !== this.#observerGeneration) return;
        // Mobile uses document flow: wait until all of the preceding Chinese is above the screen.
        this.#mobileChineseGone = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
      }, { threshold: 0 });
      this.#previousChineseObserver.observe(previousChinese);
    }
  }

  updateSpecificEffects(trigger) {
    const profile = topScrollManager.getTrigger('profile_progress');
    const profileFinished = !profile || profile.progress >= 1;
    const allowed = profileFinished && (deviceManager.isSPLayout
      ? this.#previousChineseObserver ? this.#mobileChineseGone
        : !this.#previousChinese || this.#previousChinese.getBoundingClientRect().bottom <= 0
      : trigger.progress >= BaseMissionVisionController.TEXT_OUT[1]);
    if (allowed !== this.#englishAllowed) {
      this.#englishAllowed = allowed;
      // Start the outline on the same frame as the letters, after MISSION opacity reaches zero.
      // Do not let either animation finish while its parent is still hidden.
      if (!allowed) this._timeline?.pause(0);
      else if (this.#reducedMotion) this._timeline?.progress(1).pause();
      else this._timeline?.restart();
    }
    this.#portfolioType.update({
      progress: trigger.progress,
      outProgress: this.outProgress,
      isSPLayout: deviceManager.isSPLayout,
      canEnter: allowed,
    });
  }

  // The English outline now uses its own entrance clock; Chinese lines retain scroll damping.
  updateTitlePath() {}

  out() {
    this.#observerGeneration += 1;
    this.#previousChineseObserver?.disconnect();
    this.#previousChineseObserver = null;
    this.#previousChinese = null;
    this.#mobileChineseGone = false;
    this.#englishAllowed = false;
    this.#portfolioType.out();
    super.out();
  }

  get containerSelector() { return '[data-vision-container]'; }
  get titleSelector() { return '[data-vision-title]'; }
  get textEnSelector() { return '[data-vision-text_en]'; }
  get textSelector() { return '[data-vision-text]'; }
  get triggerName() { return 'vision'; }
  get outTriggerName() { return 'vision_out'; }
  get lerperPrefix() { return 'vision'; }

  /**
   * VISION 段的退场尺子是**字标侧壁的开合进度**本身，不是任何触发器。
   *
   * GL 那边推侧壁用的是 `lerper.set('mainLogo_serviceRotate', …)`，
   * 这里直接读同一个跟随器的当前值 —— 这样"侧壁转到这个角度时文字还在"
   * 才是一句能对准的话。用触发器进度不行：它跑在侧壁前面（实测侧壁 0.245 时
   * service_in 已经 0.50、vision_out 已经 0.64），也不能用 vision 段自己的进度，
   * 那是吸附段，0 → 0.949 → 1 一步到位，根本没有中间态。
   */
  get outProgress() {
    return lerper.get('mainLogo_serviceRotate')?.current ?? 0;
  }
}

/** 两段共用一个逐帧入口，顺序固定：先 mission 后 vision。 */
export class VisionMissionController {
  #mission = new MissionController();
  #vision = new VisionController();
  #profile = new ProfileStoryController();

  in() {
    this.#mission.in();
    this.#vision.in();
    this.#profile.in();
  }

  out() {
    this.#mission.out();
    this.#vision.out();
    this.#profile.out();
  }

  update() {
    this.#mission.update();
    this.#vision.update();
    this.#profile.update();
  }
}

export const visionMissionController = new VisionMissionController();
