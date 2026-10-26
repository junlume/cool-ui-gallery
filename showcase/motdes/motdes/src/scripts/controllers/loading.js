import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

import { TIMELINE_DURATION } from '../../lib/construction-svg.js';

/**
 * 开场编排。四段，时序逐个取自原站 LoadingUIController 与两个 Lottie：
 *
 *   ① 构造线   进度 = min(真实加载进度, 已用时/1s)，再经 0.1 的阻尼推进
 *              —— 所以就算资源秒开，线也至少画满 1 秒，不会闪一下就没。
 *              这个进度映射到 bg Lottie 的**前 45%**（3.003s × 0.45 = 1.351s，
 *              原站字面量），每条线再按自己的 ip / trim 关键帧各走各的。
 *   ② 文字     400ms 后开始；逐字乱码显影，每字错开 40ms、起点再延 300ms
 *   ③ 字标     构造线完成后，1.8 秒把 M 的轮廓"写"出来，缓动 easeInOutSine
 *              （原站 setProgress(0.144 + ease × 0.3775)，正好是 logo Lottie
 *               的 f13 → f47 那段 trim）
 *   ④ 收场     整层 0.8s 淡出（power2.out），同时把滚动交还给页面
 *
 * ⚠️ 上一版所有线用同一个 0.34 宽的错峰窗口齐刷刷生长 —— 那是我编的。
 * 原站四组线的出场次序是：竖线(0→0.33s) → 横线(0.13→1.0s) →
 * 一族斜线(0.3→0.8s) → 另一族斜线(0.73→1.33s)，圆和扫光各自穿插。
 *
 * 原站②用的乱码字符池是品牌名 "ALCHE"，这里同样用品牌名。
 */
const SCRAMBLE_CHARS = 'MOTDES'.split('');
const MIN_DURATION = 1;          // 构造线最短播放时长（秒）
const DAMP = 0.1;                // 进度阻尼，越小越"迟滞"
const LOGO_DURATION = 1.8;       // 字标描边时长（秒）
const TEXT_DELAY = 400;          // 文字开始的延迟（毫秒）

/** easeInOutSine —— 原站字标描边用的就是它 */
const ease = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

/**
 * AE 的 easyEase，Lottie 里记作 i:{x:.667,y:1} / o:{x:.333,y:0}，
 * 也就是 cubic-bezier(.333,0,.667,1)。四组线用的都是它。
 * （圆与扫光用的是 i/o 都取 .833/.167 的那条，数值上已经接近直线，
 *   两者差 <1.5%，这里统一用同一条足够 —— 但差别不是被忽略，是被量过的。）
 */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

export class LoadingController {
  #overlay = null;
  #consContainer = null;
  #logoContainer = null;
  #textElement = null;
  #consItems = [];
  #logoPath = null;
  #logoLength = 0;
  #logoDir = -1;

  #enabled = false;
  #animating = false;
  #realProgress = 0;
  #displayProgress = 0;
  #currentTime = 0;
  #startedAt = 0;
  #progressComplete = false;
  #logoPlaying = false;
  #logoTime = 0;
  #textSplit = null;
  #scrambleTimer = null;
  #charStates = [];
  #resolveComplete = null;
  #completePromise = null;
  #completed = false;
  #hidePromise = null;

  init() {
    this.#overlay = document.getElementById('loading-overlay');
    if (!this.#overlay) return false;

    this.#consContainer = this.#overlay.querySelector('#loading-lottie');
    this.#logoContainer = this.#overlay.querySelector('#loading-logo');
    this.#textElement = this.#overlay.querySelector('#loading-text');

    // 每个元素自带 data-t0 / data-t1（Lottie 秒）与 data-dir（+1 从头画、−1 从尾画）
    this.#consItems = [...(this.#consContainer?.querySelectorAll('[data-t0]') ?? [])].map((el) => ({
      el,
      t0: Number(el.dataset.t0),
      t1: Number(el.dataset.t1),
      dir: Number(el.dataset.dir) || 1,
    }));
    // 全部元素在 SVG 里已带 pathLength="1"，所以这里统一用 1 —— 不必逐个量长度
    this.#consItems.forEach(({ el, dir }) => {
      el.style.strokeDasharray = '1';
      el.style.strokeDashoffset = String(dir);
    });

    this.#logoPath = this.#logoContainer?.querySelector('.cons-logo') ?? null;
    if (this.#logoPath) {
      this.#logoLength = 1;
      // 原站是 trim start 100→0：从路径**末端**倒着写回起点
      this.#logoDir = Number(this.#logoPath.dataset.dir) || -1;
      this.#logoPath.style.strokeDasharray = '1';
      this.#logoPath.style.strokeDashoffset = String(this.#logoDir);
    }

    gsap.set(this.#consContainer, { opacity: 1 });
    gsap.set(this.#logoContainer, { opacity: 0 });
    this.#enabled = true;
    return true;
  }

  show() {
    if (!this.#enabled) return;
    this.#overlay.removeAttribute('data-hidden');
    this.#overlay.style.opacity = '1';
    this.#animating = true;
    this.#reset();
    this.#startedAt = Date.now();
    setTimeout(() => this.#startTextAnimation(), TEXT_DELAY);
  }

  #reset() {
    this.#realProgress = 0;
    this.#displayProgress = 0;
    this.#currentTime = 0;
    this.#progressComplete = false;
    this.#logoPlaying = false;
    this.#logoTime = 0;
    this.#completed = false;
    this.#completePromise = null;
  }

  /** 由资源加载器调用，0..1。 */
  setProgress(v) {
    if (!this.#enabled || !this.#animating) return;
    this.#realProgress = Math.max(this.#realProgress, Math.min(1, v));
  }

  update(deltaTime) {
    if (!this.#enabled || !this.#animating) return;
    this.#updateConstruction();
    if (this.#logoPlaying) this.#updateLogo(deltaTime);
  }

  #updateConstruction() {
    const elapsed = (Date.now() - this.#startedAt) / 1000;
    const timeGate = Math.min(1, elapsed / MIN_DURATION);
    this.#displayProgress = Math.min(this.#realProgress, timeGate);

    // 阻尼推进 —— 目标值跳变时线不会瞬移
    this.#currentTime += (this.#displayProgress - this.#currentTime) * DAMP;
    this.#paintConstruction(this.#currentTime);

    if (!this.#progressComplete
      && this.#realProgress >= 0.999
      && timeGate >= 0.999
      && Math.abs(this.#currentTime - this.#displayProgress) < 0.01) {
      this.#progressComplete = true;
      this.#startLogo();
    }
  }

  /**
   * 把 0..1 的加载进度映射到 Lottie 的 0..1.351s，再按每个元素自己的
   * 关键帧区间推进。dir = −1 的元素 offset 走 −1 → 0，也就是从尾端画回来。
   */
  #paintConstruction(p) {
    if (!this.#consItems.length) return;
    const now = p * TIMELINE_DURATION;
    for (const { el, t0, t1, dir } of this.#consItems) {
      const t = t1 > t0 ? gsap.utils.clamp(0, 1, (now - t0) / (t1 - t0)) : (now >= t1 ? 1 : 0);
      el.style.strokeDashoffset = String(dir * (1 - easeInOut(t)));
    }
  }

  #startLogo() {
    if (!this.#logoPath) { this.#complete(); return; }
    this.#logoPlaying = true;
    this.#logoTime = 0;
    gsap.set(this.#logoContainer, { opacity: 1 });
  }

  #updateLogo(deltaTime) {
    this.#logoTime += deltaTime;
    if (this.#logoTime >= LOGO_DURATION) {
      this.#logoTime = LOGO_DURATION;
      this.#logoPlaying = false;
      this.#complete();
    }
    const t = ease(this.#logoTime / LOGO_DURATION);
    this.#logoPath.style.strokeDashoffset = String(this.#logoDir * this.#logoLength * (1 - t));
  }

  /**
   * 逐字乱码显影。空格直接隐藏 —— 否则乱码字符会把词间距撑开。
   * 未显影的字压到 0.3 透明度，显影瞬间跳回 1，形成"啪"的一下落定。
   */
  #startTextAnimation() {
    if (!this.#textElement) return;
    this.#textElement.style.opacity = '1';
    this.#textSplit = new SplitText(this.#textElement, { type: 'chars' });

    const t0 = Date.now();
    this.#charStates = [];
    this.#textSplit.chars.forEach((el, i) => {
      const ch = el.textContent || '';
      if (ch.trim() === '') { el.style.opacity = '0'; return; }
      this.#charStates.push({ el, ch, revealed: false, at: t0 + i * 40 + 300 });
      el.style.opacity = '0.3';
      el.style.transformOrigin = '50% 50%';
      el.textContent = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    });

    this.#scrambleTimer = window.setInterval(() => {
      const now = Date.now();
      let allDone = true;
      this.#charStates.forEach((s) => {
        if (s.revealed) return;
        if (now >= s.at) {
          s.revealed = true;
          s.el.textContent = s.ch;
          s.el.style.opacity = '1';
        } else {
          s.el.textContent = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          allDone = false;
        }
      });
      if (allDone && this.#scrambleTimer) {
        clearInterval(this.#scrambleTimer);
        this.#scrambleTimer = null;
      }
    }, 32);
  }

  #complete() {
    // 必须记标志位：#complete() 有可能早于 waitForComplete() 被调用，
    // 那时 #resolveComplete 还是 null，resolve 会丢，之后新建的 promise
    // 永远不会兑现 —— 开场就卡死在那里。
    this.#completed = true;
    this.#resolveComplete?.();
    this.#resolveComplete = null;
  }

  /** 等构造线 + 字标都走完。 */
  waitForComplete() {
    if (!this.#enabled || this.#completed) return Promise.resolve();
    if (!this.#completePromise) {
      this.#completePromise = new Promise((r) => { this.#resolveComplete = r; });
    }
    return this.#completePromise;
  }

  /** 开发期状态快照。 */
  debugState() {
    return {
      enabled: this.#enabled,
      animating: this.#animating,
      realProgress: +this.#realProgress.toFixed(3),
      currentTime: +this.#currentTime.toFixed(3),
      progressComplete: this.#progressComplete,
      logoPlaying: this.#logoPlaying,
      logoTime: +this.#logoTime.toFixed(2),
      completed: this.#completed,
      hidePending: !!this.#hidePromise,
    };
  }

  hide(lenis) {
    this.#animating = false;
    if (!this.#enabled) return Promise.resolve();
    if (this.#hidePromise) return this.#hidePromise;

    lenis?.scrollTo(0, { immediate: true });
    this.#hidePromise = new Promise((resolve) => {
      gsap.to(this.#overlay, {
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        onComplete: () => {
          this.#overlay.setAttribute('data-hidden', '');
          document.body.style.overflow = '';
          if (this.#scrambleTimer) { clearInterval(this.#scrambleTimer); this.#scrambleTimer = null; }
          this.#hidePromise = null;
          resolve();
        },
      });
    });
    return this.#hidePromise;
  }
}

export const loadingController = new LoadingController();
