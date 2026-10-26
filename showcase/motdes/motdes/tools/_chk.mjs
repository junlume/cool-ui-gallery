import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1920, height: 908 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:4322/', { waitUntil: 'load' });
await p.waitForFunction(() => window.__gl && window.__lenis, null, { timeout: 20000 });
await p.waitForTimeout(7000);
const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);
// WORKS 大字峰值 + 用户看到光斑的位置（works→mission 交界）
for (const [n,f] of [['wt',0.025],['blob1',0.325],['blob2',0.345],['blob3',0.365]]) {
  await p.evaluate(y => window.__lenis.scrollTo(y,{immediate:true}), Math.round(H*f));
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => ({ sec: document.body.dataset.current_section,
    wt: window.__lerper.get('works_title_visibility')?.current?.toFixed(3),
    m: window.__gl.debugMetrics() }));
  await p.screenshot({ path: `/tmp/motdes-capture/c_${n}.png` });
  console.log(`${n.padEnd(6)} ${String(r.sec).padEnd(12)} worksTitle=${r.wt}  bright%=${r.m.bright}  full=${r.m.full}`);
}
await b.close();
