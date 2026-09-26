import { describe, expect, it } from "vitest";
import { runSimulation, summarize, validateRequest } from "../src/index.js";
import { baseRequest, JOUKOWSKY } from "./helpers.js";

/**
 * 瞬时全关（Tc=0）时，阀门处水头抬升应逼近儒可夫斯基值 a*V0/g。
 * 无摩阻 + 库朗数=1 时 MOC 对该问题是精确的，容差放到 1e-6；
 * 带摩阻时摩阻会略微削减峰值，容差放宽到 5%。
 */
describe("瞬时关闭逼近儒可夫斯基值", () => {
  it("无摩阻：峰值抬升 ≈ a*V0/g（相对容差 1e-6）", () => {
    const res = runSimulation(validateRequest(baseRequest()));
    const s = summarize(res);
    expect(s.peakHeadRise).toBeGreaterThan(0);
    expect(Math.abs(s.peakHeadRise - JOUKOWSKY) / JOUKOWSKY).toBeLessThan(1e-6);
    expect(s.peakToJoukowskyRatio).not.toBeNull();
    expect(Math.abs(s.peakToJoukowskyRatio! - 1)).toBeLessThan(1e-6);
  });

  it("带摩阻（f=0.02）：峰值抬升仍在儒可夫斯基值的 ±5% 以内", () => {
    const r = baseRequest();
    r.pipe.frictionFactor = 0.02;
    const res = runSimulation(validateRequest(r));
    const s = summarize(res);
    // 注意：比值可略大于 1 —— 到达阀门的 C+ 特征线把上游邻点的稳态水头
    // （含末段摩阻落差）带进边界解，峰值抬升因此包含沿程摩阻梯度的恢复。
    expect(s.peakToJoukowskyRatio).toBeGreaterThan(0.95);
    expect(s.peakToJoukowskyRatio!).toBeLessThan(1.05);
  });

  it("关闭历时远小于波往返时间（Tc = L/a 的 1/10）同样逼近", () => {
    const r = baseRequest();
    r.closure = { type: "linear", duration: 0.1 }; // 2L/a = 2 s，Tc 远小于它
    const res = runSimulation(validateRequest(r));
    const s = summarize(res);
    expect(Math.abs(s.peakHeadRise - JOUKOWSKY) / JOUKOWSKY).toBeLessThan(0.01);
  });
});
