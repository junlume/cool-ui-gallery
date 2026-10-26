import { OUTLINE, W, H, T, CENTROID, PATH } from './glyph.js';

/**
 * 开场的构造线图纸。
 *
 * ⚠️ 这一版是照着原站 /common/loading/bg/data.json 逐层拆出来重建的，
 * 不是凭观感画的。上一版之所以「和字母不贴合、乱七八糟」，是因为我把
 * 参考线放在了 H*0.34、H*0.66 这类拍脑袋的位置上 —— 原站根本不是那样。
 *
 * 原站的规则只有四条，每条都能从字形本身推出来：
 *
 *   ① 斜线：字形每一条**去重后的斜边**，沿自身方向延长到画布外。
 *      因为线就是边本身，所以必然严丝合缝 —— 这是"贴合"的全部秘密。
 *      每条画三根：本体 + 水平偏移 ±(0.114 × 笔画宽) 的两根发丝线。
 *   ② 竖线：字形每一条竖边（A 没有竖边，于是退化成包围盒左右两条；
 *      M 本身有四条立柱边，就画四条）。
 *   ③ 横线：字形每一个**顶点 y 高度**各一条，另在基线下加一条陪衬线。
 *      A 有 5 个高度 + 2 条陪衬 = 7 条，与 Lottie 里 7 个 yoko 图层一致。
 *   ④ 圆：两个同心圆，圆心是多边形**形心**（不是包围盒中心 —— A 的形心
 *      是三角形重心，比盒心低 16.6% 字高），大圆过最远顶点，小圆取其半。
 *
 * 画布固定 2304 见方，字标高度固定 822.93 —— 两者都取自原站 Lottie，
 * 这样在同样的 80% 容器里做 cover 铺排时，M 的屏占比与原站的 A 完全一致
 * （实测原站字标高 = 视口高的 60.2%）。
 *
 * 时间轴同样来自 Lottie：原站只播它前 45%（3.003s × 0.45 = 1.351s），
 * 每个图层各有自己的 ip / trim 关键帧，所以线不是齐刷刷长出来的。
 * 每个元素带 data-t0 / data-t1（秒）与 data-dir（+1 从头画，−1 从尾画），
 * 控制器照着这三个值推进，不再用统一的错峰窗口硬凑。
 *
 * 所有元素带 pathLength="1"。这不是可选项：描边用了
 * vector-effect:non-scaling-stroke 保持发丝粗细，而该属性会让 dasharray
 * 按屏幕像素而非用户单位解释 —— 不归一化就会在"未绘制"状态露出一截。
 */

const f = (n) => Number(n.toFixed(3));

/** 画布与字标尺寸：原站 Lottie 的字面值。 */
export const CANVAS = 2304;
const MARK_HEIGHT_ON_CANVAS = 822.93;

const S = MARK_HEIGHT_ON_CANVAS / H;
const C = CANVAS / 2;

/**
 * 标志**盒心**在画布上的落点。
 *
 * 原站是把 ▲ 的**形心**放在画布正中的。三角形的形心比盒心低 1/6 高度
 * （实测 16.6% 字高），所以那一步等于把图形整体往上顶了
 * 0.166 × 822.93 = 136.6 个画布单位。
 *
 * M 的形心几乎就落在盒心上（CENTROID[1]=72.92 / H=145.4544 = 50.1%），
 * 照搬"形心居中"就没有这一顶 —— 实测标志比原站低了将近 10% 视口高，
 * 底边压到 81% 处，把下面那行英文正文整个圈进字里去了。
 *
 * 所以这里改成按**盒心**定位，落点直接取原站 ▲ 盒心的位置。
 * 实测原站（4064×2324 录屏第 0.15 秒，视口 3833×1849）：
 *   标志上沿 10.6%、下沿 70.5%、高 59.9%、盒心 40.6%
 */
const MARK_BOX_CY = C - 0.166 * MARK_HEIGHT_ON_CANVAS;

/** 字形 → 画布：按**包围盒**归零，再缩放，落到上面那个位置。 */
const tx = (x) => C + (x - W / 2) * S;
const ty = (y) => MARK_BOX_CY + (y - H / 2) * S;

/** 字形顶点在画布坐标下的位置。审计工具直接用这一份，别再各自算一遍。 */
export const PTS = OUTLINE.map(([x, y]) => [tx(x), ty(y)]);
/** 两个同心圆仍然以**形心**为心（原站如此），只是形心跟着字形一起挪了。 */
const CEN = [tx(CENTROID[0]), ty(CENTROID[1])];

/** 旁线的水平偏移量。原站 A 上是 20 画布单位 = 笔画宽的 11.4%。 */
const FLANK = 0.114 * T * S;

/** 把过某点、给定方向的直线裁到画布边界。 */
function clip(px, py, dx, dy) {
  let tmin = -1e9;
  let tmax = 1e9;
  for (const [d, p] of [[dx, px], [dy, py]]) {
    if (Math.abs(d) < 1e-12) {
      if (p < 0 || p > CANVAS) return null;
      continue;
    }
    let ta = (0 - p) / d;
    let tb = (CANVAS - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    tmin = Math.max(tmin, ta);
    tmax = Math.min(tmax, tb);
  }
  if (tmin >= tmax) return null;
  return [px + dx * tmin, py + dy * tmin, px + dx * tmax, py + dy * tmax];
}

/** 轮廓边去重成"无穷直线"。同一条直线上的多段边只留一条。 */
function distinctEdgeLines() {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < PTS.length; i += 1) {
    const a = PTS[i];
    const b = PTS[(i + 1) % PTS.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const ux = dx / L;
    const uy = dy / L;
    let nx = -uy;
    let ny = ux;
    if (nx < -1e-9 || (Math.abs(nx) < 1e-9 && ny < 0)) { nx = -nx; ny = -ny; }
    const key = `${nx.toFixed(4)},${ny.toFixed(4)},${(nx * a[0] + ny * a[1]).toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: a[0], y: a[1], ux, uy, horizontal: Math.abs(uy) < 1e-6, vertical: Math.abs(ux) < 1e-6 });
  }
  return out;
}

/** 形心到最远顶点 —— 大圆半径。小圆取其半，与原站 549.8 / 273.2 同构。 */
function circumradius() {
  return Math.max(...PTS.map(([x, y]) => Math.hypot(x - CEN[0], y - CEN[1])));
}

/** 笔画中线折线。收尾的三条渐变扫光沿着它跑。 */
function skeleton() {
  const xs = [...new Set(OUTLINE.map((p) => p[0]))].sort((a, b) => a - b);
  const stemL = (xs[0] + xs[1]) / 2;
  const stemR = (xs[xs.length - 2] + xs[xs.length - 1]) / 2;
  const valleyY = Math.max(...OUTLINE.filter((p) => p[0] > W * 0.35 && p[0] < W * 0.65).map((p) => p[1]));
  return [
    [tx(stemL), ty(H)], [tx(stemL), ty(0)],
    [tx(W / 2), ty(valleyY)],
    [tx(stemR), ty(0)], [tx(stemR), ty(H)],
  ];
}

/** 原站各图层的关键帧（秒）。3.003s × 0.45 = 1.351s 是整段的长度。 */
export const TIMELINE_DURATION = 1.351;
const T_VERTICAL = [0, 0.333, +1];      // tate:  trim e 0→100，f0→f10
const T_HORIZONTAL = [0.133, 1.0, -1];  // yoko:  trim s 100→0，f4→f30
const T_DIAG_A = [0.3, 0.8, +1];        // right: trim e 0→100，f9→f24
const T_DIAG_B = [0.733, 1.333, -1];    // left:  trim s 100→0，f22→f40
const T_CIRCLE = [0.133, 1.333, +1];    // circle:      f4→f40
const T_CIRCLE_S = [0.5, 1.333, +1];    // corcle_s:    f15→f40
const T_STREAK = [0.567, 1.233, -1];    // line/2/3:    f17→f37

export function buildConstructionSVG() {
  const parts = [];
  let count = 0;

  const attr = ([t0, t1, dir], cls) =>
    `class="${cls}" pathLength="1" data-t0="${t0}" data-t1="${t1}" data-dir="${dir}"`;

  const line = (c, time, cls) => {
    if (!c) return;
    parts.push(`<line ${attr(time, cls)} x1="${f(c[0])}" y1="${f(c[1])}" x2="${f(c[2])}" y2="${f(c[3])}"/>`);
    count += 1;
  };

  const edges = distinctEdgeLines();

  // ---- ① 横线：每个顶点高度一条，基线下再加一条陪衬 ----
  const levels = [...new Set(PTS.map((p) => f(p[1])))].sort((a, b) => a - b);
  levels.forEach((y) => line([0, y, CANVAS, y], T_HORIZONTAL, 'cons-rule'));
  line([0, levels[levels.length - 1] + FLANK, CANVAS, levels[levels.length - 1] + FLANK],
    T_HORIZONTAL, 'cons-rule cons-thin');

  // ---- ② 竖线：字形的竖边；没有竖边时退化成包围盒左右缘 ----
  const verticals = edges.filter((e) => e.vertical);
  const vxs = verticals.length
    ? [...new Set(verticals.map((e) => f(e.x)))].sort((a, b) => a - b)
    : [f(Math.min(...PTS.map((p) => p[0]))), f(Math.max(...PTS.map((p) => p[0])))];
  const vMin = vxs[0];
  const vMax = vxs[vxs.length - 1];
  vxs.forEach((x) => {
    const outer = x === vMin || x === vMax;
    line([x, 0, x, CANVAS], T_VERTICAL, outer ? 'cons-axis' : 'cons-axis cons-thin');
  });

  // ---- ③ 斜线：每条斜边延长，各带两根 ±FLANK 的发丝线 ----
  //      按倾向分两族（"/" 与 "\"），两族的出场时间不同 —— 原站即如此。
  const diagonals = edges.filter((e) => !e.horizontal && !e.vertical);
  diagonals.forEach((e) => {
    const leansRight = (e.ux * e.uy) > 0;              // y 向下：同号即 "\"
    const time = leansRight ? T_DIAG_B : T_DIAG_A;
    [-FLANK, 0, FLANK].forEach((d) => {
      line(clip(e.x + d, e.y, e.ux, e.uy), time, d === 0 ? 'cons-edge' : 'cons-edge cons-thin');
    });
  });

  // ---- ④ 两个同心圆，圆心是形心 ----
  const R = circumradius();
  parts.push(`<circle ${attr(T_CIRCLE, 'cons-circle')} cx="${f(C)}" cy="${f(C)}" r="${f(R)}"/>`);
  parts.push(`<circle ${attr(T_CIRCLE_S, 'cons-circle cons-circle_s')} cx="${f(C)}" cy="${f(C)}" r="${f(R / 2)}"/>`);
  count += 2;

  // ---- ⑤ 沿笔画中线的扫光。原站是三条带渐变的短线，长度约为边长的 1.16 倍 ----
  const sk = skeleton();
  for (let i = 0; i < sk.length - 1; i += 1) {
    const [ax, ay] = sk[i];
    const [bx, by] = sk[i + 1];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const L = Math.hypot(bx - ax, by - ay) * 1.16;
    const ux = (bx - ax) / Math.hypot(bx - ax, by - ay);
    const uy = (by - ay) / Math.hypot(bx - ax, by - ay);
    line([mx - ux * L / 2, my - uy * L / 2, mx + ux * L / 2, my + uy * L / 2], T_STREAK, 'cons-streak');
  }

  return { viewBox: `0 0 ${CANVAS} ${CANVAS}`, markup: parts.join(''), count };
}

/**
 * 字标描边。原站是 logo lottie 的 trim start 100→0，1.8 秒画完，
 * 也就是**从路径末端倒着写回起点**，所以这里 dir = −1。
 */
export function buildLogoOutlineSVG() {
  const d = PATH.replace(/([-\d.]+) ([-\d.]+)/g, (_, x, y) => `${f(tx(Number(x)))} ${f(ty(Number(y)))}`);
  return {
    viewBox: `0 0 ${CANVAS} ${CANVAS}`,
    markup: `<path class="cons-logo" pathLength="1" data-dir="-1" d="${d}" fill="none"/>`,
  };
}
