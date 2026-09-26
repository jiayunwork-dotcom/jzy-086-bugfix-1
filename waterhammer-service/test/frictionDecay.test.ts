import { describe, expect, it } from "vitest";
import { runSimulation, validateRequest } from "../src/index.js";
import { baseRequest } from "./helpers.js";

/**
 * 长时程摩阻衰减（回归测试）。
 *
 * 历史缺陷：C- 特征线的摩阻阻抗误用带符号流量 R·Q（正确形式为 R·|Q|，
 * 见 src/characteristics.ts 注释与 README）。流量反向后摩阻变号成为
 * 「负阻尼」，与 C+ 的阻尼大致对消，导致带摩阻振荡几十周期不衰减、
 * 低压谷反而比无摩阻更深。短时程（t < 2L/a，管内流量尚未反向）看不出，
 * 必须拉长仿真时长才暴露。
 *
 * 算例：L=1000 m, D=0.5 m, a=1000 m/s, H_res=50 m, V0=1 m/s,
 * 瞬时关闭（Tc=0），N=20（dx=50 m, dt=0.05 s），历时 40 s。
 * 往返周期 4L/a = 4 s，40 s 恰为 10 个周期；按整步数分箱（80 步/周期），
 * 避免浮点时刻落在周期边界上的歧义。
 */
const CYCLES = 10;
const STEPS_PER_CYCLE = 80; // (4L/a) / dt = 4 / 0.05

interface CycleMetrics {
  /** 每周期峰值抬升：峰值 − 初始稳态阀门水头 */
  rises: number[];
  /** 每周期谷值深度：初始稳态阀门水头 − 谷值 */
  depths: number[];
  /** 每周期谷值（绝对水头） */
  valleys: number[];
  initialValveHead: number;
  head: number[];
}

function perCycle(frictionFactor: number): CycleMetrics {
  const r = baseRequest();
  r.pipe.frictionFactor = frictionFactor;
  r.duration = 40; // 10 个往返周期
  const res = runSimulation(validateRequest(r));
  const { head } = res.valve;
  // 分箱前提：40 s 恰好 10×80 步（网格改动时此断言先失败，提示同步本文件）
  expect(res.grid.steps).toBe(CYCLES * STEPS_PER_CYCLE);

  const rises: number[] = [];
  const depths: number[] = [];
  const valleys: number[] = [];
  for (let c = 0; c < CYCLES; c++) {
    let peak = -Infinity;
    let valley = Infinity;
    for (let i = c * STEPS_PER_CYCLE; i < (c + 1) * STEPS_PER_CYCLE; i++) {
      peak = Math.max(peak, head[i]);
      valley = Math.min(valley, head[i]);
    }
    rises.push(peak - res.initialValveHead);
    depths.push(res.initialValveHead - valley);
    valleys.push(valley);
  }
  return { rises, depths, valleys, initialValveHead: res.initialValveHead, head };
}

describe("带摩阻时振荡逐周期衰减", () => {
  it("f=0.02：峰值抬升逐周期严格减小，第 10 周期 ≤ 第 1 周期的 80%", () => {
    const { rises } = perCycle(0.02);
    for (let c = 1; c < CYCLES; c++) {
      // 严格递减（实测每周期降幅约 3 m，无容差需求）
      expect(rises[c]).toBeLessThan(rises[c - 1]);
    }
    // 验收线：第 10 周期峰值抬升不超过第 1 周期的 80%（实测约 75.4%）
    expect(rises[CYCLES - 1]).toBeLessThanOrEqual(0.8 * rises[0]);
  });

  it("f=0.02：谷值深度逐周期不增，第 10 周期 ≤ 第 1 周期的 80%", () => {
    const { depths } = perCycle(0.02);
    for (let c = 1; c < CYCLES; c++) {
      // 非严格：低压平台末点恰落在相邻两周期的公共步上，
      // 第 1、2 周期谷值深度允许相等（此后严格减小）；
      // 1e-9 容差仅吸收两点末位浮点差（物理降幅每周期约 3 m）
      expect(depths[c]).toBeLessThanOrEqual(depths[c - 1] + 1e-9);
    }
    // 验收线：第 10 周期谷值深度不超过第 1 周期的 80%（实测约 76.9%）
    expect(depths[CYCLES - 1]).toBeLessThanOrEqual(0.8 * depths[0]);
  });

  it("摩阻越大衰减越快：f=0.05 的峰值抬升保留比低于 f=0.02", () => {
    const weak = perCycle(0.02);
    const strong = perCycle(0.05);
    const retention = (rises: number[]) => rises[CYCLES - 1] / rises[0];
    // 实测：f=0.02 保留约 75.4%，f=0.05 保留约 57.1%
    expect(retention(strong.rises)).toBeLessThan(retention(weak.rises));
  });

  it("无摩阻：振荡等幅不衰减，第 2 周期起逐点周期重复", () => {
    const { rises, depths, head } = perCycle(0);
    for (let c = 1; c < CYCLES; c++) {
      // 无摩阻 + 库朗数=1 时 MOC 对该问题精确，极值逐点相等（容差 0）
      expect(rises[c]).toBe(rises[0]);
      expect(depths[c]).toBe(depths[0]);
    }
    // 第 2 周期起整段序列逐点重复（第 1 周期含 t=0 初始稳态点，不参与）
    for (let i = STEPS_PER_CYCLE; i + STEPS_PER_CYCLE < head.length; i++) {
      expect(head[i + STEPS_PER_CYCLE]).toBe(head[i]);
    }
  });
});

describe("带摩阻的谷值不深于无摩阻", () => {
  it.each([0.02, 0.05])("f=%s：十个周期的谷值均不越过无摩阻谷值", (f) => {
    const frictionless = perCycle(0);
    const frictionlessValley = Math.min(...frictionless.valleys); // ≈ -51.94 m
    const { valleys } = perCycle(f);
    for (const v of valleys) {
      // 容差 1e-9 m，仅吸收浮点噪声；物理余量约 1.9 m（f=0.02）/ 4.4 m（f=0.05）
      expect(v).toBeGreaterThanOrEqual(frictionlessValley - 1e-9);
    }
  });
});
