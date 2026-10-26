const REVEAL_SECONDS = 0.72;
// 录屏标注在拉远开始；提前一帧启动，让屏幕边缘与甩手同时可见。
const REVEAL_BEFORE_PULLBACK_SECONDS = 1 / 60;
const PROGRESS_COMPLETE_LEAD_SECONDS = 1;
const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** 百分比跟随视频时间，在甩手前一秒到 100%；缓冲时同步暂停。 */
class CoinOpeningController {
  #intro;
  #loop;
  #overlay;
  #progress;
  #percent;
  #skip;
  #gl;
  #lenis;
  #events;
  #state = 'idle';
  #ready;
  #resourcesReady = false;
  #loopReady = false;
  #gated = false;
  #lastPercent = -1;
  #revealStart = 0;
  #revealMediaStart = 0;
  #introTailSeconds = 0;
  #introTailActive = false;
  #loopSwitchPending = false;
  #loopPlaybackBlocked = false;
  #loopPlayPending = false;
  #onReveal;
  #onComplete;
  #resolve;
  #generation = 0;

  get active() { return this.#state !== 'idle'; }

  init({ gl, lenis, onReveal, onComplete }) {
    this.dispose();
    this.#intro = document.getElementById('coin-intro-video');
    this.#loop = document.getElementById('coin-loop-video');
    this.#overlay = document.getElementById('coin-opening');
    if (!this.#intro || !this.#loop || !this.#overlay) return false;
    this.#progress = document.getElementById('coin-progress');
    this.#percent = this.#progress.querySelector('[data-coin-percent]');
    this.#skip = document.getElementById('coin-skip');
    this.#gl = gl;
    this.#lenis = lenis;
    this.#onReveal = onReveal;
    this.#onComplete = onComplete;
    this.#events = new AbortController();
    this.#state = 'loading';
    this.#resourcesReady = false;
    this.#loopReady = false;
    this.#gated = false;
    this.#loopPlaybackBlocked = false;
    this.#loopPlayPending = false;
    this.#introTailActive = false;
    this.#introTailSeconds = 0;
    this.#loopSwitchPending = false;
    this.#lastPercent = -1;
    this.#overlay.hidden = false;
    this.#overlay.removeAttribute('data-revealing');
    this.#overlay.removeAttribute('data-progress-hidden');
    this.#skip.textContent = '跳过动画';
    this.#skip.disabled = false;
    document.body.dataset.coinState = 'loading';
    document.body.dataset.coinAtTop = 'true';
    this.#setPercent(0);
    this.#intro.muted = this.#loop.muted = true;
    this.#intro.currentTime = this.#loop.currentTime = 0;
    this.#lenis.stop();
    this.#lenis.scrollTo(0, { immediate: true, force: true });
    this.#gl.setCoinOrbitIntro(0);
    const options = { signal: this.#events.signal };
    this.#intro.addEventListener('ended', this.#onIntroEnded, options);
    this.#skip.addEventListener('click', () => this.#reveal(), options);
    this.#intro.addEventListener('error', () => {
      if (this.#introTailActive) this.#switchToLoop();
      else this.#reveal();
    }, options);
    document.addEventListener('visibilitychange', this.#onVisibility, options);
    window.addEventListener('pagehide', () => {
      this.#intro.pause();
      this.#loop.pause();
    }, options);
    window.addEventListener('pageshow', this.#onVisibility, options);
    // 低电量模式等环境拦截静音自动播放时，首次触摸恢复播放。
    document.addEventListener('pointerdown', this.#retryPlayback, options);
    document.addEventListener('keydown', this.#retryPlayback, options);
    return true;
  }

  async run(resourcePromise) {
    if (this.#state !== 'loading') return;
    const generation = this.#generation;
    const complete = new Promise((resolve) => { this.#resolve = resolve; });
    const loopReady = this.#firstFrame(this.#loop).then(() => {
      if (generation !== this.#generation) return;
      this.#loopReady = true;
      this.#gl.prepareCoinVideo(this.#loop);
    }).catch((error) => {
      if (generation !== this.#generation) return;
      console.warn('循环视频暂时无法播放，将保留作品展示。', error);
    });
    this.#ready = Promise.allSettled([resourcePromise, loopReady]).then((results) => {
      if (generation !== this.#generation) return;
      for (const result of results) {
        if (result.status === 'rejected') console.warn('部分场景预加载未完成，继续进入页面。', result.reason);
      }
      this.#resourcesReady = true;
      if (this.#gated && this.#state === 'loading') {
        this.#gated = false;
        if (!document.hidden) this.#play(this.#intro);
      }
    });
    try {
      await this.#firstFrame(this.#intro);
      if (generation === this.#generation && this.#state === 'loading') {
        this.#gl.prepareCoinVideo(this.#intro);
        this.#gl.setCoinVideo(this.#intro);
        this.#gl.setCoinVideoMix(1);
        if (!document.hidden) await this.#play(this.#intro);
      }
    } catch {
      if (generation === this.#generation) this.#reveal();
    }
    return complete;
  }

  #firstFrame(video) {
    if (video.readyState >= 2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = (error) => {
        clearTimeout(timer);
        video.removeEventListener('loadeddata', loaded);
        video.removeEventListener('error', failed);
        error ? reject(error) : resolve();
      };
      const loaded = () => done();
      const failed = () => done(new Error('Video could not be decoded'));
      const timer = setTimeout(() => done(new Error('Video readiness timed out')), 20000);
      video.addEventListener('loadeddata', loaded, { once: true });
      video.addEventListener('error', failed, { once: true });
      video.load();
    });
  }

  async #play(video) {
    const generation = this.#generation;
    const isLoop = video === this.#loop;
    if (isLoop && this.#loopPlayPending) return false;
    if (isLoop) this.#loopPlayPending = true;
    try {
      await video.play();
      if (generation !== this.#generation) {
        if (this.#state === 'idle' || (video !== this.#intro && video !== this.#loop)) video.pause();
        return false;
      }
      if (document.hidden) {
        video.pause();
        return false;
      }
      if (video === this.#intro) this.#skip.textContent = '跳过动画';
      if (isLoop) this.#loopPlaybackBlocked = false;
      return true;
    } catch {
      if (generation !== this.#generation) return false;
      if (video === this.#intro && this.#state === 'loading') this.#skip.textContent = '进入网站';
      if (isLoop) this.#loopPlaybackBlocked = true;
      return false;
    } finally {
      if (generation === this.#generation && isLoop) this.#loopPlayPending = false;
    }
  }

  #setPercent(value) {
    const rounded = Math.max(0, Math.min(100, Math.floor(value)));
    if (rounded === this.#lastPercent) return;
    this.#lastPercent = rounded;
    this.#percent.textContent = String(rounded);
    this.#progress.setAttribute('aria-valuenow', String(rounded));
  }

  async #reveal(continueIntro = false) {
    if (this.#state !== 'loading') return;
    this.#state = 'waiting';
    this.#skip.disabled = true;
    const generation = this.#generation;
    await this.#ready;
    if (generation !== this.#generation) return;
    this.#introTailActive = continueIntro && !this.#intro.ended && this.#intro.readyState >= 2;
    this.#revealMediaStart = this.#intro.currentTime;
    this.#introTailSeconds = 0;
    if (this.#introTailActive) {
      // 环绕先出，人物仍播放同一段拉远；不提前跳到已落稳的循环首帧。
      this.#gl.setCoinVideo(this.#intro);
      this.#gl.setCoinVideoMix(1);
      if (!document.hidden && this.#intro.paused) this.#play(this.#intro);
    } else {
      this.#intro.pause();
      this.#loop.currentTime = 0;
      if (this.#loopReady && !document.hidden) await this.#play(this.#loop);
      if (generation !== this.#generation) return;
      this.#gl.setCoinVideo(this.#loopReady ? this.#loop : null);
      this.#gl.setCoinVideoMix(this.#loopReady ? 1 : 0);
    }
    this.#gl.completeLoadingImmediately();
    this.#gl.setCoinOrbitIntro(0);
    this.#setPercent(100);
    this.#state = 'revealing';
    this.#revealStart = performance.now();
    document.body.dataset.coinState = 'revealing';
    document.body.dataset.gl_loading_end = 'true';
    this.#onReveal?.();
    if (this.#introTailActive) {
      // GL 已持续采样同一个 intro，直接交出遮罩，不等待 loop.play 或额外一帧。
      this.#overlay.setAttribute('data-revealing', '');
    } else {
      requestAnimationFrame(() => {
        if (generation === this.#generation) this.#overlay.setAttribute('data-revealing', '');
      });
    }
  }

  #onIntroEnded = () => {
    if (this.#state === 'loading') this.#reveal();
    else if (this.#introTailActive) this.#switchToLoop();
  };

  async #switchToLoop() {
    if (!this.#introTailActive || this.#loopSwitchPending) return;
    this.#loopSwitchPending = true;
    const generation = this.#generation;
    this.#introTailSeconds = Math.max(0, this.#intro.currentTime - this.#revealMediaStart);
    if (this.#loopReady && !document.hidden) await this.#play(this.#loop);
    if (generation !== this.#generation) return;
    if (this.#loopReady) this.#gl.setCoinVideo(this.#loop);
    this.#introTailActive = false;
    this.#loopSwitchPending = false;
    this.#overlay.hidden = true;
  }

  update() {
    if (this.#state === 'idle' || !this.#intro) return;
    if (this.#state === 'loading') {
      const duration = this.#intro.duration;
      if (Number.isFinite(duration) && duration > 0) {
        const arrivalStart = Number(this.#intro.dataset.arrivalStart) || duration;
        const revealAt = Math.max(0, Math.min(duration, arrivalStart) - REVEAL_BEFORE_PULLBACK_SECONDS);
        const progressEnd = Math.max(0, revealAt - PROGRESS_COMPLETE_LEAD_SECONDS);
        this.#setPercent(progressEnd > 0 ? (this.#intro.currentTime / progressEnd) * 100 : 100);
        // 先准备好场景，再完整播放近景→拉远；不要在镜头拉远途中停住。
        const preloadDeadline = Math.max(0, Math.min(duration, arrivalStart) - 0.12);
        if (!this.#resourcesReady && this.#intro.currentTime >= preloadDeadline) {
          this.#intro.pause();
          this.#gated = true;
        } else if (this.#resourcesReady && !document.hidden && this.#intro.currentTime >= revealAt) {
          this.#reveal(true);
        }
      }
      return;
    }
    if (this.#state === 'waiting') return;
    if (this.#state === 'revealing') {
      const elapsed = this.#introTailActive
        ? Math.max(0, this.#intro.currentTime - this.#revealMediaStart)
        : this.#loopReady && !this.#loopPlaybackBlocked
          ? this.#introTailSeconds + this.#loop.currentTime
          : (performance.now() - this.#revealStart) / 1000;
      const progress = clamp01(elapsed / REVEAL_SECONDS);
      // 前 0.2 秒走完约 80%，余下距离柔和刹停，与甩手的速度感一致。
      this.#gl.setCoinOrbitIntro(1 - (1 - progress) ** 5);
      if (elapsed > 0.06) this.#overlay.setAttribute('data-progress-hidden', '');
      // intro 播完前只让上层透明，避免 display:none 抑制其视频帧更新。
      if (elapsed > 0.32 && !this.#introTailActive) this.#overlay.hidden = true;
      if (progress >= 1) {
        this.#state = 'ready';
        this.#gl.setCoinOrbitIntro(null);
        if (!this.#introTailActive) this.#overlay.hidden = true;
        document.body.dataset.coinState = 'ready';
        this.#lenis.start();
        this.#onComplete?.();
        this.#resolve?.();
        this.#resolve = null;
      }
    }
    if (this.#state === 'ready' || this.#state === 'revealing') {
      const scrollY = this.#lenis.scroll;
      document.body.dataset.coinAtTop = String(scrollY < 40);
      // 人物继续替代首页主背景，ABOUT 的独立 M 随亮底场景正常入场。
      // 后续内容完全盖住背景后才暂停解码，回滚露出背景前恢复。
      const mission = document.querySelector('[data-top_section="mission_in"]');
      const covered = mission && mission.getBoundingClientRect().top < -window.innerHeight * 0.25;
      if (this.#state === 'ready' && this.#loopReady && !this.#introTailActive) {
        if (covered && !this.#loop.paused) this.#loop.pause();
        else if (!covered && this.#loop.paused && !this.#loopPlaybackBlocked && !document.hidden) this.#play(this.#loop);
      }
    }
  }

  #retryPlayback = () => {
    if (document.hidden) return;
    if (this.#state === 'loading' && !this.#gated && this.#intro.paused) this.#play(this.#intro);
    if ((this.#state === 'ready' || this.#state === 'revealing') && this.#introTailActive && this.#intro.paused) {
      if (this.#intro.ended || this.#loopSwitchPending) this.#switchToLoop();
      else this.#play(this.#intro);
    }
    if ((this.#state === 'ready' || this.#state === 'revealing') && !this.#introTailActive && this.#loopReady && this.#loop.paused) {
      this.#loopPlaybackBlocked = false;
      this.#play(this.#loop);
    }
  };

  #onVisibility = () => {
    if (document.hidden) {
      this.#intro.pause();
      this.#loop.pause();
    } else {
      if (this.#state === 'loading' && !this.#gated) this.#play(this.#intro);
      if ((this.#state === 'ready' || this.#state === 'revealing') && this.#introTailActive) {
        if (this.#intro.ended || this.#loopSwitchPending) this.#switchToLoop();
        else this.#play(this.#intro);
      } else if (this.#state === 'revealing' && this.#loopReady) this.#play(this.#loop);
      if (this.#state === 'ready') this.update();
    }
  };

  dispose() {
    this.#generation += 1;
    this.#events?.abort();
    this.#intro?.pause();
    this.#loop?.pause();
    this.#resolve?.();
    this.#resolve = null;
    this.#state = 'idle';
    this.#introTailActive = false;
    this.#loopSwitchPending = false;
    if (this.#gl) {
      this.#gl.setCoinVideoMix(0);
      this.#gl.setCoinVideo(null);
      this.#gl.setCoinOrbitIntro(null);
    }
  }
}

export const coinOpeningController = new CoinOpeningController();
