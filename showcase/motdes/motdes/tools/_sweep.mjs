import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1920, height: 908 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:4322/', { waitUntil: 'load' });
await p.waitForFunction(() => window.__gl && window.__lenis, null, { timeout: 20000 });
await p.waitForTimeout(7000);
await p.mouse.move(960, 454);
const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);
for (let i = 0; i < 20; i++) {
  const f = 0.02 + i * 0.014;
  await p.evaluate(y => window.__lenis.scrollTo(y,{immediate:true}), Math.round(H*f));
  await p.waitForTimeout(700);
  await p.screenshot({ path: `/tmp/motdes-capture/sw_${String(i).padStart(2,'0')}.png` });
}
await b.close();
