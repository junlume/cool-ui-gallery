import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Narrow production-core check. No browser, renderer, HTTP or network.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'motdes/src');
const read = (name) => fs.readFileSync(path.join(src, name), 'utf8');
const load = (name) => import(pathToFileURL(path.join(src, name)));
const timeline = await load('lib/profile-timeline.js');
const { Lerper } = await load('scripts/core/lerper.js');
const { EventEmitter } = await load('scripts/core/event-emitter.js');
let checks = 0;
const check = (condition, text) => { assert.ok(condition, text); checks += 1; };
const equal = (actual, expected, text) => { assert.deepEqual(actual, expected, text); checks += 1; };
const near = (actual, expected, text) => check(Math.abs(actual - expected) < 1e-8, `${text}: ${actual} versus ${expected}`);
const key = 'profile_story_progress';
const lerper = new Lerper();
const trigger = { progress: .2, isActive: true, kill() {} };
const motion = { matches: false };
let queries = 0, now = 0;
const viewport = { innerWidth: 1440, innerHeight: 900, matchMedia: () => { queries += 1; return motion; } };
const document = { hidden: false, body: { removeAttribute() {} }, addEventListener() {}, removeEventListener() {} };
const strip = (source) => source.replace(/^import[\s\S]*?;\s*$/gm, '').replace(/^export\s+(class|const|function)\s/gm, '$1 ');
function subject(name, className, globals) {
  const context = vm.createContext({ console, ...globals });
  vm.runInContext(`${strip(read(name))}\nglobalThis.Subject = ${className};`, context, { filename: name });
  return context.Subject;
}
const Manager = subject('scripts/core/top-scroll-manager.js', 'TopScrollManager', {
  EventEmitter, lerper, window: viewport, document,
  ScrollTriggerFactory: { setActivePage() {}, create: () => trigger, killAll() {} },
});
const manager = new Manager();
const register = () => manager.registerSection('profile_progress', {}, {});
register();
lerper.update(now);
near(manager.getProfileProgress(), .2, 'First profile read starts at its actual trigger position');
near(lerper.get(key).multiplier, .7, 'Production manager owns the configured resistance multiplier');
const queryCount = queries;
for (let call = 0; call < 5; call += 1) manager.getProfileProgress();
equal(queries, queryCount, 'Repeated core reads reuse their cached reduced-motion query');

trigger.progress = .8;
near(manager.getProfileProgress(), .2, 'Changing the raw target does not jump the reading progress');
near(lerper.get(key).target, .8, 'The sole shared reading key records the new raw target');
let previous = .2, reached95Ms = null;
for (let frame = 1; frame <= 30; frame += 1) {
  lerper.update(now += 1000 / 60);
  const current = manager.getProfileProgress();
  check(current >= previous && current <= .8, 'Forward resistance converges without overshooting');
  if (reached95Ms === null && (current - .2) / .6 >= .95) reached95Ms = frame * 1000 / 60;
  previous = current;
}
check(reached95Ms >= 390 && reached95Ms <= 450, 'The 0.7 production resistance reaches 95 percent in roughly 0.4 seconds');
trigger.progress = .3;
const reverseStart = manager.getProfileProgress();
check(reverseStart > .3, 'Reverse motion retains its previous reading position before the first damped frame');
previous = reverseStart;
for (let frame = 0; frame < 30; frame += 1) {
  lerper.update(now += 1000 / 60);
  const current = manager.getProfileProgress();
  check(current <= previous && current >= .3, 'Reverse resistance converges without overshooting');
  previous = current;
}
for (let frame = 0; frame < 120 && manager.getProfileProgress() !== .3; frame += 1) {
  lerper.update(now += 1000 / 60);
  manager.getProfileProgress();
}
near(manager.getProfileProgress(), .3, 'A stopped target snaps exactly when its residual error is below 1e-5');
near(lerper.get(key).velocity, 0, 'A settled target has zero remaining velocity');
const settled = JSON.stringify(lerper.get(key));
for (let call = 0; call < 10; call += 1) manager.getProfileProgress();
equal(JSON.stringify(lerper.get(key)), settled, 'Repeated stopped reads preserve the exact settled core state');
motion.matches = true; trigger.progress = .64;
near(manager.getProfileProgress(), .64, 'Reduced motion immediately reads the raw target');
motion.matches = false; trigger.isActive = false; trigger.progress = .72;
near(manager.getProfileProgress(), .72, 'Inactive profile progress immediately synchronizes to raw');
trigger.isActive = true;
for (const endpoint of [0, 1]) {
  trigger.progress = endpoint;
  near(manager.getProfileProgress(), endpoint, 'Raw profile boundaries cannot leave delayed content in another section');
  near(lerper.get(key).velocity, 0, 'Raw boundaries clear residual velocity');
}
manager.out();
equal(lerper.get(key), undefined, 'TopScrollManager.out removes the shared profile key');
trigger.progress = .37; register();
const beforeReentryQueries = queries;
near(manager.getProfileProgress(), .37, 'A reentered profile has no progress from its previous page');
equal(queries, beforeReentryQueries + 1, 'Reentry creates a fresh motion query after cleanup');

class Element {
  constructor() {
    this.selectors = new Map(); this.attributes = new Map(); this.writes = 0;
    this.dataset = {}; this.inert = false; this.textContent = ''; this.hidden = false;
    const self = this;
    this.style = { values: {}, setProperty(name, value) { this.values[name] = value; self.writes += 1; },
      set visibility(value) { this.values.visibility = value; self.writes += 1; }, get visibility() { return this.values.visibility; } };
  }
  querySelectorAll(selector) { return this.selectors.get(selector) || []; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); this.writes += 1; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener() {} removeEventListener() {}
}
const container = new Element(), process = new Element(), intro = [new Element(), new Element()];
const chapters = Array.from({ length: 4 }, () => new Element());
const bodies = chapters.map(() => [new Element(), new Element()]);
chapters.forEach((chapter, index) => chapter.selectors.set('[data-profile-body-line]', bodies[index]));
const cases = Array.from({ length: timeline.PROFILE_CASE_STOPS.length }, () => new Element()), statement = new Element(), end = new Element(), number = new Element(), progress = new Element();
for (const [selector, elements] of [
  ['[data-profile-process]', [process]], ['[data-profile-intro-line]', intro], ['[data-profile-chapter]', chapters],
  ['[data-profile-case]', cases], ['[data-profile-statement]', [statement]], ['[data-profile-end]', [end]],
  ['[data-profile-number]', [number]], ['[data-profile-progress]', [progress]],
]) container.selectors.set(selector, elements);
document.querySelector = () => container;
const Controller = subject('scripts/controllers/profile-story.js', 'ProfileStoryController', { ...timeline, lerper, document, window: viewport, topScrollManager: manager });
const controller = new Controller(); controller.in();
const THREE = await import(pathToFileURL(path.join(root, 'motdes/node_modules/three/build/three.module.js')));
const { Animator } = await load('scripts/gl/animator.js');
const geometry = await load('scripts/gl/logo-geometry.js');
const shaders = await load('scripts/gl/shaders/index.js');
const Logo = subject('scripts/gl/main-logo.js', 'MainLogo', { THREE, Animator, lerper, ...geometry, ...shaders, ...timeline,
  window: viewport, deviceManager: { isSPLayout: false }, topScrollManager: manager });
const logo = new Logo({ commonUniforms: {}, transparentBuffer: { uniformSet: {} }, envMap: null, noiseTexture: null, serviceSceneTexture: null, renderOrderBase: 0 });
logo.scale.setScalar(3.1); logo.position.set(0, -.3, 0); logo.updateMatrixWorld(true); logo.in();
const mesh = logo.children[0], cloud = logo.outlineContainer.children.find((object) => object.isPoints);
const consumers = [];
for (const [start, target] of [[.02, .04], [.434, .46], [.797, .82], [.86, .90]]) {
  trigger.isActive = false; trigger.progress = start; manager.getProfileProgress();
  trigger.isActive = true; trigger.progress = target; manager.getProfileProgress();
  lerper.update(now += 1000 / 60);
  const shared = manager.getProfileProgress();
  check(shared > start && shared < target, 'Consumer fixture uses a real unresolved shared progress rather than the raw target');
  controller.update(); logo.update({ deltaTime: 1 / 60 });
  near(Number(progress.style.values['--profile-progress']), shared, 'Actual ProfileStoryController reads the same shared progress');
  for (const [index, entry] of cases.entries()) near(Number(entry.style.values['--case-opacity']), timeline.profileCaseFrame(shared, index).opacity, 'Actual case fades read the shared progress');
  near(Number(process.style.values['--process-opacity']), timeline.profileProcessFrame(shared).opacity, 'Actual Process copy reads the shared progress');
  const frame = timeline.profileLogoFrame(shared);
  near(mesh.material.uniforms.uProfileReveal.value, frame.reveal, 'Actual complete M reveal reads the shared progress');
  near(mesh.material.uniforms.uProfileYaw.value, frame.yaw, 'Actual M pose reads the same shared progress');
  equal(cloud, undefined, 'Damped progress never recreates a particle layer');
  const halfHeight = Math.tan(THREE.MathUtils.degToRad((35 + 18 / (viewport.innerWidth / viewport.innerHeight)) / 2)) * 10;
  const center = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const expectedCenterY = timeline.profileLogoLayout(false, viewport.innerHeight).centerY * frame.layout + (1 - logo.position.y / halfHeight) / 2 * (1 - frame.layout);
  near((1 - center.y / halfHeight) / 2, expectedCenterY, 'Actual M rises from its bottom anchor using the same damped progress as the final exit');
  if (start === .797) check(frame.layout < 1 && frame.layout > timeline.profileLogoFrame(target).layout, 'Final exit starts visible M growth with resistance before reaching the raw scroll target');
  consumers.push({ start, rawTarget: target, sharedProgress: shared });
}
// Use the production controller and its real Lerper to exercise motion over time.
const driftKey = 'profile_card_drift';
const cardY = () => parseFloat(statement.style.values['--case-drift-y']);
function restAt(p) {
  trigger.isActive = false; trigger.progress = p;
  controller.update();
  trigger.isActive = true; controller.update();
  near(cardY(), 0, 'Direct section entry starts with a resting card');
}
function driftTick(p, fps = 60) {
  trigger.progress = p; manager.getProfileProgress();
  lerper.update(now += 1000 / fps); controller.update();
  return cardY();
}
const driftRuns = [];
for (const fps of [30, 60, 120]) {
  viewport.innerWidth = 1440; viewport.innerHeight = 900;
  restAt(.46);
  let forward = 0;
  for (let i = 1; i <= fps; i += 1) {
    forward = driftTick(.46 + .04 * i / fps, fps);
    check(forward >= 0 && forward <= 27, 'Forward movement stays within the viewport safe drift limit');
  }
  check(forward > 8, 'Normal scrolling visibly carries the entire card');
  const beforeStop = forward;
  const justStopped = driftTick(.5, fps);
  check(justStopped > beforeStop * .8, 'Stopping the scroll does not snap the card home');
  let stillSettling = false;
  for (let i = 0; i < fps * 3; i += 1) {
    const y = driftTick(.5, fps);
    if (manager.getProfileProgress() === .5 && y > .02) stillSettling = true;
  }
  check(stillSettling, 'Card continues to settle after the cached reading progress stops changing');
  near(cardY(), 0, 'Stopped card returns exactly to its resting alignment');
  const writes = statement.writes;
  for (let i = 0; i < fps; i += 1) driftTick(.5, fps);
  equal(statement.writes, writes, 'Resting cards do not cause idle style writes');
  let reverse = 0;
  for (let i = 1; i <= fps; i += 1) reverse = driftTick(.5 - .04 * i / fps, fps);
  check(reverse < -8 && reverse >= -27, 'Reverse scrolling gently carries the card in the opposite direction');
  driftRuns.push({ fps, forward, justStopped, reverse });
}
// The site's existing Euler scroll damping varies slightly with frame length.
check(Math.max(...driftRuns.map((run) => run.forward)) - Math.min(...driftRuns.map((run) => run.forward)) < 3, `30 60 and 120 Hz stay within three pixels ${JSON.stringify(driftRuns)}`);
document.hidden = true; controller.update();
near(cardY(), 0, 'Hidden page clears drift immediately');
document.hidden = false;
viewport.innerWidth = 390; viewport.innerHeight = 844;
restAt(.46);
for (let i = 1; i <= 30; i += 1) {
  const y = driftTick(.46 + .10 * i / 30);
  check(Math.abs(y) <= 16, 'Mobile drift remains capped at 16 pixels during fast scrolling');
}
check(cardY() > 5, 'Mobile retains a smaller visible motion');
motion.matches = true; controller.update();
near(cardY(), 0, 'Reduced motion removes the drift immediately');
motion.matches = false;
viewport.innerWidth = 1440; viewport.innerHeight = 900;
restAt(.25);
for (let i = 1; i <= 20; i += 1) driftTick(.25 + .03 * i / 20);
near(cardY(), 0, 'Introduction copy never activates video drift');
trigger.progress = 1;
controller.update(); logo.update({ deltaTime: 1 / 60 });
equal(container.style.visibility, 'hidden', 'Raw end boundary closes delayed profile DOM immediately');
check(mesh.scale.x > 2 && mesh.scale.x < 3, 'Raw end boundary retains the enlarged M for continuing PORTFOLIO growth');
check(mesh.position.y < 0, 'Raw end boundary retains the raised handoff anchor');
controller.out(); logo.out(); manager.out();
equal(lerper.get(driftKey), undefined, 'Lifecycle exit removes the card drift state');
equal(lerper.get(key), undefined, 'Consumer lifecycle exit leaves no shared damping state');
check(read('scripts/gl/main-logo.js').includes('topScrollManager.getProfileProgress()') && read('scripts/controllers/profile-story.js').includes('topScrollManager.getProfileProgress()'), 'Both production reading consumers call the shared manager API');
const assets = path.join(root, 'motdes/dist/_astro');
const built = fs.readdirSync(assets).filter((file) => file.endsWith('.js')).filter((file) => fs.readFileSync(path.join(assets, file), 'utf8').includes(key));
check(built.length > 0, 'Latest production build includes the shared profile resistance key');
const report = { status: 'passed', checks, resistanceMultiplier: .7, sharedKey: key, reached95Ms, settleThreshold: .00001,
  forwardReverseAndStopPassed: true, reducedInactiveAndBoundarySyncPassed: true, cleanupAndReentryPassed: true,
  actualConsumerProgressPassed: true, consumers, cardDriftPassed: true, driftRuns, built,
  scope: 'Narrow actual TopScrollManager and Lerper core VM plus three actual ProfileStoryController/MainLogo/layout checkpoints. Real Three objects without GPU rendering. Offline only.' };
fs.writeFileSync(path.join(root, 'analysis/profile-scroll/verification-damping.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
