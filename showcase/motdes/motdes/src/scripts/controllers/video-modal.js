import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gl } from '../gl/index.js';
import { SERVICE_CASES } from '../../lib/service-cases.js';
import { rectCorners, validVideoQuad, fitVideoRect, interpolateVideoQuad, videoQuadTransform } from '../../lib/video-focus.js';

/** Expand the current GL case into a centered player, then return to the same window. */
export class VideoModalController {
  #dialog;
  #stage;
  #shade;
  #preview;
  #video;
  #closeButton;
  #lenis;
  #isOpen = false;
  #phase = 'idle';
  #returnY = 0;
  #returnFocus;
  #wasStopped = false;
  #snapTriggers = [];
  #backdropPressed = false;
  #restorePosition = true;
  #playGeneration = 0;
  #motionGeneration = 0;
  #motion = null;
  #previewMotion = null;
  #sourceFrame = null;
  #sourceIndex = -1;
  #originQuad = null;
  #currentQuad = null;
  #size = null;
  #veil = 0;
  #waitingSeek = false;

  in(lenis) {
    this.out();
    this.#dialog = document.querySelector('[data-video-modal]');
    if (!this.#dialog) return;
    this.#lenis = lenis;
    this.#stage = this.#dialog.querySelector('[data-video-player]');
    this.#shade = this.#dialog.querySelector('[data-video-shade]');
    this.#preview = this.#dialog.querySelector('[data-video-preview]');
    this.#video = this.#dialog.querySelector('video');
    this.#closeButton = this.#dialog.querySelector('[data-video-close]');
    document.addEventListener('click', this.#onOpen, true);
    this.#dialog.addEventListener('pointerdown', this.#onPointerDown);
    this.#dialog.addEventListener('click', this.#onBackdrop);
    this.#dialog.addEventListener('cancel', this.#onCancel);
    this.#dialog.addEventListener('close', this.#onDialogClose);
    this.#closeButton.addEventListener('click', this.#onClose);
    this.#video.addEventListener('loadedmetadata', this.#onMetadata);
    this.#video.addEventListener('loadeddata', this.#onVideoReady);
    this.#video.addEventListener('seeked', this.#onSeeked);
    window.addEventListener('resize', this.#onResize);
  }

  #getFrame() {
    try { return gl.getServiceVideoFrame(this.#sourceIndex); } catch { return null; }
  }

  #fit(aspect) {
    this.#size = fitVideoRect(window.innerWidth, window.innerHeight, aspect);
    this.#stage.style.width = `${this.#size.width}px`;
    this.#stage.style.height = `${this.#size.height}px`;
    return rectCorners(this.#size);
  }

  #onOpen = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('[data-video-open]');
    if (!link || !this.#dialog?.showModal) return;
    event.preventDefault();
    if (this.#isOpen) return;
    this.#returnY = window.scrollY;
    this.#returnFocus = link;
    const serviceId = link.closest('[data-service_item]')?.dataset.service_id;
    this.#sourceIndex = SERVICE_CASES.findIndex((item) => serviceId ? item.id === serviceId
      : new URL(item.video, window.location.href).href === link.href);
    this.#sourceFrame = this.#getFrame();
    this.#wasStopped = this.#lenis.isStopped;
    this.#restorePosition = true;
    this.#isOpen = true;
    this.#phase = 'opening';
    const generation = ++this.#playGeneration;
    this.#snapTriggers = ScrollTrigger.getAll().filter((trigger) => trigger.enabled && trigger.vars.snap);
    this.#snapTriggers.forEach((trigger) => trigger.disable(false));
    this.#lenis.stop();
    this.#dialog.setAttribute('aria-label', `播放${link.dataset.videoOpen}`);
    this.#video.controls = false;
    this.#waitingSeek = false;
    const target = this.#fit(this.#sourceFrame?.aspect || 16 / 9);
    const sourceQuad = this.#sourceFrame?.corners;
    const fallback = link.getBoundingClientRect();
    this.#currentQuad = validVideoQuad(sourceQuad) ? sourceQuad
      : fallback.width > 16 && fallback.height > 16 ? rectCorners(fallback) : target;
    this.#originQuad = this.#currentQuad.map((p) => ({ ...p }));
    this.#veil = 0;
    this.#render(this.#currentQuad, 0);
    this.#capturePreview();
    this.#video.src = link.href;
    try {
      this.#dialog.showModal();
      this.#animate(target, 1, 0.66, 'power4.out', this.#onOpened);
      const video = this.#video;
      video.play().then(() => {
        if (generation !== this.#playGeneration && (!this.#isOpen || this.#video !== video)) video.pause();
      }).catch(() => {});
    } catch {
      this.#closeImmediately(true);
    }
  };

  #capturePreview() {
    this.#previewMotion?.kill();
    const source = this.#sourceFrame?.video;
    this.#preview.style.opacity = '0';
    if (!source || source.readyState < 2) return;
    try {
      this.#preview.width = Math.min(1280, source.videoWidth);
      this.#preview.height = Math.round(this.#preview.width / this.#sourceFrame.aspect);
      this.#preview.getContext('2d').drawImage(source, 0, 0, this.#preview.width, this.#preview.height);
      this.#preview.style.opacity = '1';
    } catch { /* An unavailable frame still permits native playback and dismissal. */ }
  }

  #onMetadata = () => {
    if (!this.#isOpen || this.#phase === 'closing') return;
    const source = this.#sourceFrame?.video;
    if (!source || !Number.isFinite(source.currentTime)) return;
    const duration = this.#video.duration;
    const time = Number.isFinite(duration) ? Math.min(source.currentTime, Math.max(0, duration - 0.02)) : source.currentTime;
    if (Math.abs(this.#video.currentTime - time) > 0.08) {
      this.#waitingSeek = true;
      try { this.#video.currentTime = time; } catch { this.#waitingSeek = false; }
    }
  };

  #onSeeked = () => { this.#waitingSeek = false; this.#onVideoReady(); };

  #onVideoReady = () => {
    if (!this.#isOpen || this.#phase === 'closing' || this.#waitingSeek
      || this.#video.seeking || this.#video.readyState < 2) return;
    this.#previewMotion?.kill();
    this.#previewMotion = gsap.to(this.#preview, { opacity: 0, duration: 0.14, overwrite: true });
  };

  #render(corners, veil) {
    this.#currentQuad = corners;
    this.#veil = veil;
    this.#stage.style.transform = videoQuadTransform(this.#size.width, this.#size.height, corners);
    // 最后一点缩回时交还原来的曲面，柔和接回其边缘和亮度。
    this.#stage.style.opacity = String(this.#phase === 'closing' ? Math.min(1, veil * 8) : 1);
    this.#shade.style.opacity = String(veil);
    this.#closeButton.style.opacity = String(Math.max(0, (veil - 0.25) / 0.75));
  }

  #animate(target, veil, duration, ease, complete) {
    this.#motion?.kill();
    const generation = ++this.#motionGeneration;
    const from = this.#currentQuad.map((p) => ({ ...p }));
    const fromVeil = this.#veil;
    // Resize may have changed the player's base dimensions before the next ticker frame.
    this.#render(from, fromVeil);
    const state = { progress: 0 };
    const render = () => {
      if (generation !== this.#motionGeneration || !this.#isOpen) return;
      const latest = this.#phase === 'closing' ? this.#getFrame()?.corners : null;
      this.#render(interpolateVideoQuad(from, validVideoQuad(latest) ? latest : target, state.progress),
        fromVeil + (veil - fromVeil) * state.progress);
    };
    const finish = () => {
      if (generation !== this.#motionGeneration || !this.#isOpen) return;
      this.#motion = null;
      complete();
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      state.progress = 1; render(); finish(); return;
    }
    this.#motion = gsap.to(state, { progress: 1, duration, ease, onUpdate: render, onComplete: finish });
  }

  #onOpened = () => {
    if (!this.#isOpen || this.#phase !== 'opening') return;
    this.#phase = 'open';
    this.#video.controls = true;
  };

  #onPointerDown = (event) => { this.#backdropPressed = event.target === this.#dialog; };

  #onBackdrop = (event) => {
    if (event.target === this.#dialog && (this.#backdropPressed || event.detail === 0)) this.close();
    this.#backdropPressed = false;
  };

  #onCancel = (event) => { event.preventDefault(); this.close(); };
  #onClose = () => this.close();
  #onDialogClose = () => { if (!this.#dialog?.open) this.#finishClose(); };

  close(restorePosition = true) {
    if (!this.#isOpen) return;
    if (!restorePosition) { this.#closeImmediately(false); return; }
    if (this.#phase === 'closing') return;
    this.#restorePosition = true;
    this.#phase = 'closing';
    this.#video.controls = false;
    const frame = this.#getFrame();
    this.#syncSourceTime(frame);
    this.#animate(validVideoQuad(frame?.corners) ? frame.corners : this.#originQuad,
      0, 0.48, 'power3.inOut', () => {
        this.#syncSourceTime();
        this.#closeImmediately(true);
      });
  }

  #syncSourceTime(frame = this.#getFrame()) {
    const source = frame?.video ?? this.#sourceFrame?.video;
    if (source?.readyState >= 1 && this.#video.readyState >= 2 && !this.#waitingSeek
      && !this.#video.seeking && Number.isFinite(this.#video.currentTime)) {
      try { source.currentTime = this.#video.currentTime; } catch { /* Preserve dismissal if the source cannot seek. */ }
    }
  }

  #closeImmediately(restorePosition) {
    this.#restorePosition = restorePosition;
    this.#motionGeneration += 1;
    this.#motion?.kill();
    this.#motion = null;
    if (this.#dialog?.open) this.#dialog.close();
    this.#finishClose();
  }

  #onResize = () => {
    if (!this.#isOpen) return;
    if (this.#phase === 'closing') { this.#closeImmediately(true); return; }
    const target = this.#fit(this.#video.videoWidth / this.#video.videoHeight || this.#sourceFrame?.aspect || 16 / 9);
    this.#phase = 'opening';
    this.#animate(target, 1, 0.24, 'power2.out', this.#onOpened);
  };

  #finishClose = () => {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#phase = 'idle';
    this.#playGeneration += 1;
    this.#motionGeneration += 1;
    this.#motion?.kill();
    this.#motion = null;
    this.#previewMotion?.kill();
    this.#previewMotion = null;
    this.#video.pause();
    this.#video.removeAttribute('src');
    this.#video.load();
    if (this.#restorePosition) this.#lenis.scrollTo(this.#returnY, { immediate: true, force: true });
    const current = new Set(ScrollTrigger.getAll());
    this.#snapTriggers.forEach((trigger) => { if (current.has(trigger)) trigger.enable(false, false); });
    this.#snapTriggers = [];
    if (!this.#wasStopped) this.#lenis.start();
    if (this.#restorePosition && this.#returnFocus?.isConnected) this.#returnFocus.focus({ preventScroll: true });
    this.#returnFocus = null;
    this.#sourceFrame = null;
    this.#originQuad = null;
    this.#currentQuad = null;
    this.#backdropPressed = false;
  };

  out() {
    this.close(false);
    document.removeEventListener('click', this.#onOpen, true);
    this.#dialog?.removeEventListener('pointerdown', this.#onPointerDown);
    this.#dialog?.removeEventListener('click', this.#onBackdrop);
    this.#dialog?.removeEventListener('cancel', this.#onCancel);
    this.#dialog?.removeEventListener('close', this.#onDialogClose);
    this.#closeButton?.removeEventListener('click', this.#onClose);
    this.#video?.removeEventListener('loadedmetadata', this.#onMetadata);
    this.#video?.removeEventListener('loadeddata', this.#onVideoReady);
    this.#video?.removeEventListener('seeked', this.#onSeeked);
    window.removeEventListener('resize', this.#onResize);
    this.#dialog = this.#stage = this.#shade = this.#preview = this.#video = this.#closeButton = this.#lenis = null;
  }
}

export const videoModalController = new VideoModalController();
