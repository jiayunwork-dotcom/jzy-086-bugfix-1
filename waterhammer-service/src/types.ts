/**
 * 对外请求/响应与内核共享的类型定义。
 * 所有物理量均为 SI 单位：长度 m、时间 s、水头 m、流速 m/s、流量 m^3/s。
 */

/** 管道几何与物性。 */
export interface PipeSpec {
  /** 管长 L > 0 */
  length: number;
  /** 内径 D > 0 */
  diameter: number;
  /** 波速 a > 0 */
  waveSpeed: number;
  /** 达西摩阻系数 f >= 0（取 0 即无摩阻） */
  frictionFactor: number;
}

/** 线性关闭：开度从 1 线性降到 0，历时 duration（可为 0，表示瞬时关闭）。 */
export interface LinearClosure {
  type: "linear";
  /** 关闭历时 Tc >= 0 */
  duration: number;
}

/** 分段关闭：调用方给出 (time, opening) 折线，开度在相邻点间线性插值。 */
export interface PiecewiseClosure {
  type: "piecewise";
  points: Array<{ time: number; opening: number }>;
}

export type ClosureSpec = LinearClosure | PiecewiseClosure;

/**
 * 离散参数。空间步长必须满足 dx = a*dt（库朗数恰为 1）。
 * - 只给 segments：dx = L/N，dt = dx/a，天然贴格；
 * - 只给 timeStep：要求 L/(a*dt) 为整数，否则报 GRID_NOT_CONFORMING；
 * - 两者都给：要求 N*a*dt 与 L 一致，否则报 GRID_NOT_CONFORMING。
 */
export interface DiscretizationSpec {
  segments?: number;
  timeStep?: number;
}

/** POST /simulate 的请求体。 */
export interface SimulationRequest {
  pipe: PipeSpec;
  /** 上游水库恒定水头 H_res */
  reservoirHead: number;
  /** 初始（稳态）断面平均流速 V0 */
  initialVelocity: number;
  closure: ClosureSpec;
  discretization: DiscretizationSpec;
  /** 仿真总时长 > 0 */
  duration: number;
  /** 推进步数上限，缺省 DEFAULT_MAX_STEPS；超过即报 STEPS_EXCEEDED */
  maxSteps?: number;
}

/** 校验通过、可直接喂给求解器的输入（字段齐备、类型收窄）。 */
export type ValidatedRequest = Required<Omit<SimulationRequest, "maxSteps">> & {
  maxSteps: number;
};

/** 贴格网格。 */
export interface Grid {
  /** 管段数 N */
  segments: number;
  /** 空间步长 dx = L/N */
  dx: number;
  /** 时间步长 dt = dx/a */
  dt: number;
  /** 推进总步数 */
  steps: number;
}

/** 某一时刻的全管状态。 */
export interface PipeState {
  time: number;
  /** 节点坐标 x_0..x_N */
  x: number[];
  /** 节点水头 */
  head: number[];
  /** 节点流量 */
  flow: number[];
}

/** 求解器原始输出（HTTP 层再裁剪）。 */
export interface SimulationResult {
  grid: Grid;
  /** 阀门处水头时间序列 */
  valve: { time: number[]; head: number[] };
  /** 末态全管水头/流量分布 */
  finalState: PipeState;
  /** 初始稳态阀门水头（峰值抬升的基准） */
  initialValveHead: number;
  /** 连续性诊断序列：供流量协调校验/测试使用 */
  diagnostics: {
    time: number[];
    /** 全管水头的梯形加权平均 */
    meanHead: number[];
    /** 上游断面流量 Q(0,t) */
    inflow: number[];
    /** 下游（阀门）断面流量 Q(L,t) */
    outflow: number[];
  };
  /** 派生量计算所需的常量 */
  derived: {
    area: number;
    /** 儒可夫斯基水锤升压 a*|V0|/g */
    joukowskyRise: number;
    /** 波往返周期理论值 4L/a */
    theoreticalPeriod: number;
  };
}
