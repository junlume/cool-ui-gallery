import { GLYPHS, WORDMARK_W, WORDMARK_H, CAP_HEIGHT, MARK_POLYGON } from './wordmark.js';
import { OUTRO_NAME_TEXT, OUTRO_NAME_GLYPHS, OUTRO_NAME_WIDTH, OUTRO_NAME_HEIGHT } from './outro-name.js';

/**
 * 收场那张**整幅字标的构造图纸**。
 *
 * 真源是原站的 Lottie：.ref/lottie/top/outro/data.json，1100×1100 画布、
 * 29.97fps、0→119 帧共 3.971 秒。这份文件把它整份拆开对过一遍，
 * 下面每一个数都能在里面指出出处，没有一个是估的。
 *
 * ---------------------------------------------------------------------------
 * 一、线从哪里来 —— 不是包围盒，是**字形自己的直边**
 * ---------------------------------------------------------------------------
 *
 * 我之前按"每个字形包围盒的左右两条边"出 12 条竖线，结果就是用户说的
 * "每一条线都对应不到字母上"。把原站 t=2.0 那帧（3830×1566）逐像素扫开，
 * 12 条竖线实际落在：
 *
 *   264.6 1047.6 │ 1161.9 1300.4 1587.8 │ ── │ 2408.6 2540.4 2827.8 2966.4 │ 3094.6 3233.2 3548.4
 *    A 左   A 右  │  L 竖左 竖右  脚右   │ C 无 │  H 竖左 竖右  竖左  竖右   │  E 竖左 竖右  横杆右
 *
 * 对照同一帧的墨迹边界（A 264..1047、L 1164..1586、H 2408..2966、E 3097..3548）
 * ——**每一条竖线都压在字形的一条竖直笔画边上**，一条不多一条不少：
 * A 2 条、L 3 条、C 0 条、H 4 条、E 3 条，合计 12。
 *
 * C 一条都没有，因为 C 没有竖直边 —— 它拿到的是那个圆。
 *
 * 所以规则是：**把字形轮廓里的直边解析出来，竖的当竖线、横的当横线**。
 * MOTDES 按同一规则算出来是 14 条竖线（M 4、O 0、T 4、D 2、E 4、S 0）。
 * 数目和原站的 12 不同，那是 ALCHE 和 MOTDES 字形不同的必然结果，
 * 12 是结果不是常数 —— 要守的是"线必须落在字母的边上"这条规则。
 *
 * 横线原站 6 条，实测 534.3 / 811 / 921.8 / 1084.5 / 1184 / 1208.4，对应
 * 帽线、H 横杆顶＝E 中杆顶、H 横杆底＝E 中杆底、L 脚顶＝E 下杆顶＝A 横杠顶、
 * A 内三角底、基线。可以看出取的是**被多个字形共用的高度**，不够时补标志自己的。
 * 这里照搬：按容差聚类后按"共用了几个字形"排序取 6 条，同分标志（M）优先。
 *
 * 斜线 4 条 = M 的四条斜边（MOTDES 里唯一有斜边的字，正如 ALCHE 里的 A）。
 * 圆 1 个 = 套在圆形字母上；原站是 C，实测直径 690 源像素 ÷ 3.482 = 198.2 画布单位，
 * 而 Lottie 里 corcle_s 的椭圆是 1159.844 × 17.1% = 198.33 —— 对得上，
 * 也就是**圆直径 = 那个字母的高**。我们对应的是 O。
 *
 * ---------------------------------------------------------------------------
 * 二、原站时间轴参考 —— Lottie 的裁剪路径（tm）与不透明度（ks.o）关键帧
 * ---------------------------------------------------------------------------
 *
 *   tate  ×12   e 0→100   帧 0 →22    从头画
 *   yoko  ×6    s 100→0   帧 13→35    从尾画
 *   斜线  ×4    帧 22→40（left 与シェイプレイヤー10 从尾画，right 2/4 从头画）
 *   corcle_s    e 0→100   帧 20→35    从头画，**虚线**（线段 16×17.1%＝2.736 画布单位）
 *   字标描边    s 100→0   帧 37→55    从尾画，当前六个字形同时（tm.m=1＝同时）
 *   字标填充    透明度 0→100 帧 57→79  整体一起，**没有逐字错峰**
 *   构造线淡出  100@72 → 50@78 → 0@92 —— 所有构造层的关键帧完全一致
 *
 * 最后一行就是用户说的"底部辅助线随着滚轮下滑逐渐消失"。原站不是把线留着，
 * 是在字母填实的同时（帧 72 起）把整张图纸淡掉，帧 92 归零 —— 之后画面上
 * 只剩实心字标。录屏 t=3.0/3.2/3.4/3.6 处线的亮度实测 53→32→13→0，对得上。
 *
 * 缓动也照抄：线是 cubic-bezier(.333,0,.667,1)，圆/描边/填充/淡出是
 * cubic-bezier(.167,.167,.833,.833) —— 后者正好落在对角线上，等于线性。
 *
 * ---------------------------------------------------------------------------
 * 三、当前设计：全部字母先描边，随后从左到右逐字填实
 * ---------------------------------------------------------------------------
 *
 * 原站页面里 .TopPageOutro__logo 是一个**独立的实心 ▲**（.ref/index.html
 * 那段 markup 里就是一条 fill="white" 的路径），压在 Lottie 上面全程可见；
 * Lottie 内部虽然也画了 A 的描边和填充，但被它盖住。所以画面上是
 * "标志一直实心，其余字母描边→填实"。按用户 2026-10-08 的要求，当前取消
 * M 的常驻实心覆盖层，让六个字母统一参与描边。2026-10-09 再延长滚动行程：
 * 线稿完整后保持至帧 66，M→S 每字用 12 帧逐个填实，至帧 138 完成，
 * 构造线随后在帧 138→149 淡出。这里的帧是滚动时间轴刻度，并非自动播放时长。
 */

const f = (n) => Number(n.toFixed(3));

/** 画布取原站 Lottie 的 comp 尺寸。 */
export const OUTRO_CANVAS = 1100;

/**
 * 字标在画布上的位置。原站实测（4064×2324 录屏第 37.5 秒，视口 3833×1849）：
 * 字标宽 85.7% 视口、水平居中。画布按 slice 铺满视口时横向是 1:1 映射，
 * 所以宽度直接取 0.857 × 1100。
 */
const MARK_W_ON_CANVAS = f(0.857 * OUTRO_CANVAS);
const S = MARK_W_ON_CANVAS / WORDMARK_W;
const OX = (OUTRO_CANVAS - MARK_W_ON_CANVAS) / 2;
/**
 * 竖向：画布居中之后实测落在视口 34.1%–65.8%，原站是 37.6%–68.4%，整体高了 3.4%。
 * slice 铺排下 1 个画布单位 = 视口宽 / 1100，2.115 的宽高比换算过来是 17.7 个画布单位。
 */
const OY_FIX = 17.7;
const OY = (OUTRO_CANVAS - WORDMARK_H * S) / 2 + OY_FIX;

const tx = (x) => f(OX + x * S);
const ty = (y) => f(OY + y * S);

/**
 * 线有多长 —— 这是个动效参数，不是"够铺满就行"。
 *
 * 原站每一条构造线用的都是**同一段 1921 单位的线**（Lottie 里所有 tate/yoko/
 * left/right 图层的路径顶点都是 [-961,-136]→[960,-136]），靠图层缩放取不同长度：
 *
 *   tate   缩放 100%        → 1921，旋转 90°，中点钉在画布竖中 550.5
 *   yoko   缩放 [58,100]    → 1114，中点钉在画布横中 548.8（正好一个画布宽）
 *   left   缩放 ±116%       → 2228，旋转 −60°
 *   right  缩放 126%        → 2420，旋转 +60°
 *
 * 我原先把每条线都延到 ±2200（全长 4400–4850），铺是铺满了，但**画面内那一段
 * 只占全长的 14%** —— 于是"画出来"这个动作有 86% 发生在屏幕外，可见的那一小截
 * 在中间一闪而过。用户说的"M 的 X 线一下就闪出来"就是这么来的。
 * 按原站的长度，可见占比回到 30–32%，同样的 18 帧窗口里扫过屏幕的时间长两倍多。
 */
const LINE_BASE = 1921;
const LEN_TATE = LINE_BASE;
const LEN_YOKO = f(LINE_BASE * 0.58);
const LEN_LEFT = f(LINE_BASE * 1.16);
const LEN_RIGHT = f(LINE_BASE * 1.26);
const C = OUTRO_CANVAS / 2;

// ---------------------------------------------------------------------------
// 字形轮廓 → 直边
// ---------------------------------------------------------------------------

/** 把 d 拆成线段。字形数据只用到绝对 M/L/C/Z。 */
function segments(d) {
  const out = [];
  let cur = [0, 0];
  let start = [0, 0];
  const re = /([MLCZmlcz])([^MLCZmlcz]*)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1].toUpperCase();
    const n = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (cmd === 'M') {
      cur = [n[0], n[1]]; start = cur;
      for (let i = 2; i + 1 < n.length; i += 2) { const p = [n[i], n[i + 1]]; out.push([cur, p]); cur = p; }
    } else if (cmd === 'L') {
      for (let i = 0; i + 1 < n.length; i += 2) { const p = [n[i], n[i + 1]]; out.push([cur, p]); cur = p; }
    } else if (cmd === 'C') {
      // 曲线段不算直边 —— 原站的 C 一条竖线都没有，正是因为它全是曲线
      for (let i = 0; i + 5 < n.length; i += 6) { cur = [n[i + 4], n[i + 5]]; }
    } else if (cmd === 'Z') {
      out.push([cur, start]); cur = start;
    }
  }
  return out;
}

/** 坐标相同视为同一条边；比这更短的直边不算笔画边。 */
const SAME = 0.05;
/** 竖笔画至少要有这么高才算一条竖边（最短的是 T/E 的横杆侧边，约 28）。 */
const MIN_V = 5;
/**
 * 横边的最小长度取 1 —— M 的谷底缺口只有 1.7 单位宽、内竖顶只有 1.2，
 * 但它们是 M 最要紧的两条设计高度，正如 ALCHE 里 A 的内三角底也入选。
 */
const MIN_H = 1;

/** 某个字形所有竖直笔画边的 x（去重）。 */
function verticalEdges(g) {
  const xs = [];
  for (const [a, b] of segments(g.d)) {
    if (Math.abs(a[0] - b[0]) > SAME) continue;
    if (Math.abs(a[1] - b[1]) < MIN_V) continue;
    if (!xs.some((x) => Math.abs(x - a[0]) < SAME)) xs.push(a[0]);
  }
  return xs.sort((p, q) => p - q);
}

/** 某个字形所有水平笔画边的 y（去重）。 */
function horizontalEdges(g) {
  const ys = [];
  for (const [a, b] of segments(g.d)) {
    if (Math.abs(a[1] - b[1]) > SAME) continue;
    if (Math.abs(a[0] - b[0]) < MIN_H) continue;
    if (!ys.some((y) => Math.abs(y - a[1]) < SAME)) ys.push(a[1]);
  }
  return ys.sort((p, q) => p - q);
}

/** 原站 6 条横线。聚类容差取帽高的 2%（≈2.9 单位）—— 刚好把 O/S 的光学溢出并进帽线与基线，
 *  和原站把 C 的溢出（526/1212）并进 534/1208 是同一处理。 */
const H_TOL = 0.02 * CAP_HEIGHT;
const YOKO_COUNT = 6;

function pickHorizontals() {
  const raw = [];
  GLYPHS.forEach((g, gi) => horizontalEdges(g).forEach((y) => raw.push({ y, gi })));
  raw.sort((a, b) => a.y - b.y);

  const clusters = [];
  for (const it of raw) {
    const last = clusters[clusters.length - 1];
    if (last && it.y - last.items[0].y <= H_TOL) last.items.push(it);
    else clusters.push({ items: [it] });
  }
  for (const c of clusters) {
    const gs = new Set(c.items.map((i) => i.gi));
    c.share = gs.size;                       // 被几个字形共用
    c.hasMark = gs.has(0);                   // 标志（M）自己的高度
    c.y = c.items.reduce((s, i) => s + i.y, 0) / c.items.length;
  }
  // 共用得多的优先；同分时标志优先；再同分按位置
  clusters.sort((a, b) => (b.share - a.share) || (b.hasMark - a.hasMark) || (a.y - b.y));
  return clusters.slice(0, YOKO_COUNT).map((c) => f(c.y)).sort((a, b) => a - b);
}

const MARK = GLYPHS[0];

/**
 * M 的斜边（去重后 4 条）。端点先换到画布坐标再定长 —— 长度必须是画布单位，
 * 否则同一个数字在字标坐标里是另一个尺度。
 * 左倾的取 left 的长度（2228）、右倾的取 right 的（2420），和原站两族对应。
 */
function markDiagonals() {
  const seen = [];
  const out = [];
  for (let i = 0; i < MARK_POLYGON.length; i += 1) {
    const a = MARK_POLYGON[i];
    const b = MARK_POLYGON[(i + 1) % MARK_POLYGON.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5) continue;
    const k = dy / dx;
    const c = a[1] - k * a[0];
    if (seen.some((s) => Math.abs(s[0] - k) < 0.01 && Math.abs(s[1] - c) < 0.5)) continue;
    seen.push([k, c]);
    const ax = tx(a[0] + MARK.box.x); const ay = ty(a[1] + MARK.box.y);
    const bx = tx(b[0] + MARK.box.x); const by = ty(b[1] + MARK.box.y);
    const ux = bx - ax; const uy = by - ay;
    const e = ((k > 0 ? LEN_LEFT : LEN_RIGHT) / 2) / Math.hypot(ux, uy);
    const mx = (ax + bx) / 2; const my = (ay + by) / 2;
    out.push({ k, x1: mx - ux * e, y1: my - uy * e, x2: mx + ux * e, y2: my + uy * e });
  }
  return out.slice(0, 4);
}

// ---------------------------------------------------------------------------
// 滚动时间轴 —— 保留原描线窗口，扩展停留、逐字填充和末尾淡出
// ---------------------------------------------------------------------------

const FR = 29.9700012207031;
const fr = (n) => Number((n / FR).toFixed(4));

/** 前 149 帧保留描线填充节奏，后半段滚动把 MOTDES 换成 THANKS FOR WATCHING。 */
export const OUTRO_DURATION = fr(298);

/** 各类构造线的绘制窗口（秒）与方向。dir −1 表示从尾端往回画。 */
export const OUTRO_TRACKS = {
  tate:   { t0: fr(0),  t1: fr(22), ease: 'lines' },
  yoko:   { t0: fr(13), t1: fr(35), ease: 'lines' },
  naname: { t0: fr(22), t1: fr(40), ease: 'lines' },
  circle: { t0: fr(20), t1: fr(35), ease: 'linear' },
};

/** 全部字母一起描边；填充窗口从 M 开始，后续字母每隔 stagger 依次推进。 */
export const OUTRO_STROKE = { t0: fr(37), t1: fr(55) };
export const OUTRO_FILL = { t0: fr(66), t1: fr(78), stagger: fr(12) };

/** 完整字标停留后逐字离场；最后一个 S 消失后才让感谢文案入场。 */
export const OUTRO_EXIT = { t0: fr(165), t1: fr(173), stagger: fr(8) };
// Fit every letter into the original entrance window and retain the final hold.
export const OUTRO_NAME_IN = { t0: fr(213), t1: fr(221), stagger: fr(56) / Math.max(1, OUTRO_NAME_GLYPHS.length - 1) };

/**
 * 最后一个 S 填实后再淡出整张图纸；六个字母的填充保持不变。
 */
export const OUTRO_CONS_FADE = [
  { t: fr(138), o: 1 },
  { t: fr(143), o: 0.5 },
  { t: fr(149), o: 0 },
];

/** 圆的虚线：Lottie 里线段 16 单位 × 图层 17.1% 缩放。 */
export const OUTRO_CIRCLE_DASH = f(16 * 0.171);

// ---------------------------------------------------------------------------

const line = (x1, y1, x2, y2, cls, track, dir) =>
  `<line class="${cls}" pathLength="1" data-track="${track}" data-dir="${dir}"`
  + ` x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;

export function buildOutroSVG() {
  const parts = [];
  const stat = { tate: 0, yoko: 0, naname: 0, circle: 0 };

  // ---- ① 竖线：每个字形所有竖直笔画边 ----
  GLYPHS.forEach((g) => {
    verticalEdges(g).forEach((x) => {
      parts.push(line(tx(x), C - LEN_TATE / 2, tx(x), C + LEN_TATE / 2, 'ocons-tate', 'tate', 1));
      stat.tate += 1;
    });
  });

  // ---- ② 横线：共用度最高的 6 条高度。原站 yoko 是从尾端往回画的 ----
  pickHorizontals().forEach((y) => {
    parts.push(line(C - LEN_YOKO / 2, ty(y), C + LEN_YOKO / 2, ty(y), 'ocons-yoko', 'yoko', -1));
    stat.yoko += 1;
  });

  // ---- ③ 斜线：M 的四条斜边。原站两条从尾画、两条从头画，按左右倾分 ----
  markDiagonals().forEach((d) => {
    parts.push(line(d.x1, d.y1, d.x2, d.y2, 'ocons-naname', 'naname', d.k > 0 ? -1 : 1));
    stat.naname += 1;
  });

  // ---- ④ 圆：套在圆形字母（O）上，直径 = 它的高 ----
  const O = GLYPHS.find((g) => g.ch === 'O') ?? GLYPHS[1];
  const cx = tx(O.box.x + O.box.w / 2);
  const cy = ty(O.box.y + O.box.h / 2);
  const r = f((O.box.h / 2) * S);
  parts.push(`<circle class="ocons-circle" pathLength="1" data-track="circle" data-dir="1"`
    + ` data-circumference="${f(2 * Math.PI * r)}" cx="${cx}" cy="${cy}" r="${r}"/>`);
  stat.circle = 1;

  return {
    viewBox: `0 0 ${OUTRO_CANVAS} ${OUTRO_CANVAS}`,
    markup: parts.join(''),
    count: parts.length,
    stat,
  };
}

/**
 * 字标在这张画布上的路径 —— 逐字形一条。
 * isMark 只标识 M；控制器先共同描边，再按此顺序逐字填实。
 */
export function buildOutroMarkGlyphs() {
  return GLYPHS.map((g, i) => ({
    ch: g.ch,
    isMark: i === 0,
    d: g.d.replace(/([-\d.]+) ([-\d.]+)/g, (_, x, y) => `${tx(Number(x))} ${ty(Number(y))}`),
  }));
}

export function buildOutroMarkSVG() {
  return { viewBox: `0 0 ${OUTRO_CANVAS} ${OUTRO_CANVAS}`, glyphs: buildOutroMarkGlyphs() };
}

/** 新文字与原字标共用 SVG 画布，按原区域等比居中，不挤压字形。 */
export function buildOutroNameSVG() {
  const scale = Math.min(MARK_W_ON_CANVAS / OUTRO_NAME_WIDTH, CAP_HEIGHT * S / OUTRO_NAME_HEIGHT);
  const width = OUTRO_NAME_WIDTH * scale;
  const height = OUTRO_NAME_HEIGHT * scale;
  return {
    text: OUTRO_NAME_TEXT,
    glyphs: OUTRO_NAME_GLYPHS,
    transform: `translate(${f((OUTRO_CANVAS - width) / 2)} ${f(OY + WORDMARK_H * S / 2 - height / 2)}) scale(${scale})`,
  };
}
