// 集中导出，便于测试只引一个入口。
export { runSimulation } from "./solver.js";
export { validateRequest, DEFAULT_MAX_STEPS } from "./validation.js";
export { summarize } from "./analysis.js";
export type { SimulationSummary } from "./analysis.js";
export { buildApp } from "./http.js";
export { ServiceError } from "./errors.js";
export { GRAVITY } from "./constants.js";
export type { SimulationRequest, SimulationResult } from "./types.js";
