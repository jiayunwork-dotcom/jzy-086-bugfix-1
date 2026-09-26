import type { SimulationResult } from "./types.js";

export interface SimulationSummary {
  /** 初始稳态阀门水头（峰值抬升基准） */
  initialValveHead: number;
  /** 阀门水头峰值及出现时刻 */
  peakHead: number;
  peakTime: number;
  /** 峰值相对初始稳态的抬升 */
  peakHeadRise: number;
  /** 儒可夫斯基升压 a*|V0|/g */
  joukowskyRise: number;
  /** 峰值抬升 / 儒可夫斯基值（V0=0 时无意义，为 null） */
  peakToJoukowskyRatio: number | null;
  /** 阀门水头第二次达到峰值的时刻（用于观测往返周期；观测不到为 null） */
  secondPeakTime: number | null;
  /** 观测往返周期 = secondPeakTime - peakTime */
  observedRoundTripPeriod: number | null;
  /** 理论往返周期 4L/a */
  theoreticalRoundTripPeriod: number;
}

/**
 * 从阀门水头序列提取峰值与往返周期观测。
 *
 * 第二次峰值的判据：以「峰值抬升的 90%」为阈值，取首次越阈时刻 t1 与
 * t1 之后至少一个回波时间 2L/a 之后的再次越阈时刻 t2，观测周期 = t2 - t1。
 * 用越阈时刻（而非峰值平台内的 argmax）是为了让带摩阻时平台内的缓慢爬升
 * 不把两个时刻错开半个平台。摩阻使峰值逐周期衰减，故阈值留 10% 余量；
 * 缓关使波形畸变到判不出第二峰时返回 null。
 */
export function summarize(result: SimulationResult): SimulationSummary {
  const { time, head } = result.valve;
  const { initialValveHead, derived } = result;
  const waveTravelTime = derived.theoreticalPeriod / 4; // L/a

  let peakIdx = 0;
  for (let i = 1; i < head.length; i++) {
    if (head[i] > head[peakIdx]) peakIdx = i;
  }
  const peakHead = head[peakIdx];
  const peakTime = time[peakIdx];
  const peakHeadRise = peakHead - initialValveHead;

  const threshold = peakHead - 0.1 * Math.max(peakHeadRise, 1e-12);
  let t1: number | null = null;
  for (let i = 0; i < head.length; i++) {
    if (head[i] >= threshold) {
      t1 = time[i];
      break;
    }
  }
  const searchStart = (t1 ?? peakTime) + 2 * waveTravelTime;
  let secondPeakTime: number | null = null;
  if (t1 !== null) {
    for (let i = 0; i < head.length; i++) {
      if (time[i] >= searchStart && head[i] >= threshold) {
        secondPeakTime = time[i];
        break;
      }
    }
  }

  const joukowskyRise = derived.joukowskyRise;
  return {
    initialValveHead,
    peakHead,
    peakTime,
    peakHeadRise,
    joukowskyRise,
    peakToJoukowskyRatio: joukowskyRise > 0 ? peakHeadRise / joukowskyRise : null,
    secondPeakTime,
    observedRoundTripPeriod:
      secondPeakTime !== null && t1 !== null ? secondPeakTime - t1 : null,
    theoreticalRoundTripPeriod: derived.theoreticalPeriod,
  };
}
