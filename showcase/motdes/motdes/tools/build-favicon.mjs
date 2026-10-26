/**
 * 从字标里的 M 生成 favicon。
 *
 * 和三维字标、开场构造图纸、页眉一样，图形取自唯一真源 src/lib/wordmark.js 的
 * MARK_POLYGON —— 标志就是字标里那个 M，不另画。
 *
 * 版式起点是原站那枚 ▲ 的实测值：48×48 画布、墨迹 42×38、左右各留 3px。
 * ▲ 的宽高比 1.105 和我们 M 的 1.118 几乎一样，所以同宽即同框。
 *
 * 但**没有照搬 42**。▲ 是空心三角，墨迹只占画布 23.6%；M 是实心字形，
 * 同样撑到 42 宽时占到 48.6%，在标签栏里明显比原站压得满。
 * 收到 36（画布的 75%，图标安全区的常规值），墨迹回落到 35.7%，
 * 视觉重量接近原站，字形本身仍然认得出。
 *
 * 出两份，都是纯黑不随深浅色翻转（用户定的；深色标签栏上会偏暗，
 * 想翻白就把 INK_COLOR 换成媒体查询）：
 *   favicon.svg  矢量，高分屏下边缘更实，浏览器优先取它
 *   favicon.png  48×48 透明底，不支持 SVG 图标时的兜底
 *
 *   node tools/build-favicon.mjs
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

import { MARK_POLYGON, MARK_W, MARK_H } from '../src/lib/wordmark.js';

const CANVAS = 48;
const INK_W = 36;                       // 画布的 75%；原站 ▲ 是 42，见上面的墨迹面积说明
const INK_COLOR = '#000000';

const scale = INK_W / MARK_W;
const inkH = MARK_H * scale;
const ox = (CANVAS - INK_W) / 2;
const oy = (CANVAS - inkH) / 2;
const f = (n) => Number(n.toFixed(3));

const d = `${MARK_POLYGON.map(([x, y], i) => `${i ? 'L' : 'M'}${f(ox + x * scale)} ${f(oy + y * scale)}`).join('')}Z`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">`
  + `<path fill="${INK_COLOR}" d="${d}"/></svg>`;

writeFileSync(new URL('../public/favicon.svg', import.meta.url), `${svg}\n`);

// PNG 走 4 倍超采样再降采样 —— 直接栅格到 48 时 M 谷底那个尖角会糊掉一格。
const png = await sharp(Buffer.from(svg.replace(`width="${CANVAS}" height="${CANVAS}"`, `width="${CANVAS * 4}" height="${CANVAS * 4}"`)))
  .resize(CANVAS, CANVAS, { kernel: 'lanczos3' })
  .png()
  .toBuffer();
writeFileSync(new URL('../public/favicon.png', import.meta.url), png);

console.log(`favicon：M 墨迹 ${INK_W}×${f(inkH)} 落在 ${CANVAS}×${CANVAS}，填充 ${INK_COLOR}（原站 ▲ 是 42×38 / #231815）`);
console.log('  → public/favicon.svg  public/favicon.png');
