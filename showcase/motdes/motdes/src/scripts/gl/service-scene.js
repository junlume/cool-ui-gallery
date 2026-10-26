import * as THREE from 'three';

import { ServiceList } from './service-list.js';
import { createServiceTitleTexture } from './text-textures.js';

/**
 * SERVICE 段的独立场景。
 *
 * 结构照原站 TopPageServiceScene：自己的相机（z=10、fov 50）、黑底、
 * 上面挂一组 ServiceList —— 也就是那面卷起来的视频墙。
 *
 * 视频墙已接上（ServiceList）。这个场景同时还承担一件结构性的事：
 *
 *   o = mix(o, serviceSceneCol, step(0.9999, uVisibleService))
 *
 * uVisibleService 一到 1，服务场景就整片顶替掉前面所有层。少了它，
 * MISSION/VISION 的亮底会因为 uVisibleMissionVision 停在 1 而一路白到页脚 ——
 * 这正是加上亮底之后暴露出来的问题。
 *
 */
export class ServiceScene extends THREE.Scene {
  #camera;
  #list;

  constructor(commonUniforms) {
    super();
    this.background = new THREE.Color('#000000');
    this.#camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.#camera.position.set(0, 0, 10);
    this.#camera.userData.basePos = this.#camera.position.clone();
    this.#camera.userData.baseFov = 50;

    // 网格与十字标记由 ServiceList 自带（它们要跟着那道波一起弯），
    // 这里不再挂一层独立的 Grid —— 原站 TopPageServiceScene 里也只有 ServiceList。
    this.#list = new ServiceList(commonUniforms, createServiceTitleTexture());
    this.add(this.#list);
  }

  get list() { return this.#list; }

  get camera() { return this.#camera; }

  update(ctx) { this.#list.update(ctx); }

  in() { this.#list.in(); }

  out() { this.#list.out(); }

  resize(aspectRatio) {
    this.#camera.aspect = aspectRatio;
    this.#camera.updateProjectionMatrix();
    this.#list.resize(this.#camera);
  }
}
