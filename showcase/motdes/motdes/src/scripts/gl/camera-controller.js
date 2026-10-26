import * as THREE from 'three';

import { Animator } from './animator.js';
import { lerper } from '../core/lerper.js';
import { topScrollManager } from '../core/top-scroll-manager.js';

/**
 * 相机。原站数值，逐个照搬：
 *
 *   基位          (0, 0, 10)，永远 lookAt 原点
 *   FOV          35 + (1/宽高比)·18  —— 竖屏时视野更大，字标不会被裁
 *   KV 额外推进   z −0.5、fov −4，用 sigmoid 在 1 秒内进出
 *   鼠标视差      范围 ±0.5，跟随速度 3（按 min(3·dt, 1) 逐帧逼近）
 *
 * 视差量会被 works_outro 的进度整体衰减到 0 —— 越往下滚，画面越「定住」，
 * 这是整页从「可把玩」过渡到「叙事」的关键一笔。
 */
export class CameraController {
  #camera;
  #animator = new Animator();
  #basePosition = new THREE.Vector3(0, 0, 10);
  #mouseTarget = new THREE.Vector2(0, 0);
  #mouseOffset = new THREE.Vector2(0, 0);
  #mouseMoveRange = 0.5;
  #mouseLerpSpeed = 3;
  #worksOutroTrigger = null;
  #onMouseMove = null;

  constructor(camera) {
    this.#camera = camera;
    this.#animator.add({ name: 'kvZoom', initValue: 1 });
    this.#camera.userData.basePos = this.#basePosition.clone();
    this.#camera.userData.baseFov = 45;

    this.#onMouseMove = (e) => {
      this.#mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.#mouseTarget.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', this.#onMouseMove);
  }

  update({ deltaTime }) {
    this.#animator.update(deltaTime);

    const t = Math.min(this.#mouseLerpSpeed * deltaTime, 1);
    const outro = lerper.set('cameraController_worksOutro', this.#worksOutroTrigger?.progress || 0, 0.5);
    const target = this.#mouseTarget.clone()
      .multiplyScalar(this.#mouseMoveRange)
      .multiplyScalar(1 - outro);
    this.#mouseOffset.lerp(target, t);

    const kvZoom = this.#animator.get('kvZoom') ?? 0;
    this.#camera.position.set(
      this.#basePosition.x + this.#mouseOffset.x,
      this.#basePosition.y + this.#mouseOffset.y,
      this.#basePosition.z - kvZoom * 0.5,
    );
    this.#camera.fov = this.#camera.userData.baseFov - kvZoom * 4;
    this.#camera.updateProjectionMatrix();
    this.#camera.lookAt(0, 0, 0);
  }

  resize({ aspectRatio }) {
    this.#camera.aspect = aspectRatio;
    this.#camera.userData.baseFov = 35 + (1 / aspectRatio) * 18;
  }

  in() {
    this.#worksOutroTrigger = topScrollManager.getTrigger('works_outro');
  }

  out() {
    this.#worksOutroTrigger = null;
  }

  changeSection(name) {
    this.#animator.animate('kvZoom', name === 'kv' ? 1 : 0, 1);
  }

  dispose() {
    if (this.#onMouseMove) window.removeEventListener('mousemove', this.#onMouseMove);
    this.#onMouseMove = null;
  }
}
