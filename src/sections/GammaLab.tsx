import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface Curves {
  inX: number[];
  inY: number[];
  outX: number[];
  outY: number[];
}

type Mode = "mtk2qcom" | "qcom2mtk";

/** 对比曲线配色（与输入蓝/输出粉区分） */
const CMP_COLORS = [
  "#a78bfa", "#34d399", "#fbbf24", "#fb923c",
  "#e879f9", "#22d3ee", "#4ade80", "#f87171",
  "#c084fc", "#94a3b8", "#fde047", "#f9a8d4",
];

const CMP_PRESETS = [1.6, 1.8, 2.0, 2.2, 2.4];

/** 解析对比 gamma 值列表：去重、排序、限幅、上限 12 条 */
function parseCompareGammas(text: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const tok of text.split(/[,，\s]+/).filter(Boolean)) {
    const v = parseFloat(tok);
    if (isNaN(v) || v < 0.3 || v > 10) continue;
    const r = Math.round(v * 100) / 100;
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out.sort((a, b) => a - b).slice(0, 12);
}

/** Gamma 转换页：大曲线可视化 + 右侧输入/输出参数 */
export default function GammaLab({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<Mode>("mtk2qcom");
  const [hexInput, setHexInput] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [curves, setCurves] = useState<Curves | null>(null);
  const [cmpText, setCmpText] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

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
      // 剪贴板不可用
    }
  };

  const cmpGammas = useMemo(() => parseCompareGammas(cmpText), [cmpText]);

  const togglePreset = (v: number) => {
    const next = cmpGammas.includes(v) ? cmpGammas.filter((g) => g !== v) : [...cmpGammas, v];
    setCmpText(next.join(", "));
  };

  // 大画布绘制（随窗口缩放）
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    if (cw === 0 || ch === 0) return;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#141417";
    ctx.fillRect(0, 0, cw, ch);

    const ml = 46, mr = 18, mt = 50, mb = 34;
    const pw = cw - ml - mr;
    const ph = ch - mt - mb;
    const px = (x: number) => ml + (x / 1023) * pw;
    const py = (y: number) => mt + ph - (y / 1023) * ph;

    ctx.font = "11px monospace";
    ctx.strokeStyle = "#33333a";
    ctx.fillStyle = "#777";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const g of [0, 256, 512, 768, 1023]) {
      ctx.beginPath();
      ctx.moveTo(px(g), mt);
      ctx.lineTo(px(g), mt + ph);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ml, py(g));
      ctx.lineTo(ml + pw, py(g));
      ctx.stroke();
      ctx.fillText(String(g), px(g) - 8, ch - 12);
      ctx.fillText(String(g), 10, py(g) + 4);
    }
    ctx.setLineDash([]);

    // 轴说明
    ctx.fillStyle = "#888";
    ctx.fillText("输入 →", ml + pw - 44, ch - 12);
    ctx.save();
    ctx.translate(14, mt + 40);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("输出 →", 0, 0);
    ctx.restore();

    // y=x 参考
    ctx.strokeStyle = "#44444c";
    ctx.beginPath();
    ctx.moveTo(px(0), py(0));
    ctx.lineTo(px(1023), py(1023));
    ctx.stroke();

    // 对比 gamma 曲线（标准幂曲线，虚线）
    cmpGammas.forEach((g, gi) => {
      ctx.strokeStyle = CMP_COLORS[gi % CMP_COLORS.length];
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      for (let i = 0; i <= 256; i++) {
        const x = (i / 256) * 1023;
        const y = 1023 * Math.pow(x / 1023, 1 / g);
        if (i === 0) ctx.moveTo(px(x), py(y));
        else ctx.lineTo(px(x), py(y));
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 图例（两行）
    ctx.font = "12px sans-serif";
    let lx = ml + 10;
    if (curves) {
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("━ 输入", lx, 16);
      ctx.fillStyle = "#f472b6";
      ctx.fillText("━ 输出", lx + 62, 16);
      lx += 124;
    }
    ctx.fillStyle = "#888";
    ctx.fillText("┅ y=x", lx, 16);
    cmpGammas.forEach((g, gi) => {
      ctx.fillStyle = CMP_COLORS[gi % CMP_COLORS.length];
      ctx.fillText(`╌ γ${g}`, ml + 10 + gi * 62, 34);
    });

    if (!curves) {
      ctx.fillStyle = "#555";
      ctx.font = "13px sans-serif";
      ctx.fillText("在右侧粘贴数据并点「转换」，此处显示输入/输出 gamma 曲线", ml + 20, mt + ph / 2);
      return;
    }

    const drawCurve = (xs: number[], ys: number[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      xs.forEach((x, i) => {
        if (i === 0) ctx.moveTo(px(x), py(ys[i]));
        else ctx.lineTo(px(x), py(ys[i]));
      });
      ctx.stroke();
    };
    drawCurve(curves.inX, curves.inY, "#38bdf8");
    drawCurve(curves.outX, curves.outY, "#f472b6");
  }, [curves, cmpGammas]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const placeholder =
    mode === "mtk2qcom"
      ? hexInput
        ? "粘贴 MTK dump 的十六进制数据，如：00 04 0a 1f …（共 256 组）"
        : `输入 ${MTK_INPUT_LEN} 组 MTK gamma 十进制值，空格/逗号/换行分隔`
      : `输入 ${QCOM_INPUT_LEN} 组 QCOM gamma 十进制值，空格/逗号/换行分隔`;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700">
        <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-2 py-1 rounded" onClick={onExit}>
          ← 返回
        </button>
        <span className="font-bold text-sm">📈 Gamma 转换（MTK ↔ QCOM）</span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 曲线可视化 */}
        <div ref={boxRef} className="flex-1 min-w-0 p-1 grid">
          <canvas ref={canvasRef} className="block rounded border border-neutral-700" />
        </div>

        {/* 输入/输出参数 */}
        <aside className="w-96 shrink-0 bg-neutral-800/60 border-l border-neutral-700 overflow-y-auto p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
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
              <label className="flex items-center gap-1 text-xs text-neutral-300 cursor-pointer ml-1">
                <input type="checkbox" checked={hexInput} onChange={(e) => setHexInput(e.target.checked)} />
                十六进制输入（dump 文件）
              </label>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-xs text-neutral-400">输入（{needLen} 组）</div>
            <textarea
              className="w-full h-32 bg-neutral-900 border border-neutral-700 rounded p-2 text-xs font-mono text-neutral-100 resize-y"
              placeholder={placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === "Enter") convert();
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <button className="bg-sky-600 hover:bg-sky-500 text-white text-sm px-4 py-1 rounded" onClick={convert}>
              转换
            </button>
            <button
              className="bg-neutral-700 hover:bg-neutral-600 text-xs px-2 py-1 rounded"
              onClick={() => {
                setInput("");
                setOutput("");
                setError("");
                setCurves(null);
                setCopied(false);
              }}
            >
              清空
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>

          {output && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">
                  输出（{mode === "mtk2qcom" ? QCOM_INPUT_LEN : MTK_INPUT_LEN} 组）
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
                className="w-full h-40 bg-neutral-900 border border-neutral-700 rounded p-2 text-xs font-mono text-amber-200 resize-y"
                value={output}
                onFocus={(e) => e.target.select()}
              />
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">对比 Gamma 曲线（{cmpGammas.length}/12）</span>
              {cmpGammas.length > 0 && (
                <button
                  className="text-[10px] bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded"
                  onClick={() => setCmpText("")}
                >
                  清除
                </button>
              )}
            </div>
            <input
              type="text"
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs font-mono text-neutral-100"
              placeholder="如：1.6, 2.2, 2.4（逗号或空格分隔）"
              value={cmpText}
              onChange={(e) => setCmpText(e.target.value)}
            />
            <div className="flex gap-1 flex-wrap">
              {CMP_PRESETS.map((v) => (
                <button
                  key={v}
                  className={`text-[10px] px-2 py-0.5 rounded ${
                    cmpGammas.includes(v) ? "bg-sky-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"
                  }`}
                  onClick={() => togglePreset(v)}
                >
                  γ{v}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-600">虚线为标准幂曲线 y=x^(1/γ)，最多 12 条，与转换结果叠加对比</p>
          </div>

          <p className="text-[10px] text-neutral-500 leading-relaxed">
            转换算法与原 Python 版位精确一致（QCOM→MTK 使用 PCHIP 插值）。
            输出值域：QCOM 0..1023，MTK 0..1020；组数不符会在上方红字提示。
          </p>
        </aside>
      </div>
    </div>
  );
}
