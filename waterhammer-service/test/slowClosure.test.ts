import { describe, expect, it } from "vitest";
import { runSimulation, summarize, validateRequest } from "../src/index.js";
import { baseRequest } from "./helpers.js";

/**
 * 缓慢关闭（关闭历时明显大于波往返周期 2L/a）时，
 * 阀门峰值水头必须低于瞬时关闭的情形。
 */
describe("缓慢关闭峰值低于瞬时关闭", () => {
  it("Tc = 8 个往返时间（16 s，2L/a = 2 s）", () => {
    const instantaneous = summarize(runSimulation(validateRequest(baseRequest())));

    const r = baseRequest();
    r.closure = { type: "linear", duration: 16 };
    r.duration = 24;
    const slow = summarize(runSimulation(validateRequest(r)));

    expect(slow.peakHead).toBeLessThan(instantaneous.peakHead);
    expect(slow.peakToJoukowskyRatio!).toBeLessThan(1);
    expect(slow.peakToJoukowskyRatio!).toBeLessThan(instantaneous.peakToJoukowskyRatio!);
  });

  it("等效的分段关闭折线与线性关闭给出一致结果", () => {
    const linear = baseRequest();
    linear.closure = { type: "linear", duration: 16 };
    linear.duration = 24;

    const piecewise = baseRequest();
    piecewise.closure = {
      type: "piecewise",
      points: [
        { time: 0, opening: 1 },
        { time: 16, opening: 0 },
      ],
    };
    piecewise.duration = 24;

    const a = runSimulation(validateRequest(linear));
    const b = runSimulation(validateRequest(piecewise));
    expect(b.valve.head).toEqual(a.valve.head);
  });
});
