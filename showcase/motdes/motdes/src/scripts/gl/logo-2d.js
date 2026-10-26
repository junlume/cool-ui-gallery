import * as THREE from 'three';

import { Animator } from './animator.js';
import { logo2DVert, logo2DFrag } from './shaders/index.js';

/**
 * KV 里那块平面字标。它不是三维字标 —— 是一张贴在 z = −15 的大平面上的
 * 品牌字样，远远地浮在砖墙和玻璃 M 之间，给画面加一层纵深。
 *
 * 只在 KV 段出现，切走时 0.5 秒淡掉。片元里 `o.xyz *= 1.5` 是刻意过曝，
 * 让它在黑底上像一块自发光的招牌。
 */
export class Logo2D extends THREE.Mesh {
  #animator = new Animator();
  #uniforms;

  constructor(commonUniforms, texture) {
    const animator = new Animator();
    const uniforms = {
      ...commonUniforms,
      uTex: { value: texture ?? null },
      uVisibility: animator.add({ name: 'visibility', initValue: 0 }),
    };

    super(
      new THREE.PlaneGeometry(28, 28 * (250 / 1204)),   // 与贴图同宽高比
      new THREE.ShaderMaterial({
        vertexShader: logo2DVert,
        fragmentShader: logo2DFrag,
        uniforms,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    this.#animator = animator;
    this.#uniforms = uniforms;
  }

  setTexture(tex) {
    this.#uniforms.uTex.value = tex;
    this.material.needsUpdate = true;
  }

  changeSection(name) {
    this.#animator.animate('visibility', name === 'kv' ? 1 : 0, 0.5);
  }

  update({ deltaTime }) {
    this.#animator.update(deltaTime);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
