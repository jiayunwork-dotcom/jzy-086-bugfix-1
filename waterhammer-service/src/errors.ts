/**
 * 服务级错误。code 会原样出现在 HTTP 响应的 error.code 字段里，
 * 供调用方做程序化分支。
 */
export type ErrorCode =
  | "INVALID_INPUT" // 参数非法（非正几何量、缺水库水头/初始流速、负关闭历时等）
  | "GRID_NOT_CONFORMING" // 离散参数凑不出库朗数恰为 1 的贴格网格
  | "STEPS_EXCEEDED"; // 推进步数超过上限

export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.details = details;
  }
}
