import { useEffect, useRef, useState } from "react";
import ImagePane from "@/sections/ImagePane";
import RawImportDialog from "@/sections/RawImportDialog";
import RawChannelHist from "@/sections/RawChannelHist";
import StatsPanel from "@/sections/StatsPanel";
import { demosaicBilinear, rgbaToCanvas, subtractOb, type BayerPattern } from "@/lib/raw";
import { useImportFormat, decodeFiles, type DecodedImage } from "@/lib/rawImport";
import {
  applyIspFromPlanes,
  applyIspFromRgba,
  rawGainedHistograms,
  radialMap,
  defaultIspParams,
  type IspParams,
  type ChannelHist,
} from "@/lib/isp";
import { computeStats, type ImageStats } from "@/lib/stats";
import type { LoadedImage, Rect, ViewState } from "@/types/image";

interface LabSource {
  id: string;
  name: string;
  width: number;
  height: number;
  format: string;
  bits: number; // 0 = YUV
  raw?: { vals: Uint16Array; pattern: BayerPattern; bits: number };
  yuvRgba?: Uint8ClampedArray<ArrayBuffer>;
  radial: Float32Array;
}

let labId = 0;

/** 数值输入框：聚焦时可输入，2 位小数，失焦/回车提交并限幅 */
function NumBox({ value, min, max, onChange, decimals = 2, step }: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  decimals?: number;
  step?: number;
}) {
  const [text, setText] = useState<string | null>(null);
  const fmt = (v: number) => v.toFixed(decimals);
  return (
    <input
      type="text"
      inputMode="decimal"
      className="w-14 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[11px] font-mono text-right text-neutral-100"
      value={text ?? fmt(value)}
      onFocus={(e) => {
        setText(fmt(value));
        e.target.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = step ? Math.round(parseFloat(e.target.value)) : parseFloat(e.target.value);
        if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
      onBlur={() => setText(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function Slider({
  label, value, min, max, step, onChange, suffix, editable,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
  editable?: boolean;
}) {
  return (
    <label className="block text-xs text-neutral-300 space-y-0.5">
      <div className="flex justify-between items-center gap-1">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          {editable && <NumBox value={value} min={min} max={max} onChange={onChange} />}
          {suffix && <span className="font-mono text-neutral-400 text-[10px] w-7 text-right">{suffix}</span>}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-sky-400"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** RAW 实验室：独立页面，保留查看/框选统计能力，实时调节 ISP 处理链参数 */
export default function RawLab({ onExit }: { onExit: () => void }) {
  const [sources, setSources] = useState<LabSource[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [fmt, setFmt] = useImportFormat(); // 格式参数跨页面记忆（localStorage）
  const [params, setParams] = useState<IspParams>(defaultIspParams);
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [region, setRegion] = useState<Rect | null>(null);
  const [display, setDisplay] = useState<LoadedImage | null>(null);
  const [hist, setHist] = useState<ChannelHist | undefined>();
  const [stats, setStats] = useState<ImageStats | null>(null);
  const [dropHint, setDropHint] = useState("");
  const [dropBusy, setDropBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const processedRef = useRef<ImageData | null>(null);
  // OB（黑电平）扣除：按物理通道 R/Gr/Gb/B，分正负，依 Bayer 排列映射
  const [ob, setOb] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  // 去马赛克结果缓存：按 (源, OB) 签名，OB 变化才重算
  const planesCache = useRef(
    new Map<string, { key: string; vals: Uint16Array; planes: { r: Float32Array; g: Float32Array; b: Float32Array } }>()
  );

  const active = sources.find((s) => s.id === activeId) ?? null;

  // 拖放导入：按记忆的格式参数解码
  const onDropFiles = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const fs = Array.from(e.dataTransfer.files);
    if (fs.length === 0) return;
    setDropBusy(true);
    setDropHint("");
    try {
      importSources(await decodeFiles(fs, fmt));
    } catch (err) {
      setDropHint(err instanceof Error ? err.message : String(err));
    } finally {
      setDropBusy(false);
    }
  };

  const selectSource = (id: string) => {
    setActiveId(id);
    setView({ zoom: 1, panX: 0, panY: 0 });
    setRegion(null);
  };

  const importSources = (decoded: DecodedImage[]) => {
    const news: LabSource[] = decoded.map((d) => ({
      id: `lab-${++labId}`,
      name: d.name,
      width: d.width,
      height: d.height,
      format: d.rawInfo.format,
      bits: d.rawInfo.bitDepth,
      raw: d.raw,
      yuvRgba: d.yuvRgba,
      radial: radialMap(d.width, d.height),
    }));
    setSources((prev) => [...prev, ...news]);
    if (!activeId) setActiveId(news[0].id);
  };

  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    planesCache.current.delete(id);
    if (activeId === id) {
      setActiveId(null);
      setDisplay(null);
      setHist(undefined);
    }
  };

  // 参数或源变化 → 防抖重处理
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      let proc;
      const maxVal = (1 << active.bits) - 1;
      if (active.raw) {
        // OB 扣除在去马赛克前进行；结果按 (源, OB) 缓存
        const obKey = ob.join(",");
        let entry = planesCache.current.get(active.id);
        if (!entry || entry.key !== obKey) {
          const hasOb = ob.some((v) => v !== 0);
          const vals = hasOb
            ? subtractOb(active.raw.vals, active.width, active.height, active.raw.pattern, ob, maxVal)
            : active.raw.vals;
          entry = {
            key: obKey,
            vals,
            planes: demosaicBilinear(vals, active.width, active.height, active.raw.pattern),
          };
          planesCache.current.set(active.id, entry);
          // 缓存上限：超过 3 个源淘汰最早的
          if (planesCache.current.size > 3) {
            const oldest = planesCache.current.keys().next().value;
            if (oldest) planesCache.current.delete(oldest);
          }
        }
        proc = applyIspFromPlanes(entry.planes, maxVal, active.width, active.height, params, active.radial);
        setHist(rawGainedHistograms(entry.vals, active.width, active.height, active.raw.pattern, maxVal, params, active.radial));
      } else if (active.yuvRgba) {
        proc = applyIspFromRgba(active.yuvRgba, active.width, active.height, params, active.radial);
        setHist(undefined);
      } else {
        return;
      }
      processedRef.current = proc.imageData;
      const canvas = rgbaToCanvas(proc.rgba, active.width, active.height);
      setDisplay({
        id: active.id,
        file: new File([], active.name),
        url: "",
        name: active.name,
        size: 0,
        width: active.width,
        height: active.height,
        element: canvas,
        exif: {},
        rawInfo: { format: active.format, bitDepth: active.bits },
      });
    }, 180);
    return () => clearTimeout(t);
  }, [active, params, ob]);

  // 统计（防抖）
  useEffect(() => {
    const data = processedRef.current;
    if (!data) {
      setStats(null);
      return;
    }
    const t = setTimeout(() => setStats(computeStats(data, region)), 120);
    return () => clearTimeout(t);
  }, [display, region]);

  const setCcm = (i: number, v: number) => {
    const ccm = [...params.ccm];
    ccm[i] = isNaN(v) ? 0 : v;
    setParams({ ...params, ccm });
  };

  const inputCls =
    "w-full bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-xs font-mono text-neutral-100";

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${dragOver ? "ring-2 ring-sky-400 ring-inset" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDropFiles}
    >
      {/* lab header */}
      <header className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700 flex-wrap">
        <button
          className="bg-neutral-700 hover:bg-neutral-600 text-xs px-2 py-1 rounded"
          onClick={onExit}
        >
          ← 返回
        </button>
        <span className="font-bold text-sm">🔬 RAW 实验室</span>
        <button
          className="bg-sky-600 hover:bg-sky-500 text-white text-xs px-3 py-1 rounded"
          onClick={() => setShowImport(true)}
        >
          导入 RAW/YUV
        </button>
        <span className="text-[10px] text-neutral-500">可直接拖放文件到本页</span>
        {dropBusy && <span className="text-xs text-sky-400">拖放解码中…</span>}
        {dropHint && <span className="text-xs text-red-400">{dropHint}</span>}
        {active && (
          <span className="text-xs text-neutral-400 font-mono">
            {active.name} · {active.width}×{active.height} · {active.format}
          </span>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* source list */}
        <aside className="w-44 shrink-0 bg-neutral-800/60 border-r border-neutral-700 overflow-y-auto p-2 space-y-1">
          <div className="text-xs text-neutral-400 px-1 pb-1">源数据（{sources.length}）</div>
          {sources.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center justify-between gap-1 rounded px-2 py-1 cursor-pointer text-xs ${
                s.id === activeId ? "bg-sky-600/30 ring-1 ring-sky-400" : "hover:bg-neutral-700/60"
              }`}
              onClick={() => selectSource(s.id)}
              title={s.name}
            >
              <div className="min-w-0">
                <div className="truncate text-neutral-100">{s.name}</div>
                <div className="text-[10px] text-neutral-500">{s.width}×{s.height}</div>
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-400 px-1 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSource(s.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {sources.length === 0 && (
            <div className="text-[11px] text-neutral-500 px-1">点击「导入 RAW/YUV」加载裸数据</div>
          )}
        </aside>

        {/* viewer */}
        <div className="flex-1 min-w-0 p-1 grid">
          {display ? (
            <ImagePane
              image={display}
              view={view}
              onViewChange={setView}
              active
              onActivate={() => {}}
              region={region}
              onRegionChange={setRegion}
              onRemove={() => active && removeSource(active.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-neutral-500">
              <div className="text-5xl mb-3">🔬</div>
              <div>导入 RAW / YUV 数据开始调试</div>
              <div className="text-sm mt-1">右侧可调节 gamma、增益、CCM、shading 并实时预览</div>
            </div>
          )}
        </div>

        {/* params panel */}
        <aside className="w-80 shrink-0 bg-neutral-800/60 border-l border-neutral-700 overflow-y-auto p-3 space-y-4">
          {/* OB（黑电平）扣除 */}
          <section className="space-y-2">
            <div className="text-sm font-semibold text-neutral-200 flex items-center justify-between">
              OB（黑电平）
              <button
                className="text-[10px] bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded font-normal"
                onClick={() => setOb([0, 0, 0, 0])}
              >
                清零
              </button>
            </div>
            {active && active.bits === 0 ? (
              <p className="text-[10px] text-neutral-500">YUV 数据无 OB</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-1 items-end">
                  {(["R", "Gr", "Gb", "B"] as const).map((label, idx) => (
                    <label key={label} className="block text-center">
                      <span className="text-[10px] text-neutral-400">{label}</span>
                      <NumBox
                        value={ob[idx]}
                        min={-4095}
                        max={4095}
                        decimals={0}
                        step={1}
                        onChange={(v) => {
                          const next = [...ob] as [number, number, number, number];
                          next[idx] = v;
                          setOb(next);
                        }}
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-neutral-500 leading-relaxed">
                  按物理通道填 OB 扣除量（正=减 OB / 负=加回），依导入的 Bayer 排列（RGGB/BGGR…）自动映射位置，在去马赛克前生效；0 = 不处理
                </p>
              </>
            )}
          </section>

          <section className="space-y-2">
            <div className="text-sm font-semibold text-neutral-200 flex items-center justify-between">
              ISP 参数
              <button
                className="text-[10px] bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded font-normal"
                onClick={() => setParams(defaultIspParams())}
              >
                重置全部
              </button>
            </div>
            <Slider
              label="显示 Gamma"
              value={params.gamma}
              min={0.5}
              max={3.5}
              step={0.05}
              onChange={(v) => setParams({ ...params, gamma: v })}
              editable
            />
            <div className="flex gap-1">
              {[
                ["线性", 1],
                ["2.2", 2.2],
                ["2.4", 2.4],
              ].map(([label, v]) => (
                <button
                  key={label}
                  className="text-[10px] bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded"
                  onClick={() => setParams({ ...params, gamma: v as number })}
                >
                  {label}
                </button>
              ))}
            </div>
            <Slider
              label="总增益 (ISP gain)"
              value={params.gain}
              min={0.1}
              max={16}
              step={0.05}
              onChange={(v) => setParams({ ...params, gain: v })}
              suffix="×"
              editable
            />
            {(
              [
                ["R 通道增益", 0],
                ["G 通道增益", 1],
                ["B 通道增益", 2],
              ] as [string, number][]
            ).map(([label, idx]) => (
              <Slider
                key={label}
                label={label}
                value={params.gainRGB[idx]}
                min={0.1}
                max={4}
                step={0.05}
                onChange={(v) => {
                  const gainRGB = [...params.gainRGB] as [number, number, number];
                  gainRGB[idx] = v;
                  setParams({ ...params, gainRGB });
                }}
                suffix="×"
                editable
              />
            ))}
            <Slider
              label="Shading 校正（径向）"
              value={params.shading * 100}
              min={0}
              max={80}
              step={1}
              onChange={(v) => setParams({ ...params, shading: v / 100 })}
              suffix="%"
              editable
            />
          </section>

          <section className="space-y-1">
            <div className="text-xs text-neutral-300">CCM（3×3 行主序）</div>
            <div className="grid grid-cols-3 gap-1">
              {params.ccm.map((v, i) => (
                <input
                  key={i}
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={v}
                  onChange={(e) => setCcm(i, parseFloat(e.target.value))}
                />
              ))}
            </div>
            <button
              className="text-[10px] bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded"
              onClick={() => setParams({ ...params, ccm: defaultIspParams().ccm })}
            >
              CCM 重置为单位阵
            </button>
          </section>

          {hist && (
            <section>
              <div className="text-sm font-semibold mb-1 text-neutral-200">RAW 通道直方图</div>
              <RawChannelHist hist={hist} />
              <div className="text-[10px] text-neutral-500 mt-0.5">增益/shading 后、CCM/gamma 前</div>
            </section>
          )}

          <section>
            <div className="text-sm font-semibold mb-1 text-neutral-200">图像统计</div>
            <StatsPanel stats={stats} region={region} scopeLabel={region ? "框选区域" : "全图"} />
            <div className="text-[10px] text-neutral-500 mt-0.5">处理链输出（gamma 后），右键框选</div>
          </section>
        </aside>
      </div>

      {showImport && (
        <RawImportDialog
          fmt={fmt}
          onFmtChange={setFmt}
          onClose={() => setShowImport(false)}
          onImport={importSources}
        />
      )}
    </div>
  );
}
