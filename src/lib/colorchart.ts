// ColorChecker Classic 24 色分析
// 参考值为 X-Rite 发布的 sRGB(D50 适配)标准值；测量与参考经过同一 rgb→Lab 变换保证口径一致
import { rgbToLab } from "./color";
import type { RgbaData } from "./analysis";

/** 24 色名称（行主序，4 行 × 6 列）与参考 sRGB */
export const CC_PATCHES: { name: string; srgb: [number, number, number] }[] = [
  { name: "暗肤色", srgb: [115, 82, 68] },
  { name: "浅肤色", srgb: [194, 150, 130] },
  { name: "蓝天空", srgb: [98, 122, 157] },
  { name: "树叶", srgb: [87, 108, 67] },
  { name: "蓝花", srgb: [133, 128, 177] },
  { name: "青绿", srgb: [103, 189, 170] },
  { name: "橙色", srgb: [214, 126, 44] },
  { name: "紫蓝", srgb: [80, 91, 166] },
  { name: "中红", srgb: [193, 90, 99] },
  { name: "紫色", srgb: [94, 60, 108] },
  { name: "黄绿", srgb: [157, 188, 64] },
  { name: "橙黄", srgb: [224, 163, 46] },
  { name: "蓝色", srgb: [56, 61, 150] },
  { name: "绿色", srgb: [70, 148, 73] },
  { name: "红色", srgb: [175, 54, 60] },
  { name: "黄色", srgb: [231, 199, 31] },
  { name: "品红", srgb: [187, 86, 149] },
  { name: "青色", srgb: [8, 133, 161] },
  { name: "白色", srgb: [243, 243, 242] },
  { name: "中性8", srgb: [200, 200, 200] },
  { name: "中性6.5", srgb: [160, 160, 160] },
  { name: "中性5", srgb: [122, 122, 121] },
  { name: "中性3.5", srgb: [85, 85, 85] },
  { name: "黑色", srgb: [52, 52, 52] },
];

/** 参考 Lab（与测量值同一变换口径） */
export const CC_REF_LAB: [number, number, number][] = CC_PATCHES.map((p) =>
  rgbToLab(p.srgb[0], p.srgb[1], p.srgb[2]) as [number, number, number]
);

export type Corner = [number, number]; // [x, y] 图像坐标

/** 四角（左上、右上、右下、左下）双线性插值：u 沿宽度 0..1，v 沿高度 0..1 */
export function quadPoint(corners: Corner[], u: number, v: number): [number, number] {
  const [tl, tr, br, bl] = corners;
  const x = (1 - u) * (1 - v) * tl[0] + u * (1 - v) * tr[0] + u * v * br[0] + (1 - u) * v * bl[0];
  const y = (1 - u) * (1 - v) * tl[1] + u * (1 - v) * tr[1] + u * v * br[1] + (1 - u) * v * bl[1];
  return [x, y];
}

/** 24 个色块中心（行主序） */
export function patchCenters(corners: Corner[]): [number, number][] {
  const out: [number, number][] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      out.push(quadPoint(corners, (col + 0.5) / 6, (row + 0.5) / 4));
    }
  }
  return out;
}

/** 在 patch 中心附近采样平均 RGB（采样半径取相邻中心距离的 0.22，至少 2px） */
export function samplePatches(img: RgbaData, corners: Corner[]): [number, number, number][] {
  const centers = patchCenters(corners);
  const du = Math.hypot(centers[1][0] - centers[0][0], centers[1][1] - centers[0][1]);
  const dv = Math.hypot(centers[6][0] - centers[0][0], centers[6][1] - centers[0][1]);
  const r = Math.max(2, Math.min(du, dv) * 0.22);
  return centers.map(([cx, cy]) => {
    let sr = 0, sg = 0, sb = 0, n = 0;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(img.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(img.height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * img.width + x) * 4;
        sr += img.data[i];
        sg += img.data[i + 1];
        sb += img.data[i + 2];
        n++;
      }
    }
    if (n === 0) n = 1;
    return [sr / n, sg / n, sb / n];
  });
}

export interface PatchResult {
  index: number; // 1..24
  name: string;
  measured: [number, number, number];
  refLab: [number, number, number];
  measLab: [number, number, number];
  deltaE: number;
}

export interface ChartResult {
  patches: PatchResult[];
  meanDeltaE: number;
  maxDeltaE: number;
  maxPatch: string;
  /** 由白色/中性灰块估计的白平衡增益（G 归一化为 1） */
  wbGain: [number, number, number];
  /** 中性灰块的亮度误差（测量/参考，用于判断曝光偏移） */
  neutralYRatio: number;
}

export function analyzeChart(measured: [number, number, number][]): ChartResult {
  const patches: PatchResult[] = measured.map((m, i) => {
    const measLab = rgbToLab(m[0], m[1], m[2]) as [number, number, number];
    const ref = CC_REF_LAB[i];
    const dE = Math.sqrt(
      (measLab[0] - ref[0]) ** 2 + (measLab[1] - ref[1]) ** 2 + (measLab[2] - ref[2]) ** 2
    );
    return { index: i + 1, name: CC_PATCHES[i].name, measured: m, refLab: ref, measLab, deltaE: dE };
  });
  const meanDeltaE = patches.reduce((s, p) => s + p.deltaE, 0) / patches.length;
  const maxP = patches.reduce((a, b) => (b.deltaE > a.deltaE ? b : a));
  // 白平衡增益：白色 + 四个中性灰块（索引 18..22 → patches 18-22 0-based）
  let mr = 0, mg = 0, mb = 0;
  for (let i = 18; i <= 23; i++) {
    mr += measured[i][0];
    mg += measured[i][1];
    mb += measured[i][2];
  }
  const rr = mr / 6, rg = mg / 6, rb = mb / 6;
  let wr = 0, wg = 0, wb = 0;
  for (let i = 18; i <= 23; i++) {
    wr += CC_PATCHES[i].srgb[0];
    wg += CC_PATCHES[i].srgb[1];
    wb += CC_PATCHES[i].srgb[2];
  }
  // 以 G 通道为基准的 R/G、B/G 增益
  const wbGain: [number, number, number] = [
    (wr / 6 / (wg / 6)) / (rr / rg),
    1,
    (wb / 6 / (wg / 6)) / (rb / rg),
  ];
  // 中性灰平均亮度比（判断曝光偏移）
  const measY = 0.2126 * rr + 0.7152 * rg + 0.0722 * rb;
  const refY = 0.2126 * (wr / 6) + 0.7152 * (wg / 6) + 0.0722 * (wb / 6);
  return {
    patches,
    meanDeltaE,
    maxDeltaE: maxP.deltaE,
    maxPatch: maxP.name,
    wbGain,
    neutralYRatio: refY > 0 ? measY / refY : 1,
  };
}

/** 标定网格覆盖角点间的校验：四点是否构成足够大的四边形 */
export function quadValid(corners: Corner[]): boolean {
  if (corners.length !== 4) return false;
  const w = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]);
  const h = Math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]);
  return w > 40 && h > 30;
}
