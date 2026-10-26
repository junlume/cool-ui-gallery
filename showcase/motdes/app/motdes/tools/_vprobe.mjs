import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 908 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4322/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__gl && window.__lenis, null, { timeout: 20000 });
await page.waitForTimeout(6000);
const rows = await page.evaluate(async () => {
  const H = document.body.scrollHeight - innerHeight;
  const out = [];
  // 找 mission→service 那段
  for (let f = 0.50; f <= 0.78; f += 0.01) {
    const y = Math.round(H * f);
    window.__lenis.scrollTo(y, { immediate: true });
    for (let k = 0; k < 40; k += 1) await new Promise((r) => requestAnimationFrame(r));
    out.push({ f: +f.toFixed(2), sec: document.body.dataset.current_section, ...window.__gl.debugLogoState() });
  }
  return out;
});
rows.forEach((r) => console.log(`${r.f}  ${String(r.sec).padEnd(11)} vision=${r.visionRotate}  serviceIn=${r.serviceIn}  serviceRotate=${r.serviceRotate}`));
await browser.close();
