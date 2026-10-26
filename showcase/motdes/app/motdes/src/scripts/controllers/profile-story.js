import { topScrollManager } from '../core/top-scroll-manager.js';
import { lerper } from '../core/lerper.js';
import { profileChapterFrame, profileProcessFrame, profileIntroLineFrame, profileStoryFrame, profileCaseFrame, profileBackdropFrame, profileEndFrame, profileSpaciousTrack } from '../../lib/profile-timeline.js';
const CARD_DRIFT_KEY = 'profile_card_drift';
/** A shared damped scroll drives every reading layer and its reverse transition. */
export class ProfileStoryController {
  #container = null; #process = null; #introLines = []; #chapters = []; #chapterBodies = []; #statement = null; #cases = []; #media = []; #end = null; #number = null; #progress = null; #motionQuery = null; #lastState = null;
  #activeMedia = null; #mediaState = 'idle'; #playGeneration = 0; #manualVideos = new WeakSet();
  #lastDrift = null;
  #onVisibility = () => { this.#lastState = null; this.update(); };
  #onPlay = (event) => {
    const button = event.target?.closest?.('[data-profile-play]');
    const media = this.#media.find((entry) => entry.button === button);
    if (!media || media !== this.#activeMedia || document.hidden) return;
    this.#manualVideos.add(media.video);
    this.#playMedia(media);
  };
  in() {
    this.out();
    this.#container = document.querySelector('[data-profile-story]');
    if (!this.#container) return;
    this.#motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.#process = this.#container.querySelector('[data-profile-process]');
    this.#introLines = [...this.#container.querySelectorAll('[data-profile-intro-line]')];
    this.#chapters = [...this.#container.querySelectorAll('[data-profile-chapter]')];
    this.#chapterBodies = this.#chapters.map((el) => [...el.querySelectorAll('[data-profile-body-line]')]);
    this.#statement = this.#container.querySelector('[data-profile-statement]');
    this.#cases = [...this.#container.querySelectorAll('[data-profile-case]')];
    this.#media = this.#cases.map((el) => ({
      video: el.querySelector('[data-profile-video]'),
      button: el.querySelector('[data-profile-play]'),
    })).filter((entry) => entry.video);
    this.#end = this.#container.querySelector('[data-profile-end]');
    this.#number = this.#container.querySelector('[data-profile-number]');
    this.#progress = this.#container.querySelector('[data-profile-progress]');
    this.#container.addEventListener('click', this.#onPlay);
    document.addEventListener('visibilitychange', this.#onVisibility);
    this.update();
  }
  update() {
    if (!this.#container) return;
    const trigger = topScrollManager.getTrigger('profile_progress');
    const rawProgress = trigger?.progress ?? 0;
    const p = topScrollManager.getProfileProgress();
    const frame = profileStoryFrame(p);
    const active = Boolean(trigger?.isActive && rawProgress > 0 && rawProgress < 1);
    const reduced = Boolean(this.#motionQuery?.matches);
    const mobile = window.innerWidth <= 768;
    const spaciousTrack = profileSpaciousTrack(window.innerWidth, window.innerHeight);
    const cases = this.#cases.map((_, index) => profileCaseFrame(p, index));
    // Keep the card settling even when the reading timeline has stopped changing.
    this.#updateDrift(rawProgress - p, active && !reduced && !document.hidden && cases.some((state) => state.opacity > 0), mobile);
    const key = `${p}:${active}:${reduced}:${mobile}:${spaciousTrack}:${Boolean(document.hidden)}`;
    if (key === this.#lastState) return;
    this.#lastState = key;
    this.#container.style.setProperty('--profile-opacity', String(active ? frame.opacity : 0));
    this.#container.style.setProperty('--profile-dark', String(profileBackdropFrame(p).dark));
    this.#container.setAttribute('data-profile-paper', String(active));
    this.#container.style.visibility = active ? 'visible' : 'hidden';
    this.#container.setAttribute('aria-hidden', String(!active));
    this.#container.inert = !active;
    const process = profileProcessFrame(p);
    this.#process?.style.setProperty('--process-opacity', String(active ? process.opacity : 0));
    this.#process?.style.setProperty('--intro-y', `${reduced ? 0 : process.y}vh`);
    this.#process?.style.setProperty('--intro-copy-reveal', String(reduced ? 1 : process.copyReveal));
    this.#process?.style.setProperty('--intro-location-reveal', String(reduced ? 1 : process.locationReveal));
    this.#introLines.forEach((el, index) => {
      const line = profileIntroLineFrame(p, index);
      el.style.setProperty('--intro-line-y', `${reduced ? 0 : line.y}%`);
      el.style.setProperty('--intro-line-opacity', String(reduced ? 1 : line.opacity));
    });
    this.#chapters.forEach((el, index) => {
      const state = profileChapterFrame(p, index, spaciousTrack);
      const opacity = active ? state.opacity : 0;
      el.style.setProperty('--chapter-opacity', String(opacity));
      el.style.setProperty('--chapter-y', `${state.y}vh`);
      el.style.setProperty('--chapter-heading-reveal', String(reduced ? 1 : state.headingReveal));
      el.style.setProperty('--chapter-label-reveal', String(reduced ? 1 : state.labelReveal));
      this.#chapterBodies[index].forEach((body, line) => {
        body.style.setProperty('--chapter-body-reveal', String(reduced ? 1 : (state.bodyReveal[line] ?? 1)));
      });
      const hidden = opacity < 0.02 || state.headingReveal < 0.08;
      el.setAttribute('aria-hidden', String(hidden));
      el.inert = hidden;
    });
    let visibleCases = false;
    let nearest = -1;
    let strength = 0;
    cases.forEach((state, index) => {
      if (active && state.readable && state.weight > strength) {
        nearest = index;
        strength = state.weight;
      }
    });
    this.#cases.forEach((el, index) => {
      const state = cases[index];
      const opacity = active ? state.opacity : 0;
      el.style.setProperty('--case-opacity', String(opacity));
      el.style.setProperty('--case-y', `${state.y}vh`);
      el.style.setProperty('--case-title-enter-x', `${reduced ? 0 : state.titleEnterX}vw`);
      el.style.setProperty('--case-media-enter-x', `${reduced ? 0 : state.mediaEnterX}vw`);
      el.style.setProperty('--case-exit', String(reduced ? 0 : state.exit));
      el.style.setProperty('--case-flip', String(reduced ? 0 : state.flip));
      el.style.setProperty('--case-text-opacity', String(state.textOpacity));
      el.setAttribute('aria-hidden', String(index !== nearest));
      el.inert = index !== nearest;
      visibleCases ||= opacity > 0.01;
    });
    this.#statement?.setAttribute('aria-hidden', String(!visibleCases));
    this.#syncMedia(!document.hidden && nearest >= 0 ? this.#media[nearest] : null, reduced);
    const end = active ? profileEndFrame(p).opacity : 0;
    this.#end?.style.setProperty('--end-opacity', String(end));
    this.#end?.setAttribute('aria-hidden', String(end < 0.01));
    if (this.#number) this.#number.textContent = String(frame.chapter + 1).padStart(2, '0');
    this.#progress?.style.setProperty('--profile-progress', String(frame.progress));
  }
  #updateDrift(scrollLag, enabled, mobile) {
    const limit = Math.min(mobile ? 16 : 28, window.innerHeight * 0.03);
    const target = enabled ? Math.max(-limit, Math.min(limit, scrollLag * window.innerHeight * 2.7)) : 0;
    // Start at rest on direct entry then softly follow the signed scroll lag.
    if (!lerper.get(CARD_DRIFT_KEY)) lerper.set(CARD_DRIFT_KEY, 0, 0.55);
    lerper.set(CARD_DRIFT_KEY, target, 0.55);
    const drift = lerper.get(CARD_DRIFT_KEY);
    if (!enabled || (Math.abs(target) < 0.01 && Math.abs(drift.current) < 0.01)) {
      drift.current = 0;
      drift.velocity = 0;
    }
    drift.current = Math.max(-limit, Math.min(limit, drift.current));
    const value = `${drift.current.toFixed(3)}px`;
    if (value === this.#lastDrift) return;
    this.#lastDrift = value;
    // One shared offset keeps the outgoing and incoming videos aligned.
    this.#statement?.style.setProperty('--case-drift-y', value);
  }
  #syncMedia(media, reduced) {
    if (media !== this.#activeMedia) {
      this.#pauseMedia();
      this.#activeMedia = media;
    }
    if (!media) return;
    if (reduced && !this.#manualVideos.has(media.video)) {
      if (this.#mediaState !== 'manual') {
        ++this.#playGeneration;
        media.video.pause();
        this.#mediaState = 'manual';
      }
      if (media.button) media.button.hidden = false;
      return;
    }
    if (this.#mediaState === 'idle' || this.#mediaState === 'manual') this.#playMedia(media);
  }
  #playMedia(media) {
    const { video, button } = media;
    const generation = ++this.#playGeneration;
    this.#mediaState = 'pending';
    if (button) button.hidden = true;
    if (!video.getAttribute('src')) {
      video.src = video.dataset.src;
      video.load();
    }
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    let playing;
    try { playing = video.play(); } catch (error) { playing = Promise.reject(error); }
    Promise.resolve(playing).then(() => {
      // A late decoder result must not restart a film after its card has left.
      if (generation !== this.#playGeneration) {
        if (video !== this.#activeMedia?.video || document.hidden || !this.#container || this.#mediaState === 'manual') video.pause();
        return;
      }
      if (media !== this.#activeMedia || document.hidden || !this.#container) { video.pause(); return; }
      this.#mediaState = 'playing';
      if (button) button.hidden = true;
    }, () => {
      if (generation !== this.#playGeneration || media !== this.#activeMedia || !this.#container) return;
      this.#mediaState = 'blocked';
      if (button) button.hidden = false;
    });
  }
  #pauseMedia() {
    ++this.#playGeneration;
    if (this.#activeMedia) {
      this.#activeMedia.video.pause();
      if (this.#activeMedia.button) this.#activeMedia.button.hidden = true;
    }
    this.#activeMedia = null;
    this.#mediaState = 'idle';
  }
  out() {
    lerper.remove(CARD_DRIFT_KEY);
    this.#lastDrift = null;
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#container?.removeEventListener('click', this.#onPlay);
    this.#pauseMedia();
    this.#media.forEach(({ video, button }) => {
      video.pause();
      if (video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
      if (button) button.hidden = true;
    });
    if (this.#container) {
      this.#container.style.setProperty('--profile-opacity', '0');
      this.#container.style.visibility = 'hidden';
      this.#container.setAttribute('aria-hidden', 'true');
      this.#container.setAttribute('data-profile-paper', 'false');
      this.#container.inert = true;
      this.#chapters.forEach((el) => { el.setAttribute('aria-hidden', 'true'); el.inert = true; });
      this.#cases.forEach((el) => { el.setAttribute('aria-hidden', 'true'); el.inert = true; });
      this.#statement?.setAttribute('aria-hidden', 'true');
      this.#statement?.style.setProperty('--case-drift-y', '0px');
      this.#end?.setAttribute('aria-hidden', 'true');
    }
    this.#container = this.#process = this.#statement = this.#end = this.#number = this.#progress = null;
    this.#introLines = []; this.#chapters = []; this.#chapterBodies = []; this.#cases = []; this.#media = []; this.#manualVideos = new WeakSet(); this.#motionQuery = null; this.#lastState = null;
  }
}
