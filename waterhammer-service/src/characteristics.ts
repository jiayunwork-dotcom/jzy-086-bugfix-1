import { GRAVITY } from "./constants.js";

/**
 * 特征线法的两族特征线系数。
 *
 * 动量/连续方程沿特征线 dx/dt = ±a 积分（库朗数取 1，无需插值）：
 *   C+:  H_P = Cp - Bp * Q_P   （从左侧邻点 i-1 到达）
 *   C-:  H_P = Cm + Bm * Q_P   （从右侧邻点 i+1 到达）
 *
 * 摩阻线性化（本实现的选择，Wylie & Streeter 的一阶近似）：
 * 稳态二次损失 R*Q*|Q*| 沿特征线线性化为 R*|Q_old|*Q_P，
 * 即把上一时层流量的模当作已知系数，吸收进阻抗：
 *   Bp = B + R*|Q_{i-1,old}|,  Cp = H_{i-1,old} + B * Q_{i-1,old}
 *   Bm = B + R*|Q_{i+1,old}|,  Cm = H_{i+1,old} - B * Q_{i+1,old}
 * 其中 B = a/(g*A) 为管道阻抗，R = f*dx/(2*g*D*A^2) 为每管段摩阻系数。
 */

/** 管道阻抗 B = a/(g*A)。 */
export function waveImpedance(waveSpeed: number, area: number): number {
  return waveSpeed / (GRAVITY * area);
}

/** 每管段摩阻系数 R = f*dx/(2*g*D*A^2)，使 hf = R*Q*|Q*|。 */
export function reachFriction(
  frictionFactor: number,
  dx: number,
  diameter: number,
  area: number,
): number {
  return (frictionFactor * dx) / (2 * GRAVITY * diameter * area * area);
}

/** 一条特征线带到待求点的关系 H_P = c ± b*Q_P。 */
export interface CharRelation {
  c: number;
  b: number;
}

/** C+ 特征线：由上游邻点的旧时层状态构造。 */
export function plusRelation(headUp: number, flowUp: number, B: number, R: number): CharRelation {
  return { c: headUp + B * flowUp, b: B + R * Math.abs(flowUp) };
}

/** C- 特征线：由下游邻点的旧时层状态构造。 */
export function minusRelation(
  headDown: number,
  flowDown: number,
  B: number,
  R: number,
): CharRelation {
  return { c: headDown - B * flowDown, b: B + R * flowDown };
}

/**
 * 内部节点：联立 C+ 与 C-。
 *   Cp - Bp*Q = Cm + Bm*Q  =>  Q = (Cp - Cm)/(Bp + Bm)
 */
export function interiorNode(plus: CharRelation, minus: CharRelation): {
  head: number;
  flow: number;
} {
  const flow = (plus.c - minus.c) / (plus.b + minus.b);
  const head = plus.c - plus.b * flow;
  return { head, flow };
}
