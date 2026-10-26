import * as THREE from 'three';

import { Grid } from './grid.js';

/**
 * MISSION / VISION 段的独立场景。
 *
 * 这一段在原站是**亮底**的：背景 #D7DBDC，深色平面网格，字标只留一层描边。
 * 我之前整段都渲在黑底上 —— 那不是"细节没做"，是整节的底色搞错了。
 *
 * 它不画进主场景，而是单独渲一张 RT，再由合成着色器用一条**带弧度的横向
 * 擦除**推上来（见 shaders/composite.js 里的 missionVisionSelector）。
 * 这就是往下滚时那一下"白色版面从上方压下来、边缘是一道弯的"的来源。
 *
 * 两处照抄原站的怪异之处，都不是笔误：
 *   · 场景用**主场景的相机**渲染，自己的正交相机只用来给网格定尺寸
 *   · 字标描边容器被**移到**这个场景里 —— three 的对象只能有一个父节点，
 *     所以描边从此只在亮底这一段出现，主场景里的玻璃字标是没有勾边的
 */
export class MissionVisionScene extends THREE.Scene {
  #grid;
  #oCamera;
  #lightBackground = new THREE.Color('#D7DBDC');
  #profileAmount = 0;

  constructor(commonUniforms) {
    super();
    this.background = this.#lightBackground.clone();
    this.#grid = new Grid('dark', 'flat', commonUniforms);
    this.#grid.frustumCulled = false;
    this.add(this.#grid);
    this.#oCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
  }

  get oCamera() { return this.#oCamera; }

  /** Keep the original paper and grid throughout the profile and portfolio. */
  setProfileBackdrop(amount = 0) {
    this.#profileAmount = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
    this.background.copy(this.#lightBackground);
    this.#grid.visible = true;
  }

  get debugState() {
    return { profileDark: 0, profileAmount: this.#profileAmount,
      background: `#${this.background.getHexString()}`, gridVisible: this.#grid.visible };
  }

  /** 网格随页面滚动向上走，阻尼 0.5。 */
  setScroll(v) {
    this.#grid.setScrollAmount(v);
  }

  resize(aspectRatio) {
    let x = 4;
    let y = 4;
    if (aspectRatio < 1) y = x / aspectRatio;
    else x = y * aspectRatio;
    this.#oCamera.left = -x;
    this.#oCamera.right = x;
    this.#oCamera.top = y;
    this.#oCamera.bottom = -y;
    this.#oCamera.updateProjectionMatrix();
    this.#grid.resize(this.#oCamera);
  }
}
