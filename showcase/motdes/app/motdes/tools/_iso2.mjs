import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1920, height: 908 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:4322/', { waitUntil: 'load' });
await p.waitForFunction(() => window.__gl && window.__lenis, null, { timeout: 20000 });
await p.waitForTimeout(7000);
const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);
for (const [n,f] of [['a',0.06],['b',0.10],['c',0.14],['d',0.18],['e',0.22],['f',0.26]]) {
  await p.evaluate(y => window.__lenis.scrollTo(y,{immediate:true}), Math.round(H*f));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `/tmp/motdes-capture/iso_${n}.png` });
}
await b.close();
