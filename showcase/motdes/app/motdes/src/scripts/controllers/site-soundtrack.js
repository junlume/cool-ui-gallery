// Both web copies are attenuated to about -24 LUFS so phones that ignore
// media.volume still receive quiet background music.
const MUSIC_VOLUME = 0.7;
const STORAGE_KEY = 'motdes-music-muted';

export class SiteSoundtrackController {
  #audio = null;
  #opening = null;
  #button = null;
  #events = null;
  #modalObserver = null;
  #modal = null;
  #index = 0;
  #enabled = true;
  #started = false;
  #linked = true;
  #buffering = false;
  #away = false;
  #blocked = false;
  #failed = false;
  #playing = false;
  #hasPlayed = false;
  #pending = null;
  #pendingGesture = false;
  #request = 0;

  init() {
    this.dispose();
    this.#audio = document.querySelector('[data-site-music]');
    this.#opening = document.getElementById('coin-intro-video');
    this.#button = document.querySelector('[data-music-toggle]');
    if (!this.#audio || !this.#opening || !this.#button) return;
    this.#events = new AbortController();
    this.#index = 0;
    this.#enabled = true;
    try { this.#enabled = localStorage.getItem(STORAGE_KEY) !== 'true'; } catch { /* Private browsing uses the default. */ }
    this.#started = false;
    this.#linked = true;
    this.#buffering = false;
    this.#away = false;
    this.#blocked = false;
    this.#failed = false;
    this.#playing = false;
    this.#hasPlayed = false;
    const options = { signal: this.#events.signal };
    this.#audio.volume = MUSIC_VOLUME;
    this.#audio.loop = false;
    this.#audio.muted = !this.#enabled;
    this.#audio.src = this.#audio.dataset.openingSrc;
    this.#audio.addEventListener('error', () => {
      this.#failed = true;
      this.#pause();
    }, options);
    this.#audio.addEventListener('loadedmetadata', () => this.#syncOpening(), options);
    this.#audio.addEventListener('playing', () => {
      this.#playing = true;
      this.#hasPlayed = true;
      this.#render();
    }, options);
    for (const event of ['pause', 'waiting', 'ended']) {
      this.#audio.addEventListener(event, () => { this.#playing = false; this.#render(); }, options);
    }
    this.#audio.addEventListener('ended', this.#nextTrack, options);
    this.#opening.addEventListener('playing', this.#onOpeningPlaying, options);
    this.#opening.addEventListener('pause', this.#onOpeningPause, options);
    this.#opening.addEventListener('waiting', this.#onOpeningPause, options);
    this.#opening.addEventListener('seeking', this.#onOpeningPause, options);
    this.#opening.addEventListener('ended', this.releaseOpening, options);
    this.#opening.addEventListener('error', this.releaseOpening, options);
    this.#button.addEventListener('click', this.#toggle, options);
    // A real click must reach play directly rather than waiting for a later
    // video callback after the browser's user activation has expired.
    document.addEventListener('click', this.#onGesture, options);
    document.addEventListener('keydown', this.#onGesture, options);
    document.addEventListener('visibilitychange', this.#resume, options);
    window.addEventListener('pagehide', () => { this.#away = true; this.#pause(); }, options);
    window.addEventListener('pageshow', () => { this.#away = false; this.#resume(); }, options);
    this.#modal = document.querySelector('[data-video-modal]');
    if (this.#modal) {
      this.#modalObserver = new MutationObserver(this.#resume);
      this.#modalObserver.observe(this.#modal, { attributes: true, attributeFilter: ['open'] });
    }
    this.#button.hidden = false;
    this.#render();
    if (!this.#opening.paused && this.#opening.readyState >= 2) this.#onOpeningPlaying();
  }

  #canPlay(fromGesture = false) {
    return Boolean(this.#events && this.#started && this.#enabled && !this.#away
      && !this.#failed && !document.hidden && !this.#modal?.open
      && (fromGesture || !this.#linked || (!this.#opening.paused && !this.#buffering)));
  }

  #syncOpening() {
    if (!this.#linked || this.#index !== 0 || this.#audio?.readyState < 1) return;
    const time = this.#opening.currentTime;
    if (Number.isFinite(time) && Math.abs(this.#audio.currentTime - time) > 0.2) {
      try { this.#audio.currentTime = Math.min(time, Math.max(0, this.#audio.duration - 0.01)); } catch { /* Retry on metadata or the next playing event. */ }
    }
  }

  #play(fromGesture = false) {
    if (!this.#canPlay(fromGesture) || (!fromGesture && (this.#pending || this.#blocked))) return;
    const track = this.#audio;
    if (!fromGesture && !track.paused) return;
    this.#syncOpening();
    const request = ++this.#request;
    this.#pending = request;
    this.#pendingGesture = fromGesture;
    track.muted = false;
    // Keep this synchronous even while autoplay or the opening is loading.
    let playback;
    try { playback = track.play(); } catch (error) { this.#playFailed(request, error); return; }
    this.#render();
    Promise.resolve(playback).then(() => {
      if (request !== this.#request) {
        if (track !== this.#audio || !this.#canPlay()) track.pause();
        return;
      }
      this.#pending = null;
      this.#pendingGesture = false;
      this.#hasPlayed = true;
      this.#playing = !track.paused && track.readyState >= 2;
      // An early click authorizes this player Then wait for the first video
      // frame and resume the same element to keep picture and sound aligned.
      if (!this.#canPlay()) this.#pause();
      else this.#render();
    }).catch((error) => this.#playFailed(request, error));
  }

  #playFailed(request, error) {
    if (request !== this.#request) return;
    this.#pending = null;
    this.#pendingGesture = false;
    this.#playing = false;
    this.#blocked = error?.name === 'NotAllowedError';
    this.#failed = !this.#blocked && error?.name !== 'AbortError';
    this.#render();
  }

  #pause() {
    this.#request += 1;
    this.#pending = null;
    this.#pendingGesture = false;
    this.#playing = false;
    this.#audio?.pause();
    this.#render();
  }

  #onOpeningPlaying = () => {
    if (!this.#linked) return;
    this.#started = true;
    this.#buffering = false;
    this.#syncOpening();
    this.#play();
  };

  #onOpeningPause = () => {
    if (!this.#linked) return;
    this.#buffering = true;
    this.#pause();
  };

  // The nine-second reveal must not truncate the ninety-two-second song.
  releaseOpening = () => {
    if (!this.#events || !this.#linked) return;
    this.#linked = false;
    this.#buffering = false;
    this.#started = true;
    this.#play();
  };

  #nextTrack = () => {
    if (!this.#events || this.#index !== 0) return;
    this.#pause();
    this.#index = 1;
    this.#linked = false;
    this.#failed = false;
    this.#blocked = false;
    // WebKit grants playback per element Reuse the one activated by the user.
    this.#audio.loop = true;
    this.#audio.src = this.#audio.dataset.loopSrc;
    this.#audio.load();
    this.#play();
  };

  #resume = () => {
    if (!this.#canPlay()) this.#pause();
    else this.#play();
  };

  #activate() {
    this.#enabled = true;
    this.#started = true;
    this.#blocked = false;
    if (this.#failed) {
      this.#failed = false;
      this.#audio.load();
    }
    try { localStorage.setItem(STORAGE_KEY, 'false'); } catch { /* Keep the in-memory choice. */ }
    this.#play(true);
    this.#render();
  }

  #onGesture = (event) => {
    if (this.#button.contains(event.target) || !this.#enabled || this.#hasPlayed || this.#pendingGesture) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    this.#activate();
  };

  #toggle = () => {
    // Enabled preference is not playback An early click must start music
    // instead of accidentally saving a permanent mute.
    if (!this.#isPlaying() && !this.#pendingGesture) { this.#activate(); return; }
    this.#enabled = false;
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* Keep the in-memory choice. */ }
    this.#audio.muted = true;
    this.#pause();
  };

  #isPlaying() {
    return this.#canPlay() && this.#playing && !this.#audio.paused && !this.#audio.muted;
  }

  #render() {
    if (!this.#button) return;
    const active = Boolean(this.#isPlaying());
    const state = this.#failed ? 'error' : !this.#enabled ? 'off' : this.#blocked ? 'blocked'
      : active ? 'on' : this.#pending ? 'loading' : this.#hasPlayed ? 'paused' : 'idle';
    this.#button.dataset.state = state;
    this.#button.setAttribute('aria-pressed', String(active));
    this.#button.setAttribute('aria-label', active ? '关闭音乐' : '开启音乐');
    this.#button.textContent = state === 'error' ? '点击重试声音' : state === 'on' ? '音乐已开启'
      : state === 'loading' ? '声音加载中' : state === 'paused' ? '音乐暂时暂停' : '点击开启声音';
  }

  dispose() {
    this.#events?.abort();
    this.#events = null;
    this.#modalObserver?.disconnect();
    this.#modalObserver = null;
    this.#pause();
    if (this.#button) this.#button.hidden = true;
    this.#audio = this.#opening = this.#button = this.#modal = null;
  }
}

export const siteSoundtrackController = new SiteSoundtrackController();
