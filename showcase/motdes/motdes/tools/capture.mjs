/**
 * 用真实的无头 Chrome 抓帧，供与原站录屏逐帧对照。
 *
 * 为什么需要它：开发面板隐藏时 Chromium 会挂起 rAF 和合成器 —— 截图是黑的、
 * CSS 过渡冻在起始值、Clock.getDelta() 恒为 0。之前只能靠 debugComposite()
 * 读像素反推，看不到 DOM 层，也没法看开场那 3 秒的推进。
 * 这里换成 playwright-core 驱动系统 Chrome（headless），rAF 实测 61 帧/500ms，
 * 一切照常跑。
 *
 * 视口默认 1920×908 —— 按原站录屏量出来的可视区（3839×1815 设备像素 @dpr2），
 * 宽高比对齐了才谈得上逐帧比对：这个站的字标屏占比是随宽高比变的。
 *
 *   node tools/capture.mjs intro     开场 0→4s，每 200ms 一帧
 *   node tools/capture.mjs sections  各区段定点
 *   node tools/capture.mjs both
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.CAPTURE_DIR || '/tmp/motdes-capture';
const URL = process.env.CAPTURE_URL || 'http://localhost:4322/';
const VIEWPORT = { width: 1920, height: 908 };
const mode = process.argv[2] || 'both';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/** 开场：从导航那一刻起按墙钟计时，和录屏的时间轴对得上。 */
async function captureIntro() {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'commit' });
  const t0 = Date.now();
  for (let ms = 200; ms <= 4000; ms += 200) {
    const wait = t0 + ms - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${OUT}/intro_${String(ms).padStart(4, '0')}.png` });
  }
  await page.close();
  console.log(`开场 20 帧 → ${OUT}/intro_*.png`);
}

/**
 * 区段：先扫一遍 scroll → section 的映射，再按**名字**定位。
 *
 * 早先按滚动比例硬编码位置，换个视口高度整张表就错位（0.85 有时是 stellla、
 * 有时是 service_1）。按名字取才稳定。
 *
 * 每站停 2.5 秒：合成里那两级跟随是渐进的，uVisibleService 要越过
 * step(0.9999) 这道门大约需要 1.5 秒 —— 停 1.2 秒会拍到 0.9995，
 * 于是服务段还顶着 MISSION 的白底，看着像 bug，其实是没等够。
 */
async function captureSections() {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__gl && window.__lenis, null, { timeout: 20000 });
  await page.waitForTimeout(5000);            // 等开场走完

  // 扫映射：每 1% 采一个点，记下每个区段第一次出现的位置和它的中点
  const map = await page.evaluate(async () => {
    const H = document.body.scrollHeight - innerHeight;
    const hits = {};
    for (let i = 0; i <= 200; i += 1) {
      const y = Math.round((i / 200) * H);
      window.__lenis.scrollTo(y, { immediate: true });
      await new Promise((r) => requestAnimationFrame(r));
      const s = document.body.dataset.current_section;
      if (!s) continue;
      if (!hits[s]) hits[s] = [y, y]; else hits[s][1] = y;
    }
    return hits;
  });

  const wanted = ['kv', 'works_intro', 'works', 'works_outro', 'mission_in',
    'mission', 'vision', 'vision_out', 'service_in', 'service_0', 'service_1',
    'stellla', 'footer'];
  for (const name of wanted) {
    const range = map[name];
    if (!range) { console.log(`  ${name.padEnd(12)} 未出现`); continue; }
    const y = Math.round((range[0] + range[1]) / 2);
    await page.evaluate((yy) => window.__lenis.scrollTo(yy, { immediate: true }), y);
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => {
      const d = window.__gl.debugInfo();
      return { sec: document.body.dataset.current_section, mv: d.visibleMV, svc: d.visibleService };
    });
    await page.screenshot({ path: `${OUT}/sec_${wanted.indexOf(name)}_${name}.png` });
    console.log(`  ${name.padEnd(12)} y=${String(y).padEnd(6)} 实为=${String(info.sec).padEnd(12)} mv=${info.mv} svc=${info.svc}`);
  }
  await page.close();
  console.log(`区段 → ${OUT}/sec_*.png`);
}

if (mode === 'intro' || mode === 'both') await captureIntro();
if (mode === 'sections' || mode === 'both') await captureSections();
await browser.close();
