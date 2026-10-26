import { chromium } from 'playwright-core';
const tag = process.argv[2] || 'x';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 908 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4322/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__gl && window.__lenis, null, { timeout: 20000 });
await page.waitForTimeout(6000);
const y = await page.evaluate(async () => {
  const H = document.body.scrollHeight - innerHeight; const hits = {};
  for (let i = 0; i <= 300; i += 1) {
    const yy = Math.round((i / 300) * H);
    window.__lenis.scrollTo(yy, { immediate: true });
    await new Promise((r) => requestAnimationFrame(r));
    const s = document.body.dataset.current_section;
    if (s && !hits[s]) hits[s] = [yy, yy]; else if (s) hits[s][1] = yy;
  }
  const t = Math.round(hits.works[0] + (hits.works[1] - hits.works[0]) * 0.55);
  window.__lenis.scrollTo(t, { immediate: true });
  return t;
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `/tmp/motdes-w-${tag}.png` });
await browser.close(); console.log('scrollY', y);
