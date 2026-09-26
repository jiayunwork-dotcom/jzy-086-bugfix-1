import { ServiceError } from "./errors.js";
import type { DiscretizationSpec, Grid, PipeSpec } from "./types.js";

/** 判定 L/(a*dt) 是否为整数的相对容差。 */
const CONFORM_TOL = 1e-6;

/**
 * 按特征线法要求构造贴格网格：dx = a*dt，库朗数 Cr = a*dt/dx 恰为 1。
 * 凑不出贴格网格时抛 GRID_NOT_CONFORMING，绝不做插值勉强推进。
 */
export function buildGrid(
  pipe: PipeSpec,
  disc: DiscretizationSpec,
  duration: number,
): Grid {
  const { length: L, waveSpeed: a } = pipe;
  const hasN = disc.segments !== undefined;
  const hasDt = disc.timeStep !== undefined;

  if (!hasN && !hasDt) {
    throw new ServiceError(
      "INVALID_INPUT",
      "discretization requires at least one of segments / timeStep",
    );
  }

  let segments: number;
  let dt: number;

  if (hasN && disc.segments !== undefined) {
    if (!Number.isInteger(disc.segments) || disc.segments < 1) {
      throw new ServiceError("INVALID_INPUT", "discretization.segments must be an integer >= 1", {
        segments: disc.segments,
      });
    }
    segments = disc.segments;
    const dx = L / segments;
    if (hasDt && disc.timeStep !== undefined) {
      // 两者都给：必须自洽，即 a*dt*N == L
      dt = disc.timeStep;
      const mismatch = Math.abs(a * dt * segments - L) / L;
      if (mismatch > CONFORM_TOL) {
        throw new ServiceError(
          "GRID_NOT_CONFORMING",
          "segments and timeStep are inconsistent with Courant = 1: require segments * waveSpeed * timeStep == length",
          { segments, timeStep: dt, waveSpeed: a, length: L, relativeMismatch: mismatch },
        );
      }
    } else {
      dt = dx / a;
    }
  } else {
    // 只给 timeStep：L/(a*dt) 必须为整数
    dt = disc.timeStep as number;
    if (!(dt > 0) || !Number.isFinite(dt)) {
      throw new ServiceError("INVALID_INPUT", "discretization.timeStep must be a positive number", {
        timeStep: dt,
      });
    }
    const nReal = L / (a * dt);
    const nRound = Math.round(nReal);
    const mismatch = Math.abs(nReal - nRound) / nReal;
    if (nRound < 1 || mismatch > CONFORM_TOL) {
      throw new ServiceError(
        "GRID_NOT_CONFORMING",
        "length / (waveSpeed * timeStep) is not an integer; grid cannot satisfy Courant = 1",
        { timeStep: dt, waveSpeed: a, length: L, reachesReal: nReal },
      );
    }
    segments = nRound;
  }

  const dx = L / segments;
  // 用贴格后的真实 dt（只给 segments 时严格为 dx/a）
  const dtConforming = dx / a;
  const steps = Math.ceil(duration / dtConforming - 1e-12);

  return { segments, dx, dt: dtConforming, steps };
}
