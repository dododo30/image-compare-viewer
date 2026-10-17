// MTK ISP CCM 转换：Hex ↔ Dec
// 算法逐行移植自 MTK-CCM-convert 的 index.html（MTK ISP6s / ISP4s 色彩校正矩阵）
// 纯整数运算，无浮点，结果与原工具完全一致

/** 有符号13位转换：取低13位，值 ≥ 4096 时减去 8192，范围 [-4096, 4095] */
export function toSigned13(val: number): number {
  val = val & 0x1fff;
  if (val >= 4096) val -= 8192;
  return val;
}

/** 有符号13位编码：限幅到 [-4096, 4095]，负数加 8192 */
export function fromSigned13(val: number): number {
  if (val > 4095) val = 4095;
  if (val < -4096) val = -4096;
  return val < 0 ? val + 8192 : val;
}

/** 提取所有 32 位十六进制值（0xXXXXXXXX 格式） */
export function parseHex32(text: string): number[] {
  const re = /0x([0-9A-Fa-f]{8})/g;
  const out: number[] = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(parseInt(m[1], 16));
  return out;
}

/** 提取所有整数（支持负数与任意分隔符混用） */
export function parseDec(text: string): number[] {
  const matches = text.match(/-?\d+/g);
  return matches ? matches.map(Number) : [];
}

export interface CcmMatrix {
  /** 3×3 有符号十进制矩阵 */
  dec: number[][];
  /** 3×3 各元素的 16 位十六进制（4 位大写，无前缀） */
  hex: string[][];
  /** 原始的 6 个 32 位值 */
  raw: number[];
}

const hex4 = (v: number) => (v & 0xffff).toString(16).toUpperCase().padStart(4, "0");

/** 每 6 个 32 位值解析为一个 3×3 矩阵（忽略末尾不足 6 个的残留） */
export function hexToDecMatrices(hexValues: number[]): CcmMatrix[] {
  const count = Math.floor(hexValues.length / 6);
  const out: CcmMatrix[] = [];
  for (let m = 0; m < count; m++) {
    const b = m * 6;
    const v = hexValues;
    const lo = [v[b] & 0xffff, v[b + 2] & 0xffff, v[b + 4] & 0xffff];
    const hi = [v[b] >>> 16, v[b + 2] >>> 16, v[b + 4] >>> 16];
    const lone = [v[b + 1] & 0xffff, v[b + 3] & 0xffff, v[b + 5] & 0xffff];
    out.push({
      dec: [
        [toSigned13(lo[0]), toSigned13(hi[0]), toSigned13(lone[0])],
        [toSigned13(lo[1]), toSigned13(hi[1]), toSigned13(lone[1])],
        [toSigned13(lo[2]), toSigned13(hi[2]), toSigned13(lone[2])],
      ],
      hex: [
        [hex4(lo[0]), hex4(hi[0]), hex4(lone[0])],
        [hex4(lo[1]), hex4(hi[1]), hex4(lone[1])],
        [hex4(lo[2]), hex4(hi[2]), hex4(lone[2])],
      ],
      raw: v.slice(b, b + 6),
    });
  }
  return out;
}

/** 9 个十进制元素打包为 6 个 32 位值（自动限幅到 13 位有符号范围） */
export function decToHexBlock(mat: number[]): number[] {
  const e = fromSigned13;
  return [
    (((e(mat[1]) & 0xffff) << 16) | (e(mat[0]) & 0xffff)) >>> 0,
    (e(mat[2]) & 0xffff) >>> 0,
    (((e(mat[4]) & 0xffff) << 16) | (e(mat[3]) & 0xffff)) >>> 0,
    (e(mat[5]) & 0xffff) >>> 0,
    (((e(mat[7]) & 0xffff) << 16) | (e(mat[6]) & 0xffff)) >>> 0,
    (e(mat[8]) & 0xffff) >>> 0,
  ];
}

/** 32 位值格式化为 0xXXXXXXXX（大写） */
export const u32hex = (v: number) => "0x" + (v >>> 0).toString(16).toUpperCase().padStart(8, "0");

/** CCM.cpp 格式输出（批量矩阵） */
export function toCppFormat(matrices: CcmMatrix[]): string {
  return matrices
    .map((mm, i) => {
      const v = mm.raw;
      return (
        `    {   // CCM #${i + 1}\n` +
        `        ${u32hex(v[0])}, ${u32hex(v[1])},\n` +
        `        ${u32hex(v[2])}, ${u32hex(v[3])},\n` +
        `        ${u32hex(v[4])}, ${u32hex(v[5])}\n` +
        `    }`
      );
    })
    .join(",\n");
}

/** 纯十进制矩阵输出（批量矩阵） */
export function toDecFormat(matrices: CcmMatrix[]): string {
  return matrices
    .map((mm, i) => {
      const lines = mm.dec
        .map((row) => "    [" + row.map((x) => String(x).padStart(5, " ")).join(", ") + "]")
        .join("\n");
      return (matrices.length > 1 ? `Matrix #${i + 1}:\n` : "") + lines;
    })
    .join("\n\n");
}

/** Dec → Hex 的代码块输出（批量矩阵） */
export function decToHexOutput(blocks: number[][]): string {
  return blocks
    .map(
      (v, i) =>
        `// CCM Matrix #${i + 1} (Dec input)\n{\n` +
        `    ${u32hex(v[0])}, ${u32hex(v[1])},\n` +
        `    ${u32hex(v[2])}, ${u32hex(v[3])},\n` +
        `    ${u32hex(v[4])}, ${u32hex(v[5])}\n}`
    )
    .join(",\n\n");
}
