export interface ExifInfo {
  exposureTime?: string;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  make?: string;
  model?: string;
  dateTime?: string;
  lensModel?: string;
  exposureBias?: number;
  meteringMode?: string;
  flash?: string;
  whiteBalance?: string;
  colorSpace?: string;
}

export interface LoadedImage {
  id: string;
  file: File;
  url: string; // object URL 或缩略图 data URL
  name: string;
  size: number; // bytes
  width: number;
  height: number;
  element: HTMLImageElement | HTMLCanvasElement;
  exif: ExifInfo;
  /** RAW 源数据信息（仅 RAW/YUV 导入的图像存在） */
  rawInfo?: {
    format: string; // 如 "MIPI RAW10 / RGGB"
    bitDepth: number; // 0 表示 YUV
    channelHist?: { r: number[]; gr: number[]; gb: number[]; b: number[] }; // 256 bin，仅 RAW
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewState {
  zoom: number; // 1 = fit
  panX: number;
  panY: number;
}

export type LayoutMode = 1 | 2 | 4 | 6;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
