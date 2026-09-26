import { ServiceError } from "./errors.js";
import type { SimulationRequest, ValidatedRequest } from "./types.js";

/** 推进步数缺省上限：超过即报 STEPS_EXCEEDED，防止失控循环。 */
export const DEFAULT_MAX_STEPS = 200_000;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function fail(message: string, details?: Record<string, unknown>): never {
  throw new ServiceError("INVALID_INPUT", message, details);
}

/**
 * 输入校验。以下情况一律判非法（INVALID_INPUT）：
 * - 波速、管长、管径非正；
 * - 摩阻系数为负；
 * - 关闭历时为负（或分段折线非法）；
 * - 缺水库水头或初始流速；
 * - 仿真时长非正、maxSteps 非正。
 * 网格贴格与否由 grid.ts 单独判定（GRID_NOT_CONFORMING）。
 */
export function validateRequest(raw: unknown): ValidatedRequest {
  if (typeof raw !== "object" || raw === null) {
    fail("request body must be a JSON object");
  }
  const req = raw as Partial<SimulationRequest>;

  // ---- 管道 ----
  const pipe = req.pipe;
  if (typeof pipe !== "object" || pipe === null) fail("pipe is required");
  const { length, diameter, waveSpeed, frictionFactor } = pipe!;
  if (!isFiniteNumber(length) || length <= 0) fail("pipe.length must be a positive number", { length });
  if (!isFiniteNumber(diameter) || diameter <= 0) fail("pipe.diameter must be a positive number", { diameter });
  if (!isFiniteNumber(waveSpeed) || waveSpeed <= 0) fail("pipe.waveSpeed must be a positive number", { waveSpeed });
  if (!isFiniteNumber(frictionFactor) || frictionFactor < 0) {
    fail("pipe.frictionFactor must be a non-negative number", { frictionFactor });
  }

  // ---- 水库水头 / 初始流速（缺失即非法） ----
  if (!isFiniteNumber(req.reservoirHead)) fail("reservoirHead is required and must be a finite number");
  if (!isFiniteNumber(req.initialVelocity)) fail("initialVelocity is required and must be a finite number");

  // ---- 关闭规律 ----
  const closure = req.closure;
  if (typeof closure !== "object" || closure === null) fail("closure is required");
  if (closure!.type === "linear") {
    const d = (closure as { duration?: unknown }).duration;
    if (!isFiniteNumber(d)) fail("closure.duration is required and must be a finite number");
    if (d < 0) fail("closure.duration must be >= 0", { duration: d });
  } else if (closure!.type === "piecewise") {
    const points = (closure as { points?: unknown }).points;
    if (!Array.isArray(points) || points.length === 0) {
      fail("closure.points must be a non-empty array for piecewise closure");
    }
    let prevTime = -Infinity;
    for (const p of points) {
      if (typeof p !== "object" || p === null) fail("closure.points entries must be objects");
      const { time, opening } = p as { time?: unknown; opening?: unknown };
      if (!isFiniteNumber(time) || time < 0) fail("closure point time must be a finite number >= 0", { time });
      if (!isFiniteNumber(opening) || opening < 0 || opening > 1) {
        fail("closure point opening must be within [0, 1]", { opening });
      }
      if (time < prevTime) fail("closure points must be ordered by non-decreasing time");
      prevTime = time;
    }
  } else {
    fail("closure.type must be 'linear' or 'piecewise'", { type: (closure as { type?: unknown }).type });
  }

  // ---- 离散参数（存在性/基本合法；贴格判定在 grid.ts） ----
  const disc = req.discretization;
  if (typeof disc !== "object" || disc === null) {
    fail("discretization is required (segments and/or timeStep)");
  }
  if (disc!.segments === undefined && disc!.timeStep === undefined) {
    fail("discretization requires at least one of segments / timeStep");
  }
  if (disc!.segments !== undefined && (!Number.isInteger(disc!.segments) || disc!.segments < 1)) {
    fail("discretization.segments must be an integer >= 1", { segments: disc!.segments });
  }
  if (disc!.timeStep !== undefined && (!isFiniteNumber(disc!.timeStep) || disc!.timeStep <= 0)) {
    fail("discretization.timeStep must be a positive number", { timeStep: disc!.timeStep });
  }

  // ---- 仿真时长与步数上限 ----
  if (!isFiniteNumber(req.duration) || req.duration <= 0) {
    fail("duration must be a positive number", { duration: req.duration });
  }
  const maxSteps = req.maxSteps ?? DEFAULT_MAX_STEPS;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    fail("maxSteps must be an integer >= 1", { maxSteps: req.maxSteps });
  }

  return req as ValidatedRequest & { maxSteps: number };
}
