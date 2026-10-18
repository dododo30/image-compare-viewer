// 图像分析算法：差异对比 / shading 测量 / 裁切分析 / 噪声估计
// 全部基于结构化 RGBA 数据（与 ImageData 兼容），纯计算无 DOM 依赖

import { rgbToLab } from "./color";

export interface RgbaData {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clampRect(img: RgbaData, rect?: Rect | null): Rect {
  if (!rect) return { x: 0, y: 0, w: img.width, h: img.height };
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.min(img.width - x, Math.ceil(rect.w));
  const h = Math.min(img.height - y, Math.ceil(rect.h));
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

/** 大图上按 stride 采样，控制计算量 ≤ ~25 万像素 */
function strideFor(w: number, h: number): number {
  return Math.max(1, Math.ceil(Math.sqrt((w * h) / 250000)));
}

// ---------- 差异对比 ----------

/** |A−B| 放大热力图：RGB 通道分别显示差值绝对值 × amplify */
export function diffHeatmap(a: RgbaData, b: RgbaData, amplify: number): RgbaData {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      out[i] = Math.abs(a.data[ia] - b.data[ib]) * amplify;
      out[i + 1] = Math.abs(a.data[ia + 1] - b.data[ib + 1]) * amplify;
      out[i + 2] = Math.abs(a.data[ia + 2] - b.data[ib + 2]) * amplify;
      out[i + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

export interface DiffStats {
  pixels: number;
  meanAbs: [number, number, number];
  meanDiff: [number, number, number];
  maxAbs: number;
  /** CIE76 平均色差 */
  deltaE76: number;
}

export function diffStats(a: RgbaData, b: RgbaData, rect?: Rect | null): DiffStats {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const r = clampRect({ data: a.data, width: w, height: h }, rect);
  const stride = strideFor(r.w, r.h);
  let n = 0;
  let ar = 0, ag = 0, ab = 0;
  let dr = 0, dg = 0, db = 0;
  let maxAbs = 0;
  let dE = 0;
  for (let y = r.y; y < r.y + r.h; y += stride) {
    for (let x = r.x; x < r.x + r.w; x += stride) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const d0 = a.data[ia] - b.data[ib];
      const d1 = a.data[ia + 1] - b.data[ib + 1];
      const d2 = a.data[ia + 2] - b.data[ib + 2];
      ar += Math.abs(d0);
      ag += Math.abs(d1);
      ab += Math.abs(d2);
      dr += d0;
      dg += d1;
      db += d2;
      const m = Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2));
      if (m > maxAbs) maxAbs = m;
      const [l1, a1_, b1_] = rgbToLab(a.data[ia], a.data[ia + 1], a.data[ia + 2]);
      const [l2, a2_, b2_] = rgbToLab(b.data[ib], b.data[ib + 1], b.data[ib + 2]);
      dE += Math.sqrt((l1 - l2) ** 2 + (a1_ - a2_) ** 2 + (b1_ - b2_) ** 2);
      n++;
    }
  }
  if (n === 0) n = 1;
  return {
    pixels: r.w * r.h,
    meanAbs: [ar / n, ag / n, ab / n],
    meanDiff: [dr / n, dg / n, db / n],
    maxAbs,
    deltaE76: dE / n,
  };
}

// ---------- Shading 测量 ----------

export interface ShadingZone {
  name: string;
  yMean: number;
  rMean: number;
  gMean: number;
  bMean: number;
  rg: number;
  bg: number;
}

export interface ShadingResult {
  zones: ShadingZone[];
  /** 四角 Y 与中心 Y 的比值（min/max） */
  cornerRatioMin: number;
  cornerRatioMax: number;
}

/** 五区 shading：中心 + 四角，zoneFrac 为边长占比 */
export function shadingAnalysis(img: RgbaData, zoneFrac = 0.2): ShadingResult {
  const zw = Math.max(1, Math.floor(img.width * zoneFrac));
  const zh = Math.max(1, Math.floor(img.height * zoneFrac));
  const cx = Math.floor((img.width - zw) / 2);
  const cy = Math.floor((img.height - zh) / 2);
  const zones: { name: string; x: number; y: number }[] = [
    { name: "中心", x: cx, y: cy },
    { name: "左上", x: 0, y: 0 },
    { name: "右上", x: img.width - zw, y: 0 },
    { name: "左下", x: 0, y: img.height - zh },
    { name: "右下", x: img.width - zw, y: img.height - zh },
  ];
  const out: ShadingZone[] = [];
  for (const z of zones) {
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = z.y; y < z.y + zh; y++) {
      for (let x = z.x; x < z.x + zw; x++) {
        const i = (y * img.width + x) * 4;
        sr += img.data[i];
        sg += img.data[i + 1];
        sb += img.data[i + 2];
        n++;
      }
    }
    if (n === 0) n = 1;
    const r = sr / n, g = sg / n, b = sb / n;
    out.push({
      name: z.name,
      yMean: 0.2126 * r + 0.7152 * g + 0.0722 * b,
      rMean: r,
      gMean: g,
      bMean: b,
      rg: g > 0 ? r / g : 0,
      bg: g > 0 ? b / g : 0,
    });
  }
  const centerY = out[0].yMean || 1;
  const ratios = out.slice(1).map((z) => z.yMean / centerY);
  return {
    zones: out,
    cornerRatioMin: Math.min(...ratios),
    cornerRatioMax: Math.max(...ratios),
  };
}

// ---------- 裁切分析 ----------

export interface ClipStats {
  threshold: number;
  pixels: number;
  r: { count: number; pct: number };
  g: { count: number; pct: number };
  b: { count: number; pct: number };
  any: { count: number; pct: number };
}

export function clippingAnalysis(img: RgbaData, threshold = 250): ClipStats {
  const n = img.width * img.height;
  let cr = 0, cg = 0, cb = 0, ca = 0;
  const d = img.data;
  for (let i = 0; i < n * 4; i += 4) {
    const r = d[i] >= threshold;
    const g = d[i + 1] >= threshold;
    const b = d[i + 2] >= threshold;
    if (r) cr++;
    if (g) cg++;
    if (b) cb++;
    if (r || g || b) ca++;
  }
  const pct = (c: number) => (c / n) * 100;
  return {
    threshold,
    pixels: n,
    r: { count: cr, pct: pct(cr) },
    g: { count: cg, pct: pct(cg) },
    b: { count: cb, pct: pct(cb) },
    any: { count: ca, pct: pct(ca) },
  };
}

/** 裁切位置蒙版：黑底，裁切像素按通道着色（R 红 / G 绿 / B 蓝，多通道叠加为白） */
export function clippingMask(img: RgbaData, threshold = 250): RgbaData {
  const n = img.width * img.height;
  const out = new Uint8ClampedArray(n * 4);
  const d = img.data;
  for (let i = 0; i < n * 4; i += 4) {
    const o = i;
    out[o] = d[i] >= threshold ? 255 : 0;
    out[o + 1] = d[i + 1] >= threshold ? 255 : 0;
    out[o + 2] = d[i + 2] >= threshold ? 255 : 0;
    out[o + 3] = 255;
  }
  return { data: out, width: img.width, height: img.height };
}

// ---------- 噪声 / SNR ----------

export interface NoiseStats {
  pixels: number;
  mean: [number, number, number];
  sigma: [number, number, number];
  snrDb: [number, number, number];
  lumaSnrDb: number;
}

/**
 * 平坦区域噪声估计：3×3 均值 high-pass 去除场景内容，
 * 残差标准差即噪声 σ；SNR = 20·log10(信号/σ)
 */
export function noiseAnalysis(img: RgbaData, rect?: Rect | null): NoiseStats | null {
  const r = clampRect(img, rect);
  if (r.w < 8 || r.h < 8) return null;
  const d = img.data;
  const W = img.width;
  const x0 = r.x, x1 = r.x + r.w - 1;
  const y0 = r.y, y1 = r.y + r.h - 1;
  let n = 0;
  let sr = 0, sg = 0, sb = 0;
  const hpr: number[] = [];
  const hpg: number[] = [];
  const hpb: number[] = [];
  for (let y = y0 + 1; y < y1; y++) {
    for (let x = x0 + 1; x < x1; x++) {
      const i = (y * W + x) * 4;
      // 3×3 均值
      let mr = 0, mg = 0, mb = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = ((y + dy) * W + (x + dx)) * 4;
          mr += d[j];
          mg += d[j + 1];
          mb += d[j + 2];
        }
      }
      hpr.push(d[i] - mr / 9);
      hpg.push(d[i + 1] - mg / 9);
      hpb.push(d[i + 2] - mb / 9);
      sr += d[i];
      sg += d[i + 1];
      sb += d[i + 2];
      n++;
    }
  }
  if (n === 0) return null;
  const mean: [number, number, number] = [sr / n, sg / n, sb / n];
  const sigmaOf = (hp: number[]) => {
    let s = 0;
    for (const v of hp) s += v * v;
    return Math.sqrt(Math.max(0, s / n)); // hp 均值≈0
  };
  const sigma: [number, number, number] = [sigmaOf(hpr), sigmaOf(hpg), sigmaOf(hpb)];
  const snr = (m: number, s: number) => (s > 0 ? 20 * Math.log10(m / s) : 99);
  const snrDb: [number, number, number] = [snr(mean[0], sigma[0]), snr(mean[1], sigma[1]), snr(mean[2], sigma[2])];
  const lumaMean = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
  const lumaSigma = Math.sqrt(
    (0.2126 * sigma[0]) ** 2 + (0.7152 * sigma[1]) ** 2 + (0.0722 * sigma[2]) ** 2
  );
  return {
    pixels: n,
    mean,
    sigma,
    snrDb,
    lumaSnrDb: snr(lumaMean, lumaSigma),
  };
}
