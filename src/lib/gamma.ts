// Gamma 表转换：MTK ↔ QCOM
// 算法逐行移植自 Gamma_convert.py（MTK→QCOM 为整数运算，QCOM→MTK 使用 PCHIP 插值）

export const MTK_INPUT_LEN = 256;
export const QCOM_INPUT_LEN = 257;
export const Qcom_GAMMA_MIN = 0;
export const Qcom_GAMMA_MAX = 1023;
export const MTK_GAMMA_MIN = 0;
export const MTK_GAMMA_MAX = 1020;

/** MTK→QCOM：前 128 取偶数位，接下来 64 全取，之后全取并插入相邻均值，末尾补 1023 */
export function mtkToQcom(mtk: number[]): number[] {
  const qcom: number[] = [];
  for (let i = 0; i < mtk.length; i++) {
    if (i < 128) {
      if (i % 2 === 0) qcom.push(mtk[i]);
    } else if (i < 192) {
      qcom.push(mtk[i]);
    } else {
      qcom.push(mtk[i]);
      if (i < mtk.length - 1) {
        qcom.push(Math.floor((mtk[i] + mtk[i + 1]) / 2));
      } else {
        qcom.push(Math.floor((mtk[i] + 1024) / 2));
      }
    }
  }
  qcom.push(1023);
  return qcom;
}

/** MTK 平台的 X 轴采样点（与 Python 版一致：0..256 步进 2，260..512 步进 4，520..1016 步进 8） */
export function mtkXPoints(): number[] {
  const xs: number[] = [];
  for (let i = 0; i < 256; i++) {
    if (i < 129) xs.push(i * 2);
    else if (i < 193) xs.push(256 + (i - 128) * 4);
    else xs.push(512 + 8 * (i - 192));
  }
  return xs;
}

/** QCOM 平台的 X 轴采样点：0,4,8,...,1020，最后一位固定 1023 */
export function qcomXPoints(): number[] {
  const xs = Array.from({ length: 257 }, (_, i) => i * 4);
  xs[256] = 1023;
  return xs;
}

/**
 * PCHIP（Fritsch–Carlson 保形三次 Hermite 插值）导数计算，
 * 与 scipy.interpolate.PchipInterpolator 相同：
 * 内部点为加权调和平均，端点用 scipy 的单侧三点公式。
 */
function pchipDerivatives(x: number[], y: number[]): number[] {
  const n = x.length;
  const h: number[] = [];
  const m: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    h.push(x[k + 1] - x[k]);
    m.push((y[k + 1] - y[k]) / h[k]);
  }
  const d = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    if (m[k - 1] === 0 || m[k] === 0 || Math.sign(m[k - 1]) !== Math.sign(m[k])) {
      d[k] = 0;
    } else {
      const w1 = 2 * h[k] + h[k - 1];
      const w2 = h[k] + 2 * h[k - 1];
      // 与 scipy 相同的运算顺序：(w1/m0 + w2/m1)/(w1+w2) 再取倒数
      const whmean = (w1 / m[k - 1] + w2 / m[k]) / (w1 + w2);
      d[k] = 1.0 / whmean;
    }
  }
  // scipy 的端点处理 _edge_case
  const edge = (h0: number, h1: number, m0: number, m1: number): number => {
    let dd = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if (Math.sign(dd) !== Math.sign(m0)) dd = 0;
    else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(dd) > 3 * Math.abs(m0)) dd = 3 * m0;
    return dd;
  };
  d[0] = edge(h[0], h[1], m[0], m[1]);
  d[n - 1] = edge(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
  return d;
}

/** 三次 Hermite 求值（显式幂 + 从左到右求和，与 scipy Cython 版浮点行为最接近）；区间外按端点区间外推 */
function pchipEvaluate(x: number[], y: number[], d: number[], xi: number): number {
  const n = x.length;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= xi) lo = mid;
    else hi = mid;
  }
  const k = Math.min(Math.max(lo, 0), n - 2);
  const h = x[k + 1] - x[k];
  const dx = xi - x[k];
  const slope = (y[k + 1] - y[k]) / h;
  const c2 = (3 * slope - 2 * d[k] - d[k + 1]) / h;
  const c3 = (d[k] + d[k + 1] - 2 * slope) / h / h;
  const dx2 = dx * dx;
  return (y[k] + d[k] * dx) + c2 * dx2 + c3 * dx2 * dx;
}

/** 与 Python round() 一致的四舍五入（银行家舍入，half-to-even） */
function pyRound(x: number): number {
  const fl = Math.floor(x);
  const diff = x - fl;
  if (diff > 0.5) return fl + 1;
  if (diff < 0.5) return fl;
  return fl % 2 === 0 ? fl : fl + 1;
}

/** QCOM→MTK：PCHIP 拟合 QCOM 曲线并采样到 MTK 的 X 点，四舍五入 + 截断到 [0, 1020] */
export function qcomToMtk(qcom: number[]): number[] {
  const qx = qcomXPoints();
  const mx = mtkXPoints();
  const d = pchipDerivatives(qx, qcom);
  return mx.map((xi) => {
    const v = pyRound(pchipEvaluate(qx, qcom, d, xi));
    return Math.max(MTK_GAMMA_MIN, Math.min(MTK_GAMMA_MAX, v));
  });
}

/** 解析十进制输入（支持空格/逗号/换行分隔），返回 { values, invalid } */
export function parseDecimalList(text: string): { values: number[]; invalid: string[] } {
  const tokens = text.replace(/[,，]/g, " ").split(/\s+/).filter(Boolean);
  const values: number[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (/^\d+$/.test(t)) values.push(parseInt(t, 10));
    else invalid.push(t);
  }
  return { values, invalid };
}

/** 解析十六进制输入（支持空格/逗号/换行分隔，如 MTK dump 文件内容） */
export function parseHexList(text: string): { values: number[]; invalid: string[] } {
  const tokens = text.replace(/[,，]/g, " ").split(/\s+/).filter(Boolean);
  const values: number[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (/^[0-9a-fA-F]+$/.test(t)) values.push(parseInt(t, 16));
    else invalid.push(t);
  }
  return { values, invalid };
}
