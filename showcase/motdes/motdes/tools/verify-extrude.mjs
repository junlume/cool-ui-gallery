import * as THREE from 'three';

// Alche 的 A：外轮廓 7 点 + 内三角挖空 3 点（取自站点 SVG，Y 翻转成 3D 坐标系）
const OUTER = [[0,205.884],[43.617,205.884],[48.0243,198.277],[189.108,198.277],
               [193.516,205.884],[237.133,205.884],[118.541,0.28223]];
const HOLE  = [[64.691,169.42],[118.592,75.9503],[172.492,169.42]];

const W = 237.133, H = 205.602;
const SCALE = 0.4171 / W;              // shape 轮廓 = 外表面；倒角向外扩到芯层 0.4333

const shape = new THREE.Shape();
OUTER.forEach(([x,y],i)=>{
  const px=(x-W/2)*SCALE, py=-(y-H/2)*SCALE;
  i ? shape.lineTo(px,py) : shape.moveTo(px,py);
});
shape.closePath();
const hole = new THREE.Path();
HOLE.forEach(([x,y],i)=>{
  const px=(x-W/2)*SCALE, py=-(y-H/2)*SCALE;
  i ? hole.lineTo(px,py) : hole.moveTo(px,py);
});
hole.closePath();
shape.holes.push(hole);

const geo = new THREE.ExtrudeGeometry(shape, {
  depth: 0.0964, bevelEnabled: true,
  bevelThickness: 0.0048, bevelSize: 0.0081, bevelSegments: 3,
  curveSegments: 1,
});
geo.translate(0, 0, -(0.0964/2));        // ExtrudeGeometry 的 z 从 -bt 到 depth+bt，居中即减 depth/2
geo.computeBoundingBox();

const pos = geo.attributes.position;
const layers = new Map();
for (let i=0;i<pos.count;i++){
  const z = +pos.getZ(i).toFixed(4);
  if(!layers.has(z)) layers.set(z,[]);
  layers.get(z).push([pos.getX(i), pos.getY(i)]);
}
const bb = geo.boundingBox;
console.log(`生成: 顶点 ${pos.count}  三角形 ${geo.index ? geo.index.count/3 : pos.count/3}`);
console.log(`包围盒 X[${bb.min.x.toFixed(4)},${bb.max.x.toFixed(4)}] Y[${bb.min.y.toFixed(4)},${bb.max.y.toFixed(4)}] Z[${bb.min.z.toFixed(4)},${bb.max.z.toFixed(4)}]`);
console.log(`Z 层: ${[...layers.keys()].sort((a,b)=>a-b).join(', ')}`);
for (const z of [...layers.keys()].sort((a,b)=>a-b)) {
  if (z < 0) continue;
  const L = layers.get(z);
  const xs = L.map(p=>p[0]), ys = L.map(p=>p[1]);
  console.log(`  z=${z>=0?'+':''}${z.toFixed(4)}  n=${String(L.length).padStart(4)}  宽 ${(Math.max(...xs)-Math.min(...xs)).toFixed(4)}  高 ${(Math.max(...ys)-Math.min(...ys)).toFixed(4)}`);
}

/*
 * 用途：核对 ExtrudeGeometry 的参数能否复现 alche.studio 的 scene.glb 中 Alche_A 的倒角剖面。
 * 结论：Z 分层逐值命中（±0.0482 / ±0.0506 / ±0.0524 / ±0.053），外表面尺寸精确匹配，
 *      芯层差 0.8%（A 的 60° 尖角 miter 外扩所致）。
 * 因此首页的 3D 字标无需 Blender、也无需 GLB —— 运行时参数化生成即可。
 *   node tools/verify-extrude.mjs
 */
