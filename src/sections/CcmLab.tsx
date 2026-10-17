import { useState } from "react";
import {
  parseHex32,
  parseDec,
  hexToDecMatrices,
  decToHexBlock,
  toCppFormat,
  toDecFormat,
  decToHexOutput,
  type CcmMatrix,
} from "@/lib/ccm";

interface Props {
  onExit: () => void;
}

const LABELS = ["a₁₁", "a₁₂", "a₁₃", "a₂₁", "a₂₂", "a₂₃", "a₃₁", "a₃₂", "a₃₃"];
const EXAMPLE = `0x1EC0032B, 0x00000015,
0x02651F68, 0x00000033,
0x1E7D1FBE, 0x000003C5`;

// 颜色预览样本：基色 + 白/灰 + 肤色
const SAMPLES: [string, number[]][] = [
  ["红", [4095, 0, 0]],
  ["绿", [0, 4095, 0]],
  ["蓝", [0, 0, 4095]],
  ["青", [0, 4095, 4095]],
  ["品红", [4095, 0, 4095]],
  ["黄", [4095, 4095, 0]],
  ["白", [4095, 4095, 4095]],
  ["灰", [2048, 2048, 2048]],
  ["肤色", [3000, 1900, 1400]],
];

/** 应用 CCM 并归一化到 0..255 用于显示（保留色相对比） */
function applyCcmDisplay(m: number[][], rgb: number[]): [number, number, number] {
  const out = [
    m[0][0] * rgb[0] + m[0][1] * rgb[1] + m[0][2] * rgb[2],
    m[1][0] * rgb[0] + m[1][1] * rgb[1] + m[1][2] * rgb[2],
    m[2][0] * rgb[0] + m[2][1] * rgb[1] + m[2][2] * rgb[2],
  ];
  const maxAbs = Math.max(1e-6, ...out.map(Math.abs));
  const s = 255 / maxAbs;
  const v = out.map((x) => Math.max(0, Math.min(255, Math.round(x * s))));
  return [v[0], v[1], v[2]];
}

function ColorPreview({ matrix }: { matrix: number[][] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-neutral-400">颜色预览（经 CCM 后按最大分量归一化）</div>
      <div className="flex gap-1">
        {SAMPLES.map(([name, rgb]) => (
          <div key={name} className="text-center" title={`${name} ${rgb.join(",")}`}>
            <div
              className="w-9 h-9 rounded border border-neutral-600"
              style={{ background: `rgb(${rgb.map((v) => Math.round((v / 4095) * 255)).join(",")})` }}
            />
            <div className="text-[9px] text-neutral-500 mt-0.5">{name}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {SAMPLES.map(([name, rgb]) => {
          const [r, g, b] = applyCcmDisplay(matrix, rgb);
          return (
            <div key={name} className="text-center" title={`${name} → ${r},${g},${b}`}>
              <div className="w-9 h-9 rounded border border-neutral-600" style={{ background: `rgb(${r},${g},${b})` }} />
              <div className="text-[9px] text-neutral-500 mt-0.5">{r},{g},{b}</div>
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-neutral-600">上：原始 · 下：CCM 后</div>
    </div>
  );
}

/** CCM 转换页：矩阵可视化 + 颜色预览 + 右侧输入/输出参数 */
export default function CcmLab({ onExit }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [hexResult, setHexResult] = useState<CcmMatrix[] | null>(null);
  const [decBlocks, setDecBlocks] = useState<number[][] | null>(null);
  const [copiedKey, setCopiedKey] = useState("");

  const hexToDec = () => {
    setError("");
    setWarning("");
    setCopiedKey("");
    setDecBlocks(null);
    if (!input.trim()) {
      setError("请输入十六进制数据");
      setHexResult(null);
      return;
    }
    const vals = parseHex32(input);
    if (vals.length === 0) {
      setError("未找到有效的 32 位十六进制值（需要 0xXXXXXXXX 格式）");
      setHexResult(null);
      return;
    }
    if (vals.length % 6 !== 0) {
      setWarning(`检测到 ${vals.length} 个 32 位值，应为 6 的倍数；已忽略末尾不足 6 个的部分`);
    }
    const matrices = hexToDecMatrices(vals);
    if (matrices.length === 0) {
      setError("至少需要 6 个 32 位值才能组成一个矩阵");
      setHexResult(null);
      return;
    }
    setHexResult(matrices);
  };

  const decToHex = () => {
    setError("");
    setWarning("");
    setCopiedKey("");
    setHexResult(null);
    if (!input.trim()) {
      setError("请输入十进制数据");
      setDecBlocks(null);
      return;
    }
    const vals = parseDec(input);
    if (vals.length === 0) {
      setError("未找到有效的十进制数值");
      setDecBlocks(null);
      return;
    }
    if (vals.length % 9 !== 0) {
      setWarning(`检测到 ${vals.length} 个值，应为 9 的倍数；已忽略末尾不足 9 个的部分`);
    }
    let truncated = 0;
    for (const v of vals) if (v > 4095 || v < -4096) truncated++;
    if (truncated > 0) {
      setWarning(`有 ${truncated} 个值超出 13 位有符号范围 [-4096, 4095]，已自动截断`);
    }
    const count = Math.floor(vals.length / 9);
    if (count === 0) {
      setError("至少需要 9 个值才能组成一个矩阵");
      setDecBlocks(null);
      return;
    }
    const blocks: number[][] = [];
    for (let m = 0; m < count; m++) blocks.push(decToHexBlock(vals.slice(m * 9, m * 9 + 9)));
    setDecBlocks(blocks);
  };

  const clear = () => {
    setInput("");
    setError("");
    setWarning("");
    setHexResult(null);
    setDecBlocks(null);
    setCopiedKey("");
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1500);
    } catch {
      // 剪贴板不可用
    }
  };

  // Dec→Hex 时从输入构造预览矩阵（每 9 个一组，截断后）
  const previewMatrices: number[][][] = [];
  if (decBlocks) {
    const vals = parseDec(input);
    for (let m = 0; m < decBlocks.length; m++) {
      const slice = vals.slice(m * 9, m * 9 + 9).map((v) => Math.max(-4096, Math.min(4095, v)));
      previewMatrices.push([slice.slice(0, 3), slice.slice(3, 6), slice.slice(6, 9)]);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700">
        <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-2 py-1 rounded" onClick={onExit}>
          ← 返回
        </button>
        <span className="font-bold text-sm">🎨 CCM 转换（Hex ↔ Dec）</span>
        <span className="text-[10px] text-neutral-500">MTK ISP6s / ISP4s 色彩校正矩阵</span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 可视化区 */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
          {hexResult && (
            <>
              {hexResult.map((mm, mi) => (
                <div key={mi} className="space-y-2">
                  {hexResult.length > 1 && (
                    <div className="text-xs text-sky-400 font-bold">CCM Matrix #{mi + 1}</div>
                  )}
                  <div className="grid grid-cols-3 gap-2 max-w-md">
                    {mm.dec.map((row, r) =>
                      row.map((val, c) => (
                        <div key={`${r}-${c}`} className="bg-neutral-800 border border-neutral-700 rounded p-2 text-center">
                          <div className="text-[10px] text-neutral-500">{LABELS[r * 3 + c]}</div>
                          <div className="text-xs font-mono text-orange-300">0x{mm.hex[r][c]}</div>
                          <div className="text-lg font-mono font-bold text-sky-300">{val}</div>
                        </div>
                      ))
                    )}
                  </div>
                  <ColorPreview matrix={mm.dec} />
                </div>
              ))}

              {[
                { key: "cpp", title: "CCM.cpp 格式输出", text: toCppFormat(hexResult) },
                { key: "dec", title: "纯十进制矩阵", text: toDecFormat(hexResult) },
              ].map(({ key, title, text }) => (
                <div key={key} className="space-y-1 max-w-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400">{title}</span>
                    <button
                      className="text-xs bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded"
                      onClick={() => copy(text, key)}
                    >
                      {copiedKey === key ? "已复制 ✓" : "复制"}
                    </button>
                  </div>
                  <pre className="bg-neutral-900 border border-neutral-700 rounded p-2 text-xs font-mono text-emerald-200 overflow-x-auto whitespace-pre">
                    {text}
                  </pre>
                </div>
              ))}
            </>
          )}

          {decBlocks && (
            <>
              {previewMatrices.map((m, mi) => (
                <div key={mi} className="space-y-2">
                  {previewMatrices.length > 1 && (
                    <div className="text-xs text-sky-400 font-bold">CCM Matrix #{mi + 1}</div>
                  )}
                  <ColorPreview matrix={m} />
                </div>
              ))}
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">Dec → Hex 结果（{decBlocks.length} 个矩阵）</span>
                  <button
                    className="text-xs bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded"
                    onClick={() => copy(decToHexOutput(decBlocks), "rev")}
                  >
                    {copiedKey === "rev" ? "已复制 ✓" : "复制"}
                  </button>
                </div>
                <pre className="bg-neutral-900 border border-neutral-700 rounded p-2 text-xs font-mono text-emerald-200 overflow-x-auto whitespace-pre">
                  {decToHexOutput(decBlocks)}
                </pre>
              </div>
            </>
          )}

          {!hexResult && !decBlocks && (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
              <div className="text-5xl mb-3">🎨</div>
              <div>在右侧粘贴数据并转换，此处显示矩阵与颜色预览</div>
            </div>
          )}
        </div>

        {/* 输入/输出参数 */}
        <aside className="w-96 shrink-0 bg-neutral-800/60 border-l border-neutral-700 overflow-y-auto p-3 space-y-3">
          <p className="text-[10px] text-neutral-500 leading-relaxed">
            每个 32 位值的低 16 位为第 1 个元素、高 16 位为第 2 个元素；13 位有符号（≥4096 减 8192）。
            支持批量多个光源矩阵。
          </p>
          <textarea
            className="w-full h-32 bg-neutral-900 border border-neutral-700 rounded p-2 text-xs font-mono text-neutral-100 resize-y"
            placeholder={"例：\n0x1EC0032B, 0x00000015,\n0x02651F68, 0x00000033,\n0x1E7D1FBE, 0x000003C5"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === "Enter") hexToDec();
            }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button className="bg-sky-600 hover:bg-sky-500 text-white text-sm px-4 py-1 rounded" onClick={hexToDec}>
              Hex → Dec
            </button>
            <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded" onClick={decToHex}>
              Dec → Hex
            </button>
            <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded" onClick={clear}>
              清空
            </button>
            <button
              className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded"
              onClick={() => {
                setInput(EXAMPLE);
                setError("");
                setWarning("");
                setCopiedKey("");
                setDecBlocks(null);
                setHexResult(hexToDecMatrices(parseHex32(EXAMPLE)));
              }}
            >
              加载示例
            </button>
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          {!error && warning && <div className="text-xs text-amber-400">{warning}</div>}
        </aside>
      </div>
    </div>
  );
}
