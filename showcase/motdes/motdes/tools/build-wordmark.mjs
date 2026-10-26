/**
 * 从 brand/motdes-wordmark.svg 生成 src/lib/wordmark.js。
 *
 * 品牌资产只有一个真源：用户给的那张 SVG。字标、页眉、页脚、KV 贴图、
 * 收场、favicon 全部从这里派生 —— 不允许任何地方用系统字体"近似"出一个
 * MOTDES，也不允许手抄坐标。改了 SVG，跑一次这个脚本，全站跟着变。
 *
 *   node tools/build-wordmark.mjs
 *
 * 输出的坐标做了两件事：
 *   · 整体平移，让字标包围盒左上角落在 (0,0)
 *   · 逐字记录包围盒，好让"M 作为独立标志"能精确取出来
 * 除此之外一律保持原样 —— 曲线控制点不做任何重采样。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(resolve(root, 'brand/motdes-wordmark.svg'), 'utf8');

const LETTERS = ['M', 'O', 'T', 'D', 'E', 'S'];
const paths = [...svg.matchAll(/<path\s+d="([^"]+)"/g)].map((m) => m[1]);
if (paths.length !== LETTERS.length) {
  throw new Error(`期望 ${LETTERS.length} 条字形路径，实际 ${paths.length} 条`);
}

/** 把路径拆成命令流。SVG 里只用到 M/H/V/L/C/Z，绝对坐标。 */
function tokenize(d) {
  const out = [];
  for (const m of d.matchAll(/([MLHVCZmlhvcz])([^MLHVCZmlhvcz]*)/g)) {
    const nums = [...m[2].matchAll(/-?\d*\.?\d+(?:e-?\d+)?/g)].map((n) => Number(n[0]));
    out.push([m[1], nums]);
  }
  return out;
}

/** 走一遍路径，收集顶点（曲线按控制点入框 —— 这里的字形本就没有曲线外扩）。 */
function walk(d, onPoint, onCtrl) {
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  for (const [c, v] of tokenize(d)) {
    switch (c) {
      case 'M': [x, y] = v; sx = x; sy = y; onPoint(x, y); break;
      case 'L': for (let i = 0; i < v.length; i += 2) { [x, y] = [v[i], v[i + 1]]; onPoint(x, y); } break;
      case 'H': for (const t of v) { x = t; onPoint(x, y); } break;
      case 'V': for (const t of v) { y = t; onPoint(x, y); } break;
      case 'C':
        for (let i = 0; i < v.length; i += 6) {
          onCtrl(v[i], v[i + 1]); onCtrl(v[i + 2], v[i + 3]);
          [x, y] = [v[i + 4], v[i + 5]]; onPoint(x, y);
        }
        break;
      case 'Z': x = sx; y = sy; break;
      default: throw new Error(`未支持的命令 ${c}`);
    }
  }
}

/** 顶点包围盒（不含曲线控制点）—— 圆字母的 overshoot 由顶点本身体现。 */
function bbox(d) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const put = (px, py) => { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); };
  walk(d, put, put);
  return { x0, y0, x1, y1 };
}

const boxes = paths.map(bbox);
const OX = Math.min(...boxes.map((b) => b.x0));
const OY = Math.min(...boxes.map((b) => b.y0));

const f = (n) => {
  const r = Number(n.toFixed(4));
  return Object.is(r, -0) ? 0 : r;
};

/** 平移后重新序列化。H/V 会退化成 L —— 数值等价，少一层坐标系心智负担。 */
function translate(d) {
  const parts = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const P = (px, py) => `${f(px - OX)} ${f(py - OY)}`;
  for (const [c, v] of tokenize(d)) {
    switch (c) {
      case 'M': [x, y] = v; sx = x; sy = y; parts.push(`M${P(x, y)}`); break;
      case 'L': for (let i = 0; i < v.length; i += 2) { [x, y] = [v[i], v[i + 1]]; parts.push(`L${P(x, y)}`); } break;
      case 'H': for (const t of v) { x = t; parts.push(`L${P(x, y)}`); } break;
      case 'V': for (const t of v) { y = t; parts.push(`L${P(x, y)}`); } break;
      case 'C':
        for (let i = 0; i < v.length; i += 6) {
          parts.push(`C${P(v[i], v[i + 1])} ${P(v[i + 2], v[i + 3])} ${P(v[i + 4], v[i + 5])}`);
          [x, y] = [v[i + 4], v[i + 5]];
        }
        break;
      case 'Z': parts.push('Z'); x = sx; y = sy; break;
      default: break;
    }
  }
  return parts.join('');
}

/** M 的顶点表。它同时是三维标志、构造图纸、favicon 的几何真源，所以单独导出。 */
function polygon(d) {
  const pts = [];
  walk(d, (px, py) => pts.push([f(px - OX), f(py - OY)]), () => {});
  // 首尾同点时去掉重复的收尾点
  const last = pts[pts.length - 1];
  const first = pts[0];
  if (last && first && last[0] === first[0] && last[1] === first[1]) pts.pop();
  return pts;
}

const glyphs = LETTERS.map((ch, i) => ({
  ch,
  d: translate(paths[i]),
  box: {
    x: f(boxes[i].x0 - OX), y: f(boxes[i].y0 - OY),
    w: f(boxes[i].x1 - boxes[i].x0), h: f(boxes[i].y1 - boxes[i].y0),
  },
}));

const W = f(Math.max(...boxes.map((b) => b.x1)) - OX);
const H = f(Math.max(...boxes.map((b) => b.y1)) - OY);
// 帽高取方口字母（M/T/D/E）—— O 和 S 是圆字母，带光学 overshoot，不能拿来定基准
const CAP = f(Math.max(...['M', 'T', 'D', 'E'].map((c) => glyphs.find((g) => g.ch === c).box.h)));

const mPoly = polygon(paths[0]);

const src = `/**
 * motdes 字标 —— 由 brand/motdes-wordmark.svg 自动生成，请勿手改。
 * 重新生成：node tools/build-wordmark.mjs
 *
 * 坐标系：SVG 惯例（y 向下），整体平移到包围盒左上角为原点。
 * 字标总宽 ${W} × 总高 ${H}，帽高 ${CAP}（方口字母；O 与 S 有光学 overshoot）。
 */

/** 六个字形的路径数据与各自包围盒。顺序即书写顺序。 */
export const GLYPHS = ${JSON.stringify(glyphs, null, 2).replace(/"([a-z]+)":/g, '$1:')};

export const WORDMARK_W = ${W};
export const WORDMARK_H = ${H};
export const CAP_HEIGHT = ${CAP};
export const WORDMARK_VIEWBOX = \`0 0 \${WORDMARK_W} \${WORDMARK_H}\`;

/** 六个字形连成的一条路径。填充规则用 nonzero 即可 —— 字形之间不重叠。 */
export const WORDMARK_PATH = GLYPHS.map((g) => g.d).join('');

/**
 * 标志 = 字标的首字母 M。
 * 和 alche 把 ▲ 同时当作标志与字标里的 A 是同一套做法：
 * 标志必须就是字标里那个字，不能是另画的一个。
 */
export const MARK = GLYPHS[0];

/** M 的顶点多边形（已平移到 M 自身包围盒原点）。三维标志与构造图纸的真源。 */
export const MARK_POLYGON = ${JSON.stringify(
    mPoly.map(([x, y]) => [f(x - glyphs[0].box.x), f(y - glyphs[0].box.y)]),
  ).replace(/\],\[/g, '],\n  [').replace(/^\[/, '[\n  ').replace(/\]$/, ',\n]')};

export const MARK_W = ${glyphs[0].box.w};
export const MARK_H = ${glyphs[0].box.h};

/** 生成一段 <svg>。fill 传 'none' 时画描边轮廓。 */
export function wordmarkSVG({ fill = 'currentColor', className = '', extra = '' } = {}) {
  return \`<svg class="\${className}" viewBox="\${WORDMARK_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" \${extra}><path d="\${WORDMARK_PATH}" fill="\${fill}"/></svg>\`;
}
`;

writeFileSync(resolve(root, 'src/lib/wordmark.js'), src);

console.log(`字标 ${W} × ${H}，帽高 ${CAP}`);
glyphs.forEach((g) => console.log(`  ${g.ch}  x=${g.box.x} w=${g.box.w} h=${g.box.h}`));
console.log(`M 多边形 ${mPoly.length} 点 → src/lib/wordmark.js`);
