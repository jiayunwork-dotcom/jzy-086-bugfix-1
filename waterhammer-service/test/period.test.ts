import { describe, expect, it } from "vitest";
import { runSimulation, summarize, validateRequest } from "../src/index.js";
import { baseRequest, PERIOD } from "./helpers.js";

/**
 * 压力波在管中往返一趟的周期为 4L/a。
 * 无摩阻瞬时关闭时阀门水头是周期 4L/a 的方波，
 * 用第二次达到峰值的时刻观测该周期。
 */
describe("往返周期 ≈ 4L/a", () => {
  it("第二次峰值时刻与第一峰值相差 ≈ 4L/a（容差 2%）", () => {
    const r = baseRequest();
    r.duration = 12; // 覆盖 3 个周期（4L/a = 4 s）
    const res = runSimulation(validateRequest(r));
    const s = summarize(res);

    expect(s.secondPeakTime).not.toBeNull();
    expect(s.observedRoundTripPeriod).not.toBeNull();
    const err = Math.abs(s.observedRoundTripPeriod! - PERIOD) / PERIOD;
    expect(err).toBeLessThan(0.02);
  });

  it("阀门水头在第一峰值后于 2L/a 附近回落（方波特征）", () => {
    const r = baseRequest();
    r.duration = 12;
    const res = runSimulation(validateRequest(r));
    const { time, head } = res.valve;
    const h0 = res.initialValveHead;
    // t = 3 s（即 2L/a 与 4L/a 之间）应处于低压平台 H0 - ΔH 附近
    const idx = time.findIndex((t) => t >= 3);
    expect(head[idx]).toBeLessThan(h0);
  });
});
