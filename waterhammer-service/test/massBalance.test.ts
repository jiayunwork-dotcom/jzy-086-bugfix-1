import { describe, expect, it } from "vitest";
import { GRAVITY, runSimulation, validateRequest } from "../src/index.js";
import { baseRequest } from "./helpers.js";

/**
 * 流量协调（连续性积分平衡）：
 * 连续方程 d/dt ∫H dx = (a^2/(g*A)) * (Q_in - Q_out)，
 * 即管内蓄水（以平均水头表征）的变化必须和两端进出流量之差对得上。
 * 对整条仿真历程做积分，比较两侧，相对容差 5%。
 */
describe("流量协调：管内蓄水变化 = 两端流量差累积", () => {
  it("带摩阻、历时覆盖多个往返周期", () => {
    const r = baseRequest();
    r.pipe.frictionFactor = 0.02;
    r.closure = { type: "linear", duration: 3 };
    r.duration = 10;
    const res = runSimulation(validateRequest(r));

    const { time, meanHead, inflow, outflow } = res.diagnostics;
    const { area, joukowskyRise } = res.derived;
    const a = 1000;
    const L = 1000;

    // 左端：∫H dx 的变化 = L * (meanH(T) - meanH(0))
    const lhs = L * (meanHead[meanHead.length - 1] - meanHead[0]);

    // 右端：(a^2/(g*A)) ∫(Q_in - Q_out) dt，梯形积分
    let integral = 0;
    for (let i = 1; i < time.length; i++) {
      const d0 = inflow[i - 1] - outflow[i - 1];
      const d1 = inflow[i] - outflow[i];
      integral += 0.5 * (d0 + d1) * (time[i] - time[i - 1]);
    }
    const rhs = (a * a) / (GRAVITY * area) * integral;

    const scale = L * joukowskyRise; // 以水头变化量级归一
    expect(Math.abs(lhs - rhs) / scale).toBeLessThan(0.05);
  });
});
