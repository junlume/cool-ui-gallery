export function rectCorners({ left, top, width, height }) {
  return [{ x: left, y: top }, { x: left + width, y: top },
    { x: left + width, y: top + height }, { x: left, y: top + height }];
}

export function validVideoQuad(corners) {
  if (!Array.isArray(corners) || corners.length !== 4
    || !corners.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  const area = corners.reduce((sum, p, i) => {
    const next = corners[(i + 1) % 4];
    return sum + p.x * next.y - next.x * p.y;
  }, 0);
  return area > 16;
}

export function fitVideoRect(viewWidth, viewHeight, aspect = 16 / 9) {
  if (!Number.isFinite(aspect) || aspect <= 0) aspect = 16 / 9;
  const narrow = viewWidth <= 768;
  const maxWidth = Math.min(viewWidth * (narrow ? 0.92 : 0.84), 1440);
  const maxHeight = viewHeight * (narrow ? 0.76 : 0.82);
  const width = Math.min(maxWidth, maxHeight * aspect);
  const height = width / aspect;
  return { left: (viewWidth - width) / 2, top: (viewHeight - height) / 2, width, height };
}

export function interpolateVideoQuad(from, to, progress) {
  return from.map((p, i) => ({ x: p.x + (to[i].x - p.x) * progress,
    y: p.y + (to[i].y - p.y) * progress }));
}

/** Homography: map the player's rectangle onto the projected WebGL corners. */
export function videoQuadTransform(width, height, [p0, p1, p2, p3]) {
  const dx1 = p1.x - p2.x; const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y; const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(denominator) > 1e-8 ? (sx * dy2 - dx2 * sy) / denominator : 0;
  const h = Math.abs(denominator) > 1e-8 ? (dx1 * sy - sx * dy1) / denominator : 0;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  return `matrix3d(${[a / width, d / width, 0, g / width,
    b / height, e / height, 0, h / height, 0, 0, 1, 0, p0.x, p0.y, 0, 1].join(',')})`;
}
