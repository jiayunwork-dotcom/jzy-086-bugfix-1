import { describe, expect, it } from "vitest";
import { runSimulation, ServiceError, validateRequest } from "../src/index.js";
import { baseRequest } from "./helpers.js";

/** 断言校验/求解抛出指定 code 的 ServiceError。 */
function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`expected ServiceError(${code}), but nothing was thrown`);
}

describe("输入校验：非法参数判 INVALID_INPUT", () => {
  it("波速非正", () => {
    const r = baseRequest();
    r.pipe.waveSpeed = 0;
    expectCode(() => validateRequest(r), "INVALID_INPUT");
    r.pipe.waveSpeed = -1000;
    expectCode(() => validateRequest(r), "INVALID_INPUT");
  });

  it("管长非正", () => {
    const r = baseRequest();
    r.pipe.length = -1;
    expectCode(() => validateRequest(r), "INVALID_INPUT");
  });

  it("管径非正", () => {
    const r = baseRequest();
    r.pipe.diameter = 0;
    expectCode(() => validateRequest(r), "INVALID_INPUT");
  });

  it("关闭历时为负", () => {
    const r = baseRequest();
    r.closure = { type: "linear", duration: -0.5 };
    expectCode(() => validateRequest(r), "INVALID_INPUT");
  });

  it("缺水库水头", () => {
    const r = baseRequest() as unknown as Record<string, unknown>;
    delete r.reservoirHead;
    expectCode(() => validateRequest(r), "INVALID_INPUT");
  });

  it("缺初始流速", () => {
    const r = baseRequest() as unknown as Record<string, unknown>;
    delete r.initialVelocity;
    expectCode(() => validateRequest(r), "INVALID_INPUT");
  });

  it("摩阻系数为负 / 分段折线开度越界", () => {
    const r = baseRequest();
    r.pipe.frictionFactor = -0.01;
    expectCode(() => validateRequest(r), "INVALID_INPUT");

    const r2 = baseRequest();
    r2.closure = { type: "piecewise", points: [{ time: 0, opening: 1.2 }] };
    expectCode(() => validateRequest(r2), "INVALID_INPUT");
  });
});

describe("网格贴格：库朗数必须恰为 1", () => {
  it("只给 timeStep 且 L/(a*dt) 非整数 -> GRID_NOT_CONFORMING", () => {
    const r = baseRequest();
    r.discretization = { timeStep: 0.07 }; // 1000/(1000*0.07) = 14.2857
    expectCode(() => runSimulation(validateRequest(r)), "GRID_NOT_CONFORMING");
  });

  it("segments 与 timeStep 同时给出但不自洽 -> GRID_NOT_CONFORMING", () => {
    const r = baseRequest();
    r.discretization = { segments: 20, timeStep: 0.06 }; // 20*1000*0.06 = 1200 != 1000
    expectCode(() => runSimulation(validateRequest(r)), "GRID_NOT_CONFORMING");
  });

  it("只给 timeStep 且恰能整除 -> 正常推进且 dt 贴格", () => {
    const r = baseRequest();
    r.discretization = { timeStep: 0.05 };
    const res = runSimulation(validateRequest(r));
    expect(res.grid.segments).toBe(20);
    expect(res.grid.dt).toBeCloseTo(0.05, 12);
    expect(res.grid.dx).toBeCloseTo(res.grid.dt * 1000, 12); // dx = a*dt
  });

  it("segments 与 timeStep 自洽 -> 正常推进", () => {
    const r = baseRequest();
    r.discretization = { segments: 25, timeStep: 0.04 };
    const res = runSimulation(validateRequest(r));
    expect(res.grid.segments).toBe(25);
  });
});

describe("推进步数上限", () => {
  it("超过 maxSteps -> STEPS_EXCEEDED", () => {
    const r = baseRequest();
    r.maxSteps = 10; // 实际需要 10/0.05 = 200 步
    expectCode(() => runSimulation(validateRequest(r)), "STEPS_EXCEEDED");
  });
});
