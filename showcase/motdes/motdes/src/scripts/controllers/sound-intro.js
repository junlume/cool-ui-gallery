import { deviceManager } from '../core/device-manager.js';

/**
 * 首访声音确认条。
 *
 * 收场那一下是原站最讲究的细节：面板不是简单淡出，而是**被吸进右上角的
 * 声音开关** —— 计算面板中心到开关中心的位移，用 750ms 位移过去并缩到 0.04，
 * 落地后开关自己脉冲一下（1.35 → 1），再从开关下方浮出一条提示。
 * 整个过程把「这个选择归属于那个按钮」讲清楚了，比任何文案都直接。
 *
 * 只在首访、且非 SP 布局时出现（localStorage 记住）。
 */
const STORAGE_KEY = 'sound-intro-shown';
const FALLBACK_DELAY = 8000;   // 兜底：外部没来叫它，8 秒后自己出场
const ABSORB_DURATION = 750;
const HINT_DURATION = 6000;

export class SoundIntroController {
  #overlay = null;
  #panel = null;
  #hint = null;
  #hintText = null;
  #accept = null;
  #decline = null;
  #fallbackTimer = null;
  #hintTimer = null;
  #isOpen = false;
  #isDone = false;
  #onChoice = null;

  init(onChoice) {
    this.#onChoice = onChoice;
    this.#overlay = document.getElementById('sound-intro');
    this.#hint = document.getElementById('sound-hint');
    if (!this.#overlay || !this.#hint) return;

    this.#panel = this.#overlay.querySelector('[data-sound-intro-panel]');
    this.#hintText = this.#hint.querySelector('[data-sound-hint-text]');
    this.#accept = this.#overlay.querySelector('[data-sound-intro-accept]');
    this.#decline = this.#overlay.querySelector('[data-sound-intro-decline]');

    this.#accept?.addEventListener('click', this.#onAccept);
    this.#decline?.addEventListener('click', this.#onDecline);
    window.addEventListener('keydown', this.#onKeyDown);

    this.#fallbackTimer = window.setTimeout(() => this.show(), FALLBACK_DELAY);
  }

  get isDone() { return this.#isDone; }

  shouldShow() {
    try { return localStorage.getItem(STORAGE_KEY) === null; } catch { return false; }
  }

  #markShown() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* 隐私模式下忽略 */ }
  }

  #getToggle() {
    const el = document.querySelector('[data-sound-toggle]');
    if (!el || window.getComputedStyle(el).display === 'none') return null;
    return el;
  }

  show() {
    if (!this.#overlay || this.#isOpen || this.#isDone || deviceManager.isSPLayout) return;
    if (!this.shouldShow()) { this.#isDone = true; return; }
    if (this.#fallbackTimer !== null) { window.clearTimeout(this.#fallbackTimer); this.#fallbackTimer = null; }
    this.#isOpen = true;
    this.#overlay.setAttribute('data-state', 'visible');
    this.#overlay.setAttribute('aria-hidden', 'false');
  }

  #onAccept = () => { this.#onChoice?.(true); this.#dismiss(false); };
  #onDecline = () => { this.#onChoice?.(false); this.#dismiss(true); };
  #onKeyDown = (e) => { if (this.#isOpen && e.key === 'Escape') this.#onDecline(); };

  #dismiss(muted) {
    if (!this.#overlay || !this.#panel) return;
    this.#isOpen = false;
    this.#isDone = true;
    this.#markShown();

    const toggle = this.#getToggle();
    if (!toggle) {
      this.#panel.style.transition = 'transform .5s cubic-bezier(.25,.46,.45,.94), opacity .5s';
      this.#panel.style.transform = 'translateY(100%)';
      this.#panel.style.opacity = '0';
      window.setTimeout(this.#hideOverlay, 500);
      return;
    }

    this.#absorbInto(toggle);
    window.setTimeout(() => {
      this.#hideOverlay();
      this.#pulse(toggle);
      this.#showHint(muted, toggle);
    }, ABSORB_DURATION);
  }

  /** 位移到开关中心并缩到 0.04 —— 视觉上就是「被吸进去」。 */
  #absorbInto(toggle) {
    const t = toggle.getBoundingClientRect();
    const p = this.#panel.getBoundingClientRect();
    const dx = Math.round(t.left + t.width / 2 - (p.left + p.width / 2));
    const dy = Math.round(t.top + t.height / 2 - (p.top + p.height / 2));
    this.#panel.style.transformOrigin = 'center center';
    this.#panel.style.transition =
      `transform ${ABSORB_DURATION}ms cubic-bezier(.65,0,.2,1), opacity ${ABSORB_DURATION}ms cubic-bezier(.65,0,.2,1)`;
    this.#panel.style.transform = `translate(${dx}px, ${dy}px) scale(0.04)`;
    this.#panel.style.opacity = '0';
  }

  /** 接住那一下：快速弹到 1.35（180ms），再慢慢回到 1（420ms）。 */
  #pulse(toggle) {
    toggle.style.transition = 'transform .18s cubic-bezier(.25,.46,.45,.94)';
    toggle.style.transform = 'scale(1.35)';
    window.setTimeout(() => {
      toggle.style.transition = 'transform .42s cubic-bezier(.25,.46,.45,.94)';
      toggle.style.transform = 'scale(1)';
      window.setTimeout(() => { toggle.style.transition = ''; toggle.style.transform = ''; }, 450);
    }, 190);
  }

  #hideOverlay = () => {
    this.#overlay?.setAttribute('data-state', 'hidden');
    this.#overlay?.setAttribute('aria-hidden', 'true');
  };

  #showHint(muted, toggle) {
    if (!this.#hint || !this.#hintText) return;
    this.#hintText.textContent = muted ? '可以在这里打开声音' : '可以在这里关闭声音';
    const r = toggle.getBoundingClientRect();
    this.#hint.style.top = `${r.bottom + 12}px`;
    this.#hint.style.right = `${window.innerWidth - r.right}px`;
    this.#hint.setAttribute('data-state', 'visible');
    this.#hint.setAttribute('aria-hidden', 'false');
    this.#hintTimer = window.setTimeout(this.#hideHint, HINT_DURATION);
    // 用户一动（滚轮或点击）就收起，不等计时
    window.addEventListener('wheel', this.#hideHint, { once: true });
    window.addEventListener('click', this.#hideHint, { once: true });
  }

  #hideHint = () => {
    if (this.#hintTimer !== null) { window.clearTimeout(this.#hintTimer); this.#hintTimer = null; }
    this.#hint?.setAttribute('data-state', 'hidden');
    this.#hint?.setAttribute('aria-hidden', 'true');
  };

  dispose() {
    this.#accept?.removeEventListener('click', this.#onAccept);
    this.#decline?.removeEventListener('click', this.#onDecline);
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('wheel', this.#hideHint);
    window.removeEventListener('click', this.#hideHint);
    if (this.#fallbackTimer !== null) { window.clearTimeout(this.#fallbackTimer); this.#fallbackTimer = null; }
    this.#hideHint();
  }
}

export const soundIntroController = new SoundIntroController();
