import * as THREE from 'three';

import { buildConstructionSVG, buildLogoOutlineSVG, CANVAS } from '../../lib/construction-svg.js';

/**
 * 把画完的构造图纸烤成一张方形贴图，交给合成着色器做开场擦除。
 *
 * 原站这张图是预导出的资源（resources.getTextureUniform("loadingSVG")）。
 * 我们的图纸是从字形现算的，所以在加载结束的那一刻现烤 —— 那时线已经画满，
 * 是静态的，只需一次栅格化。
 *
 * ⚠️ 必须把样式内联进 SVG。<img> 加载 SVG 时是"独立文档"，外部样式表一律不生效，
 * 光靠 class 会得到一张全黑的图。
 */

/** 与 chrome.css 里那组 .cons-* 规则保持一致 —— 改一处要同步另一处。 */
const INLINE_CSS = `
line,circle,path{fill:none;stroke-linecap:butt}
.cons-rule{stroke:#919191;stroke-width:1}
.cons-axis{stroke:#919191;stroke-width:1}
.cons-axis.cons-thin{stroke-width:.6}
.cons-edge{stroke:#919191;stroke-width:.5}
.cons-edge.cons-thin{opacity:.72}
.cons-circle{stroke:#535353;stroke-width:2;opacity:.55}
.cons-circle_s{stroke-width:3}
.cons-streak{stroke:#919191;stroke-width:1;opacity:.55}
.cons-logo{stroke:#bbb;stroke-width:3}
`;

/**
 * @param {number} size 栅格边长。1024 已经足够 —— 这张图在屏幕上最多铺
 *   80% 视口宽，而且擦除半径一大就被场景盖掉，看不到细节。
 */
export async function createLoadingSVGTexture(size = 1024) {
  const cons = buildConstructionSVG();
  const logo = buildLogoOutlineSVG();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${CANVAS} ${CANVAS}">`
    + `<style>${INLINE_CSS}</style>`
    + `<rect width="${CANVAS}" height="${CANVAS}" fill="#000"/>`
    + cons.markup + logo.markup
    + '</svg>';

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  const loaded = new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  img.src = url;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
