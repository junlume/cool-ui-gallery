import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const reportDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(reportDir, '../../motdes');
const source = fs.readFileSync(path.join(root, 'src/scripts/main.js'), 'utf8');
const start = source.indexOf('async function bootCoinOpening()');
const end = source.indexOf('\n\n\n/**', start);
assert.ok(start > 0 && end > start);
const boot = source.slice(start, end);
const scenarios = [];

for (const [name, fonts] of [
  ['fonts-ready', Promise.resolve()],
  ['font-fallback', Promise.reject(new Error('unavailable font'))],
]) {
  // Test the real boot function with instrumented boundaries, without a browser.
  let phase = 'loading';
  let callbacks;
  const trace = [];
  const record = (operation) => trace.push({ operation, phase });
  const prepared = new Set();
  const init = (operation) => {
    assert.equal(phase, 'loading', `${operation} must finish behind the opening`);
    prepared.add(operation);
    record(operation);
  };
  const controller = () => ({ in() { record('controller.in'); } });
  const context = {
    history: { scrollRestoration: 'auto' },
    document: {
      body: { dataset: {} }, fonts: { ready: fonts },
      getElementById: () => ({}),
    },
    window: { scrollTo() { record('window.scrollTo'); } },
    lenis: { scrollTo() { record('lenis.scrollTo'); } },
    ScrollTrigger: { update() { record('ScrollTrigger.update'); } },
    topScrollManager: {
      on() {}, in() {},
      checkCurrentSection() { record('section.check'); },
    },
    gl: {
      init() {}, in() {}, completeLoadingImmediately() {},
      changeTopSection() { record('gl.changeTopSection'); },
      async precompile() { init('shaders'); },
      async prepareCoinWorks() { init('visible-video-textures'); },
    },
    worksItemController: {
      in(options) {
        assert.equal(options.deferEnter, true);
        init('split-text');
      },
      reveal(index) {
        assert.equal(phase, 'revealing');
        assert.equal(index, 0);
        assert.ok(prepared.has('split-text'));
        record('title-animation');
      },
    },
    outroController: { init() { init('outro'); } },
    remeasure() { init('layout-refresh'); },
    bindSectionSounds() {},
    siteSoundtrackController: { init() { record('music.init'); }, releaseOpening() { record('music.releaseOpening'); } },
  };
  for (const name of ['topScrollIndicator', 'visionMissionController',
    'serviceItemController', 'servicePagerController', 'stelllaSectionController', 'worksOutroController',
    'scrambleController', 'sideMenuController', 'soundToggleController', 'videoModalController']) {
    context[name] = controller();
  }
  context.coinOpeningController = {
    init(options) { callbacks = options; },
    async run(resourcesReady) {
      // Both automatic reveal and skip await this same readiness gate.
      await resourcesReady;
      assert.deepEqual([...prepared].sort(),
        ['layout-refresh', 'outro', 'shaders', 'split-text', 'visible-video-textures']);
      phase = 'revealing';
      callbacks.onReveal();
      phase = 'ready';
      callbacks.onComplete?.();
    },
  };
  await vm.runInNewContext(`${boot}\nbootCoinOpening();`, context);
  assert.equal(context.history.scrollRestoration, 'manual');
  assert.equal(trace.filter((x) => x.operation === 'layout-refresh').length, 1);
  assert.equal(trace.filter((x) => x.operation === 'music.init' && x.phase === 'loading').length, 1);
  assert.equal(trace.filter((x) => x.operation === 'music.releaseOpening' && x.phase === 'revealing').length, 1);
  assert.equal(trace.filter((x) => x.phase === 'ready').length, 0);
  scenarios.push({ name, passed: true, trace });
}

const css = fs.readFileSync(path.join(root, 'src/styles/coin-opening.css'), 'utf8');
assert.match(css, /html:has\(> body\[data-coin-opening='true'\]\)\s*\{\s*scrollbar-width: none;/);
assert.match(css, /html:has\(> body\[data-coin-opening='true'\]\)::-webkit-scrollbar\s*\{\s*width: 0;\s*height: 0;/);
assert.ok(!/lenis-stopped/.test(css), 'Scroll lock must not control scrollbar geometry');
const timing = fs.readFileSync(path.join(root, 'src/scripts/controllers/coin-opening.js'), 'utf8');
assert.match(timing, /const REVEAL_SECONDS = 0\.72;/);
assert.match(timing, /const REVEAL_BEFORE_PULLBACK_SECONDS = 1 \/ 60;/);
assert.match(timing, /const PROGRESS_COMPLETE_LEAD_SECONDS = 1;/);
const report = {
  passed: true, scenarios,
  scrollbarRulesScopedToCoinHomepage: true,
  timing: { revealSeconds: 0.72, beforePullbackSeconds: 1 / 60, progressLeadSeconds: 1 },
  limitation: 'Offline lifecycle and source checks; not a live browser frame-rate measurement.',
};
fs.writeFileSync(path.join(reportDir, 'boot-validation.json'), JSON.stringify(report, null, 2));
console.log('PASS: boot preparation, font fallback, readiness gate, reveal boundary, scoped scrollbar CSS, retained timing.');
