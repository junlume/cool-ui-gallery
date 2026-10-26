/**
 * 值动画器。移植自原站 Animator —— 默认缓动是 sigmoid(6)，
 * 不是任何一条 cubic-bezier。KV 的相机推进、logo 的翻滚强度都走它，
 * 换掉缓动手感立刻不对。
 */

/**
 * sigmoid 缓动：两端极缓、中段陡。k 越大越接近阶跃。
 *   f(t) = (1 + tanh-ish(k(2t-1)) · 归一化系数) / 2
 * 归一化系数保证 f(0)=0、f(1)=1。
 */
export function sigmoid(k = 6) {
  const d = Math.exp(-k);
  const norm = (1 + d) / (1 - d);
  return (t) => {
    const a = Math.exp(-k * (2 * t - 1));
    return (1 + ((1 - a) / (1 + a)) * norm) / 2;
  };
}

/**
 * 三次贝塞尔缓动。原站用查表 + 牛顿迭代求 t(x)，这里用二分求根 ——
 * 精度 1e-5 对 60fps 足够，且没有查表的初始化开销。
 */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 24; i += 1) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v > x) hi = t; else lo = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

export const Easings = {
  sigmoid,
  cubicBezier,
  linear: (t) => t,
  easeOutCubic: (t) => { const f = t - 1; return f * f * f + 1; },
  easeInCubic: (t) => t * t * t,
  smoothstep: (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  },
};

const lerpNumber = (a, b, t) => a + (b - a) * t;

export class Animator {
  #vars = new Map();

  add({ name, initValue, easing }) {
    const v = {
      time: 0,
      duration: 0,
      value: initValue,
      startValue: initValue,
      goalValue: initValue,
      easing: easing || sigmoid(),
      isAnimating: false,
    };
    this.#vars.set(name, v);
    // 返回一个 uniform 兼容对象，可直接塞进 ShaderMaterial.uniforms
    return {
      get value() { return v.value; },
      set value(x) { v.value = x; },
    };
  }

  get(name) {
    return this.#vars.get(name)?.value;
  }

  setValue(name, value) {
    const v = this.#vars.get(name);
    if (!v) return;
    v.value = value;
    v.isAnimating = false;
  }

  animate(name, goal, duration = 1) {
    const v = this.#vars.get(name);
    if (!v) return;
    v.time = 0;
    v.duration = duration;
    v.startValue = v.value;
    v.goalValue = goal;
    v.isAnimating = true;
  }

  update(deltaTime) {
    this.#vars.forEach((v) => {
      if (!v.isAnimating) return;
      v.time += deltaTime;
      const raw = v.duration > 0 ? Math.min(v.time / v.duration, 1) : 1;
      v.value = lerpNumber(v.startValue, v.goalValue, v.easing(raw));
      if (raw >= 1) {
        v.value = v.goalValue;
        v.isAnimating = false;
      }
    });
  }
}

/**
 * 全站共享的动画器。背景砖墙的十来个 uniform 都挂在它上面 ——
 * 原站也是一个模块级单例，因为那些定时器需要跨对象改同一批值。
 */
export const animator = new Animator();
