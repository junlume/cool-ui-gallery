import { ScrollTriggerFactory } from '../core/scroll-trigger-factory.js';

/**
 * works_outro 是否已经整段滑到视口上方。
 *
 * 唯一职责是往 body 上写一个布尔属性，供 CSS 决定「More Works」按钮在
 * works_outro 段里还要不要继续亮着：
 *   [data-current_section=works_outro][data-works-outro-above-viewport=false] .Works__more { opacity:1 }
 * 也就是说，离开 works 之后按钮不会立刻消失，而是等 works_outro 也翻过去才收。
 */
export class WorksOutroController {
  #scrollTrigger = null;
  #element = null;
  #isAboveViewport = false;

  in() {
    this.#element = document.querySelector('[data-top_section="works_outro"]');
    if (!this.#element) return;
    this.#createTrigger();
    this.#writeAttribute();
  }

  out() {
    this.#scrollTrigger?.kill();
    this.#scrollTrigger = null;
    this.#element = null;
    this.#isAboveViewport = false;
    document.body.removeAttribute('data-works-outro-above-viewport');
  }

  #createTrigger() {
    this.#scrollTrigger = ScrollTriggerFactory.create({
      triggerId: 'works_outro_controller',
      pathname: '/',
      trigger: this.#element,
      start: 'top top',
      end: 'bottom bottom',
      onEnter: () => { this.#isAboveViewport = true; this.#writeAttribute(); },
      onLeaveBack: () => { this.#isAboveViewport = false; this.#writeAttribute(); },
    });
  }

  #writeAttribute() {
    document.body.setAttribute('data-works-outro-above-viewport', String(this.#isAboveViewport));
  }

  get isAboveViewport() {
    return this.#isAboveViewport;
  }
}

export const worksOutroController = new WorksOutroController();
