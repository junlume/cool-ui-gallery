import { Vector4 } from 'three';

const CORNERS = [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]];
const smoothstep = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/**
 * CPU counterpart of serviceListVert's IS_THUMBNAIL path. A unit PlaneGeometry
 * cannot be projected directly: the shader bends each vertex before applying
 * the mesh/camera matrices, then the final case also blends in clip space.
 * The returned corners use CSS client pixels, ordered TL / TR / BR / BL.
 */
export function projectServiceVideoFrame({ uniforms, matrixWorld, camera, rect, isStellla = false }) {
  if (!camera || !matrixWorld || !(rect?.width > 0) || !(rect?.height > 0)) return null;
  const serviceIn = uniforms.uServiceIn.value;
  const scroll = uniforms.uThumbnailScroll.value;
  const stelllaIn = uniforms.uStelllaIn.value;
  const stelllaView = uniforms.uStelllaView.value;
  const spWeight = uniforms.uSPWeight.value;
  const scale = uniforms.uScale.value;
  const index = uniforms.uInstanceId.value;
  const values = [serviceIn, scroll, stelllaIn, stelllaView, spWeight, scale.x, scale.y, index, rect.left, rect.top];
  if (!values.every(Number.isFinite)) return null;

  const offset = (index - (scroll - 1) + 0.09 * spWeight) * 0.95
    - 0.05 * (1 - stelllaIn) - (isStellla ? 0 : stelllaView * 0.5);
  const wavePower = 4 * serviceIn * (1 - stelllaIn) * (1 - spWeight * 0.2);
  const corners = CORNERS.map(([x, y]) => {
    const localX = x * 0.3 * (16 / 9) * 0.85 + offset;
    const localY = y * 0.3;
    const theta = localX * Math.PI + (1 - serviceIn) * 8 - stelllaIn * 2;
    const clip = new Vector4(localX * scale.x, localY * scale.y + 0.6 * spWeight, -Math.sin(theta) * wavePower, 1)
      .applyMatrix4(matrixWorld)
      .applyMatrix4(camera.matrixWorldInverse)
      .applyMatrix4(camera.projectionMatrix);

    if (isStellla) {
      const curve = 0.3 + (0.2 - 0.3) * spWeight;
      const weight = smoothstep(-(x + 0.5) * curve + stelllaView * (1 + curve));
      // Mix homogeneous coordinates before division, exactly as the shader does.
      clip.lerp(new Vector4(x * 2, y * 2, 0, 1), weight);
    }
    if (!(clip.w > 0.000001)) return null;
    const point = {
      x: rect.left + (clip.x / clip.w + 1) * rect.width / 2,
      y: rect.top + (1 - clip.y / clip.w) * rect.height / 2,
    };
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
  });
  return corners.every(Boolean) ? corners : null;
}
