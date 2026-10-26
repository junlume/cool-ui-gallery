import { deviceManager } from '../core/device-manager.js';
import { topScrollManager } from '../core/top-scroll-manager.js';
import { TOP_SCROLL_SECTIONS } from '../../lib/top-sections.js';

/**
 * 左侧滚动指示器。CSS 里用 mix-blend-mode: difference，
 * 所以 MISSION/VISION 的白场上会自动翻黑 —— 不要在 JS 里再写翻色逻辑。
 */
class TopScrollIndicatorController {
  #el = null;
  #sectionItems = null;
  #subsectionItems = null;
  #initialized = false;

  in() {
    if (deviceManager.isSPLayout) {
      this.#hide();
      return;
    }
    if (this.#initialized) {
      this.#show();
      return;
    }

    this.#el = document.querySelector('[data-top-scroll-indicator]');
    if (!this.#el) return;
    this.#sectionItems = this.#el.querySelectorAll('[data-section]');
    this.#subsectionItems = this.#el.querySelectorAll('[data-subsection]');
    if (!this.#sectionItems.length) return;

    this.#sectionItems.forEach((item) => {
      item.querySelector('[data-section-label]')?.addEventListener('click', () => {
        const id = item.getAttribute('data-section');
        if (id) this.#scrollToSection(id);
      });
    });
    this.#subsectionItems.forEach((item) => {
      item.addEventListener('click', () => {
        const sectionId = item.closest('[data-section]')?.getAttribute('data-section');
        const index = item.getAttribute('data-subsection');
        if (sectionId && index !== null) this.#scrollToSubsection(sectionId, parseInt(index, 10));
      });
    });

    this.#updateStates();
    this.#show();
    this.#initialized = true;
  }

  out() {
    this.#initialized = false;
  }

  update() {
    if (deviceManager.isSPLayout) return;
    this.#updateStates();
  }

  #show() { if (this.#el) this.#el.style.display = 'block'; }
  #hide() { if (this.#el) this.#el.style.display = 'none'; }

  /** 当前 body[data-current_section] 属于哪一个导航组 */
  #activeGroup() {
    const current = document.body.getAttribute('data-current_section');
    if (!current) return null;
    for (const group of TOP_SCROLL_SECTIONS) {
      if (group.id === current || group.scrollTriggerIds.includes(current)) return group.id;
    }
    return null;
  }

  #updateStates() {
    if (!this.#el) return;
    const active = this.#activeGroup();
    let activeIndex = -1;
    TOP_SCROLL_SECTIONS.forEach((group, i) => {
      if (group.id === active) activeIndex = i;
    });

    this.#sectionItems.forEach((item, i) => {
      item.setAttribute('data-active', String(i === activeIndex));
      const trigger = topScrollManager.getTrigger(TOP_SCROLL_SECTIONS[i].id === 'mission' ? 'profile_progress' : TOP_SCROLL_SECTIONS[i].id);
      const progress = trigger ? trigger.progress : 0;
      item.querySelectorAll('[data-subsection]').forEach((sub, j) => {
        const threshold = TOP_SCROLL_SECTIONS[i].subsections[j]?.progress ?? j / TOP_SCROLL_SECTIONS[i].subsections.length;
        sub.setAttribute('data-active', String(i === activeIndex && progress >= threshold));
      });
    });
  }

  #scrollToSection(id) {
    if (id === 'kv' && document.body.dataset.coinOpening === 'true') {
      window.__lenis?.scrollTo(0, { duration: 1.4 });
      return;
    }
    if (id === 'mission' && this.#scrollToProfile(0)) return;
    const el = document.querySelector(`[data-top_section="${id}"]`);
    if (el) window.__lenis?.scrollTo(el, { duration: 1.4 });
  }

  #scrollToSubsection(id, index) {
    if (id === 'mission' && this.#scrollToProfile(index)) return;
    const el = document.querySelector(`[data-top_section="${id}"]`);
    if (!el) return;
    const count = TOP_SCROLL_SECTIONS.find((group) => group.id === id)?.subsections.length || 2;
    const offset = el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight * index) / count;
    window.__lenis?.scrollTo(offset, { duration: 1.4 });
  }

  #scrollToProfile(index) {
    const trigger = topScrollManager.getTrigger('profile_progress');
    const subsection = TOP_SCROLL_SECTIONS.find((group) => group.id === 'mission')?.subsections[index];
    if (!trigger || !subsection) return false;
    window.__lenis?.scrollTo(trigger.start + (trigger.end - trigger.start) * subsection.progress, { duration: 1.4 });
    return true;
  }
}

export const topScrollIndicator = new TopScrollIndicatorController();
