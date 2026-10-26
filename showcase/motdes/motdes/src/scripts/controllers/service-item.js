import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { topScrollManager } from '../core/top-scroll-manager.js';

gsap.registerPlugin(SplitText);

/** Match each introduction to the final, damped GL video coordinate. */
export class ServiceItemController {
  #container = null;
  #items = [];
  #splits = new Map();
  #currentAnimation = null;
  #currentIndex = -1;
  #opacity = -1;
  #unsubscribe = null;

  in() {
    this.out();
    this.#container = document.querySelector('[data-service-container]');
    if (!this.#container) return;
    this.#items = [...this.#container.querySelectorAll('[data-service_item]')];
    this.#items.forEach((item) => {
      this.#hide(item);
      const title = item.querySelector('[data-service_title]');
      if (title) this.#splits.set(title, SplitText.create(title, { type: 'chars' }));
    });
    this.#container.style.opacity = '0';
    this.#container.dataset.presenting = 'false';
    this.#container.setAttribute('aria-hidden', 'true');
    this.#unsubscribe = topScrollManager.on('service/frame', this.#renderFrame);
  }

  #renderFrame = ({ index, opacity }) => {
    if (!this.#container) return;
    const visible = Number.isInteger(index) && index >= 0 && index < this.#items.length
      && Number.isFinite(opacity) && opacity > 0.001;
    const alpha = visible ? Math.min(1, opacity) : 0;
    const visibilityChanged = visible !== (this.#opacity > 0.001);
    if (Math.abs(alpha - this.#opacity) > 0.001 || alpha === 0 || alpha === 1) {
      if (alpha !== this.#opacity) this.#container.style.opacity = String(alpha);
      this.#opacity = alpha;
    }
    if (visibilityChanged) {
      this.#container.dataset.presenting = String(visible);
      this.#container.setAttribute('aria-hidden', String(!visible));
    }
    if (!visible) {
      if (this.#currentIndex !== -1) {
        this.#currentAnimation?.kill();
        this.#currentAnimation = null;
        this.#items.forEach((item) => this.#hide(item));
        this.#currentIndex = -1;
      }
      return;
    }
    if (index === this.#currentIndex) return;

    // Kill the entire previous entrance: no delayed exit callback can hide a new item.
    this.#currentAnimation?.kill();
    this.#items.forEach((item) => this.#hide(item));
    this.#currentIndex = index;
    const item = this.#items[index];
    item.style.visibility = 'visible';
    item.style.opacity = '1';
    item.style.pointerEvents = 'auto';
    item.setAttribute('aria-hidden', 'false');
    this.#container.dataset.serviceId = item.dataset.service_id;
    const title = item.querySelector('[data-service_title]');
    const chars = this.#splits.get(title)?.chars ?? [];
    const descriptions = [...item.querySelectorAll('[data-service_description]')];
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      gsap.set([...chars, ...descriptions], { y: 0, opacity: 1 });
      this.#currentAnimation = null;
      return;
    }
    // The badge is visible immediately; title and copy settle without an empty frame.
    this.#currentAnimation = gsap.timeline();
    if (chars.length) this.#currentAnimation.fromTo(chars,
      { y: 8, opacity: 0.25 },
      { y: 0, opacity: 1, duration: 0.36, stagger: 0.025, ease: 'power3.out' }, 0);
    this.#currentAnimation.fromTo(descriptions,
      { y: 5, opacity: 0.2 },
      { y: 0, opacity: 1, duration: 0.32, stagger: 0.045, ease: 'power2.out' }, 0.04);
  };

  #hide(item) {
    item.style.visibility = 'hidden';
    item.style.opacity = '0';
    item.style.pointerEvents = 'none';
    item.setAttribute('aria-hidden', 'true');
  }

  out() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#currentAnimation?.kill();
    this.#currentAnimation = null;
    this.#splits.forEach((split) => split.revert());
    this.#splits.clear();
    this.#items.forEach((item) => this.#hide(item));
    if (this.#container) {
      this.#container.style.opacity = '0';
      this.#container.dataset.presenting = 'false';
      this.#container.setAttribute('aria-hidden', 'true');
      delete this.#container.dataset.serviceId;
    }
    this.#container = null;
    this.#items = [];
    this.#currentIndex = -1;
    this.#opacity = -1;
  }
}

export const serviceItemController = new ServiceItemController();
