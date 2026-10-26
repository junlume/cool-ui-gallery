import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * 集中登记所有 ScrollTrigger，便于换页时整体 kill。
 * 原站还会把每个 trigger 注册进 loading 进度计数；PHASE 1 先不接 loading，
 * 保留 triggerId 以便 PHASE 4 接回去。
 */
export class ScrollTriggerFactory {
  static #activePathname = null;
  static #registered = new Map();

  static setActivePage(pathname) {
    this.#activePathname = pathname;
  }

  static create({ triggerId, pathname, ...config }) {
    const st = ScrollTrigger.create(config);
    this.#registered.set(triggerId, st);
    return st;
  }

  static killAll() {
    this.#registered.forEach((st) => st.kill());
    this.#registered.clear();
  }

  static get(triggerId) {
    return this.#registered.get(triggerId) ?? null;
  }

  static get size() {
    return this.#registered.size;
  }
}
