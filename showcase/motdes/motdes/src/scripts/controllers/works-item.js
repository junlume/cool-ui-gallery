import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

import { topScrollManager } from '../core/top-scroll-manager.js';

gsap.registerPlugin(SplitText);

/**
 * WORKS 区段的条目切换。
 *
 * 六件作品的文字块全部叠在同一个固定位置，靠 works/item_enter|leave 事件切换。
 * 标题按字符错开推入（stagger 0.01），退出时反向且更快（0.001）—— 进场要看清，
 * 退场只需要"让开"。
 */
export class WorksItemController {
  #container = null;
  #items = null;
  #splits = new Map();
  #currentAnimation = null;
  #currentIndex = -1;
  #enterEnabled = true;

  constructor() {
    topScrollManager.on('works/item_enter', (i) => this.#onItemEnter(i));
    topScrollManager.on('works/item_leave', (i) => this.#onItemLeave(i));
  }

  in({ deferEnter = false } = {}) {
    this.out();
    this.#enterEnabled = !deferEnter;
    this.#container = document.querySelector('[data-works-container]');
    if (!this.#container) return;

    this.#items = this.#container.querySelectorAll('[data-works_item]');
    if (!this.#items?.length) return;

    this.#setupItems();
  }

  /** 预先准备文字，仍在甩手交接时播放原来的入场。 */
  reveal(index = 0) {
    this.#enterEnabled = true;
    this.#onItemEnter(index);
  }

  out() {
    this.#currentAnimation?.kill();
    this.#splits.forEach((s) => s.revert());
    this.#splits.clear();
    this.#currentAnimation = null;
    this.#container = null;
    this.#items = null;
    this.#currentIndex = -1;
    this.#enterEnabled = true;
  }

  #setupItems() {
    this.#items.forEach((item) => {
      item.style.visibility = 'hidden';
      item.style.opacity = '0';
      const title = item.querySelector('[data-works_title]');
      if (title) this.#splits.set(title, SplitText.create(title, { type: 'chars' }));
    });
    this.#currentIndex = -1;
  }

  #onItemEnter(i) {
    if (!this.#enterEnabled || !this.#items || this.#currentIndex === i) return;
    this.#currentAnimation?.revert();
    this.#showItem(i);
    this.#currentIndex = i;
  }

  #onItemLeave(i) {
    if (!this.#enterEnabled || !this.#items) return;
    this.#hideItem(i);
    if (this.#currentIndex === i) this.#currentIndex = -1;
  }

  #showItem(i) {
    const item = this.#items[i];
    if (!item) return;
    const title = item.querySelector('[data-works_title]');
    const desc = item.querySelector('[data-works_description]');

    item.style.visibility = 'visible';
    gsap.to(item, { opacity: 1, duration: 0.3, ease: 'power2.out' });

    if (title && this.#splits.has(title)) {
      const { chars } = this.#splits.get(title);
      gsap.set(chars, { y: 10, opacity: 0 });
      this.#currentAnimation = gsap.to(chars, {
        y: 0, opacity: 1, duration: 0.7, ease: 'power4', stagger: 0.01,
      });
    }

    if (desc) {
      gsap.set(desc, { opacity: 0 });
      gsap.to(desc, { opacity: 1, duration: 0.5, ease: 'power2.out', delay: 0.3 });
    }
  }

  #hideItem(i) {
    const item = this.#items[i];
    if (!item) return;
    const title = item.querySelector('[data-works_title]');
    const desc = item.querySelector('[data-works_description]');

    if (title && this.#splits.has(title)) {
      const { chars } = this.#splits.get(title);
      gsap.to(chars, { y: -10, opacity: 0, duration: 0.4, ease: 'power2.in', stagger: 0.001 });
    }
    if (desc) gsap.to(desc, { opacity: 0, duration: 0.3, ease: 'power2.in' });
    gsap.to(item, { opacity: 0, duration: 0.5, ease: 'power2.inOut' });
  }
}

export const worksItemController = new WorksItemController();
