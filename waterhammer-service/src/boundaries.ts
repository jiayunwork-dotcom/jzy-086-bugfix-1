import type { CharRelation } from "./characteristics.js";

/**
 * 上、下游边界条件。两侧都只用到一条到达边界的特征线，
 * 与边界自身的物理关系联立，不引入任何额外的经验增量公式。
 */

/**
 * 上游水库：水头锁死为 H_res，与到达边界的 C- 特征线联立。
 *   H_res = Cm + Bm*Q  =>  Q = (H_res - Cm)/Bm
 */
export function reservoirBoundary(
  reservoirHead: number,
  minus: CharRelation,
): { head: number; flow: number } {
  const flow = (reservoirHead - minus.c) / minus.b;
  return { head: reservoirHead, flow };
}

/**
 * 下游阀门：孔口关系 Q = tau * Cv * sqrt(H)，与到达阀门的 C+ 特征线
 *   H = Cp - Bp*Q
 * 联立。代入 s = sqrt(H) 得二次方程 s^2 + Bp*k*s - Cp = 0（k = tau*Cv），
 * 取正根。tau = 0（全关）时退化为 Q = 0、H = Cp。
 *
 * Cv = Q0/sqrt(Hv0) 由初始稳态标定：Q0 为初始流量，Hv0 为初始阀门水头。
 */
export function valveBoundary(
  plus: CharRelation,
  tau: number,
  valveCoeff: number,
): { head: number; flow: number } {
  const k = tau * valveCoeff;
  if (k <= 0) {
    return { head: plus.c, flow: 0 };
  }
  const { c, b } = plus;
  const disc = b * b * k * k + 4 * c;
  // 数值上 Cp 极小概率为负（剧烈降压），此时孔口无实解，按断流处理
  if (disc < 0 || c <= 0) {
    return { head: c, flow: 0 };
  }
  const s = (-b * k + Math.sqrt(disc)) / 2;
  return { head: s * s, flow: k * s };
}
