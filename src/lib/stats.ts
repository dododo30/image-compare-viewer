import { rgbToHsv, rgbToHsl, rgbToLab } from "./color";

export interface RegionRect {
  x: number; // in image pixels
  y: number;
  w: number;
  h: number;
}

export interface ImageStats {
  pixelCount: number;
  histogram: {
    r: number[]; // 256 bins
    g: number[];
    b: number[];
    lum: number[];
  };
  mean: { r: number; g: number; b: number };
  lab: { l: number; a: number; b: number };
  hsv: { h: number; s: number; v: number };
  hsl: { h: number; s: number; l: number };
  stddev: { r: number; g: number; b: number };
}

/**
 * Compute stats over an ImageData, optionally limited to a region (image coords).
 * For large images samples are strided to keep it fast.
 */
export function computeStats(data: ImageData, region?: RegionRect | null): ImageStats {
  const { width, height, data: px } = data;
  const rx = region ? Math.max(0, Math.floor(region.x)) : 0;
  const ry = region ? Math.max(0, Math.floor(region.y)) : 0;
  const rw = region ? Math.min(width - rx, Math.ceil(region.w)) : width;
  const rh = region ? Math.min(height - ry, Math.ceil(region.h)) : height;

  const total = rw * rh;
  // stride so we sample at most ~250k pixels
  const stride = Math.max(1, Math.ceil(Math.sqrt(total / 250000)));

  const hr = new Array<number>(256).fill(0);
  const hg = new Array<number>(256).fill(0);
  const hb = new Array<number>(256).fill(0);
  const hl = new Array<number>(256).fill(0);

  let n = 0;
  let sr = 0, sg = 0, sb = 0;
  let sL = 0, sa = 0, sb_ = 0;
  let sHs = 0, sHv = 0; // hsv
  let sHs2 = 0, sHl = 0; // hsl
  // circular mean for hue
  let hsvSin = 0, hsvCos = 0, hslSin = 0, hslCos = 0;
  let srr = 0, sgg = 0, sbb = 0;

  for (let y = ry; y < ry + rh; y += stride) {
    for (let x = rx; x < rx + rw; x += stride) {
      const i = (y * width + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      hr[r]++; hg[g]++; hb[b]++;
      const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      hl[Math.min(255, lum)]++;

      n++;
      sr += r; sg += g; sb += b;
      srr += r * r; sgg += g * g; sbb += b * b;

      const [L, a, bb_] = rgbToLab(r, g, b);
      sL += L; sa += a; sb_ += bb_;

      const [h1, s1, v1] = rgbToHsv(r, g, b);
      const rad1 = (h1 * Math.PI) / 180;
      hsvSin += Math.sin(rad1) * s1; hsvCos += Math.cos(rad1) * s1;
      sHs += s1; sHv += v1;

      const [h2, s2, l2] = rgbToHsl(r, g, b);
      const rad2 = (h2 * Math.PI) / 180;
      hslSin += Math.sin(rad2) * s2; hslCos += Math.cos(rad2) * s2;
      sHs2 += s2; sHl += l2;
    }
  }

  if (n === 0) n = 1;
  const meanR = sr / n, meanG = sg / n, meanB = sb / n;
  const std = (sxx: number, mean: number) => Math.sqrt(Math.max(0, sxx / n - mean * mean));

  const hueFrom = (sin: number, cos: number) => {
    let h = (Math.atan2(sin, cos) * 180) / Math.PI;
    if (h < 0) h += 360;
    return h;
  };

  return {
    pixelCount: total,
    histogram: { r: hr, g: hg, b: hb, lum: hl },
    mean: { r: meanR, g: meanG, b: meanB },
    lab: { l: sL / n, a: sa / n, b: sb_ / n },
    hsv: { h: hueFrom(hsvSin, hsvCos), s: sHs / n, v: sHv / n },
    hsl: { h: hueFrom(hslSin, hslCos), s: sHs2 / n, l: sHl / n },
    stddev: { r: std(srr, meanR), g: std(sgg, meanG), b: std(sbb, meanB) },
  };
}
