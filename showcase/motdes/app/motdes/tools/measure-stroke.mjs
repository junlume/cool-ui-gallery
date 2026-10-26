/**
 * 量两处 M 描边在屏幕上的真实粗细（设备像素）。
 *
 * 手法是"墨迹积分"而不是数硬边：一条 2.7px 的线经抗锯齿会摊成 4 个灰度不同的
 * 像素，数边界会数成 4，数纯色会数成 2。把每个像素相对背景的偏离量归一化后求和，
 * 得到的才是这条线真正占了多少像素宽 —— 和 SVG stroke-width 的定义对得上。
 */
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const URL = 'http://localhost:4322/';
const VIEWPORT = { width: 1920, height: 908 };
const OUT = '/tmp/motdes-stroke';

/** 扫一行，返回每段连续墨迹的 [中心x, 积分宽度, 峰值偏离] */
function scanRow(data, w, y, bg, minPeak = 12) {
  const runs = [];
  let cur = null;
  for (let x = 0; x < w; x += 1) {
    const i = (y * w + x) * 3;
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    const d = Math.abs(lum - bg);
    if (d > 3) {
      if (!cur) cur = { x0: x, sum: 0, peak: 0 };
      cur.sum += d; cur.peak = Math.max(cur.peak, d); cur.x1 = x;
    } else if (cur) {
      if (cur.peak >= minPeak) runs.push({ c: (cur.x0 + cur.x1) / 2, width: cur.sum / cur.peak, peak: cur.peak });
      cur = null;
    }
  }
  if (cur && cur.peak >= minPeak) runs.push({ c: (cur.x0 + cur.x1) / 2, width: cur.sum / cur.peak, peak: cur.peak });
  return runs;
}

async function rows(file, ys) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return ys.map((y) => {
    const yy = Math.round(y * info.height);
    // 背景取该行的中位数
    const lums = [];
    for (let x = 0; x < info.width; x += 1) {
      const i = (yy * info.width + x) * 3;
      lums.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }
    const bg = lums.slice().sort((a, b) => a - b)[Math.floor(lums.length / 2)];
    return { y: yy, bg: +bg.toFixed(1), runs: scanRow(data, info.width, yy, bg) };
  });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });

// ---------- 1) 开场 loading 的 M（藏掉构造线，只剩描边） ----------
await page.goto(URL, { waitUntil: 'commit' });
await page.waitForTimeout(1800);
const geo = await page.evaluate(() => {
  const lot = document.getElementById('loading-lottie');
  if (lot) lot.style.display = 'none';
  const box = document.getElementById('loading-logo');
  if (box) { box.style.opacity = '1'; box.style.transition = 'none'; }
  const svg = document.querySelector('.Loading__logo_svg');
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const sw = parseFloat(getComputedStyle(svg.querySelector('.cons-logo')).strokeWidth);
  return { rect: [r.x, r.y, r.width, r.height], vb, strokeWidthUserUnits: sw, dpr: devicePixelRatio };
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}-loading.png` });
console.log('【loading】svg 盒 %s  viewBox %s  stroke-width(user units) %s  dpr %s',
  JSON.stringify(geo.rect.map((v) => +v.toFixed(1))), JSON.stringify(geo.vb), geo.strokeWidthUserUnits, geo.dpr);
const scaleCss = Math.max(geo.rect[2] / geo.vb[2], geo.rect[3] / geo.vb[3]);   // slice = cover
console.log('  slice 缩放 %s → 理论 CSS 线宽 %s px → 设备像素 %s',
  scaleCss.toFixed(4), (geo.strokeWidthUserUnits * scaleCss).toFixed(3),
  (geo.strokeWidthUserUnits * scaleCss * geo.dpr).toFixed(3));
for (const r of await rows(`${OUT}-loading.png`, [0.42, 0.5, 0.58])) {
  console.log('  y=%d bg=%s  段宽:', r.y, r.bg, r.runs.map((v) => v.width.toFixed(2)).join('  '));
}

// ---------- 2) mission 段的三维字标描边 ----------
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__gl && window.__lenis, null, { timeout: 20000 });
await page.waitForTimeout(5000);
const y = await page.evaluate(async () => {
  const H = document.body.scrollHeight - innerHeight;
  const hits = {};
  for (let i = 0; i <= 200; i += 1) {
    const yy = Math.round((i / 200) * H);
    window.__lenis.scrollTo(yy, { immediate: true });
    await new Promise((r) => requestAnimationFrame(r));
    const s = document.body.dataset.current_section;
    if (s && !hits[s]) hits[s] = [yy, yy]; else if (s) hits[s][1] = yy;
  }
  const r = hits.mission;
  const target = Math.round((r[0] + r[1]) / 2);
  window.__lenis.scrollTo(target, { immediate: true });
  return target;
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}-mission.png` });
console.log('\n【mission】scrollY=%d', y);
for (const r of await rows(`${OUT}-mission.png`, [0.45, 0.55, 0.75])) {
  console.log('  y=%d bg=%s  段宽:', r.y, r.bg,
    r.runs.map((v) => `${v.width.toFixed(2)}@${Math.round(v.c)}`).join('  '));
}

await browser.close();
