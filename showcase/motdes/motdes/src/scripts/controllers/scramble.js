import gsap from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(ScrambleTextPlugin);

/**
 * 悬停乱码文字。
 *
 * 原站三处各用不同的字符池与速度，不是同一套参数复制三遍 —— 保持差异：
 *   header 导航    chars "AlcheALCHE"      speed 1     （大小写混排，颗粒最细）
 *   More Works    chars "ALCHEALCHEALCHE" speed 1.5   （池最长、最快，按钮最跳）
 *   footer 链接    chars "ALCHE"           speed 1     （池最短，最克制）
 *
 * 字符池就是品牌名本身，所以这里按同一构成方式换成 motdes：
 * 大小写混排 / 三倍长 / 单份大写。
 */
const BRAND = 'MOTDES';
const UPPER = BRAND.toUpperCase();

const PRESETS = {
  nav:   { chars: BRAND.toLowerCase() + BRAND, speed: 1 },
  more:  { chars: UPPER.repeat(3), speed: 1.5 },
  link:  { chars: UPPER, speed: 1 },
};

/**
 * 统一的绑定逻辑。
 * 监听目标与动画目标是分开的：header 把 mouseenter 绑在 nav_item 容器上（热区更大），
 * 动画却作用于内部的 span。合成一个会让热区缩小到文字本身。
 * 原站只在 mouseenter 触发，mouseleave 不做任何事。
 */
class ScrambleBinder {
  #handlers = new Map();

  /** pairs: [listenerTarget, animTarget][] */
  bind(pairs, preset) {
    pairs.forEach(([host, target]) => {
      if (!host || !target) return;
      const original = target.textContent || '';
      target.dataset.originalText = original;
      const enter = () => this.#scramble(target, original, preset);
      host.addEventListener('mouseenter', enter);
      this.#handlers.set(host, enter);
    });
  }

  #scramble(el, text, preset) {
    gsap.to(el, {
      duration: 0.4,
      scrambleText: { text, chars: preset.chars, revealDelay: 0.2, speed: preset.speed },
      ease: 'power2.out',
    });
  }

  dispose() {
    this.#handlers.forEach((handler, host) => host.removeEventListener('mouseenter', handler));
    this.#handlers.clear();
  }
}

export class ScrambleController {
  #binder = null;

  in() {
    this.out();
    this.#binder = new ScrambleBinder();

    // header：监听容器，动画作用于内部 span
    const navPairs = [...document.querySelectorAll('header nav div[class*="nav_item"]')]
      .map((item) => [item, item.querySelector('span')]);
    this.#binder.bind(navPairs, PRESETS.nav);

    const self = (el) => [el, el];
    this.#binder.bind([...document.querySelectorAll('[data-scramble-text]')].map(self), PRESETS.more);
    this.#binder.bind([...document.querySelectorAll('footer [data-scramble]')].map(self), PRESETS.link);
  }

  out() {
    this.#binder?.dispose();
    this.#binder = null;
  }
}

export const scrambleController = new ScrambleController();
