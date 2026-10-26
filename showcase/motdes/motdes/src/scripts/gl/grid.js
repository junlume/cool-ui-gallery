import * as THREE from 'three';

import { gridVert, gridFrag, crossFrag } from './shaders/index.js';

/**
 * 网格底纹。两层叠在一起，都在最底（renderOrder −999）、不写深度也不测深度：
 *   · 64×64 的细线网格，横向随时间与滚动缓慢流动
 *   · 8×8 的十字标记，实例化画出来
 *
 * 最终 alpha 只有 0.5 × 0.2 = 0.1 —— 几乎看不见，但正是它让整片黑底有了
 * 「图纸」的质感，而不是一块死黑。删掉会立刻觉得画面空。
 */
export class Grid extends THREE.Mesh {
  #uniforms;
  #cross;

  constructor(theme = 'light', shape = 'round', commonUniforms = {}) {
    const grid = new THREE.Vector2().setScalar(64);
    const uniforms = {
      ...commonUniforms,
      uGrid: { value: grid },
      uScale: { value: new THREE.Vector3(1, 1, 1) },
      uScroll: { value: 0 },
      uThumbnailScroll: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      name: 'GridMaterial',
      uniforms,
      vertexShader: gridVert,
      fragmentShader: gridFrag,
      transparent: true,
      defines: { IS_GRID: '', [`IS_${shape.toUpperCase()}`]: '', [`IS_${theme.toUpperCase()}`]: '' },
      depthWrite: false,
      depthTest: false,
    });

    super(new THREE.PlaneGeometry(1, 1, 64, 64), material);
    this.renderOrder = -999;
    this.#uniforms = uniforms;

    // 十字标记：8×8 个实例，每个是一小片 8×8 细分的平面
    const crossCount = new THREE.Vector2(grid.x / 8, grid.y / 8);
    const ids = [];
    for (let y = 0; y <= crossCount.y; y += 1) {
      for (let x = 0; x <= crossCount.x; x += 1) ids.push(x / crossCount.x, y / crossCount.y);
    }
    const base = new THREE.PlaneGeometry(1, 1, 8, 8);
    const inst = new THREE.InstancedBufferGeometry();
    inst.setAttribute('position', base.getAttribute('position'));
    inst.setAttribute('uv', base.getAttribute('uv'));
    inst.setAttribute('instanceId', new THREE.InstancedBufferAttribute(new Float32Array(ids), 2));
    inst.setIndex(base.getIndex());

    const crossMaterial = new THREE.ShaderMaterial({
      name: 'GridCrossMaterial',
      uniforms: { ...uniforms, uGridCross: { value: crossCount } },
      vertexShader: gridVert,
      fragmentShader: crossFrag,
      transparent: true,
      defines: { IS_CROSS: '', [`IS_${shape.toUpperCase()}`]: '', [`IS_${theme.toUpperCase()}`]: '' },
      depthWrite: false,
      depthTest: false,
    });

    this.#cross = new THREE.Mesh(inst, crossMaterial);
    this.#cross.renderOrder = -999;
    this.#cross.frustumCulled = false;
    this.add(this.#cross);
  }

  /**
   * 铺满视口，取长边。透视相机按基准 fov / 基准距离反算；
   * 正交相机（MISSION/VISION 那一段用）直接取视锥宽高 —— 原站两条分支都写了。
   */
  resize(camera) {
    let w;
    let h;
    if (camera.isOrthographicCamera) {
      w = camera.right - camera.left;
      h = camera.top - camera.bottom;
    } else {
      const basePos = camera.userData.basePos || camera.position;
      const fov = camera.userData.baseFov || camera.fov;
      const dist = Math.abs(basePos.z);
      h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
      w = h * camera.aspect;
    }
    const s = Math.max(h, w);
    this.#uniforms.uScale.value.set(s, s, 1);
  }

  setScrollAmount(v) {
    this.#uniforms.uScroll.value = v;
  }
}
