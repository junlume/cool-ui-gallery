/**
 * 三套吸附点算法，逐字移植自原站。
 * 五处 snap 统一 { duration: 1, directional: false } —— 不分方向是手感的关键。
 */
export const SNAP_DEFAULTS = { duration: 1, directional: false };

/**
 * [data-snapper] 容器：按各子节点的 data-snap-ratio 分配吸附点。
 * 分母是 Σratio − 1（不是 Σratio），首个吸附点固定在 0.5/o。
 */
export function missionVisionSnapArray(wrapper) {
  const n = wrapper.children.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Number(wrapper.children[i].getAttribute('data-snap-ratio') || '1');
  }
  total -= 1;
  const out = [0.5 / total];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += Number(wrapper.children[i].getAttribute('data-snap-ratio') || '1') / total;
    out.push(acc);
  }
  return out;
}

/** SERVICE：i/(n−0.5)，n=3 时只生成 [0, 0.4] 两个点 —— 最后一屏不吸附。 */
export function serviceSnapArray(count) {
  const out = [];
  for (let i = 0; i < count - 1; i++) out.push(i * (1 / (count - 0.5)));
  return out;
}

/** WORKS：n 件作品均分 n−1 段，每屏一件。 */
export function worksSnapStep(count) {
  return 1 / (count - 1);
}
