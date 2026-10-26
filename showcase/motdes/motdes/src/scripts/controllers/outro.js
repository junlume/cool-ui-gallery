import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import {
  OUTRO_DURATION, OUTRO_TRACKS, OUTRO_STROKE, OUTRO_FILL,
  OUTRO_CONS_FADE, OUTRO_CIRCLE_DASH, OUTRO_EXIT, OUTRO_NAME_IN,
} from '../../lib/outro-svg.js';

gsap.registerPlugin(ScrollTrigger);

/**
 * 收场：整幅字标的**构造图纸**一根根画出来，字标由描边转成实心，
 * 然后图纸淡掉、实心字标停留，再逐字退场并让 THANKS FOR WATCHING 逐字入场。
 *
 * 描线窗口参考原站 Lottie（.ref/lottie/top/outro/data.json，29.97fps）；
 * 当前延长线稿停留，六个字母从左到右依次填实，最后才淡出构造线。
 * 图纸由字形几何生成，元素带 data-track / data-dir，按滚动进度推进。
 *
 * 与开场那张图纸同一套做法，区别只有两点：对象是整幅 MOTDES 而不是单个 M；
 * 推进器是滚动而不是墙钟 —— 往回滚能原样倒着收回去。
 *
 * ⚠️ 所有元素都带 pathLength="1"，dasharray 用的是 0–1 的归一长度，与元素本身
 * 多长无关。少了这条属性，长短不一的线会各画各的速度。
 */

/** 求 cubic-bezier(x1,y1,x2,y2) 在 x 处的 y。牛顿迭代，8 步足够。 */
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
  const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const e = fx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    t = Math.min(1, Math.max(0, t));
    return ((ay * t + by) * t + cy) * t;
  };
}

/**
 * 两条缓动曲线，直接抄 Lottie 关键帧的 o/i 控制点：
 *   线：o=[.333],[0]      i=[.667],[1]
 *   其余：o=[.167],[.167] i=[.833],[.833] —— 控制点落在对角线上，等于线性
 */
const EASE = {
  lines: cubicBezier(0.333, 0, 0.667, 1),
  linear: (x) => x,
};

/** 折线插值：OUTRO_CONS_FADE 那三个点之间线性过渡，两端保持。 */
function piecewise(points, t) {
  if (t <= points[0].t) return points[0].o;
  for (let i = 1; i < points.length; i += 1) {
    if (t <= points[i].t) {
      const a = points[i - 1];
      const b = points[i];
      return a.o + (b.o - a.o) * ((t - a.t) / (b.t - a.t));
    }
  }
  return points[points.length - 1].o;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 圆是虚线，同时还要"画出来"。两件事都只能写在 stroke-dasharray 上，
 * 所以直接把虚线节奏拼进已画出的那一段：`段 空 段 空 … 段 1`。
 * 归一化后一段长 unit，最后补一个长度 1 的空当把余下的圆吃掉。
 */
function dashedArc(progress, unit) {
  if (progress <= 0) return '0 1';
  const out = [];
  let acc = 0;
  const step = unit * 2;
  while (acc + step <= progress && out.length < 512) { out.push(unit, unit); acc += step; }
  const rest = progress - acc;
  if (rest > 0) out.push(Math.min(rest, unit));
  out.push(1);
  return out.map((v) => v.toFixed(5)).join(' ');
}

export class OutroController {
  #wrapper = null;
  #els = [];
  #glyphs = [];
  #nameGlyphs = [];
  #trigger = null;
  #lastArc = -1;

  init() {
    this.dispose();
    this.#wrapper = document.querySelector('[data-outro-wrapper]');
    if (!this.#wrapper) return;

    // DOM 顺序即 M → O → T → D → E → S；共同描边，再逐字填实。
    this.#glyphs = [...this.#wrapper.querySelectorAll('[data-outro-glyph]')];
    this.#nameGlyphs = [...this.#wrapper.querySelectorAll('[data-outro-name-glyph]')];
    this.#els = [...this.#wrapper.querySelectorAll('[data-track]')].map((el) => {
      const track = OUTRO_TRACKS[el.dataset.track];
      const circumference = parseFloat(el.dataset.circumference);
      return {
        el,
        t0: track.t0,
        t1: track.t1,
        ease: EASE[track.ease],
        dir: parseFloat(el.dataset.dir) || 1,
        // 圆专用：把画布单位的虚线段长折算成归一长度
        dashUnit: Number.isFinite(circumference) ? OUTRO_CIRCLE_DASH / circumference : 0,
      };
    });

    this.#apply(0);

    /**
     * 触发窗口是**吸附住之后**那一段，不是滑进来的那一段。
     *
     * wrapper 高 600vh、里面的屏 position:sticky; top:0。屏顶碰到视口顶之前，
     * 它还在从下往上滑 —— 那时候画图纸，线和字标都出现在画面底部边缘，
     * 而原站是在字标已经稳稳占住画面中段的时候才画。
     * 所以 start 取 'top top'（吸附开始），end 取 'bottom bottom'（吸附结束）。
     */
    this.#trigger = ScrollTrigger.create({
      trigger: this.#wrapper,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (st) => this.#apply(st.progress),
    });
  }

  /** progress 0→1 映射到 0→总时长，再逐元素算各自窗口内的完成度。 */
  #apply(progress) {
    const t = progress * OUTRO_DURATION;

    // 构造线保持到最后一个字母填实，随后淡出，避免右侧还没填完就失去线稿。
    const consOpacity = piecewise(OUTRO_CONS_FADE, t);

    this.#els.forEach(({ el, t0, t1, ease, dir, dashUnit }) => {
      const drawn = ease(clamp01((t - t0) / Math.max(0.001, t1 - t0)));
      if (dashUnit > 0) {
        // 圆：虚线 + 画出过程合成一条 dasharray，值不变时不碰 DOM
        if (Math.abs(drawn - this.#lastArc) > 0.0005 || drawn === 0 || drawn === 1) {
          el.style.strokeDasharray = dashedArc(drawn, dashUnit);
          this.#lastArc = drawn;
        }
      } else {
        // dir = −1 的从尾端往回画：把没画的那段留在前面
        el.style.strokeDasharray = dir > 0 ? `${drawn} ${1 - drawn}` : `0 ${1 - drawn} ${drawn} 0`;
      }
      el.style.opacity = String(consOpacity);
    });

    // 先完整画出六个轮廓，停留一段滚动距离，再按顺序柔和填实。
    const drawn = EASE.linear(clamp01((t - OUTRO_STROKE.t0) / (OUTRO_STROKE.t1 - OUTRO_STROKE.t0)));
    const dash = `0 ${1 - drawn} ${drawn} 0`;
    this.#glyphs.forEach((el, index) => {
      const delay = index * OUTRO_FILL.stagger;
      const fill = EASE.lines(clamp01((t - OUTRO_FILL.t0 - delay) / (OUTRO_FILL.t1 - OUTRO_FILL.t0)));
      el.style.strokeDasharray = dash;
      el.style.fillOpacity = String(fill);
      const exited = EASE.lines(clamp01((t - OUTRO_EXIT.t0 - index * OUTRO_EXIT.stagger)
        / (OUTRO_EXIT.t1 - OUTRO_EXIT.t0)));
      // 整条路径一起退场，描边也消失；SVG 坐标保持与构造线一致。
      el.style.opacity = String(1 - exited);
      el.setAttribute('transform', `translate(0 ${-18 * exited})`);
    });

    this.#nameGlyphs.forEach((el, index) => {
      const entered = EASE.lines(clamp01((t - OUTRO_NAME_IN.t0 - index * OUTRO_NAME_IN.stagger)
        / (OUTRO_NAME_IN.t1 - OUTRO_NAME_IN.t0)));
      el.style.opacity = String(entered);
      el.setAttribute('transform', `translate(0 ${12 * (1 - entered)})`);
    });
  }

  reset() {
    this.#lastArc = -1;
    this.#apply(0);
  }

  dispose() {
    this.#trigger?.kill();
    this.#trigger = null;
    this.#els = [];
    this.#glyphs = [];
    this.#nameGlyphs = [];
    this.#lastArc = -1;
    this.#wrapper = null;
  }
}

export const outroController = new OutroController();
