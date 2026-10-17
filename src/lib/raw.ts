// RAW / YUV 裸数据解码：Bayer RAW（MIPI packed 10/12/14、16 位 unpacked）与 YUV（NV12/NV21/I420/YV12/UYVY/YUYV）
// 输出统一为 RGBA Uint8ClampedArray + HTMLCanvasElement，可直接进入现有图像管线

export type BayerPattern = "RGGB" | "BGGR" | "GRBG" | "GBRG";
export type RawPacking = "mipi10" | "mipi12" | "mipi14" | "raw16";
export type RawAlign = "low" | "high"; // 16 位容器内数据对齐：低位对齐（直接存值）/ 高位对齐（左移）
export type YuvFormat = "NV12" | "NV21" | "I420" | "YV12" | "UYVY" | "YUYV";

export interface RawParams {
  width: number;
  height: number;
  packing: RawPacking;
  pattern: BayerPattern;
  align: RawAlign;
  /** 有效位深：mipi 打包时由 packing 决定；raw16 容器时为 10/12/14（用户选择） */
  bits: number;
}

export interface YuvParams {
  width: number;
  height: number;
  format: YuvFormat;
  stride: number; // Y 平面/行步长（字节）
  strideUV: number; // UV 平面行步长（平面 420 与 packed 422 可忽略）
}

/** 有效位深 */
export function effectiveBits(p: RawParams): number {
  return p.packing === "raw16" ? p.bits : RAW_BIT_DEPTH[p.packing];
}

const RAW_BIT_DEPTH: Record<Exclude<RawPacking, "raw16">, number> = {
  mipi10: 10,
  mipi12: 12,
  mipi14: 14,
};

/** RAW 预期文件大小（字节，假设连续打包、无行填充） */
export function rawExpectedSize(p: RawParams): number {
  const { width: w, height: h, packing } = p;
  switch (packing) {
    case "mipi10": return Math.ceil((w * 10 / 8)) * h;
    case "mipi12": return Math.ceil((w * 12 / 8)) * h;
    case "mipi14": return Math.ceil((w * 14 / 8)) * h;
    case "raw16": return w * h * 2;
  }
}

/** YUV 预期文件大小（字节） */
export function yuvExpectedSize(p: YuvParams): number {
  const { height: h, format, stride, strideUV } = p;
  switch (format) {
    case "NV12":
    case "NV21":
      return stride * h + strideUV * Math.ceil(h / 2);
    case "I420":
    case "YV12":
      return stride * h + strideUV * Math.ceil(h / 2) * 2;
    case "UYVY":
    case "YUYV":
      return stride * h;
  }
}

/** 解包为每像素 16 位值（对齐与位深修正在 normalizeToBits 中处理） */
export function unpackRaw(buf: ArrayBuffer, p: RawParams): Uint16Array {
  const { width: w, height: h, packing } = p;
  const n = w * h;
  const out = new Uint16Array(n);
  const u8 = new Uint8Array(buf);

  if (packing === "raw16") {
    const v = new Uint16Array(buf, 0, Math.min(n, buf.byteLength >> 1));
    for (let i = 0; i < n; i++) out[i] = v[i];
    return out;
  }

  if (packing === "mipi10") {
    // 4 像素 / 5 字节
    const groups = Math.floor(n / 4);
    for (let g = 0; g < groups; g++) {
      const b = g * 5;
      const b4 = u8[b + 4];
      out[g * 4] = u8[b] | ((b4 & 0x03) << 8);
      out[g * 4 + 1] = u8[b + 1] | ((b4 & 0x0c) << 6);
      out[g * 4 + 2] = u8[b + 2] | ((b4 & 0x30) << 4);
      out[g * 4 + 3] = u8[b + 3] | ((b4 & 0xc0) << 2);
    }
    return out;
  }

  if (packing === "mipi12") {
    // 2 像素 / 3 字节
    const pairs = Math.floor(n / 2);
    for (let g = 0; g < pairs; g++) {
      const b = g * 3;
      const b2 = u8[b + 2];
      out[g * 2] = u8[b] | ((b2 & 0x0f) << 8);
      out[g * 2 + 1] = u8[b + 1] | ((b2 & 0xf0) << 4);
    }
    return out;
  }

  // mipi14：4 像素 / 7 字节
  const groups = Math.floor(n / 4);
  for (let g = 0; g < groups; g++) {
    const b = g * 7;
    const b4 = u8[b + 4], b5 = u8[b + 5], b6 = u8[b + 6];
    out[g * 4] = (u8[b] << 6) | (b4 & 0x3f);
    out[g * 4 + 1] = (u8[b + 1] << 6) | ((b4 >> 6) | ((b5 & 0x0f) << 2));
    out[g * 4 + 2] = (u8[b + 2] << 6) | ((b5 >> 4) | ((b6 & 0x03) << 4));
    out[g * 4 + 3] = (u8[b + 3] << 6) | (b6 >> 2);
  }
  return out;
}

/** 16 位容器对齐修正 + 位深缩放：返回 0..(2^bits-1) */
export function normalizeToBits(vals: Uint16Array, p: RawParams): Uint16Array {
  const bits = effectiveBits(p);
  const n = vals.length;
  const out = new Uint16Array(n);
  if (p.packing === "raw16" && p.align === "high") {
    const s = 16 - bits;
    for (let i = 0; i < n; i++) out[i] = vals[i] >> s;
  } else {
    const mask = (1 << bits) - 1;
    for (let i = 0; i < n; i++) out[i] = vals[i] & mask;
  }
  return out;
}

/** 双线性去马赛克，边缘钳制。pattern 决定 2×2 相位 */
export function demosaicBilinear(raw: Uint16Array, w: number, h: number, pattern: BayerPattern): { r: Float32Array; g: Float32Array; b: Float32Array } {
  const r = new Float32Array(w * h);
  const g = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  const site = (y: number, x: number): string => pattern[((y & 1) << 1) | (x & 1)];

  const at = (y: number, x: number) => raw[Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = raw[i];
      const s = site(y, x);
      if (s === "R") {
        r[i] = v;
        g[i] = (at(y - 1, x) + at(y + 1, x) + at(y, x - 1) + at(y, x + 1)) / 4;
        b[i] = (at(y - 1, x - 1) + at(y - 1, x + 1) + at(y + 1, x - 1) + at(y + 1, x + 1)) / 4;
      } else if (s === "B") {
        b[i] = v;
        g[i] = (at(y - 1, x) + at(y + 1, x) + at(y, x - 1) + at(y, x + 1)) / 4;
        r[i] = (at(y - 1, x - 1) + at(y - 1, x + 1) + at(y + 1, x - 1) + at(y + 1, x + 1)) / 4;
      } else {
        g[i] = v;
        // G 在 R 行还是 B 行：看水平邻居（G 的左右必为 R/B）
        const side = site(y, x > 0 ? x - 1 : x + 1);
        if (side === "R") {
          r[i] = (at(y, x - 1) + at(y, x + 1)) / 2;
          b[i] = (at(y - 1, x) + at(y + 1, x)) / 2;
        } else {
          r[i] = (at(y - 1, x) + at(y + 1, x)) / 2;
          b[i] = (at(y, x - 1) + at(y, x + 1)) / 2;
        }
      }
    }
  }
  return { r, g, b };
}

/** 生成显示 gamma LUT（线性 → 显示，1/2.2） */
export function gammaLut(bits: number): Uint8Array {
  const max = (1 << bits) - 1;
  const lut = new Uint8Array(max + 1);
  for (let i = 0; i <= max; i++) {
    lut[i] = Math.round(255 * Math.pow(i / max, 1 / 2.2));
  }
  return lut;
}

/** RAW 解码主入口：解包 → 去马赛克 → gamma → RGBA */
export function decodeRawToRgba(buf: ArrayBuffer, p: RawParams): Uint8ClampedArray<ArrayBuffer> {
  const bits = effectiveBits(p);
  const vals = normalizeToBits(unpackRaw(buf, p), p);
  const { r, g, b } = demosaicBilinear(vals, p.width, p.height, p.pattern);
  const lut = gammaLut(bits);
  const n = p.width * p.height;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = lut[Math.min(Math.round(r[i]), (1 << bits) - 1)];
    rgba[i * 4 + 1] = lut[Math.min(Math.round(g[i]), (1 << bits) - 1)];
    rgba[i * 4 + 2] = lut[Math.min(Math.round(b[i]), (1 << bits) - 1)];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/** RAW 分通道直方图（R/Gr/Gb/B，256 bin，去马赛克前） */
export function rawChannelHistograms(vals: Uint16Array, w: number, h: number, pattern: BayerPattern, bits: number) {
  const bins = 256;
  const shift = bits > 8 ? bits - 8 : 0;
  const mk = () => new Array<number>(bins).fill(0);
  const r = mk(), gr = mk(), gb = mk(), b = mk();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = vals[y * w + x] >> shift;
      const s = pattern[((y & 1) << 1) | (x & 1)];
      if (s === "R") r[v]++;
      else if (s === "B") b[v]++;
      else if (pattern[((y & 1) << 1) | ((x > 0 ? x - 1 : x + 1) & 1)] === "R") gr[v]++;
      else gb[v]++;
    }
  }
  return { r, gr, gb, b };
}

const clip8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** BT.601 有限幅 YUV → RGB（整数近似） */
function yuv2rgb(y: number, u: number, v: number): [number, number, number] {
  const c = y - 16, d = u - 128, e = v - 128;
  return [
    clip8((298 * c + 409 * e + 128) >> 8),
    clip8((298 * c - 100 * d - 208 * e + 128) >> 8),
    clip8((298 * c + 516 * d + 128) >> 8),
  ];
}

/** YUV 解码主入口 → RGBA */
export function decodeYuvToRgba(buf: ArrayBuffer, p: YuvParams): Uint8ClampedArray<ArrayBuffer> {
  const { width: w, height: h, format, stride, strideUV } = p;
  const u8 = new Uint8Array(buf);
  const rgba = new Uint8ClampedArray(w * h * 4);

  if (format === "NV12" || format === "NV21") {
    const uvStart = stride * h;
    const uFirst = format === "NV12";
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const yy = u8[y * stride + x];
        const uvRow = uvStart + (y >> 1) * strideUV + (x & ~1);
        const u = u8[uvRow + (uFirst ? 0 : 1)];
        const v = u8[uvRow + (uFirst ? 1 : 0)];
        const [r, g, b] = yuv2rgb(yy, u, v);
        const i = (y * w + x) * 4;
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
      }
    }
    return rgba;
  }

  if (format === "I420" || format === "YV12") {
    const uStart = stride * h;
    const vStart = uStart + strideUV * Math.ceil(h / 2);
    const [uBase, vBase] = format === "I420" ? [uStart, vStart] : [vStart, uStart];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const yy = u8[y * stride + x];
        const cx = x >> 1;
        const cy = y >> 1;
        const u = u8[uBase + cy * strideUV + cx];
        const v = u8[vBase + cy * strideUV + cx];
        const [r, g, b] = yuv2rgb(yy, u, v);
        const i = (y * w + x) * 4;
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
      }
    }
    return rgba;
  }

  // packed 422：UYVY = U Y0 V Y1；YUYV = Y0 U Y1 V
  const uyvy = format === "UYVY";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 2) {
      const base = y * stride + x * 2;
      const y0 = u8[base + (uyvy ? 1 : 0)];
      const u = u8[base + (uyvy ? 0 : 1)];
      const y1 = u8[base + (uyvy ? 3 : 2)];
      const v = u8[base + (uyvy ? 2 : 3)];
      const [r0, g0, b0] = yuv2rgb(y0, u, v);
      const [r1, g1, b1] = yuv2rgb(y1, u, v);
      let i = (y * w + x) * 4;
      rgba[i] = r0; rgba[i + 1] = g0; rgba[i + 2] = b0; rgba[i + 3] = 255;
      i = (y * w + x + 1) * 4;
      rgba[i] = r1; rgba[i + 1] = g1; rgba[i + 2] = b1; rgba[i + 3] = 255;
    }
  }
  return rgba;
}

/** RGBA → canvas（供现有图像管线使用） */
export function rgbaToCanvas(rgba: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  return canvas;
}

/** 生成小尺寸缩略图 data URL（供图片列表使用） */
export function makeThumbnail(canvas: HTMLCanvasElement, maxSide = 96): string {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const tw = Math.max(1, Math.round(canvas.width * scale));
  const th = Math.max(1, Math.round(canvas.height * scale));
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  c.getContext("2d")!.drawImage(canvas, 0, 0, tw, th);
  return c.toDataURL("image/jpeg", 0.7);
}
