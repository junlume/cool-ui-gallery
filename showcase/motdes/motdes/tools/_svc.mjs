import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1920, height: 908 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text().slice(0,140)); });
await p.goto('http://localhost:4322/', { waitUntil: 'load' });
await p.waitForFunction(() => window.__gl && window.__lenis, null, { timeout: 20000 });
await p.waitForTimeout(6000);
console.log('错误:', errs.length ? errs.slice(0,4).join('\n  ') : '无');
const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);
for (const [n, f] of [['service_in',0.62],['service_0',0.70],['service_1',0.80],['stellla',0.88]]) {
  await p.evaluate(y => window.__lenis.scrollTo(y, { immediate: true }), Math.round(H*f));
  await p.waitForTimeout(2500);
  const s = await p.evaluate(() => document.body.dataset.current_section);
  await p.screenshot({ path: `/tmp/motdes-capture/svc_${n}.png` });
  console.log(`${n.padEnd(11)} f=${f} 实为=${s}`);
}
await b.close();
