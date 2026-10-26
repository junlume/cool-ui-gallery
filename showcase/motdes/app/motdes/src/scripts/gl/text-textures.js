import * as THREE from 'three';

import { WORDMARK_PATH, WORDMARK_W, WORDMARK_H } from '../../lib/wordmark.js';

/**
 * 三张文字贴图。原站是预渲染的 PNG，这里运行时画。
 *
 *   logo          1204 × 250   KV 里那条巨大的品牌字标
 *   works-title   1136 × 256   绕圆柱缠绕的标题带，横向重复 4 次
 *   service-title 1074 × 192
 *
 * ⚠️ 字标**不再用系统字体拼**。品牌字形来自 brand/motdes-wordmark.svg，
 * 这里直接用 Path2D 填那条路径 —— 和页眉、页脚、三维标志、开场构造线是同
 * 一份坐标。之前用 Archivo 近似，字宽、字距、笔画粗细全是另一套，
 * 与页眉的字标并排时对不上。
 *
 * WORKS / SERVICE 仍是普通西文标题，不属于品牌资产，继续用字体渲染。
 *
 * 全部白字透明底 —— 着色器用 step(0.5, logo.w) 取 alpha 做遮罩，
 * 所以字形边缘要足够硬，不能有大面积半透明羽化。
 */

function makeCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  return { c, ctx };
}

function toTexture(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 把一行字**精确铺进贴图里的一个目标框**。
 *
 * 之前用的是"字号 = 贴图高 × fillRatio"，那是拍脑袋的比例，跟字体的实际
 * 墨迹高度没关系。把原站的 /top/works-title.png 下下来量过：
 *
 *   works-title   1136×256   字占 95.4% 宽 × 84.4% 高，上边距 9.0%
 *   service-title 1074×192   字占 98.5% 宽 × 84.9% 高，上边距 8.9%
 *
 * 我原来 fillRatio 给 0.58 —— 高度只有原站的 57.8/84.4 = 68%，
 * 折算到屏幕上就是背景那行 WORKS 明显比原站小一圈。
 *
 * 所以这里改成：先用 actualBoundingBox 量出这段字**真实的墨迹框**，
 * 再算出把它塞进目标框所需的缩放和位移。这样换字体、换字数都不用重调数字。
 */
/**
 * 字距是**解出来的，不是调出来的**。
 *
 * drawFittedText 取宽、高两个方向缩放里较小的那个，所以只要让这段字的
 * 墨迹宽高比等于目标框的宽高比，两个方向就同时顶满 —— 和原站那张贴图
 * 的填充方式完全一致。于是字距变成一个有唯一解的量：
 *
 *              目标宽高比 × 墨迹高 − ls=0 时的墨迹宽
 *   letterSpacing = ─────────────────────────────────
 *                              字间隙数
 *
 * 在 200px 基准字号下实测（Archivo 600）：
 *   WORKS    ls=0 → 749×142（比 5.275）；目标 5.019 → ls = (712.7−749)/4 = −9.08
 *   SERVICE  ls=0 → 858.4×142（比 6.045）；目标 6.491 → ls = (921.7−858.4)/6 = +10.55
 *
 * 也就是说 Archivo 天生比原站那款窄字距还宽 —— WORKS 得**收紧**（负字距），
 * SERVICE 反而要放开。之前一律给正值（46 / 30），WORKS 被拉宽了 31%。
 */
function drawFittedText({ width, height, text, fontWeight, boxW, boxH, boxTop, letterSpacing = 0 }) {
  const { c, ctx } = makeCanvas(width, height);
  const font = (size) => `${fontWeight} ${size}px "Archivo Variable", Archivo, system-ui, sans-serif`;

  // 先用一个基准字号量墨迹框，再按比例换算 —— 字号和墨迹是线性关系
  const PROBE = 200;
  ctx.font = font(PROBE);
  ctx.letterSpacing = `${letterSpacing}px`;
  const m = ctx.measureText(text);
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;

  const targetW = width * boxW;
  const targetH = height * boxH;
  // 取较小的那个缩放，保证两个方向都不溢出；字距按同一比例缩放
  const size = Math.min(PROBE * (targetW / inkW), PROBE * (targetH / inkH));
  ctx.font = font(size);
  ctx.letterSpacing = `${letterSpacing * (size / PROBE)}px`;

  const m2 = ctx.measureText(text);
  const w2 = m2.actualBoundingBoxLeft + m2.actualBoundingBoxRight;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  // 横向居中；纵向按原站的上边距对齐（不是居中 —— 原站上下边距不对称）
  ctx.fillText(text, (width - w2) / 2 + m2.actualBoundingBoxLeft,
    height * boxTop + m2.actualBoundingBoxAscent);
  return toTexture(c);
}

/**
 * KV 的品牌字标。
 *
 * 尺寸对表方式：把原站的 /top/logo.png 下下来量过 —— ALCHE 在 1204×250 的
 * 贴图里占满 1202/1204 宽、250/250 高，**没有留白**。所以这里同样按宽度铺满
 * （留 0.2% 防抗锯齿切边），不是拍一个「看起来差不多」的比例。
 *
 * 高度对不上是必然的：ALCHE 的宽高比 4.785，正好贴合贴图的 4.816；
 * MOTDES 六个字母，宽高比 5.72，铺满宽度后高度只有 210/250。上下那点透明
 * 边留着不管 —— 因为决定 KV 构图的是**字标宽度**（原站两侧各留 10.5%），
 * 而不是字高。砖墙着色器里 1204.0/250.0 是写死的，贴图尺寸也不能动。
 */
export function createLogoTexture() {
  const W = 1204;
  const H = 250;
  const { c, ctx } = makeCanvas(W, H);
  const s = (W * 0.998) / WORDMARK_W;
  ctx.translate((W - WORDMARK_W * s) / 2, (H - WORDMARK_H * s) / 2);
  ctx.scale(s, s);
  ctx.fill(new Path2D(WORDMARK_PATH));
  return toTexture(c);
}

/**
 * 背景那行巨大的 WORKS。尺寸与留白逐项对齐原站的 works-title.png。
 * 过滤方式也照抄：原站加载后只设了 NearestFilter，**没有**开 RepeatWrapping。
 * 我之前开了 wrapS=Repeat —— 虽然片元里那对 step() 会把越界部分挡掉，
 * 结果上看不出差别，但没理由和原站不一样。
 */
export function createWorksTitleTexture() {
  const tex = drawFittedText({
    width: 1136, height: 256, text: 'WORKS', fontWeight: 600,
    boxW: 0.954, boxH: 0.844, boxTop: 0.090, letterSpacing: -9.08,
  });
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/** SERVICE 标题带。对齐原站的 service-title.png。 */
export function createServiceTitleTexture() {
  const tex = drawFittedText({
    width: 1074, height: 192, text: 'SERVICE', fontWeight: 600,
    boxW: 0.985, boxH: 0.849, boxTop: 0.089, letterSpacing: 10.55,
  });
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}
