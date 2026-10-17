// ISP 预览处理链：增益（总增益 + 通道增益）→ 径向 shading 校正 → CCM → gamma
// 输入为去马赛克后的线性 u16 平面（RAW）或已解码 RGBA（YUV），输出显示用 RGBA

export interface IspParams {
  gamma: number; // 显示 gamma，1.0 = 线性
  gain: number; // 总数字增益
  gainRGB: [number, number, number]; // 通道增益（模拟 AWB）
  ccm: number[]; // 3×3 行主序
  shading: number; // 径向 shading 校正强度 0..0.8（0 = 关闭）
}

export const defaultIspParams = (): IspParams => ({
  gamma: 2.2,
  gain: 1,
  gainRGB: [1, 1, 1],
  ccm: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  shading: 0,
});

export interface ChannelHist {
  r: number[];
  gr: number[];
  gb: number[];
  b: number[];
}

export interface ProcessedImage {
  rgba: Uint8ClampedArray<ArrayBuffer>;
  imageData: ImageData;
  channelHist?: ChannelHist;
}

/** 指定位深与 gamma 的显示 LUT */
export function gammaLutExp(maxVal: number, gamma: number): Uint8Array {
  const lut = new Uint8Array(maxVal + 1);
  const inv = 1 / gamma;
  for (let i = 0; i <= maxVal; i++) {
    lut[i] = Math.round(255 * Math.pow(i / maxVal, inv));
  }
  return lut;
}

/** 径向 shading 表：中心 0 → 角落 1 */
export function radialMap(w: number, h: number): Float32Array {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rm = Math.sqrt(cx * cx + cy * cy) || 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rm;
      const dy = (y - cy) / rm;
      out[y * w + x] = dx * dx + dy * dy;
    }
  }
  return out;
}

/**
 * RAW 处理：planes 为去马赛克后的 u16 线性平面（0..maxVal）
 */
export function applyIspFromPlanes(
  planes: { r: ArrayLike<number>; g: ArrayLike<number>; b: ArrayLike<number> },
  maxVal: number,
  w: number,
  h: number,
  p: IspParams,
  radial: Float32Array
): ProcessedImage {
  const lut = gammaLutExp(maxVal, p.gamma);
  const n = w * h;
  const rgba = new Uint8ClampedArray(n * 4);
  const m = p.ccm;
  const pr = p.gain * p.gainRGB[0];
  const pg = p.gain * p.gainRGB[1];
  const pb = p.gain * p.gainRGB[2];

  for (let i = 0; i < n; i++) {
    const f = 1 + p.shading * radial[i];
    const r0 = planes.r[i] * pr * f;
    const g0 = planes.g[i] * pg * f;
    const b0 = planes.b[i] * pb * f;
    const r2 = m[0] * r0 + m[1] * g0 + m[2] * b0;
    const g2 = m[3] * r0 + m[4] * g0 + m[5] * b0;
    const b2 = m[6] * r0 + m[7] * g0 + m[8] * b0;
    const r = r2 < 0 ? 0 : r2 > maxVal ? maxVal : r2;
    const g = g2 < 0 ? 0 : g2 > maxVal ? maxVal : g2;
    const b = b2 < 0 ? 0 : b2 > maxVal ? maxVal : b2;
    const ri = i * 4;
    rgba[ri] = lut[r | 0];
    rgba[ri + 1] = lut[g | 0];
    rgba[ri + 2] = lut[b | 0];
    rgba[ri + 3] = 255;
  }
  return { rgba, imageData: new ImageData(rgba, w, h) };
}

/** RAW 分通道直方图（按 Bayer 位点分类），统计增益+shading 之后、CCM/gamma 之前的线性值 */
export function rawGainedHistograms(
  vals: Uint16Array,
  w: number,
  h: number,
  pattern: string,
  maxVal: number,
  p: IspParams,
  radial: Float32Array
): ChannelHist {
  const shift = maxVal > 255 ? Math.round(Math.log2(maxVal + 1)) - 8 : 0;
  const mk = () => new Array<number>(256).fill(0);
  const out: ChannelHist = { r: mk(), gr: mk(), gb: mk(), b: mk() };
  const gains = [
    p.gain * p.gainRGB[0],
    p.gain * p.gainRGB[1],
    p.gain * p.gainRGB[1],
    p.gain * p.gainRGB[2],
  ]; // 相位 0..3: 按 pattern 字符映射
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ch = pattern[((y & 1) << 1) | (x & 1)];
      const gi = ch === "R" ? 0 : ch === "B" ? 3 : pattern[((y & 1) << 1) | ((x > 0 ? x - 1 : x + 1) & 1)] === "R" ? 1 : 2;
      let v = vals[i] * gains[gi] * (1 + p.shading * radial[i]);
      v = v < 0 ? 0 : v > maxVal ? maxVal : v;
      const bin = (v | 0) >> shift;
      const arr = gi === 0 ? out.r : gi === 3 ? out.b : gi === 1 ? out.gr : out.gb;
      arr[bin > 255 ? 255 : bin]++;
    }
  }
  return out;
}

/** YUV 处理：已解码 RGBA（0..255）按线性处理 */
export function applyIspFromRgba(
  src: Uint8ClampedArray<ArrayBuffer>,
  w: number,
  h: number,
  p: IspParams,
  radial: Float32Array
): ProcessedImage {
  const lut = gammaLutExp(255, p.gamma);
  const n = w * h;
  const rgba = new Uint8ClampedArray(n * 4);
  const m = p.ccm;
  const pr = p.gain * p.gainRGB[0];
  const pg = p.gain * p.gainRGB[1];
  const pb = p.gain * p.gainRGB[2];

  for (let i = 0; i < n; i++) {
    const ri = i * 4;
    const f = 1 + p.shading * radial[i];
    const r0 = src[ri] * pr * f;
    const g0 = src[ri + 1] * pg * f;
    const b0 = src[ri + 2] * pb * f;
    let r = m[0] * r0 + m[1] * g0 + m[2] * b0;
    let g = m[3] * r0 + m[4] * g0 + m[5] * b0;
    let b = m[6] * r0 + m[7] * g0 + m[8] * b0;
    r = r < 0 ? 0 : r > 255 ? 255 : r;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    b = b < 0 ? 0 : b > 255 ? 255 : b;
    rgba[ri] = lut[r | 0];
    rgba[ri + 1] = lut[g | 0];
    rgba[ri + 2] = lut[b | 0];
    rgba[ri + 3] = 255;
  }
  return { rgba, imageData: new ImageData(rgba, w, h) };
}
