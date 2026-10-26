/**
 * 记录开场那 3 秒的四个标量，供与原站录屏逐帧对齐。
 *
 * 计时起点是 gl.onLoadingComplete() 被调用的那一刻（uLoaded 开始从 0 走），
 * 和原站录屏里量到的 t0≈0.13s 是同一个事件，两条曲线才对得上。
 *
 *   node tools/intro-trace.mjs
 */
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 908 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:4322/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__gl && window.__lenis, null, { timeout: 20000 });
await page.waitForTimeout(5000);          // 让首轮开场跑完

const rows = await page.evaluate(async () => {
  const gl = window.__gl;
  await gl.onLoadingComplete(true);       // 确保图纸贴图已烤好
  const out = [];
  await new Promise((resolve) => {
    gl.debugReplayIntro();                // uLoaded 倒回 0 重放
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      out.push({ t: +t.toFixed(3), ...gl.debugMetrics() });
      if (t < 1.6) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
  return out;
});

// 采样到 1/30 秒栅格，和原站的测量对齐
console.log('   t    uLoaded   center    full   bright%   radius');
for (let i = 0; i <= 45; i += 1) {
  const t = i / 30;
  let best = rows[0];
  for (const r of rows) if (Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
  console.log(`${t.toFixed(3)}  ${String(best.loaded).padStart(7)}  ${String(best.center).padStart(7)}  ${String(best.full).padStart(6)}  ${String(best.bright).padStart(7)}  ${String(best.radius).padStart(7)}`);
}
await browser.close();
