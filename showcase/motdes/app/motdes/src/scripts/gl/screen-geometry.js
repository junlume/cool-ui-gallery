import * as THREE from 'three';

/**
 * WORKS 环绕卡片的**板身**几何。
 *
 * 原站这块网格叫 ThumbnailScreen，从 scene.glb 里取；取不到才退回
 * `BoxGeometry(8, 4.5, 0.1, 16, 16)`（原站自己写的 fallback，带一句 console.warn）。
 * 我们没有 GLB，之前就一直吃着那个 fallback —— 于是卡片是一张纸，
 * 而 worksThumbnail 着色器里**专门为板身写的那一整支分支**全程无事可做：
 *
 *   if (vFront < 0.5) { uv.x *= 0.01; uv.x += 1.0 - vNormalGeo.x * 0.19; ... }
 *
 * 这支分支把整幅画压成 1% 宽的一条竖列再拉满侧面 —— 玻璃板边缘"导光"的做法。
 * 板厚只有 0.02（0.1 再被顶点着色器 `pos.z *= 0.2` 砍掉 80%）时，
 * 它落在不到一个像素上，等于没写。
 *
 * ---- 尺寸是从原站录屏量出来的，不是拍的 ----
 *
 * 取 4064×2324 那段录屏第 8.0 秒，横扫中央卡片左缘（三行，结果一致）：
 *
 *   背景 13 … | 22 22 (4px) | 0 0 0 (5px) | 107 150 143 (3px) | 画面 100…
 *              侧壁            背面/暗面        斜切亮边
 *
 * 也就是说边缘不是一刀切，是**三段**：一道暗侧壁、一段更暗的、一条亮边。
 * 再用右侧那张 WEAR GO LAND 卡（有效视角 73°，由正面宽高比 156.5/298
 * 反解 acos((w'/h')/(8/4.5)) 得到）量侧面占比：
 *
 *   侧面 6.7px / 正面 431px = 0.0155 = (d/w)·tan73° → d/w = 0.0048 → d = 0.0385
 *
 * 那是**渲染后**的厚度，除以 0.2 得建模厚度 0.193 —— 原 fallback 的 0.1 只有一半。
 *
 * ---- 为什么斜切要陡 ----
 *
 * 着色器用 `vFront = step(0.5, normal.z)` 分流。45° 的倒角 normal.z = 0.707，
 * 仍然走正面分支，画出来是画面的延续，看不出边。要让它落进侧面那支，
 * normal.z 必须 < 0.5，也就是从正面掰过去 **超过 60°**。这里取 72°。
 */

const f = (n) => Number(n.toFixed(6));

/**
 * @param {object} o
 * @param {number} o.width     卡片宽（原站 8）
 * @param {number} o.height    卡片高（原站 8 / (16/9)）
 * @param {number} o.depth     建模厚度；顶点着色器还会再乘 0.2
 * @param {number} o.bevelW    正面四周斜切的横向宽度 —— 就是那条亮边的粗细
 * @param {number} o.bevelD    斜切的进深
 * @param {number} o.bevelTilt 斜切法线偏离正面的角度（度）；必须 > 60 才走侧面分支
 * @param {number} o.segX      横向细分。顶点着色器按 x 把板弯成筒，细分不够会弯成折线
 * @param {number} o.segY      纵向细分
 */
export function createScreenGeometry({
  width = 8,
  height = 8 / (16 / 9),
  depth = 0.193,
  bevelW = 0.02,
  bevelD = 0.06,
  bevelTilt = 72,
  segX = 24,
  segY = 14,
} = {}) {
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;
  const iw = hw - bevelW;          // 正面（内缩到斜切以内）
  const ih = hh - bevelW;

  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];

  // uv 是**整块板**的平面投影，不是只铺正面 —— 和 GLB 里平面展开的做法一致。
  // 内缩量只有宽度的 0.25%，画面构图基本不动。
  const push = (x, y, z, nx, ny, nz) => {
    pos.push(f(x), f(y), f(z));
    nor.push(f(nx), f(ny), f(nz));
    uv.push(f(x / width + 0.5), f(y / height + 0.5));
    return pos.length / 3 - 1;
  };

  const quad = (a, b, c, d) => { idx.push(a, b, d, b, c, d); };

  /** 一张平面网格，返回 [行][列] 的顶点号；顺带给出它的边界环。 */
  const grid = (halfW, halfH, z, nz, nx = segX, ny = segY) => {
    const rows = [];
    for (let j = 0; j <= ny; j += 1) {
      const row = [];
      for (let i = 0; i <= nx; i += 1) {
        const x = -halfW + (2 * halfW * i) / nx;
        const y = -halfH + (2 * halfH * j) / ny;
        row.push(push(x, y, z, 0, 0, nz));
      }
      rows.push(row);
    }
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (nz > 0) quad(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
        else quad(rows[j][i + 1], rows[j][i], rows[j + 1][i], rows[j + 1][i + 1]);
      }
    }
    return rows;
  };

  /** 网格的边界环，逆时针（从左下角起）。返回顶点号数组。 */
  const ringOf = (rows, nx = segX, ny = segY) => {
    const r = [];
    for (let i = 0; i <= nx; i += 1) r.push(rows[0][i]);           // 下边 →
    for (let j = 1; j <= ny; j += 1) r.push(rows[j][nx]);          // 右边 ↑
    for (let i = nx - 1; i >= 0; i -= 1) r.push(rows[ny][i]);      // 上边 ←
    for (let j = ny - 1; j >= 1; j -= 1) r.push(rows[j][0]);       // 左边 ↓
    return r;
  };

  /** 照边界环再造一圈顶点，位置/法线由回调给出。 */
  const extrudeRing = (ring, at) => ring.map((vi, k) => {
    const x = pos[vi * 3];
    const y = pos[vi * 3 + 1];
    const [nx, ny, nz, dz, sx, sy] = at(x, y, k);
    return push(x + sx, y + sy, pos[vi * 3 + 2] + dz, nx, ny, nz);
  });

  const bridge = (a, b) => {
    for (let k = 0; k < a.length; k += 1) {
      const k2 = (k + 1) % a.length;
      quad(a[k], a[k2], b[k2], b[k]);
    }
  };

  // ---- ① 正面：内缩 bevelW 的细分网格 ----
  const front = grid(iw, ih, hd, 1);
  const frontRing = ringOf(front);

  // 环上每个点的外法线：由它相对内缩矩形的位置定，角上取两边的平均
  const outward = (x, y) => {
    const ox = Math.abs(x) > iw - 1e-6 ? Math.sign(x) : 0;
    const oy = Math.abs(y) > ih - 1e-6 ? Math.sign(y) : 0;
    const l = Math.hypot(ox, oy) || 1;
    return [ox / l, oy / l];
  };

  // ---- ② 斜切：撑出那条亮边，法线陡到走侧面分支 ----
  const tilt = (bevelTilt * Math.PI) / 180;
  const bevelRing = extrudeRing(frontRing, (x, y) => {
    const [ox, oy] = outward(x, y);
    return [ox * Math.sin(tilt), oy * Math.sin(tilt), Math.cos(tilt), -bevelD, ox * bevelW, oy * bevelW];
  });
  bridge(frontRing, bevelRing);

  // ---- ③ 侧壁：真正的厚度，法线完全朝外 ----
  const wallRing = extrudeRing(bevelRing, (x, y) => {
    const [ox, oy] = outward(x, y);
    return [ox, oy, 0, -(depth - bevelD), 0, 0];
  });
  bridge(bevelRing, wallRing);

  // ---- ④ 背面：转出去时能看到 ----
  // 细分必须和前面一致 —— 边界环要逐点对上侧壁那圈才缝得住。
  const back = grid(hw, hh, -hd, -1, segX, segY);
  bridge(wallRing, ringOf(back));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}
