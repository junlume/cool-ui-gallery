import gsap from 'gsap';

/** A timed entrance keeps the letter stagger visible even when section snapping jumps to 1. */
export class PortfolioTypeController {
  #container = null;
  #timeline = null;
  #observer = null;
  #mobileVisible = false;
  #mobileLayout = null;
  #active = false;
  #reducedMotion = false;
  #targets = [];
  #generation = 0;

  in(container) {
    this.out();
    if (!container) return;
    this.#container = container;
    this.#reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lines = [...container.querySelectorAll('[data-portfolio-line]')];
    const chars = [...container.querySelectorAll('[data-portfolio-char]')];
    const rule = container.querySelector('[data-portfolio-rule]');
    const details = [...container.querySelectorAll('[data-portfolio-detail]')];
    const words = [...container.querySelectorAll('[data-portfolio-word]')];
    this.#targets = [...chars, rule, ...details, ...words].filter(Boolean);

    gsap.set(chars, { yPercent: 110, rotationX: -55, opacity: 0, filter: 'blur(6px)' });
    gsap.set(rule, { scaleX: 0 });
    gsap.set(details, { y: 8, opacity: 0 });
    gsap.set(words, { yPercent: 105, opacity: 0 });
    this.#timeline = gsap.timeline({ paused: true });
    lines.forEach((line, index) => {
      this.#timeline.to(line.querySelectorAll('[data-portfolio-char]'), {
        yPercent: 0, rotationX: 0, opacity: 1, filter: 'blur(0px)',
        duration: 0.78, stagger: 0.038, ease: 'power4.out',
      }, index * 0.18);
    });
    this.#timeline.to(rule, { scaleX: 1, duration: 0.7, ease: 'expo.out' }, 0.38);
    this.#timeline.to(details, { y: 0, opacity: 1, duration: 0.5, stagger: 0.06, ease: 'power3.out' }, 0.58);
    this.#timeline.to(words, { yPercent: 0, opacity: 1, duration: 0.6, stagger: 0.027, ease: 'power3.out' }, 0.72);
    if (this.#reducedMotion) this.#timeline.progress(1).pause();

    if (typeof IntersectionObserver !== 'undefined') {
      const generation = this.#generation;
      this.#observer = new IntersectionObserver(([entry]) => {
        if (generation === this.#generation) this.#mobileVisible = entry.isIntersecting;
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });
      this.#observer.observe(container);
    }
  }

  update({ progress, outProgress, isSPLayout, canEnter = true }) {
    if (!this.#container || !this.#timeline) return;
    if (this.#mobileLayout !== isSPLayout) {
      this.#mobileLayout = isSPLayout;
      this.#active = false;
      if (!this.#reducedMotion) this.#timeline.pause(0);
      // The original controller gates the fixed desktop layer, but skips that gate on mobile.
      if (isSPLayout) gsap.set(this.#container, { clearProps: 'opacity,filter' });
    }
    const enter = canEnter && (isSPLayout
      ? this.#observer ? this.#mobileVisible : progress > 0.04
      : progress > 0.04 && outProgress < 0.76);
    const exit = !canEnter || (isSPLayout
      ? !enter
      : progress <= 0.01 || outProgress >= 0.82);

    if (enter && !this.#active) {
      this.#active = true;
      if (this.#reducedMotion) this.#timeline.progress(1).pause();
      else this.#timeline.restart();
    } else if (exit && this.#active) {
      this.#active = false;
      if (!this.#reducedMotion) this.#timeline.pause(0);
    }
  }

  out() {
    this.#generation += 1;
    this.#observer?.disconnect();
    this.#timeline?.kill();
    if (this.#targets.length) gsap.set(this.#targets, { clearProps: 'transform,opacity,filter' });
    this.#container = null;
    this.#timeline = null;
    this.#observer = null;
    this.#targets = [];
    this.#active = false;
    this.#mobileVisible = false;
    this.#mobileLayout = null;
  }
}
