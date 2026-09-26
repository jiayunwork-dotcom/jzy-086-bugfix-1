import { GRAVITY } from "./constants.js";
import { buildClosure } from "./closure.js";
import { ServiceError } from "./errors.js";
import { buildGrid } from "./grid.js";
import {
  interiorNode,
  minusRelation,
  plusRelation,
  reachFriction,
  waveImpedance,
} from "./characteristics.js";
import { reservoirBoundary, valveBoundary } from "./boundaries.js";
import type { SimulationResult, ValidatedRequest } from "./types.js";

/**
 * 时间推进内核：特征线法（MOC），库朗数恒为 1。
 *
 * 每个时步：
 *  1. 内部节点 i=1..N-1：联立从 i-1 到达的 C+ 与从 i+1 到达的 C-；
 *  2. 上游节点 0：水库水头锁死，与 C- 联立；
 *  3. 下游节点 N：阀门孔口关系（开度由关闭规律给出）与 C+ 联立。
 * 全部使用旧时层状态构造特征线系数，新时层一次性更新（显式、无生代循环）。
 */
export function runSimulation(req: ValidatedRequest): SimulationResult {
  const { pipe, reservoirHead, initialVelocity, duration, maxSteps } = req;
  const area = (Math.PI / 4) * pipe.diameter ** 2;
  const grid = buildGrid(pipe, req.discretization, duration);

  if (grid.steps > maxSteps) {
    throw new ServiceError(
      "STEPS_EXCEEDED",
      `simulation requires ${grid.steps} time steps, exceeding the limit of ${maxSteps}`,
      { steps: grid.steps, maxSteps },
    );
  }

  const N = grid.segments;
  const dx = grid.dx;
  const dt = grid.dt;
  const B = waveImpedance(pipe.waveSpeed, area);
  const R = reachFriction(pipe.frictionFactor, dx, pipe.diameter, area);

  // ---- 初始稳态：流量均匀，水头沿程按二次损失线性下降 ----
  const q0 = initialVelocity * area;
  const head = new Array<number>(N + 1);
  const flow = new Array<number>(N + 1);
  for (let i = 0; i <= N; i++) {
    flow[i] = q0;
    head[i] = reservoirHead - i * R * q0 * Math.abs(q0);
  }
  const initialValveHead = head[N];
  if (!(initialValveHead > 0)) {
    throw new ServiceError(
      "INVALID_INPUT",
      "steady-state valve head is non-positive (friction loss exceeds reservoir head); cannot calibrate valve",
      { reservoirHead, initialValveHead },
    );
  }
  const valveCoeff = q0 / Math.sqrt(initialValveHead);

  const tau = buildClosure(req.closure);

  // ---- 记录序列 ----
  const steps = grid.steps;
  const vTime = new Array<number>(steps + 1);
  const vHead = new Array<number>(steps + 1);
  const dTime = new Array<number>(steps + 1);
  const dMean = new Array<number>(steps + 1);
  const dIn = new Array<number>(steps + 1);
  const dOut = new Array<number>(steps + 1);

  const meanHead = (h: number[]): number => {
    // 梯形加权平均：端点权重 1/2
    let s = 0.5 * (h[0] + h[N]);
    for (let i = 1; i < N; i++) s += h[i];
    return s / N;
  };

  vTime[0] = 0;
  vHead[0] = head[N];
  dTime[0] = 0;
  dMean[0] = meanHead(head);
  dIn[0] = flow[0];
  dOut[0] = flow[N];

  const headNew = new Array<number>(N + 1);
  const flowNew = new Array<number>(N + 1);

  for (let n = 1; n <= steps; n++) {
    const t = n * dt;
    const tauNow = tau(t);

    // 内部节点：C+ 来自 i-1，C- 来自 i+1（均为旧时层）
    for (let i = 1; i < N; i++) {
      const plus = plusRelation(head[i - 1], flow[i - 1], B, R);
      const minus = minusRelation(head[i + 1], flow[i + 1], B, R);
      const { head: h, flow: q } = interiorNode(plus, minus);
      headNew[i] = h;
      flowNew[i] = q;
    }

    // 上游边界：水库
    const up = reservoirBoundary(reservoirHead, minusRelation(head[1], flow[1], B, R));
    headNew[0] = up.head;
    flowNew[0] = up.flow;

    // 下游边界：阀门
    const down = valveBoundary(plusRelation(head[N - 1], flow[N - 1], B, R), tauNow, valveCoeff);
    headNew[N] = down.head;
    flowNew[N] = down.flow;

    for (let i = 0; i <= N; i++) {
      head[i] = headNew[i];
      flow[i] = flowNew[i];
    }

    vTime[n] = t;
    vHead[n] = head[N];
    dTime[n] = t;
    dMean[n] = meanHead(head);
    dIn[n] = flow[0];
    dOut[n] = flow[N];
  }

  const x = Array.from({ length: N + 1 }, (_, i) => i * dx);

  return {
    grid,
    valve: { time: vTime, head: vHead },
    finalState: { time: steps * dt, x, head: [...head], flow: [...flow] },
    initialValveHead,
    diagnostics: { time: dTime, meanHead: dMean, inflow: dIn, outflow: dOut },
    derived: {
      area,
      joukowskyRise: (pipe.waveSpeed * Math.abs(initialVelocity)) / GRAVITY,
      theoreticalPeriod: (4 * pipe.length) / pipe.waveSpeed,
    },
  };
}
