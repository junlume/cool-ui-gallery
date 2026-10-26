/**
 * 逐帧阻尼器。移植自原站 Lerper —— 公式与 multiplier 语义必须保持一致，
 * MISSION/VISION 的路径描边与遮罩推进都依赖它的手感。
 *   current += (target - current) * min(1, dt * 10 * multiplier)
 */
export class Lerper {
  #beforeTime = null;
  #values = new Map();

  /** 写入目标值并取回当前(已阻尼)值。首次调用直接返回目标值，不产生突变。 */
  set(key, target, multiplier = 1) {
    const v = this.#values.get(key);
    if (v === undefined) {
      this.#values.set(key, { target, current: target, velocity: 0, multiplier });
      return target;
    }
    v.target = target;
    v.velocity = v.target - v.current;
    return v.current;
  }

  get(key) {
    return this.#values.get(key);
  }

  remove(key) {
    this.#values.delete(key);
  }

  update(time) {
    if (this.#beforeTime === null) this.#beforeTime = time;
    const dt = (time - this.#beforeTime) / 1000;
    this.#beforeTime = time;
    this.#values.forEach((v) => {
      v.velocity = v.target - v.current;
      v.current += v.velocity * Math.min(1, dt * (10 * v.multiplier));
    });
  }
}

export const lerper = new Lerper();
