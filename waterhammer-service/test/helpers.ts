import type { SimulationRequest } from "../src/index.js";

/** 基准合法输入：L=1000 m, D=0.5 m, a=1000 m/s, 无摩阻, H0=50 m, V0=1 m/s。 */
export function baseRequest(): SimulationRequest {
  return {
    pipe: { length: 1000, diameter: 0.5, waveSpeed: 1000, frictionFactor: 0 },
    reservoirHead: 50,
    initialVelocity: 1,
    closure: { type: "linear", duration: 0 }, // 瞬时关闭
    discretization: { segments: 20 }, // dx=50, dt=0.05
    duration: 10,
  };
}

/** 理论值：儒可夫斯基升压 a*V0/g。 */
export const JOUKOWSKY = (1000 * 1) / 9.81;
/** 理论值：往返周期 4L/a。 */
export const PERIOD = (4 * 1000) / 1000;
