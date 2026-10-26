/**
 * 构造图纸的贴合审计。
 *
 * 用户上一版的意见是「线稿和 M 不贴合，乱七八糟」。所以这里不靠眼看：
 * 逐条检查每根线是否真的落在字形的边上（斜线/竖线要与某条边共线，
 * 横线要过某个顶点）。任何一条对不上就报错退出。
 */
import { buildConstructionSVG, CANVAS } from '../src/lib/construction-svg.js';
import { OUTLINE, H, CENTROID, T } from '../src/lib/glyph.js';
import { PTS } from '../src/lib/construction-svg.js';

const MARK_H = 822.93;
const S = MARK_H / H;
const C = CANVAS / 2;
// ⚠️ 不要在这里重算一遍字形→画布的变换。以前这里有一份副本，
// construction-svg.js 把定位从"形心居中"改成"盒心定位"之后，这边没跟上，
// 27 条共线线一下掉到 8 条 —— 看着像回归，其实是审计自己错位了。
const P = PTS;
const FLANK = 0.114 * T * S;

const segs = [];
for (let i = 0; i < P.length; i += 1) segs.push([P[i], P[(i + 1) % P.length]]);

const { markup, count } = buildConstructionSVG();
const lines = [...markup.matchAll(/<line ([^>]*)\/>/g)].map((m) => {
  const g = (k) => Number(/(?:^| )x?/.test(k) && new RegExp(`${k}="([-\\d.]+)"`).exec(m[1])[1]);
  const cls = /class="([^"]*)"/.exec(m[1])[1];
  return { x1: g('x1'), y1: g('y1'), x2: g('x2'), y2: g('y2'), cls };
});

/** 点到直线距离 */
const dist = (px, py, l) => {
  const dx = l.x2 - l.x1; const dy = l.y2 - l.y1; const L = Math.hypot(dx, dy);
  return Math.abs((px - l.x1) * dy - (py - l.y1) * dx) / L;
};

let bad = 0;
const TOL = 0.35;                 // 画布 2304 单位下的容差，折合屏幕 ~0.2px

for (const l of lines) {
  if (l.cls.includes('cons-streak')) continue;   // 扫光沿中线走，本就不在边上
  const horiz = Math.abs(l.y2 - l.y1) < 1e-6;
  let ok = false; let why = '';
  if (horiz) {
    const d = Math.min(...P.map(([, y]) => Math.abs(y - l.y1)));
    ok = d < TOL || Math.abs(d - FLANK) < TOL;
    why = `最近顶点高度差 ${d.toFixed(3)}（陪衬线允许 ${FLANK.toFixed(3)}）`;
  } else {
    // 与某条边共线？允许 0 / ±FLANK 三种水平偏移
    let best = Infinity; let bestOff = 0;
    for (const [a, b] of segs) {
      const dx = b[0] - a[0]; const dy = b[1] - a[1];
      if (Math.hypot(dx, dy) < 1e-6) continue;
      const para = Math.abs(dx * (l.y2 - l.y1) - dy * (l.x2 - l.x1)) / (Math.hypot(dx, dy) * Math.hypot(l.x2 - l.x1, l.y2 - l.y1));
      if (para > 1e-4) continue;                  // 不平行，跳过
      for (const off of [0, FLANK, -FLANK]) {
        const d = dist(a[0] + off, a[1], l);
        if (d < best) { best = d; bestOff = off; }
      }
    }
    ok = best < TOL;
    why = `与最近平行边的距离 ${best.toFixed(3)}（偏移档 ${bestOff.toFixed(2)}）`;
  }
  if (!ok) { bad += 1; console.log(`✗ ${l.cls.padEnd(22)} ${why}`); }
}

const circles = [...markup.matchAll(/<circle ([^>]*)\/>/g)];
console.log(`元素 ${count} 个：直线 ${lines.length}、圆 ${circles.length}`);
console.log(`斜线/竖线/横线共线审计：${lines.length - bad}/${lines.length} 通过`);
if (bad) { console.error(`\n${bad} 条线没有贴合字形边缘`); process.exit(1); }
console.log('全部线条与字形边缘严格共线 ✓');
