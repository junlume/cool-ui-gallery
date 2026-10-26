import * as THREE from 'three';

import { OUTLINE as M_OUTLINE, W, H, METRICS } from '../../lib/glyph.js';

/**
 * motdes 主字标「M-01 等边」的三维几何。
 *
 * 原站是从 scene.glb 里取 Alche_A / Alche_Outline 两个网格。我们不需要 GLB ——
 * 那两个网格实测就是「平面多边形 → 挤出 → 均匀倒角」，全部参数都能量出来：
 *
 *   Alche_A 的 Z 分层  ±0.0482 / ±0.0506 / ±0.0524 / ±0.053
 *   → depth 0.0964、bevelThickness 0.0048、bevelSegments 3
 *   芯层比外表面每边宽 0.0081 → bevelSize 0.0081
 *
 * 用这组参数跑 ExtrudeGeometry，Z 分层逐值命中原 GLB，外表面尺寸精确匹配。
 * 好处是字形保持参数化：改轮廓不用重导资源。
 */

// 字形来自唯一真源 src/lib/glyph.js —— 与定稿图纸、Lottie、favicon 同一份数据。
// 这里只负责把二维轮廓变成三维网格，不重新推导任何坐标。

// ---- 挤出参数：由原 GLB 的逐层剖面反推 ----
const EXTRUDE = { depth: 0.0964, bevelThickness: 0.0048, bevelSize: 0.0081, bevelSegments: 3 };

/**
 * 原站 Alche_A 的外表面高 0.3620。字标在 KV 里是按高度定位的，
 * 所以这里按高度对齐 —— M-01 比 A 窄 2.3%，这个差异要如实保留，不能拉伸补齐。
 */
const TARGET_OUTER_HEIGHT = 0.3620;
const SCALE = TARGET_OUTER_HEIGHT / H;

function buildShape(scale) {
  const shape = new THREE.Shape();
  M_OUTLINE.forEach(([x, y], i) => {
    const px = (x - W / 2) * scale;
    const py = -(y - H / 2) * scale;      // 翻 y：SVG 向下 → 三维向上
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();
  return shape;
}

/** 玻璃实体用的网格。 */
export function createLogoGeometry() {
  const geo = new THREE.ExtrudeGeometry(buildShape(SCALE), {
    ...EXTRUDE,
    bevelEnabled: true,
    curveSegments: 1,
  });
  geo.translate(0, 0, -EXTRUDE.depth / 2);   // Z 居中到 ±0.053
  geo.computeVertexNormals();
  return geo;
}

/**
 * 把二维轮廓整体外扩 d：每个顶点沿两条邻边外法线的**角平分线**推出去，
 * 推的距离是 d / cos(θ/2)，这样外扩后的边与原边严格平行、间距恒为 d。
 *
 * 尖角处 1/cos(θ/2) 会发散（M 的谷底那个尖角尤其），所以加了斜接长度上限 ——
 * 和字体渲染、CAD 里 miter limit 是同一回事，超限就截断，不让尖角飞出去。
 */
function offsetPolygon(points, d) {
  const n = points.length;
  const area = points.reduce((acc, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % n];
    return acc + (x * ny - nx * y);
  }, 0) / 2;
  const sign = area > 0 ? 1 : -1;      // 保证"外"始终朝外，不依赖点序方向

  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const e1 = [p[0] - prev[0], p[1] - prev[1]];
    const e2 = [next[0] - p[0], next[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1;
    const l2 = Math.hypot(e2[0], e2[1]) || 1;
    // 边的外法线（y 轴朝上时，顺/逆时针由 sign 校正）
    const n1 = [(e1[1] / l1) * sign, (-e1[0] / l1) * sign];
    const n2 = [(e2[1] / l2) * sign, (-e2[0] / l2) * sign];
    let bx = n1[0] + n2[0];
    let by = n1[1] + n2[1];
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) { out.push([p[0] + n1[0] * d, p[1] + n1[1] * d]); continue; }
    bx /= bl; by /= bl;
    const cos = bx * n1[0] + by * n1[1];            // = cos(θ/2)
    const miter = Math.min(1 / Math.max(cos, 1e-6), 6);   // miter limit 6
    out.push([p[0] + bx * d * miter, p[1] + by * d * miter]);
  }
  return out;
}

/**
 * 白色描边用的网格。原站 Alche_Outline 是同轮廓外扩一层的壳，
 * 配 DoubleSide 渲染出勾边：基底（alpha 0 但写深度）把壳的内侧挖掉，
 * 露出来的那一圈就是描边。外扩量原先按原站观感估成 0.00065，
 * 现按用户要求加粗到 0.001225（下面有像素换算）。
 *
 * ⚠️ 三个坑，逐个踩过：
 *   ① 别用"整体放大一点"—— 那是绕形心缩放，离形心越远外扩越多、形心处为零。
 *   ② 别沿三维法线推 —— 正面那圈顶点的法线是 +Z，推出去只是**朝相机靠近**，
 *      正对着看的剪影一点没变大。
 *   ③ 倒角参数必须和基底**一致**。这条最隐蔽：ExtrudeGeometry 的 bevelSize
 *      会把外表面整体撑出去，基底用 0.0081、壳用 0.0040 的话，壳的外缘反而
 *      比基底**小** 0.0041 —— 实测基底 ±0.21049、壳 ±0.20704，壳整个缩在
 *      基底里面，无论外扩多少都露不出来。前两版看不见勾边，根因在这。
 *
 * 现在：倒角与基底同参，二维轮廓等距外扩 SHELL（角平分线 + miter limit），
 * 外缘正好比基底大 SHELL，粗细处处一致。
 *
 * SHELL 换算成屏幕像素：
 *   线宽 = SHELL / 0.3620（字标外表面高）× 字标在屏上的高度
 * 1920×908 @dpr2 的 mission 段实测字标高 1182 设备像素，于是
 *   0.00065 → 2.12px（原值，用户反馈"太单薄"）
 *   0.001225 → 4.00px
 * 取 4.00px，与开场 loading 那个 M 的描边同一重量（cons-logo，3 用户单位）——
 * 两个 M 在屏上高度只差 7%（1097 vs 1182 设备像素），线宽得对齐才不打架。
 */
export function createLogoOutlineGeometry() {
  const SHELL = 0.001225;
  // 厚度与基底**完全一致**。之前多给了 0.0016，壳的正面就比基底更靠近相机，
  // 深度测试全胜，整片白填充盖住字标 —— 和"完全看不见"是同一个 bug 的另一面。
  const depth = EXTRUDE.depth;

  const pts = M_OUTLINE.map(([x, y]) => [(x - W / 2) * SCALE, -(y - H / 2) * SCALE]);
  const shape = new THREE.Shape();
  offsetPolygon(pts, SHELL).forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    ...EXTRUDE,
    depth,
    bevelEnabled: true,
    curveSegments: 1,
  });
  geo.translate(0, 0, -depth / 2);
  // At the M's three concave corners, the extruded bevel folds over itself.
  // Those reversed cap triangles can sit in front of the depth base and show
  // up as isolated white flecks inside the otherwise empty outline.
  // Keep the actual silhouette and walls; omit only the inverted bevel faces.
  const positions = geo.getAttribute('position');
  const triangle = new THREE.Triangle();
  const normal = new THREE.Vector3();
  const kept = [];
  for (let i = 0; i < positions.count; i += 3) {
    triangle.a.fromBufferAttribute(positions, i);
    triangle.b.fromBufferAttribute(positions, i + 1);
    triangle.c.fromBufferAttribute(positions, i + 2);
    triangle.getNormal(normal);
    const z = (triangle.a.z + triangle.b.z + triangle.c.z) / 3;
    const invertedBevel = Math.abs(z) > depth / 2 + 1e-6 && normal.z * z < -1e-6;
    if (!invertedBevel) kept.push(i, i + 1, i + 2);
  }
  geo.clearGroups();
  geo.setIndex(kept);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 侧屏：贴在字标侧面的一条窄带。
 *
 * ⚠️ 这里曾经是个严重错误：我按 W × H 建了整块平面再转 90°，结果它在 Z 方向
 * 张了 0.4078 —— 是字母厚度（0.106）的近 4 倍，缩放后戳出 5 个单位。它的
 * renderOrder(12) 排在玻璃(101) 之前，而 transparent 材质默认仍写深度，
 * 于是把后画的玻璃整块深度剔除掉，看起来就是「模型穿模、缺一块」。
 *
 * 正确尺寸取自原站 Alche_SideScreen：Z 只跨 ±0.0536（正好一个字厚），
 * 另一维沿字高。并且必须关掉 depthWrite —— 它是纯叠加层，不该遮挡任何东西。
 */
export const SIDE_SCREEN_DEPTH = 0.1072;

/**
 * 贴边的三个实测修正量。
 *
 * 铰点改到近侧面之后（见 shaders/index.js 手改 ③），带子和 M 左壁本该重合，
 * 但描边用的是**外扩壳**、壳自己的近面又比板面更靠外，实测还差一点：
 *   横向 铰点对齐后带左比轮廓左靠里 25px  → X_FIX −0.00734
 *   竖向 带比轮廓短 51px（上 29 / 下 22）  → H_FIX 1.045、Y_FIX +0.00103
 * 换算尺 264 设备像素 / 世界单位，字标局部 → 世界还要 ×12.9。
 */
const SIDE_X_FIX = -0.00734;
const SIDE_Y_FIX = 0.00103;
const SIDE_H_FIX = 1.045;

/**
 * 它必须贴在**左立柱的外侧壁**上，不能停在字标中心。
 *
 * 原站那条虹彩带是顺着 ▲ 左斜边长的 —— 看上去就是那一笔被挤出来的侧壁，
 * 字标一转，这面墙露出得越来越多，带子跟着变宽。我原来把它摆在原点，
 * 对 ▲ 恰好蹭在左腿附近，对 M 就正落进中间那个 V 形凹口里，
 * 成了一条飘在半空、跟哪一笔都不挨着的竖条。
 *
 * 为什么是**左**侧壁：顶点着色器里 `pos.xz *= rotate(+θ)`，正面法线 (0,0,1)
 * 转成 (sinθ,0,cosθ) 偏向 +X，等于我们从字标的左边看过去 ——
 * 这时候露出来的是法线朝 −X 的那面墙。
 *
 * 位置就是 M 最左边那条边：多边形 x=0 处，换算到字标局部坐标。
 * 注意只平移 x：着色器里 screenPos 只吃 scPos.x（旋转后来自 z）和 scPos.y，
 * 所以这个偏移完全不影响后面morph成全屏那一段的标定。
 */
/**
 * 位置和高度都是**贴着 M 左立柱的轮廓量出来的**，不是按公式推的。
 *
 * 理论值（多边形 x=0 换算到字标局部坐标）落下去之后实测还差一截：
 * 在 vision 段停住时横扫像素，M 轮廓左缘在 x=1257，彩带左缘在 1287 ——
 * 往里缩了 30 个设备像素；竖向 407→1586 对轮廓的 376→1610，上下各短 30 来像素。
 * 差值来自描边用的是外扩壳、加上侧屏自己的厚度在透视里的偏移，
 * 逐项推容易漏，直接按实测补偏移和高度系数，再回扫验证。
 *
 * 换算尺：字标在 1920×908 视口下高 1234 设备像素、世界高 4.67 → 264 px/世界单位。
 */
const SIDE_SCREEN_X = (0 - W / 2) * SCALE + SIDE_X_FIX;

export function createSideScreenGeometry() {
  const geo = new THREE.PlaneGeometry(SIDE_SCREEN_DEPTH, H * SCALE * SIDE_H_FIX);
  geo.rotateY(Math.PI / 2);          // X → Z：让窄边落在厚度方向
  geo.translate(SIDE_SCREEN_X, SIDE_Y_FIX, 0);
  return geo;
}
