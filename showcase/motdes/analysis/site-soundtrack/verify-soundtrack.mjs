import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'motdes/src/scripts/controllers/site-soundtrack.js'), 'utf8');
let checks = 0;
const equal = (a, b, reason) => { assert.deepEqual(a, b, reason); checks++; };
const ok = (a, reason) => { assert.ok(a, reason); checks++; };
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
let userActivation = false;
const gesture = (fn) => { userActivation = true; try { fn(); } finally { userActivation = false; } };
const FIRST = '/sounds/opening-first.mp3', LOOP = '/sounds/ambient-loop.mp3';

class Media extends EventTarget {
  paused = true; currentTime = 0; duration = 92.2; readyState = 2;
  muted = false; loop = false; volume = 1; playCalls = 0; loadCalls = 0;
  mode = 'success'; requireGesture = false; authorized = false; requests = [];
  dataset = { openingSrc: FIRST, loopSrc: LOOP };
  _src = FIRST;
  get src() { return this._src; }
  set src(value) { this._src = value; this.currentTime = 0; this.paused = true; this.duration = value === LOOP ? 82.03 : 92.2; }
  emit(type) { this.dispatchEvent(new Event(type)); }
  play() {
    this.playCalls++;
    this.requests.push({ src: this.src, gesture: userActivation });
    if (this.requireGesture && userActivation) this.authorized = true;
    if (this.mode === 'blocked' || (this.requireGesture && !this.authorized))
      return Promise.reject(Object.assign(new Error('User activation needed'), { name: 'NotAllowedError' }));
    if (this.mode === 'unsupported') return Promise.reject(Object.assign(new Error('Decode failed'), { name: 'NotSupportedError' }));
    if (this.mode === 'throws') throw Object.assign(new Error('Synchronous denial'), { name: 'NotAllowedError' });
    if (this.mode === 'pending') return new Promise((resolve) => {
      this.finish = () => { this.paused = false; this.emit('playing'); resolve(); };
    });
    this.paused = false;
    this.emit('playing');
    return Promise.resolve();
  }
  pause() { const changed = !this.paused; this.paused = true; if (changed) this.emit('pause'); }
  load() { this.loadCalls++; this.readyState = 2; this.currentTime = 0; }
}
class Button extends EventTarget {
  dataset = {}; attributes = {}; hidden = true; textContent = '';
  setAttribute(key, value) { this.attributes[key] = value; }
  contains(target) { return target === this; }
}
function fixture(saved = null, storageThrows = false, requireGesture = false) {
  const audio = new Media(), video = new Media(), button = new Button();
  audio.requireGesture = requireGesture; video.duration = 9.366667;
  const modal = { open: false }, doc = new EventTarget(), win = new EventTarget();
  doc.hidden = false;
  doc.getElementById = () => video;
  doc.querySelector = (s) => s === '[data-music-toggle]' ? button : s === '[data-site-music]' ? audio : modal;
  const storage = new Map(saved === null ? [] : [['motdes-music-muted', saved]]);
  const context = vm.createContext({
    document: doc, window: win, AbortController, console,
    localStorage: {
      getItem(k) { if (storageThrows) throw new Error('Denied'); return storage.get(k); },
      setItem(k, v) { if (storageThrows) throw new Error('Denied'); storage.set(k, v); },
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { target.observer = this; }
      disconnect() { modal.observer = null; }
    },
  });
  vm.runInContext(source.replace(/^export /gm, '') + '\nglobalThis.Subject = SiteSoundtrackController;', context);
  const controller = new context.Subject(); controller.init();
  const playVideo = (time = video.currentTime) => { video.paused = false; video.currentTime = time; video.emit('playing'); };
  const visibility = (hidden) => { doc.hidden = hidden; doc.dispatchEvent(new Event('visibilitychange')); };
  const modalOpen = (open) => { modal.open = open; modal.observer?.callback(); };
  const clickButton = () => gesture(() => {
    button.dispatchEvent(new Event('click'));
    // Model the same click bubbling from the button to the document.
    const bubbled = new Event('click'); Object.defineProperty(bubbled, 'target', { value: button });
    doc.dispatchEvent(bubbled);
  });
  const clickPage = () => gesture(() => doc.dispatchEvent(new Event('click')));
  return { controller, audio, video, button, doc, win, modal, storage, playVideo, visibility, modalOpen, clickButton, clickPage };
}

// Regression The old code reported on before playback and saved a mute when
// the user clicked while the opening was loading without ever calling play.
const early = fixture(null, false, true);
equal(early.button.attributes['aria-pressed'], 'false', 'Startup cannot claim audible music');
equal(early.button.textContent, '点击开启声音', 'A visible activation prompt exists before the first frame');
early.clickButton();
equal(early.audio.playCalls, 1, 'Early activation reaches play synchronously');
ok(early.audio.requests[0].gesture, 'The early request retains real gesture context');
equal(early.storage.get('motdes-music-muted'), 'false', 'Early click enables music instead of saving mute');
await settle();
ok(early.audio.paused, 'Activated audio waits for the opening frame to stay synchronized');
early.playVideo(0); await settle();
ok(!early.audio.paused && early.audio.authorized, 'The same authorized player resumes at the first frame');
equal(early.button.textContent, '音乐已开启', 'Only confirmed playing reports music on');
early.controller.dispose();

const f = fixture();
equal(f.audio.playCalls, 0, 'Default music waits for actual opening playback');
equal([f.audio.src, f.audio.loop, f.audio.volume], [FIRST, false, .7], 'Opening song uses quiet volume without looping');
f.playVideo(0); await settle();
ok(!f.audio.paused, 'The first song starts with the opening');
f.audio.currentTime = 3; f.video.emit('waiting');
ok(f.audio.paused, 'Video buffering pauses the linked song');
equal(f.button.attributes['aria-pressed'], 'false', 'A paused player is not reported as audible');
f.playVideo(4.3); await settle();
equal(f.audio.currentTime, 4.3, 'Buffer recovery aligns the music to the video');
f.controller.releaseOpening();
f.video.paused = true; f.video.emit('pause'); f.video.emit('ended');
ok(!f.audio.paused && f.audio.src === FIRST, 'The nine-second reveal does not truncate the first song');
f.audio.currentTime = 50; f.playVideo(0); await settle();
equal(f.audio.currentTime, 50, 'Visual replay cannot restart a released song');
f.visibility(true); ok(f.audio.paused, 'Hidden tabs pause audio');
f.visibility(false); await settle(); ok(!f.audio.paused, 'Returning resumes audio');
equal(f.audio.currentTime, 50, 'Visibility recovery keeps the playhead');
f.audio.currentTime = 92.2; f.audio.paused = true; f.audio.emit('ended'); await settle();
equal([f.audio.src, f.audio.loop, f.audio.paused], [LOOP, true, false], 'The same player switches to the second looping song');
equal(f.audio.currentTime, 0, 'The loop starts at its beginning');
f.audio.currentTime = 24; f.playVideo(0); await settle();
equal(f.audio.currentTime, 24, 'Opening events cannot restart the second song');
f.clickButton();
ok(f.audio.paused && f.audio.muted, 'Mute silences the player immediately');
equal(f.storage.get('motdes-music-muted'), 'true', 'Explicit mute is saved');
f.clickPage(); await settle(); ok(f.audio.paused, 'Ordinary page clicks respect explicit mute');
f.clickButton(); await settle(); ok(!f.audio.paused, 'Explicit activation resumes the current loop');
equal(f.audio.currentTime, 24, 'Unmute keeps loop position');
equal(f.button.attributes['aria-pressed'], 'true', 'Accessible state follows playback');
f.modalOpen(true); ok(f.audio.paused, 'Case dialogs pause background music');
f.modalOpen(false); await settle(); ok(!f.audio.paused, 'Closing a dialog resumes the loop');
f.win.dispatchEvent(new Event('pagehide')); ok(f.audio.paused, 'Page navigation suspends music');
f.visibility(false); await settle(); ok(f.audio.paused, 'Visibility alone cannot resume a departed page');
f.win.dispatchEvent(new Event('pageshow')); await settle(); ok(!f.audio.paused, 'Page restoration resumes the loop');
f.controller.dispose();
ok(f.audio.paused && f.button.hidden, 'Disposal stops music and hides its control');
equal(f.modal.observer, null, 'Disposal removes dialog observation');
const disposedCalls = f.audio.playCalls;
f.playVideo(); f.clickButton(); f.clickPage(); f.audio.emit('ended'); f.win.dispatchEvent(new Event('pageshow'));
await settle(); equal(f.audio.playCalls, disposedCalls, 'Disposed listeners cannot restart playback');

const blocked = fixture(null, false, true);
blocked.playVideo(1.7); await settle();
equal(blocked.button.textContent, '点击开启声音', 'Autoplay rejection shows the activation prompt');
equal(blocked.button.attributes['aria-pressed'], 'false', 'Blocked autoplay is not reported as audible');
blocked.playVideo(2); await settle(); equal(blocked.audio.playCalls, 1, 'Video callbacks do not spam blocked requests');
blocked.video.currentTime = 3.2; blocked.clickPage();
ok(blocked.audio.requests.at(-1).gesture, 'A page click retries synchronously within user activation');
await settle(); ok(!blocked.audio.paused, 'A real page click recovers blocked autoplay');
equal(blocked.audio.currentTime, 3.2, 'Late activation aligns to the opening frame');
blocked.controller.releaseOpening(); blocked.audio.emit('ended'); await settle();
ok(blocked.audio.src === LOOP && !blocked.audio.paused, 'Per-element authorization carries into the second song without another click');
blocked.audio.mode = 'blocked'; blocked.audio.pause(); blocked.visibility(true); blocked.visibility(false); await settle();
equal(blocked.button.dataset.state, 'blocked', 'A later playback denial offers a retry');
blocked.audio.mode = 'success'; blocked.clickButton(); await settle(); ok(!blocked.audio.paused, 'An explicit retry can recover a later denial');
blocked.controller.dispose();

const buffering = fixture(null, false, true);
buffering.playVideo(); await settle(); buffering.video.emit('waiting');
buffering.clickButton();
ok(buffering.audio.authorized, 'A click during video buffering still reaches the player');
await settle(); buffering.playVideo(2.4); await settle();
ok(!buffering.audio.paused, 'Buffer recovery resumes the newly authorized song');
equal(buffering.audio.currentTime, 2.4, 'Recovery stays synchronized');
buffering.controller.dispose();

const skip = fixture(); skip.controller.releaseOpening(); await settle();
ok(!skip.audio.paused && skip.audio.src === FIRST, 'Skipping or failing the opening still starts the first song');
equal(skip.audio.currentTime, 0, 'Skipping before the video starts begins music at zero');
skip.controller.dispose();

const saved = fixture('true', false, true); saved.playVideo(4); await settle(); saved.clickPage();
equal(saved.audio.playCalls, 0, 'Saved mute blocks autoplay and incidental page clicks');
saved.clickButton(); await settle(); ok(!saved.audio.paused, 'Explicit activation clears saved mute');
saved.controller.dispose();

const keyboard = fixture(null, false, true); keyboard.playVideo(); await settle();
const key = new Event('keydown'); Object.defineProperty(key, 'key', { value: 'Enter' });
gesture(() => keyboard.doc.dispatchEvent(key)); await settle();
ok(!keyboard.audio.paused, 'Keyboard activation supports sound');
keyboard.controller.dispose();

const privateMode = fixture(null, true); privateMode.playVideo(); await settle();
ok(!privateMode.audio.paused, 'Unavailable storage does not break playback');
privateMode.clickButton(); ok(privateMode.audio.paused, 'Storage errors do not prevent muting');
privateMode.controller.dispose();

// Pending autoplay must not consume the only click capable of starting sound.
const pendingAuto = fixture(); pendingAuto.audio.mode = 'pending'; pendingAuto.playVideo();
equal(pendingAuto.button.attributes['aria-pressed'], 'false', 'An unresolved request does not report sound on');
const finishOld = pendingAuto.audio.finish;
pendingAuto.audio.mode = 'success'; pendingAuto.clickButton();
equal(pendingAuto.audio.playCalls, 2, 'A gesture replaces a pending automatic request');
ok(pendingAuto.audio.requests.at(-1).gesture, 'The replacement retains user activation');
await settle(); finishOld(); await settle();
ok(!pendingAuto.audio.paused, 'A stale automatic result does not interrupt successful activation');
pendingAuto.controller.dispose();

const pending = fixture(); pending.controller.releaseOpening(); await settle(); pending.clickButton();
pending.audio.mode = 'pending'; pending.clickButton();
equal(pending.button.textContent, '声音加载中', 'A user request shows loading until it resolves');
pending.clickButton(); pending.audio.finish(); await settle();
ok(pending.audio.paused && pending.audio.muted, 'Late playback cannot override canceled user activation');
pending.audio.mode = 'success'; pending.clickButton(); await settle();
ok(!pending.audio.paused, 'The player recovers after cancellation');
pending.controller.dispose();

const late = fixture(); late.audio.mode = 'pending'; late.playVideo();
late.controller.dispose(); late.audio.finish(); await settle();
ok(late.audio.paused, 'Late play success after disposal cannot leave music running');

const error = fixture(); error.audio.mode = 'unsupported'; error.playVideo(); await settle();
equal(error.button.textContent, '点击重试声音', 'Decode errors show a usable retry instead of music on');
error.audio.mode = 'success'; error.clickButton(); await settle();
ok(!error.audio.paused && error.audio.loadCalls === 1, 'Retry reloads a failed asset and starts within activation');
error.controller.dispose();

const synchronous = fixture(); synchronous.audio.mode = 'throws'; synchronous.playVideo(); await settle();
equal(synchronous.button.dataset.state, 'blocked', 'A synchronous media exception cannot break page boot');
synchronous.audio.mode = 'success'; synchronous.clickButton(); await settle();
ok(!synchronous.audio.paused, 'Synchronous failure remains recoverable');
synchronous.controller.dispose();

const reentry = fixture(); reentry.playVideo(); await settle();
reentry.controller.releaseOpening(); reentry.audio.emit('ended'); await settle();
reentry.controller.dispose(); reentry.video.paused = true;
reentry.controller.init(); equal([reentry.audio.src, reentry.audio.loop], [FIRST, false], 'Reentry resets the reused player to the first song');
reentry.playVideo(0); await settle();
equal(reentry.audio.playCalls, 3, 'Reentry adds exactly one listener set');
reentry.controller.dispose();

const layout = fs.readFileSync(path.join(root, 'motdes/src/layouts/Layout.astro'), 'utf8');
equal((layout.match(/<audio\s/g) || []).length, 1, 'The page contains one soundtrack player');
for (const asset of ['opening-first.mp3', 'ambient-loop.mp3']) {
  ok(fs.statSync(path.join(root, 'motdes/public/sounds', asset)).size > 100000, 'Bundled ' + asset + ' exists');
  ok(layout.includes('/sounds/' + asset), asset + ' is wired to the actual page');
}
const main = fs.readFileSync(path.join(root, 'motdes/src/scripts/main.js'), 'utf8');
const coinBoot = main.slice(main.indexOf('async function bootCoinOpening()'), main.indexOf('\n\n\n/**', main.indexOf('async function bootCoinOpening()')));
ok(!coinBoot.includes('bindSectionSounds'), 'The current opening does not request absent legacy sound effects');
const report = { passed: true, checks, firstTrackSeconds: 92.212208, loopTrackSeconds: 82.032,
  scope: 'Actual controller tested offline with media events promise races user activation and per-element playback policy fixtures plus real asset wiring Browser audio output remains unverified' };
fs.writeFileSync(path.join(root, 'analysis/site-soundtrack/verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
