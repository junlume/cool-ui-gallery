/**
 * 把区段大标题 PORTFOLIO 编译成一条 SVG 轮廓路径。
 *
 * 为什么要编译而不是直接写 <text>：这个标题是**描边字**，靠
 * strokeDasharray 从 `0 500` 推到 `500 0` 一笔一笔"写"出来（见
 * controllers/mission-vision.js 的 setupPathAnimation）。dasharray 在
 * <text> 上虽然也能跑，但字体没加载完的那一帧会用兜底字形去描，
 * 长度一变整段节奏就乱。烤成 path 就没有这个时序问题。
 *
 * 字形取自项目已经装着的 Archivo 可变字体（@fontsource-variable/archivo），
 * 也就是 --f-display 顶替 acumin-pro 的那一份 —— 标题和正文同源。
 *
 * 输出 src/lib/section-title.js，含 viewBox 与 d。
 *
 *   node tools/build-section-title.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { create } from 'fontkitten';

const WORD = 'PORTFOLIO';
/**
 * 字重。Archivo 这份可变字体的 wght 轴**默认值就是 600**（轴范围 100–900），
 * 而 600 正好是这个标题要的中粗，所以直接用默认实例。
 * 不要调 getVariation() —— 这个版本的 fontkitten 返回的实例缺 head/cmap 表，
 * 一取字形就炸（unitsPerEm / cmapTable.tables undefined）。
 */
const WEIGHT = 600;
/** 字距，单位 em。原站 VISION 字与字之间是松的，量下来约 0.03em。 */
const TRACKING = 0.03;

const FONT = new URL('../node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2', import.meta.url);
const font = create(new Uint8Array(readFileSync(FONT)));
if (font.variationAxes?.wght?.default !== WEIGHT) {
  throw new Error(`字体默认字重是 ${font.variationAxes?.wght?.default}，不是 ${WEIGHT}`);
}

const upem = font.unitsPerEm;
const track = TRACKING * upem;

// 逐字排下去，顺手记录整体墨迹范围
let pen = 0;
const raw = [];
let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
for (const g of font.glyphsForString(WORD)) {
  const b = g.bbox;
  minX = Math.min(minX, pen + b.minX);
  maxX = Math.max(maxX, pen + b.maxX);
  minY = Math.min(minY, b.minY);
  maxY = Math.max(maxY, b.maxY);
  raw.push({ g, pen });
  pen += g.advanceWidth + track;
}

const w = maxX - minX;
const h = maxY - minY;

/**
 * 归一到高度 100 的 viewBox。宽度按墨迹的真实比例给出去，
 * CSS 只管宽度，高度靠 height:auto 跟着走。
 */
const S = 100 / h;
const VB_W = Number((w * S).toFixed(3));

const f = (n) => Number(n.toFixed(3));
const d = raw.map(({ g, pen: px }) => g.path
  // 字体是 y 向上、SVG 是 y 向下：翻 y，同时把墨迹左下角挪到 (0, 100)
  .transform(S, 0, 0, -S, (px - minX) * S, maxY * S)
  .toSVG()).join('');

const out = `/**
 * 区段大标题的轮廓路径 —— 由 tools/build-section-title.mjs 生成，别手改。
 *
 * 字：${WORD}　字体：Archivo ${WEIGHT}　字距：${TRACKING}em
 * viewBox 高度归一到 100，宽度 ${VB_W} 是墨迹的真实比例。
 */
export const SECTION_TITLE_WORD = '${WORD}';
export const SECTION_TITLE_VIEWBOX = '0 0 ${VB_W} 100';
export const SECTION_TITLE_ASPECT = ${f(w / h)};
export const SECTION_TITLE_PATH = '${d}';
`;

writeFileSync(new URL('../src/lib/section-title.js', import.meta.url), out);
console.log(`${WORD}：墨迹 ${f(w)}×${f(h)} 字体单位，宽高比 ${f(w / h)}`);
console.log(`  viewBox "0 0 ${VB_W} 100"，路径 ${d.length} 字符 → src/lib/section-title.js`);
