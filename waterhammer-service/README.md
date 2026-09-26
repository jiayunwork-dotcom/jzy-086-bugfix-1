# waterhammer-service

单管水锤瞬变验算的轻量 HTTP 服务。喂入管道几何与阀门关闭规律（JSON），
内核用**特征线法（MOC）**沿时间和管轴逐步推进，回报全管水头/流量随空间、
时间的演化，重点给出**阀门处水头峰值**及其与儒可夫斯基值之比。

- 运行时：Node.js 20（锁定），TypeScript，HTTP 层 Fastify
- 只经 HTTP 收 JSON、回 JSON，**无前端页面**
- 全部物理量为 SI 单位：m、s、m（水头）、m/s、m³/s

## 快速开始

```bash
# 容器一键启动（推荐）
docker compose up --build

# 或本地开发
npm ci
npm test          # 自动化测试
npm run dev       # tsx 热重载，监听 3000
# 或：npm run build && npm start
```

## 物理模型与数值方法

### 控制方程

等截面单管，弹性水锤标准方程（H 水头，Q 流量，a 波速，f 达西摩阻系数）：

```
∂H/∂t + (a²/(gA)) ∂Q/∂x = 0
∂Q/∂t + gA ∂H/∂x + (f/(2DA)) Q|Q| = 0
```

### 特征线法与贴格网格

沿特征线 `dx/dt = ±a` 积分，**库朗数恒取 1**：`dx = a·dt`。
调用方给 `segments`（N）或 `timeStep`（dt）或两者：

- 只给 N：`dx = L/N`，`dt = dx/a`，天然贴格；
- 只给 dt：要求 `L/(a·dt)` 为整数（相对容差 1e-6），否则 `GRID_NOT_CONFORMING`；
- 两者都给：要求 `N·a·dt = L`，否则 `GRID_NOT_CONFORMING`。

凑不出贴格网格时**直接报错，不做特征线插值、不勉强推进**。
推进步数 `steps = duration/dt` 超过 `maxSteps`（默认 200000）即报
`STEPS_EXCEEDED` 终止，不会陷入失控循环。

### 特征线系数（src/characteristics.ts）

```
C+:  H_P = Cp − Bp·Q_P      Cp = H_{i−1} + B·Q_{i−1},  Bp = B + R·|Q_{i−1}|
C−:  H_P = Cm + Bm·Q_P      Cm = H_{i+1} − B·Q_{i+1},  Bm = B + R·|Q_{i+1}|
```

其中 `B = a/(gA)` 为管道阻抗，`R = f·dx/(2gDA²)` 为每管段摩阻系数，
旧时层取值。内部节点联立两族特征线：`Q = (Cp − Cm)/(Bp + Bm)`。

### 摩阻线性化（本实现的选择）

稳态二次损失 `R·Q|Q|` 沿特征线**线性化为 `R·|Q_old|·Q_P`**（Wylie &
Streeter 一阶近似）：把上一时层流量的模当作已知系数吸收进阻抗
`Bp/Bm`，避免每个节点每步解非线性方程。该近似在一阶精度内与显式
摩阻一致，且对流量变号稳健。

### 边界条件（src/boundaries.ts）

- **上游水库**：水头锁死 `H = H_res`，与到达边界的 C− 特征线联立得
  `Q = (H_res − Cm)/Bm`。
- **下游阀门**：孔口关系 `Q = τ(t)·Cv·√H`（`Cv = Q0/√Hv0` 由初始稳态
  标定，τ 为相对开度）与到达阀门的 C+ 特征线 `H = Cp − Bp·Q` **联立**，
  代入 `s = √H` 解二次方程 `s² + Bp·k·s − Cp = 0`（`k = τ·Cv`）取正根；
  τ=0（全关）退化为 `Q=0, H=Cp`。阀门处没有任何单独的水头增量经验公式。

### 初始稳态

流量均匀 `Q0 = V0·A`，水头自水库起沿程按二次损失递减，
阀门稳态水头 `Hv0 = H_res − f·L·V0²/(2g)`；若 `Hv0 ≤ 0` 判 `INVALID_INPUT`。

### 关闭规律

- `{"type":"linear","duration":Tc}`：开度从 1 线性到 0；`Tc=0` 为瞬时关闭；
- `{"type":"piecewise","points":[{time,opening},…]}`：分段折线覆盖，
  时间点单调不减、开度 ∈ [0,1]，相邻点线性插值。

## HTTP API

### `POST /simulate`

请求体（完整算例见 `examples/instantaneous-closure.json`）：

```json
{
  "pipe": { "length": 1000, "diameter": 0.5, "waveSpeed": 1000, "frictionFactor": 0.02 },
  "reservoirHead": 50,
  "initialVelocity": 1,
  "closure": { "type": "linear", "duration": 0 },
  "discretization": { "segments": 20 },
  "duration": 12,
  "maxSteps": 200000
}
```

响应 200：

```json
{
  "grid": { "segments": 20, "dx": 50, "dt": 0.05, "steps": 240, "courant": 1 },
  "valve": { "time": [0, 0.05, "…"], "head": [47.96, 150.0, "…"] },
  "summary": {
    "initialValveHead": 47.96,
    "peakHead": 151.94,
    "peakTime": 2.0,
    "peakHeadRise": 103.97,
    "joukowskyRise": 101.94,
    "peakToJoukowskyRatio": 1.02,
    "secondPeakTime": 4.05,
    "observedRoundTripPeriod": 4.0,
    "theoreticalRoundTripPeriod": 4.0
  },
  "finalState": { "time": 12, "x": ["…"], "head": ["…"], "flow": ["…"] }
}
```

- `valve`：阀门处水头随时间的完整序列；
- `summary`：峰值、峰值/儒可夫斯基值之比、第二峰值时刻与往返周期观测；
- `finalState`：末态全管水头/流量沿程分布。

### 错误响应（400）

```json
{ "error": { "code": "GRID_NOT_CONFORMING", "message": "…", "details": { "…": "…" } } }
```

| code | 含义 |
| --- | --- |
| `INVALID_INPUT` | 波速/管长/管径非正、摩阻为负、关闭历时为负、缺水库水头或初始流速、分段折线非法等 |
| `GRID_NOT_CONFORMING` | 离散参数凑不出库朗数恰为 1 的贴格网格 |
| `STEPS_EXCEEDED` | 推进步数超过 `maxSteps` |

### `GET /health` → `{ "status": "ok" }`

## 算例：近乎瞬时关闭 vs 儒可夫斯基

```bash
curl -s -X POST http://localhost:3000/simulate \
  -H 'Content-Type: application/json' \
  -d @examples/instantaneous-closure.json | jq .summary
```

`Tc=0`（瞬时全关），`a·V0/g = 101.94 m`。服务报得峰值抬升 103.97 m，
比值 1.02 —— 带摩阻时略大于 1 是物理结果：到达阀门的 C+ 特征线把
上游邻点的稳态水头（含末段摩阻落差）带进边界解。无摩阻时比值精确到 1e-6。

## 自动化测试（vitest，25 例）

```bash
npm test
```

| 文件 | 覆盖 |
| --- | --- |
| `test/validation.test.ts` | 非正波速/管长/管径、负关闭历时、缺水头/初速 → `INVALID_INPUT`；不贴格 → `GRID_NOT_CONFORMING`；超步数 → `STEPS_EXCEEDED` |
| `test/joukowsky.test.ts` | 瞬时关闭峰值抬升 ≈ a·V0/g（无摩阻容差 1e-6，带摩阻 ±5%） |
| `test/period.test.ts` | 第二峰值观测往返周期 ≈ 4L/a（容差 2%） |
| `test/slowClosure.test.ts` | 缓关（Tc≫2L/a）峰值 < 瞬时关闭峰值；分段折线与线性关闭一致 |
| `test/massBalance.test.ts` | 流量协调：`d/dt∫H dx = (a²/gA)(Q_in−Q_out)` 全程积分平衡（容差 5%） |
| `test/http.test.ts` | HTTP 端到端：正常响应、三类结构化错误 |

> 流量协调说明：弹性管的严格积分平衡是「管内蓄水（平均水头）变化
> ↔ 两端流量之差」，由连续方程沿管长积分得到；测试按此断言。

## 模块划分（src/）

| 文件 | 职责 |
| --- | --- |
| `grid.ts` | 贴格网格与时间步（库朗数=1 判定） |
| `characteristics.ts` | 正/负特征线系数、内部节点联立、摩阻线性化 |
| `boundaries.ts` | 上游水库、下游阀门边界 |
| `solver.ts` | 时间推进内核（显式时步循环、序列记录） |
| `closure.ts` | 阀门开度规律（线性/分段） |
| `validation.ts` | 输入校验 |
| `analysis.ts` | 峰值、往返周期等摘要量 |
| `http.ts` / `server.ts` | Fastify 路由 / 进程入口 |
| `errors.ts` / `types.ts` / `constants.ts` | 结构化错误 / 类型 / 常数 |

## 已知限制

- 单管、等截面、恒定波速；不含空化（汽蚀）模型——瞬变中算出水头
  低于汽化压力时仍按纯液柱推进，负水头会原样出现在结果里；
- 摩阻为准稳态二次损失的线性化，不含非恒定摩阻；
- 阀门特性用单一孔口系数 + 相对开度表示。
