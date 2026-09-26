import { describe, expect, it } from "vitest";
import { runSimulation, validateRequest } from "../src/index.js";
import type { SimulationResult } from "../src/index.js";
import { baseRequest, PERIOD } from "./helpers.js";

/**
 * 摩阻衰减（长时程回归）。
 *
 * 历史缺陷：C- 特征线的摩阻系数误用带符号流量（B + R*Q 而非 B + R*|Q|），
 * 反流半周期内摩阻变成能源，导致带摩阻的阀门水头振荡十个周期几乎不衰减、
 * 低压谷反而比无摩阻更深。短时程（首周期内流量尚未反向）看不出问题。
 *
 * 本组用例把期望行为固化为断言（基准算例：L=1000, D=0.5, a=1000, H_res=50,
 * V0=1, 瞬时关闭, N=20, 仿真 40 s = 10 个往返周期 4L/a=4 s）：
 *  1. 带摩阻时峰值抬升与谷值深度逐周期单调衰减，且第十周期抬升 ≤ 首周期 80%；
 *  2. 任何周期的谷值不深于同参数无摩阻算例的谷值（数值容差 1e-9 m）；
 *  3. 摩阻越大衰减越快（f=0.05 的末周期抬升低于 f=0.02）；
 *  4. 无摩阻时振荡等幅不衰减（各周期抬升差异 < 1e-9 m，防回归）。
 */

/** 跑 40 s（10 个往返周期）的基准算例，仅改摩阻系数。 */
function runCase(frictionFactor: number): SimulationResult {
  const r = baseRequest();
  r.pipe.frictionFactor = frictionFactor;
  r.duration = 40;
  return runSimulation(validateRequest(r));
}

interface PeriodExtremes {
  /** 该周期内阀门水头峰值相对初始稳态的抬升 */
  rise: number;
  /** 该周期内阀门水头谷值 */
  valley: number;
}

/**
 * 把阀门水头序列按 period 秒一段切开（区间 (p*period, (p+1)*period]，
 * 不含 t=0 的初始稳态点），逐段取峰值抬升与谷值。
 */
function slicePeriods(res: SimulationResult, period: number): PeriodExtremes[] {
  const { time, head } = res.valve;
  const h0 = res.initialValveHead;
  const nPeriods = Math.floor(time[time.length - 1] / period);
  const out: PeriodExtremes[] = [];
  for (let p = 0; p < nPeriods; p++) {
    let peak = -Infinity;
    let valley = Infinity;
    for (let i = 0; i < time.length; i++) {
      if (time[i] > p * period && time[i] <= (p + 1) * period) {
        if (head[i] > peak) peak = head[i];
        if (head[i] < valley) valley = head[i];
      }
    }
    out.push({ rise: peak - h0, valley });
  }
  return out;
}

describe("带摩阻时压力振荡逐周期衰减", () => {
  it("f=0.02：抬升与谷深逐周期单调衰减，第十周期抬升 ≤ 首周期 80%", () => {
    const periods = slicePeriods(runCase(0.02), PERIOD);
    expect(periods.length).toBe(10);

    // 逐周期严格单调：实测相邻周期抬升差约 2.5 m 以上，远高于数值噪声，
    // 故直接用严格不等式，不留容差。
    for (let p = 1; p < periods.length; p++) {
      expect(periods[p].rise).toBeLessThan(periods[p - 1].rise);
      expect(periods[p].valley).toBeGreaterThan(periods[p - 1].valley);
    }

    // 验收界：第十周期抬升不超过首周期的 80%（实测约 75%）。
    expect(periods[9].rise).toBeLessThanOrEqual(0.8 * periods[0].rise);
  });

  it("摩阻越大衰减越快：f=0.05 的第十周期抬升低于 f=0.02", () => {
    const p02 = slicePeriods(runCase(0.02), PERIOD);
    const p05 = slicePeriods(runCase(0.05), PERIOD);
    expect(p05[9].rise).toBeLessThan(p02[9].rise);
  });
});

describe("带摩阻的谷值不深于无摩阻", () => {
  it("f=0.02 / f=0.05 各周期谷值均 ≥ 无摩阻谷值（容差 1e-9 m）", () => {
    const frictionless = slicePeriods(runCase(0), PERIOD);
    const valleyFloor = Math.min(...frictionless.map((p) => p.valley));

    // 同网格、同参数、仅摩阻不同的对照；1e-9 m 仅吸收浮点噪声，
    // 物理上带摩阻谷值应严格更浅（实测首周期即浅约 1.9 m）。
    const TOL = 1e-9;
    for (const f of [0.02, 0.05]) {
      for (const [p, ext] of slicePeriods(runCase(f), PERIOD).entries()) {
        expect(
          ext.valley,
          `f=${f} 第 ${p + 1} 周期谷值 ${ext.valley} 深于无摩阻谷值 ${valleyFloor}`,
        ).toBeGreaterThanOrEqual(valleyFloor - TOL);
      }
    }
  });
});

describe("无摩阻对照：等幅振荡（防回归）", () => {
  it("f=0 时各周期抬升一致（差异 < 1e-9 m）", () => {
    const periods = slicePeriods(runCase(0), PERIOD);
    expect(periods.length).toBe(10);
    for (const p of periods) {
      expect(Math.abs(p.rise - periods[0].rise)).toBeLessThan(1e-9);
      expect(Math.abs(p.valley - periods[0].valley)).toBeLessThan(1e-9);
    }
  });
});
