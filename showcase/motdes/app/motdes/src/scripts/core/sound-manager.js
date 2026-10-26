import { Howl, Howler } from 'howler';

import { deviceManager } from './device-manager.js';

/**
 * 声音。音量、淡入时长、静音记忆全部取自原站字面量：
 *
 *   BGM 音量 0.08   —— 很轻，只是垫底噪声，不抢内容
 *   音效音量 0.1
 *   淡入 1500ms
 *   SP 布局整体禁用（移动端不自动放声音）
 *   静音状态记在 localStorage['sound-muted']，默认静音
 *
 * ⚠️ 音频文件本身是 Alche 的素材，不复制。这里只搭好骨架：
 * 把 bgm.mp3 / mission_in.mp3 / typing.mp3 / works_in.mp3 放进 public/sounds/
 * 即可直接生效，代码不用改。文件缺失时只在控制台留一条警告，不影响页面。
 */
const BGM_VOLUME = 0.08;
const SE_VOLUME = 0.1;
const FADE_IN = 1500;
const STORAGE_KEY = 'sound-muted';
const PRELOAD_SE = ['mission_in', 'typing', 'works_in'];

export class SoundManager {
  #bgm = null;
  #sounds = new Map();
  #currentBgmId = null;
  #isMuted = true;
  #disabled = false;
  #ready = false;

  /** 延迟到用户交互后再建 Howl —— 浏览器不允许在此之前创建音频上下文。 */
  init() {
    if (this.#ready) return;
    this.#disabled = deviceManager.isSPLayout;
    if (this.#disabled) {
      this.#isMuted = true;
      Howler.volume(0);
      this.#ready = true;
      return;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    this.#isMuted = saved === null ? true : saved === 'true';
    Howler.volume(this.#isMuted ? 0 : 1);
    this.#initBGM();
    this.#preloadSE(PRELOAD_SE);
    this.#ready = true;
  }

  get disabled() { return this.#disabled; }
  get isMuted() { return this.#isMuted; }

  #initBGM() {
    this.#bgm = new Howl({
      src: ['/sounds/bgm.mp3'],
      loop: true,
      volume: 0,
      onloaderror: () => console.warn('BGM 未就位：/sounds/bgm.mp3'),
    });
  }

  #preloadSE(names) {
    names.forEach((name) => {
      this.#sounds.set(name, new Howl({
        src: [`/sounds/${name}.mp3`],
        volume: SE_VOLUME,
        onloaderror: () => console.warn(`音效未就位：${name}.mp3`),
      }));
    });
  }

  setMute(muted) {
    this.#isMuted = muted;
    try { localStorage.setItem(STORAGE_KEY, String(muted)); } catch { /* 隐私模式忽略 */ }
    Howler.volume(muted ? 0 : 1);
  }

  startBGM() {
    if (this.#disabled || !this.#bgm || this.#bgm.playing()) return;
    if (this.#currentBgmId !== null) {
      this.#bgm.stop(this.#currentBgmId);
      this.#currentBgmId = null;
    }
    this.#currentBgmId = this.#bgm.play();
    this.#bgm.fade(0, BGM_VOLUME, FADE_IN, this.#currentBgmId);
  }

  stopBGM() {
    if (this.#currentBgmId === null || !this.#bgm) return;
    this.#bgm.stop(this.#currentBgmId);
    this.#currentBgmId = null;
  }

  fadeOutBGM(ms = 1000) {
    if (this.#currentBgmId === null || !this.#bgm) return;
    this.#bgm.fade(this.#bgm.volume(this.#currentBgmId), 0, ms, this.#currentBgmId);
    setTimeout(() => this.stopBGM(), ms);
  }

  playSE(name) {
    if (this.#disabled) return;
    const existing = this.#sounds.get(name);
    if (existing) { existing.play(); return; }
    const s = new Howl({
      src: [`/sounds/${name}.mp3`],
      volume: SE_VOLUME,
      onload: () => s.play(),
      onloaderror: () => console.warn(`音效未就位：${name}.mp3`),
    });
    this.#sounds.set(name, s);
  }

  stopSE(name) {
    this.#sounds.get(name)?.stop();
  }
}

export const soundManager = new SoundManager();

/**
 * 区段切换时的音效触发点。取自原站 PageTop 的 section/change 处理：
 *   works      → works_in
 *   mission_in → mission_in + typing（打字声一直响到 service）
 *   service_in → works_in，同时停掉 typing
 */
export function bindSectionSounds(topScrollManager) {
  topScrollManager.on('section/change', ({ sectionName, direction }) => {
    if (direction !== 'enter') return;
    switch (sectionName) {
      case 'works':
        soundManager.playSE('works_in');
        break;
      case 'mission_in':
        soundManager.playSE('mission_in');
        soundManager.playSE('typing');
        break;
      case 'service_in':
        soundManager.playSE('works_in');
        soundManager.stopSE('typing');
        break;
      default:
        break;
    }
  });
}
