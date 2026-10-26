/**
 * motdes 标志的唯一真源。
 *
 * 标志就是字标里的那个 M —— 不是另画的一个字。这是照抄原站的做法：
 * alche 的 ▲ 既是独立标志，也是「ALCHE」里的 A，两者是同一份路径。
 * 所以这里直接从 src/lib/wordmark.js（由用户提供的 SVG 生成）取 M 的多边形，
 * 不做任何再造。改 brand/motdes-wordmark.svg 并重跑 tools/build-wordmark.mjs，
 * 三维字标、构造图纸、页眉、页脚、favicon 会一起跟着变。
 *
 * 坐标系：SVG 惯例（y 向下），M 的包围盒左上角为原点。
 */

import { MARK_POLYGON, MARK_W, MARK_H } from './wordmark.js';

export const W = MARK_W;
export const H = MARK_H;
export const CX = W / 2;
export const CY = H / 2;

/** 轮廓顶点，顺序即绘制顺序。M 是单一闭合多边形，没有字怀。 */
export const OUTLINE = MARK_POLYGON;

const f = (n) => Number(n.toFixed(4));

/**
 * 笔画宽 —— 取左立柱的实际宽度。构造图纸的旁线间距、中心十字的臂长
 * 都以它为单位，所以必须量出来而不是设一个。
 */
export const T = f(OUTLINE[13][0] - OUTLINE[0][0]);

/**
 * 多边形形心。构造图纸的两个同心圆就落在这里 ——
 * 原站 Lottie 的圆心恰好是 A 的形心（三角形重心，距顶点 2/3 高），
 * 不是包围盒中心，两者差了 16.6% 字高。
 */
function centroid(pts) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a *= 0.5;
  return [f(cx / (6 * a)), f(cy / (6 * a))];
}

export const CENTROID = centroid(OUTLINE);

export const PATH = `M${OUTLINE.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;
export const VIEWBOX = `0 0 ${f(W)} ${f(H)}`;

export const METRICS = {
  W: f(W), H: f(H), T, CX: f(CX), CY: f(CY),
  centroid: CENTROID,
  ratio: f(W / H),
  points: OUTLINE.length,
};
