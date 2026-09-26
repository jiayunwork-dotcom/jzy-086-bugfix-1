import { describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { baseRequest, JOUKOWSKY } from "./helpers.js";

describe("HTTP 层", () => {
  it("POST /simulate 返回阀门序列、摘要与末态", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/simulate",
      payload: baseRequest(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.grid.courant).toBe(1);
    expect(body.valve.time.length).toBe(body.valve.head.length);
    expect(body.summary.peakHead).toBeGreaterThan(body.summary.initialValveHead);
    expect(Math.abs(body.summary.peakHeadRise - JOUKOWSKY) / JOUKOWSKY).toBeLessThan(1e-6);
    expect(body.summary.observedRoundTripPeriod).toBeCloseTo(4, 1);
    expect(body.finalState.head.length).toBe(body.grid.segments + 1);
    expect(body.finalState.flow.length).toBe(body.grid.segments + 1);
    await app.close();
  });

  it("非法参数 -> 400 + 结构化错误 INVALID_INPUT", async () => {
    const app = buildApp();
    const payload = baseRequest();
    payload.pipe.waveSpeed = -5;
    const res = await app.inject({ method: "POST", url: "/simulate", payload });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(typeof body.error.message).toBe("string");
    await app.close();
  });

  it("网格不贴格 -> 400 + 结构化错误 GRID_NOT_CONFORMING", async () => {
    const app = buildApp();
    const payload = baseRequest();
    payload.discretization = { timeStep: 0.07 };
    const res = await app.inject({ method: "POST", url: "/simulate", payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("GRID_NOT_CONFORMING");
    await app.close();
  });

  it("步数超限 -> 400 + 结构化错误 STEPS_EXCEEDED", async () => {
    const app = buildApp();
    const payload = baseRequest();
    payload.maxSteps = 5;
    const res = await app.inject({ method: "POST", url: "/simulate", payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("STEPS_EXCEEDED");
    await app.close();
  });

  it("GET /health", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
