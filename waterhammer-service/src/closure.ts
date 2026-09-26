import { ServiceError } from "./errors.js";
import type { ClosureSpec } from "./types.js";

/**
 * 阀门相对开度规律 tau(t)：t<=0 时为 1，关闭结束后为 0（或折线末值）。
 * 返回一个纯函数，求解器按新时层时刻求值。
 */
export function buildClosure(spec: ClosureSpec): (t: number) => number {
  if (spec.type === "linear") {
    const Tc = spec.duration;
    if (Tc === 0) {
      // 瞬时关闭：t>0 即全关
      return (t) => (t <= 0 ? 1 : 0);
    }
    return (t) => {
      if (t <= 0) return 1;
      if (t >= Tc) return 0;
      return 1 - t / Tc;
    };
  }

  // piecewise：时间点须单调不减，开度须在 [0,1]
  const pts = [...spec.points].sort((a, b) => a.time - b.time);
  if (pts.length === 0) {
    throw new ServiceError("INVALID_INPUT", "piecewise closure requires at least one point");
  }
  return (t) => {
    if (t <= pts[0].time) return pts[0].opening;
    const last = pts[pts.length - 1];
    if (t >= last.time) return last.opening;
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i].time) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const w = (t - p0.time) / (p1.time - p0.time);
        return p0.opening + w * (p1.opening - p0.opening);
      }
    }
    return last.opening;
  };
}
