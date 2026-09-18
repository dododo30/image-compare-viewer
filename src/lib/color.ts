// Color space conversions: sRGB -> HSV / HSL / CIE Lab (D65)

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function pivotRgb(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function pivotXyz(c: number): number {
  return c > 0.008856 ? Math.cbrt(c) : 7.787 * c + 16 / 116;
}

/** Returns [L*, a*, b*] with L in 0..100 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rr = pivotRgb(r), gg = pivotRgb(g), bb = pivotRgb(b);
  // sRGB D65
  const x = pivotXyz((rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) / 0.95047);
  const y = pivotXyz(rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750);
  const z = pivotXyz((rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041) / 1.08883);
  const l = 116 * y - 16;
  return [l, 500 * (x - y), 200 * (y - z)];
}
