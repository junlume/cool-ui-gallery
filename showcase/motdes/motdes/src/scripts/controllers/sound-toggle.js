import { soundManager } from '../core/sound-manager.js';

/**
 * 右上角的声音开关。三根竖条只靠 data-muted 属性切换明度，不换图标。
 * 点击时若音频上下文还没建（用户此前选了「不开声音」），这里补建 ——
 * 浏览器要求音频必须由用户手势触发。
 */
export class SoundToggleController {
  #button = null;

  in() {
    this.out();
    this.#button = document.querySelector('[data-sound-toggle]');
    if (!this.#button) return;
    this.#button.addEventListener('click', this.#onClick);
    this.updateState();
  }

  out() {
    this.#button?.removeEventListener('click', this.#onClick);
    this.#button = null;
  }

  #onClick = () => {
    soundManager.init();
    const next = !soundManager.isMuted;
    soundManager.setMute(next);
    if (!next) soundManager.startBGM(); else soundManager.fadeOutBGM(600);
    this.updateState();
  };

  updateState() {
    this.#button?.setAttribute('data-muted', String(soundManager.isMuted));
  }
}

export const soundToggleController = new SoundToggleController();
