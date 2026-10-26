// Radius is measured against panel height, so tilted screens keep circular corners.
export const VIDEO_CORNER_RADIUS = 0.034;

export const videoCornerMask = `
float videoCornerCoverage(vec2 panelUv, float aspect, float radius) {
  vec2 halfSize = vec2(aspect, 1.0) * 0.5;
  vec2 p = (panelUv - 0.5) * vec2(aspect, 1.0);
  vec2 q = abs(p) - (halfSize - radius);
  float distanceToEdge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  float edgeWidth = max(fwidth(distanceToEdge), 0.0001);
  // Clip only the corner arcs; keep the existing straight glass sidewalls opaque.
  if (q.x <= 0.0 || q.y <= 0.0) return 1.0;
  return 1.0 - smoothstep(-edgeWidth, edgeWidth, distanceToEdge);
}
`;
