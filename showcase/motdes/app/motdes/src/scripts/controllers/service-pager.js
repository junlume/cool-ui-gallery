import { topScrollManager } from '../core/top-scroll-manager.js';
import { serviceCaseStops } from '../../lib/service-presentation.js';

const WHEEL_IDLE_MS = 220;
const WHEEL_THRESHOLD = 32;
const TOUCH_THRESHOLD = 44;
const POSITION_EPSILON = 3;
const PAGE_SECONDS = 0.85;

/** SERVICE alone advances one adjacent case per gesture; all other sections retain Lenis. */
export class ServicePagerController {
  #lenis = null;
  #previousVirtualScroll;
  #generation = 0;
  #motion = null;
  #wheelAt = -Infinity;
  #wheelSum = 0;
  #wheelConsumed = false;
  #touch = null;
  #handledTouches = new WeakSet();
  #keyConsumed = false;
  #attached = false;

  in(lenis) {
    this.out();
    if (!document.querySelector('[data-service-container]')) return;
    this.#lenis = lenis;
    this.#previousVirtualScroll = lenis.options.virtualScroll;
    lenis.options.virtualScroll = this.#virtualScroll;
    lenis.on('scroll', this.#onScroll);
    document.addEventListener('touchstart', this.#onTouchStart, { passive: true });
    document.addEventListener('touchmove', this.#onTouchMove, { passive: false });
    document.addEventListener('touchend', this.#onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', this.#onTouchEnd, { passive: true });
    document.addEventListener('keydown', this.#onKeyDown);
    document.addEventListener('keyup', this.#onKeyUp);
    document.addEventListener('visibilitychange', this.#onVisibility);
    this.#attached = true;
  }

  #stops() {
    return serviceCaseStops(topScrollManager.getTrigger('service_progress'));
  }

  #blocked() {
    return !this.#lenis || this.#lenis.isStopped || this.#lenis.isLocked || document.hidden
      || Boolean(document.querySelector('dialog[open], [data-side-menu][data-open="true"]'));
  }

  #targetExcluded(target, direction = 0, keyboard = false) {
    if (!target?.closest) return false;
    if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), video, audio, [data-lenis-prevent], [data-lenis-prevent-vertical]')) return true;
    if (keyboard && target.closest('button, a, summary, [role="button"]')) return true;
    // A nested scroller gets first use of its own content, including custom scroll panels.
    for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      const overflow = getComputedStyle(el).overflowY;
      if (!/auto|scroll|overlay/.test(overflow)) continue;
      if (direction < 0 ? el.scrollTop > 0 : direction > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : true) return true;
    }
    return false;
  }

  #nextStop(direction, distance = 0) {
    const stops = this.#stops();
    if (!stops.length || !direction) return null;
    const y = this.#lenis.animatedScroll;
    const first = stops[0];
    const last = stops.at(-1);
    if (y < first - POSITION_EPSILON) {
      return direction > 0 && y + distance >= first - POSITION_EPSILON ? first : null;
    }
    if (y > last + POSITION_EPSILON) {
      return direction < 0 && y - distance <= last + POSITION_EPSILON ? last : null;
    }
    if (direction > 0) return stops.find((stop) => stop > y + POSITION_EPSILON) ?? null;
    return stops.findLast((stop) => stop < y - POSITION_EPSILON) ?? null;
  }

  #consume(event) {
    if (event.cancelable) event.preventDefault();
    return false;
  }

  #virtualScroll = (data) => {
    if (this.#previousVirtualScroll?.(data) === false) return false;
    // Our document touch listener runs before Lenis's window listener. Otherwise Lenis's
    // native-touch branch would stop the tween just started by this same touchmove.
    if (data.event.type.startsWith('touch') && (data.event.defaultPrevented || this.#handledTouches.has(data.event) || this.#touch?.used)) return false;
    if (data.event.type !== 'wheel') return undefined;
    return this.#onWheel(data);
  };

  #onWheel({ deltaX, deltaY, event }) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || Math.abs(deltaX) >= Math.abs(deltaY) || !deltaY || this.#blocked()) return undefined;
    const direction = Math.sign(deltaY);
    if (this.#targetExcluded(event.target, direction) || event.target?.closest?.('[data-lenis-prevent-wheel]')) return undefined;
    const now = performance.now();
    if (now - this.#wheelAt > WHEEL_IDLE_MS && !this.#motion) {
      this.#wheelConsumed = false;
      this.#wheelSum = 0;
    }
    this.#wheelAt = now;
    // Never queue the inertial tail. The next action needs both a settled case and a quiet gap.
    if (this.#motion || this.#wheelConsumed) {
      this.#wheelConsumed = true;
      return this.#consume(event);
    }
    const pendingDistance = Math.max(0, direction * (this.#lenis.targetScroll - this.#lenis.animatedScroll));
    const target = this.#nextStop(direction, Math.abs(deltaY) + pendingDistance);
    if (target === null) {
      this.#wheelSum = 0;
      return undefined;
    }
    this.#wheelSum = Math.sign(this.#wheelSum) === direction ? this.#wheelSum + deltaY : deltaY;
    this.#consume(event);
    if (Math.abs(this.#wheelSum) >= WHEEL_THRESHOLD) {
      this.#wheelConsumed = true;
      this.#go(target);
    }
    return false;
  }

  #go(target) {
    const lenis = this.#lenis;
    const generation = ++this.#generation;
    this.#motion = generation;
    lenis.scrollTo(target, {
      duration: PAGE_SECONDS,
      lerp: 0,
      easing: (t) => 1 - (1 - t) ** 4,
      // Do not lock Lenis: menu navigation and the video modal must be able to interrupt us.
      userData: { servicePager: generation },
      onComplete: () => {
        if (generation === this.#generation) this.#motion = null;
      },
    });
  }

  #onScroll = () => {
    if (!this.#motion) return;
    if (this.#lenis.isStopped || this.#lenis.userData?.servicePager !== this.#motion) {
      // A programmatic menu jump or modal has replaced this tween. Do not restore old positions.
      this.#generation += 1;
      this.#motion = null;
    }
  };

  #onTouchStart = (event) => {
    this.#touch = null;
    if (event.touches.length !== 1 || this.#blocked() || this.#targetExcluded(event.target)) return;
    const { clientX: x, clientY: y } = event.touches[0];
    this.#touch = { x, y, lastY: y, axis: null, used: false, owned: false };
  };

  #onTouchMove = (event) => {
    const touch = this.#touch;
    if (!touch || event.defaultPrevented || this.#blocked()) return;
    if (event.touches.length !== 1) { this.#touch = null; return; }
    const { clientX: x, clientY: y } = event.touches[0];
    const dx = touch.x - x;
    const dy = touch.y - y;
    const stepY = touch.lastY - y;
    touch.lastY = y;
    if (!touch.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) touch.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    // Cancel the first vertical movement inside SERVICE, even before the swipe threshold.
    // Letting those initial few pixels scroll natively can commit an uncancellable fling.
    if (touch.axis === 'x' || !touch.axis && Math.abs(dy) <= Math.abs(dx)) return;
    if (this.#targetExcluded(event.target, Math.sign(dy)) || event.target?.closest?.('[data-lenis-prevent-touch]')) return;
    if (touch.used || this.#motion) {
      touch.used = true;
      this.#consume(event);
      return;
    }
    const target = this.#nextStop(Math.sign(dy), Math.abs(stepY));
    if (target === null) return;
    touch.owned = true;
    this.#consume(event);
    if (Math.abs(dy) >= TOUCH_THRESHOLD) {
      touch.used = true;
      this.#go(target);
    }
  };

  #onTouchEnd = (event) => {
    if (!event.touches?.length) {
      if (this.#touch?.owned || this.#touch?.used) this.#handledTouches.add(event);
      this.#touch = null;
    }
  };

  #onKeyDown = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || this.#blocked()) return;
    let direction = 0;
    if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ' && !event.shiftKey) direction = 1;
    if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === ' ' && event.shiftKey) direction = -1;
    if (!direction || this.#targetExcluded(event.target, direction, true)) return;
    const distance = event.key.startsWith('Arrow') ? 40 : window.innerHeight;
    const target = this.#nextStop(direction, distance);
    if (target === null && !this.#motion && !this.#keyConsumed) return;
    this.#consume(event);
    if (event.repeat || this.#keyConsumed || this.#motion) return;
    this.#keyConsumed = true;
    this.#go(target);
  };

  #onKeyUp = (event) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' '].includes(event.key)) this.#keyConsumed = false;
  };

  #onVisibility = () => {
    this.#touch = null;
    this.#keyConsumed = false;
    this.#wheelConsumed = false;
    this.#wheelSum = 0;
    this.#wheelAt = -Infinity;
  };

  out() {
    this.#generation += 1;
    if (this.#lenis) {
      if (this.#motion && this.#lenis.userData?.servicePager === this.#motion) this.#lenis.reset();
      this.#lenis.off('scroll', this.#onScroll);
      if (this.#lenis.options.virtualScroll === this.#virtualScroll) this.#lenis.options.virtualScroll = this.#previousVirtualScroll;
    }
    if (this.#attached) {
      document.removeEventListener('touchstart', this.#onTouchStart);
      document.removeEventListener('touchmove', this.#onTouchMove);
      document.removeEventListener('touchend', this.#onTouchEnd);
      document.removeEventListener('touchcancel', this.#onTouchEnd);
      document.removeEventListener('keydown', this.#onKeyDown);
      document.removeEventListener('keyup', this.#onKeyUp);
      document.removeEventListener('visibilitychange', this.#onVisibility);
    }
    this.#attached = false;
    this.#lenis = null;
    this.#previousVirtualScroll = undefined;
    this.#motion = null;
    this.#handledTouches = new WeakSet();
    this.#onVisibility();
  }
}

export const servicePagerController = new ServicePagerController();
