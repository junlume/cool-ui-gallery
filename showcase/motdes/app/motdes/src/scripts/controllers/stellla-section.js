import gsap from 'gsap';

import { topScrollManager } from '../core/top-scroll-manager.js';

/**
 * stellla 区段。
 *
 * 一个进度同时驱动两件事：内容淡入，以及外框的 --progress。
 * 外框的 CSS 是 `--padding: calc(-100px + var(--progress) * 200px)`，
 * 所以 progress 0 时框比容器大 100px（在视口外），1 时小 100px（收进来）——
 * 视觉上是四条边从画面外收拢成一个取景框。
 *
 * ×1.5 封顶：让它在区段走到 2/3 时就完成，留最后一段给 footer 的接管。
 */
export class StelllaSectionController {
  #element = null;
  #frame = null;
  #trigger = null;
  #tickerCallback = null;

  in() {
    this.#element = document.querySelector('[data-top-stellla-content]');
    if (!this.#element) return;

    this.#frame = this.#element.querySelector('[data-top-stellla-frame]');
    gsap.set(this.#element, { opacity: 0 });

    this.#trigger = topScrollManager.getTrigger('stellla');
    if (!this.#trigger) return;

    this.#tickerCallback = () => {
      if (!this.#element || !this.#frame || !this.#trigger) return;
      const p = Math.min(this.#trigger.progress * 1.5, 1);
      gsap.set(this.#element, { opacity: p });
      this.#frame.style.setProperty('--progress', String(p));
    };
    gsap.ticker.add(this.#tickerCallback);
  }

  out() {
    if (this.#tickerCallback) {
      gsap.ticker.remove(this.#tickerCallback);
      this.#tickerCallback = null;
    }
    this.#trigger = null;
    this.#element = null;
    this.#frame = null;
  }
}

export const stelllaSectionController = new StelllaSectionController();
