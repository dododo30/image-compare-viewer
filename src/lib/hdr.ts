// HDR 标准 EOTF/OETF 参考曲线：PQ（SMPTE ST 2084）与 HLG（ARIB STD-B67）
// 采样为 0..1023 坐标，可直接叠加进 gamma 对比图

export interface CurvePoints {
  xs: number[];
  ys: number[];
}

// ---- PQ（ST 2084）----
const PQ_M1 = 1305 / 8192; // 0.1593017578125
const PQ_M2 = 2523 / 4096; // 0.61582034375
const PQ_C1 = 107 / 128; // 0.8359375
const PQ_C2 = 2413 / 128; // 18.8515625
const PQ_C3 = 2392 / 128; // 18.6875

/** PQ EOTF：归一化信号 Y∈[0,1] → 归一化亮度 L/Lmax */
export function pqEotf(y: number): number {
  const p = Math.pow(y, PQ_M1);
  const num = Math.max(p - PQ_C1, 0);
  const den = PQ_C2 - PQ_C3 * p;
  return Math.pow(num / den, 1 / PQ_M2);
}

/** PQ OETF：归一化亮度 L∈[0,1] → 信号 Y（EOTF 的逆） */
export function pqOetf(l: number): number {
  const x = Math.pow(l, PQ_M2);
  const num = PQ_C1 + PQ_C2 * x;
  const den = 1 + PQ_C3 * x;
  return Math.pow(num / den, 1 / PQ_M1);
}

/**
 * PQ 曲线：X 为信号（0..1023），Y 为亮度（按 10000 nits 归一化到 0..1023）
 * 形态特征：暗部极缓（一半码值在 0~100 nit），与幂律 gamma 差异极大
 */
export function pqCurve(points = 1024): CurvePoints {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < points; i++) {
    const y = i / (points - 1);
    xs.push(y * 1023);
    ys.push(pqEotf(y) * 1023);
  }
  return { xs, ys };
}

// ---- HLG（ARIB STD-B67）----
const HLG_A = 0.17883277;
const HLG_B = 0.28466892;
const HLG_C = 0.55991073;

/** HLG OETF：场景线性光 E∈[0,1] → 信号 E'∈[0,1]；暗部 √(3E)，亮部对数 */
export function hlgOetf(e: number): number {
  if (e <= 0) return 0;
  if (e <= 1 / 12) return Math.sqrt(3 * e);
  return HLG_A * Math.log(12 * e - HLG_B) + HLG_C;
}

/**
 * HLG 曲线：X 为场景线性光（0..1023 归一化），Y 为信号（0..1023）
 * 场景相对曲线（无绝对亮度），暗部等效 gamma 0.5
 */
export function hlgCurve(points = 1024): CurvePoints {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < points; i++) {
    const e = i / (points - 1);
    xs.push(e * 1023);
    ys.push(hlgOetf(e) * 1023);
  }
  return { xs, ys };
}
