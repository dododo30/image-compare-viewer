import { useEffect, useRef, useState } from "react";
import {
  mtkToQcom,
  qcomToMtk,
  mtkXPoints,
  qcomXPoints,
  parseDecimalList,
  parseHexList,
  MTK_INPUT_LEN,
  QCOM_INPUT_LEN,
} from "@/lib/gamma";

interface Props {
  onClose: () => void;
}

type Mode = "mtk2qcom" | "qcom2mtk";

interface Curves {
  inX: number[];
  inY: number[];
  outX: number[];
  outY: number[];
}

/** Gamma 转换工具：MTK ↔ QCOM gamma 表互转（算法与 Python 版位精确一致）+ 曲线预览 */
export default function GammaTool({ onClose }: Props) {
  const [mode, setMode] = useState<Mode>("mtk2qcom");
  const [hexInput, setHexInput] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [curves, setCurves] = useState<Curves | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const needLen = mode === "mtk2qcom" ? MTK_INPUT_LEN : QCOM_INPUT_LEN;

  const convert = () => {
    setError("");
    setCopied(false);
    const { values, invalid } =
      mode === "mtk2qcom" && hexInput ? parseHexList(input) : parseDecimalList(input);
    if (invalid.length > 0) {
      setError(`无法识别的内容：${invalid.slice(0, 5).join("、")}${invalid.length > 5 ? " …" : ""}`);
      setOutput("");
      setCurves(null);
      return;
    }
    if (values.length !== needLen) {
      setError(`输入 ${values.length} 组，需要 ${needLen} 组${mode === "mtk2qcom" ? " MTK" : " QCOM"} gamma 值`);
      setOutput("");
      setCurves(null);
      return;
    }
    if (mode === "mtk2qcom") {
      const out = mtkToQcom(values);
      setOutput(out.join(" "));
      setCurves({ inX: mtkXPoints(), inY: values, outX: qcomXPoints(), outY: out });
    } else {
      const out = qcomToMtk(values);
      setOutput(out.join(","));
      setCurves({ inX: qcomXPoints(), inY: values, outX: mtkXPoints(), outY: out });
    }
  };

  const copyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 不可用时选中文本由用户手动复制
      setCopied(false);
    }
  };

  // 曲线预览
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !curves) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ml = 34, mr = 10, mt = 10, mb = 22;
    const pw = cw - ml - mr;
    const ph = ch - mt - mb;
    const px = (x: number) => ml + (x / 1023) * pw;
    const py = (y: number) => mt + ph - (y / 1023) * ph;

    ctx.fillStyle = "#141417";
    ctx.fillRect(0, 0, cw, ch);

    // 网格
    ctx.strokeStyle = "#33333a";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.font = "10px monospace";
    ctx.fillStyle = "#777";
    for (const g of [0, 256, 512, 768, 1023]) {
      ctx.beginPath();
      ctx.moveTo(px(g), mt);
      ctx.lineTo(px(g), mt + ph);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ml, py(g));
      ctx.lineTo(ml + pw, py(g));
      ctx.stroke();
      ctx.fillText(String(g), px(g) - 8, ch - 8);
      ctx.fillText(String(g), 6, py(g) + 3);
    }
    ctx.setLineDash([]);

    // y=x 参考线
    ctx.strokeStyle = "#44444c";
    ctx.beginPath();
    ctx.moveTo(px(0), py(0));
    ctx.lineTo(px(1023), py(1023));
    ctx.stroke();

    const drawCurve = (xs: number[], ys: number[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      xs.forEach((x, i) => {
        if (i === 0) ctx.moveTo(px(x), py(ys[i]));
        else ctx.lineTo(px(x), py(ys[i]));
      });
      ctx.stroke();
    };
    drawCurve(curves.inX, curves.inY, "#38bdf8");
    drawCurve(curves.outX, curves.outY, "#f472b6");

    // 图例
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("— 输入", ml + 6, mt + 14);
    ctx.fillStyle = "#f472b6";
    ctx.fillText("— 输出", ml + 66, mt + 14);
  }, [curves]);

  const placeholder =
    mode === "mtk2qcom"
      ? hexInput
        ? "粘贴 MTK dump 的十六进制数据，如：00 04 0a 1f …（共 256 组）"
        : `输入 ${MTK_INPUT_LEN} 组 MTK gamma 十进制值，空格/逗号/换行分隔`
      : `输入 ${QCOM_INPUT_LEN} 组 QCOM gamma 十进制值，空格/逗号/换行分隔`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[720px] max-w-full max-h-[90vh] overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Gamma 转换（MTK ↔ QCOM）</h2>
          <button
            className="text-neutral-400 hover:text-white text-sm px-2"
            onClick={onClose}
            title="关闭"
          >
            ✕
          </button>
        </div>

        {/* 模式选择 */}
        <div className="flex items-center gap-2">
          {(
            [
              ["mtk2qcom", "MTK → QCOM"],
              ["qcom2mtk", "QCOM → MTK"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              className={`text-xs px-3 py-1 rounded ${
                mode === m ? "bg-sky-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"
              }`}
              onClick={() => {
                setMode(m);
                setError("");
                setOutput("");
                setCurves(null);
              }}
            >
              {label}
            </button>
          ))}
          {mode === "mtk2qcom" && (
            <label className="flex items-center gap-1 text-xs text-neutral-300 cursor-pointer ml-2">
              <input type="checkbox" checked={hexInput} onChange={(e) => setHexInput(e.target.checked)} />
              十六进制输入（dump 文件）
            </label>
          )}
        </div>

        {/* 输入 */}
        <textarea
          className="w-full h-28 bg-neutral-800 border border-neutral-700 rounded p-2 text-xs font-mono text-neutral-100 resize-y"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <div className="flex items-center gap-2">
          <button
            className="bg-sky-600 hover:bg-sky-500 text-white text-sm px-4 py-1 rounded"
            onClick={convert}
          >
            转换
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>

        {/* 输出 */}
        {output && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                转换结果（{mode === "mtk2qcom" ? QCOM_INPUT_LEN : MTK_INPUT_LEN} 组）
              </span>
              <button
                className="text-xs bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded"
                onClick={copyOutput}
              >
                {copied ? "已复制 ✓" : "复制"}
              </button>
            </div>
            <textarea
              readOnly
              className="w-full h-24 bg-neutral-800 border border-neutral-700 rounded p-2 text-xs font-mono text-amber-200 resize-y"
              value={output}
              onFocus={(e) => e.target.select()}
            />
            <canvas ref={canvasRef} className="w-full h-44 block rounded border border-neutral-700" />
          </>
        )}
      </div>
    </div>
  );
}
