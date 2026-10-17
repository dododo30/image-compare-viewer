// RAW/YUV 导入：格式参数类型、解码执行、格式记忆
// 图片查看器与 RAW 实验室共用，格式参数持久化到 localStorage
import { useEffect, useState } from "react";
import {
  decodeRawToRgba,
  decodeYuvToRgba,
  unpackRaw,
  normalizeToBits,
  rawChannelHistograms,
  rawExpectedSize,
  yuvExpectedSize,
  rgbaToCanvas,
  effectiveBits,
  type RawParams,
  type YuvParams,
  type BayerPattern,
  type RawPacking,
  type RawAlign,
  type YuvFormat,
} from "./raw";
import type { LoadedImage } from "@/types/image";

export interface DecodedImage {
  name: string;
  size: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  rawInfo: NonNullable<LoadedImage["rawInfo"]>;
  /** RAW 源数据（线性 u16 + 位深），供 ISP 实验室反复处理 */
  raw?: { vals: Uint16Array; pattern: BayerPattern; bits: number };
  /** YUV 解码后的 RGBA，供 ISP 实验室反复处理 */
  yuvRgba?: Uint8ClampedArray<ArrayBuffer>;
}

export interface ImportFormat {
  kind: "raw" | "yuv";
  width: number;
  height: number;
  packing: RawPacking;
  bits: number; // raw16 时有效：10/12/14
  pattern: BayerPattern;
  align: RawAlign;
  yuvFormat: YuvFormat;
  stride: number; // 0 = 自动（宽 或 2×宽）
  strideUV: number; // 0 = 自动（宽）
}

export const PACKING_LABELS: Record<RawPacking, string> = {
  mipi10: "MIPI RAW10（packed）",
  mipi12: "MIPI RAW12（packed）",
  mipi14: "MIPI RAW14（packed）",
  raw16: "16 位 unpacked",
};

export const YUV_LABELS: Record<YuvFormat, string> = {
  NV12: "NV12（Y + UV 交错）",
  NV21: "NV21（Y + VU 交错）",
  I420: "I420（Y + U + V 平面）",
  YV12: "YV12（Y + V + U 平面）",
  UYVY: "UYVY（packed 422）",
  YUYV: "YUYV（packed 422）",
};

export const defaultImportFormat = (): ImportFormat => ({
  kind: "raw",
  width: 0,
  height: 0,
  packing: "mipi10",
  bits: 10,
  pattern: "GRBG",
  align: "low",
  yuvFormat: "NV12",
  stride: 0,
  strideUV: 0,
});

const FMT_KEY = "rawlab-format-v1";

/** 读写 localStorage 持久化的格式参数（两页面共享同一份记忆） */
export function useImportFormat() {
  const [fmt, setFmt] = useState<ImportFormat>(() => {
    try {
      const s = localStorage.getItem(FMT_KEY);
      if (s) return { ...defaultImportFormat(), ...JSON.parse(s) };
    } catch {
      // 忽略损坏的缓存
    }
    return defaultImportFormat();
  });
  useEffect(() => {
    try {
      localStorage.setItem(FMT_KEY, JSON.stringify(fmt));
    } catch {
      // 存储不可用时忽略
    }
  }, [fmt]);
  return [fmt, setFmt] as const;
}

export function rawParamsOf(f: ImportFormat): RawParams {
  return {
    width: f.width,
    height: f.height,
    packing: f.packing,
    pattern: f.pattern,
    align: f.align,
    bits: f.packing === "raw16" ? f.bits : 10,
  };
}

export function yuvParamsOf(f: ImportFormat): YuvParams {
  const stride = f.stride || f.width;
  const is422 = f.yuvFormat === "UYVY" || f.yuvFormat === "YUYV";
  if (is422 && stride < f.width * 2) {
    throw new Error(`stride 过小：packed 422 每行至少 ${f.width * 2} 字节`);
  }
  return { width: f.width, height: f.height, format: f.yuvFormat, stride, strideUV: f.strideUV || f.width };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

/** 按格式参数解码一组文件（供对话框与拖放共用） */
export async function decodeFiles(files: File[], f: ImportFormat): Promise<DecodedImage[]> {
  if (f.width <= 0 || f.height <= 0) throw new Error("请先在导入对话框中设置有效的宽度和高度");
  if (f.width % 2 || f.height % 2) throw new Error("宽度/高度需为偶数（Bayer/YUV 采样要求）");
  const out: DecodedImage[] = [];

  if (f.kind === "raw") {
    const rp = rawParamsOf(f);
    const expected = rawExpectedSize(rp);
    for (const file of files) {
      await tick();
      let buf = await file.arrayBuffer();
      if (buf.byteLength < expected) {
        throw new Error(`「${file.name}」大小不足：预期 ${expected.toLocaleString()} 字节，实际 ${buf.byteLength.toLocaleString()} 字节，请检查参数`);
      }
      if (buf.byteLength > expected) buf = buf.slice(0, expected);
      const rgba = decodeRawToRgba(buf, rp);
      const canvas = rgbaToCanvas(rgba, f.width, f.height);
      const vals = normalizeToBits(unpackRaw(buf, rp), rp);
      const b = effectiveBits(rp);
      out.push({
        name: file.name,
        size: file.size,
        width: f.width,
        height: f.height,
        canvas,
        rawInfo: {
          format: `${PACKING_LABELS[f.packing]} / ${f.pattern}`,
          bitDepth: b,
          channelHist: rawChannelHistograms(vals, f.width, f.height, f.pattern, b),
        },
        raw: { vals, pattern: f.pattern, bits: b },
      });
    }
    return out;
  }

  const yp = yuvParamsOf(f);
  const expected = yuvExpectedSize(yp);
  for (const file of files) {
    await tick();
    let buf = await file.arrayBuffer();
    if (buf.byteLength < expected) {
      throw new Error(`「${file.name}」大小不足：预期 ${expected.toLocaleString()} 字节，实际 ${buf.byteLength.toLocaleString()} 字节，请检查参数`);
    }
    if (buf.byteLength > expected) buf = buf.slice(0, expected);
    const rgba = decodeYuvToRgba(buf, yp);
    const canvas = rgbaToCanvas(rgba, f.width, f.height);
    out.push({
      name: file.name,
      size: file.size,
      width: f.width,
      height: f.height,
      canvas,
      rawInfo: { format: YUV_LABELS[f.yuvFormat], bitDepth: 0 },
      yuvRgba: rgba,
    });
  }
  return out;
}

/** 预期文件大小（0 表示参数不全） */
export function expectedSizeOf(f: ImportFormat): number {
  if (f.width <= 0 || f.height <= 0) return 0;
  try {
    return f.kind === "raw" ? rawExpectedSize(rawParamsOf(f)) : yuvExpectedSize(yuvParamsOf(f));
  } catch {
    return 0;
  }
}
