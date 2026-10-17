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
  onClose: () => void;
}

const LABELS = ["a₁₁", "a₁₂", "a₁₃", "a₂₁", "a₂₂", "a₂₃", "a₃₁", "a₃₂", "a₃₃"];
const EXAMPLE = `0x1EC0032B, 0x00000015,
0x02651F68, 0x00000033,
0x1E7D1FBE, 0x000003C5`;

type Result =
  | { kind: "hex2dec"; matrices: CcmMatrix[] }
  | { kind: "dec2hex"; blocks: number[][]; truncated: number }
  | null;

/** CCM 转换工具：MTK ISP 色彩校正矩阵 Hex ↔ Dec（与原单文件工具逻辑一致） */
export default function CcmTool({ onClose }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [copiedKey, setCopiedKey] = useState("");

  const hexToDec = () => {
    setError("");
    setWarning("");
    setCopiedKey("");
    if (!input.trim()) {
      setError("请输入十六进制数据");
      setResult(null);
      return;
    }
    const vals = parseHex32(input);
    if (vals.length === 0) {
      setError("未找到有效的 32 位十六进制值（需要 0xXXXXXXXX 格式）");
      setResult(null);
      return;
    }
    if (vals.length % 6 !== 0) {
      setWarning(`检测到 ${vals.length} 个 32 位值，应为 6 的倍数；已忽略末尾不足 6 个的部分`);
    }
    const matrices = hexToDecMatrices(vals);
    if (matrices.length === 0) {
      setError("至少需要 6 个 32 位值才能组成一个矩阵");
      setResult(null);
      return;
    }
    setResult({ kind: "hex2dec", matrices });
  };

  const decToHex = () => {
    setError("");
    setWarning("");
    setCopiedKey("");
    if (!input.trim()) {
      setError("请输入十进制数据");
      setResult(null);
      return;
    }
    const vals = parseDec(input);
    if (vals.length === 0) {
      setError("未找到有效的十进制数值");
      setResult(null);
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
      setResult(null);
      return;
    }
    const blocks: number[][] = [];
    for (let m = 0; m < count; m++) blocks.push(decToHexBlock(vals.slice(m * 9, m * 9 + 9)));
    setResult({ kind: "dec2hex", blocks, truncated });
  };

  const clear = () => {
    setInput("");
    setError("");
    setWarning("");
    setResult(null);
    setCopiedKey("");
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1500);
    } catch {
      // 剪贴板不可用时忽略
    }
  };

  const matrices = result?.kind === "hex2dec" ? result.matrices : null;
  const blocks = result?.kind === "dec2hex" ? result.blocks : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[720px] max-w-full max-h-[90vh] overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">CCM 转换（Hex ↔ Dec）</h2>
          <button className="text-neutral-400 hover:text-white text-sm px-2" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <p className="text-xs text-neutral-400 leading-relaxed">
          MTK ISP6s / ISP4s 色彩校正矩阵工具。粘贴 <span className="font-mono">CCM.cpp</span> 中的 6 个
          32 位十六进制值（可批量多个光源矩阵），或 9 个十进制值做反向打包。规则：每个 32 位值的低 16
          位为第 1 个元素、高 16 位为第 2 个元素，13 位有符号（≥4096 减 8192）。
        </p>

        <textarea
          className="w-full h-28 bg-neutral-800 border border-neutral-700 rounded p-2 text-xs font-mono text-neutral-100 resize-y"
          placeholder={"例：\n0x1EC0032B, 0x00000015,\n0x02651F68, 0x00000033,\n0x1E7D1FBE, 0x000003C5"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === "Enter") hexToDec();
          }}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="bg-sky-600 hover:bg-sky-500 text-white text-sm px-4 py-1 rounded"
            onClick={hexToDec}
          >
            Hex → Dec
          </button>
          <button
            className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded"
            onClick={decToHex}
          >
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
              const matrices = hexToDecMatrices(parseHex32(EXAMPLE));
              setResult({ kind: "hex2dec", matrices });
            }}
          >
            加载示例
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
          {!error && warning && <span className="text-xs text-amber-400">{warning}</span>}
        </div>

        {/* Hex → Dec 结果 */}
        {matrices && (
          <>
            {matrices.map((mm, mi) => (
              <div key={mi} className="space-y-1">
                {matrices.length > 1 && (
                  <div className="text-xs text-sky-400 font-bold pt-1">CCM Matrix #{mi + 1}</div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {mm.dec.map((row, r) =>
                    row.map((val, c) => (
                      <div
                        key={`${r}-${c}`}
                        className="bg-neutral-800 border border-neutral-700 rounded p-2 text-center"
                      >
                        <div className="text-[10px] text-neutral-500">{LABELS[r * 3 + c]}</div>
                        <div className="text-xs font-mono text-orange-300">0x{mm.hex[r][c]}</div>
                        <div className="text-lg font-mono font-bold text-sky-300">{val}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}

            {[
              { key: "cpp", title: "CCM.cpp 格式输出", text: toCppFormat(matrices) },
              { key: "dec", title: "纯十进制矩阵", text: toDecFormat(matrices) },
            ].map(({ key, title, text }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{title}</span>
                  <button
                    className="text-xs bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded"
                    onClick={() => copy(text, key)}
                  >
                    {copiedKey === key ? "已复制 ✓" : "复制"}
                  </button>
                </div>
                <pre
                  className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-xs font-mono text-emerald-200 overflow-x-auto whitespace-pre"
                  onClick={(e) => {
                    const sel = window.getSelection();
                    if (sel) sel.selectAllChildren(e.currentTarget);
                  }}
                >
                  {text}
                </pre>
              </div>
            ))}
          </>
        )}

        {/* Dec → Hex 结果 */}
        {blocks && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Dec → Hex 结果（{blocks.length} 个矩阵）</span>
              <button
                className="text-xs bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded"
                onClick={() => copy(decToHexOutput(blocks), "rev")}
              >
                {copiedKey === "rev" ? "已复制 ✓" : "复制"}
              </button>
            </div>
            <pre className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-xs font-mono text-emerald-200 overflow-x-auto whitespace-pre">
              {decToHexOutput(blocks)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
