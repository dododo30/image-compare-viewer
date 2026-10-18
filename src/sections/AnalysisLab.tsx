import { useEffect, useRef, useState } from "react";
import ImagePane from "@/sections/ImagePane";
import {
  diffHeatmap,
  diffStats,
  shadingAnalysis,
  clippingAnalysis,
  clippingMask,
  noiseAnalysis,
  type RgbaData,
  type DiffStats,
  type ShadingResult,
  type ClipStats,
  type NoiseStats,
} from "@/lib/analysis";
import type { LoadedImage, Rect, ViewState } from "@/types/image";

interface Props {
  onExit: () => void;
}

let labId = 0;

/** 像素数据转 canvas（用于差异图/蒙版显示） */
function CanvasView({ img }: { img: RgbaData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  }, [img]);
  return <canvas ref={ref} className="max-w-full max-h-full object-contain" />;
}

/** 图像分析页：差异对比 / shading / 裁切 / 噪声 */
export default function AnalysisLab({ onExit }: Props) {
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [region, setRegion] = useState<Rect | null>(null);
  const dataCache = useRef(new Map<string, RgbaData>());

  // 差异对比
  const [diffA, setDiffA] = useState<string>("");
  const [diffB, setDiffB] = useState<string>("");
  const [amplify, setAmplify] = useState(4);
  const [diffView, setDiffView] = useState<RgbaData | null>(null);
  const [diffStat, setDiffStat] = useState<DiffStats | null>(null);
  // shading
  const [shading, setShading] = useState<ShadingResult | null>(null);
  // 裁切
  const [clipThresh, setClipThresh] = useState(250);
  const [clipStat, setClipStat] = useState<ClipStats | null>(null);
  const [clipView, setClipView] = useState<RgbaData | null>(null);
  // 噪声
  const [noiseStat, setNoiseStat] = useState<NoiseStats | null>(null);
  const [noiseCmpId, setNoiseCmpId] = useState<string>("");
  const [noiseCmpStat, setNoiseCmpStat] = useState<NoiseStats | null>(null);
  const [noiseErr, setNoiseErr] = useState("");

  const active = images.find((i) => i.id === activeId) ?? null;
  const centerMode = diffView ? "diff" : clipView ? "clip" : "image";

  const loadFiles = async (files: FileList | File[]) => {
    const loaded: LoadedImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const url = URL.createObjectURL(file);
        const el = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
        loaded.push({
          id: `an-${++labId}`,
          file,
          url,
          name: file.name,
          size: file.size,
          width: el.naturalWidth,
          height: el.naturalHeight,
          element: el,
          exif: {},
        });
      } catch {
        // 跳过无法解码的文件
      }
    }
    if (loaded.length) {
      setImages((prev) => [...prev, ...loaded]);
      if (!activeId) {
        setActiveId(loaded[0].id);
        if (loaded.length > 1) {
          setDiffA(loaded[0].id);
          setDiffB(loaded[1].id);
        }
      }
    }
  };

  const getData = (img: LoadedImage): RgbaData => {
    const cached = dataCache.current.get(img.id);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img.element, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height);
    dataCache.current.set(img.id, data);
    return data;
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const t = prev.find((i) => i.id === id);
      if (t) URL.revokeObjectURL(t.url);
      return prev.filter((i) => i.id !== id);
    });
    dataCache.current.delete(id);
    if (activeId === id) {
      setActiveId(null);
      setRegion(null);
      setShading(null);
      setClipStat(null);
      setClipView(null);
      setNoiseStat(null);
    }
    if (diffA === id || diffB === id) setDiffView(null);
  };

  const genDiff = () => {
    const a = images.find((i) => i.id === diffA);
    const b = images.find((i) => i.id === diffB);
    if (!a || !b) return;
    const da = getData(a);
    const db = getData(b);
    setDiffView(diffHeatmap(da, db, amplify));
    setDiffStat(diffStats(da, db, region));
  };

  const genShading = () => {
    if (!active) return;
    setShading(shadingAnalysis(getData(active)));
  };

  const genClip = () => {
    if (!active) return;
    const d = getData(active);
    setClipStat(clippingAnalysis(d, clipThresh));
    setClipView(clippingMask(d, clipThresh));
  };

  const genNoise = () => {
    if (!active) return;
    if (!region || region.w < 8 || region.h < 8) {
      setNoiseErr("请先在图像上右键框选一个平坦区域（≥8×8）");
      return;
    }
    setNoiseErr("");
    setNoiseStat(noiseAnalysis(getData(active), region));
    const cmp = images.find((i) => i.id === noiseCmpId);
    setNoiseCmpStat(cmp && cmp.id !== active.id ? noiseAnalysis(getData(cmp), region) : null);
  };

  const selCls = "bg-neutral-700 text-xs rounded px-1 py-1 max-w-40 text-neutral-100";
  const fmt1 = (v: number) => v.toFixed(1);
  const fmt2 = (v: number) => v.toFixed(2);

  const NoiseTable = ({ stats, title }: { stats: NoiseStats; title: string }) => (
    <div className="space-y-0.5">
      <div className="text-[10px] text-neutral-500">{title}（{stats.pixels.toLocaleString()} 像素）</div>
      <div className="grid grid-cols-4 gap-1 text-[11px] font-mono">
        <span className="text-neutral-500" />
        <span className="text-red-400">R</span>
        <span className="text-green-400">G</span>
        <span className="text-blue-400">B</span>
        <span className="text-neutral-500">σ</span>
        <span>{fmt2(stats.sigma[0])}</span>
        <span>{fmt2(stats.sigma[1])}</span>
        <span>{fmt2(stats.sigma[2])}</span>
        <span className="text-neutral-500">SNR</span>
        <span>{fmt1(stats.snrDb[0])}dB</span>
        <span>{fmt1(stats.snrDb[1])}dB</span>
        <span>{fmt1(stats.snrDb[2])}dB</span>
      </div>
      <div className="text-[11px] font-mono text-neutral-300">亮度 SNR：{fmt1(stats.lumaSnrDb)} dB</div>
    </div>
  );

  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        loadFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700 flex-wrap">
        <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-2 py-1 rounded" onClick={onExit}>
          ← 返回
        </button>
        <span className="font-bold text-sm">📊 图像分析</span>
        <label className="bg-sky-600 hover:bg-sky-500 text-white text-xs px-3 py-1 rounded cursor-pointer">
          打开图片
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) loadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-[10px] text-neutral-500">可多选或直接拖入；右键框选区域用于噪声/差异统计</span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 图像列表 */}
        <aside className="w-44 shrink-0 bg-neutral-800/60 border-r border-neutral-700 overflow-y-auto p-2 space-y-1">
          <div className="text-xs text-neutral-400 px-1 pb-1">图片（{images.length}）</div>
          {images.map((img) => (
            <div
              key={img.id}
              className={`group flex items-center justify-between gap-1 rounded px-2 py-1 cursor-pointer text-xs ${
                img.id === activeId ? "bg-sky-600/30 ring-1 ring-sky-400" : "hover:bg-neutral-700/60"
              }`}
              onClick={() => {
                setActiveId(img.id);
                setView({ zoom: 1, panX: 0, panY: 0 });
                setRegion(null);
                setShading(null);
                setClipStat(null);
                setClipView(null);
                setNoiseStat(null);
              }}
            >
              <div className="min-w-0">
                <div className="truncate text-neutral-100">{img.name}</div>
                <div className="text-[10px] text-neutral-500">{img.width}×{img.height}</div>
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-400 px-1 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(img.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {images.length === 0 && (
            <div className="text-[11px] text-neutral-500 px-1">加载图片后开始分析</div>
          )}
        </aside>

        {/* 中央视图 */}
        <div className="flex-1 min-w-0 p-1 grid relative">
          {centerMode !== "image" && (
            <button
              className="absolute top-3 left-3 z-10 bg-sky-600 hover:bg-sky-500 text-white text-xs px-2 py-1 rounded"
              onClick={() => {
                setDiffView(null);
                setClipView(null);
              }}
            >
              ← 返回原图
            </button>
          )}
          {centerMode === "diff" && diffView && (
            <div className="flex items-center justify-center overflow-auto bg-neutral-900 rounded border-2 border-fuchsia-500 min-h-0">
              <CanvasView img={diffView} />
              <span className="absolute top-3 right-3 text-xs bg-black/60 text-fuchsia-300 px-2 py-0.5 rounded">
                差异视图 ×{amplify}
              </span>
            </div>
          )}
          {centerMode === "clip" && clipView && (
            <div className="flex items-center justify-center overflow-auto bg-neutral-900 rounded border-2 border-amber-500 min-h-0">
              <CanvasView img={clipView} />
              <span className="absolute top-3 right-3 text-xs bg-black/60 text-amber-300 px-2 py-0.5 rounded">
                裁切位置（≥{clipThresh}）
              </span>
            </div>
          )}
          {centerMode === "image" &&
            (active ? (
              <ImagePane
                image={active}
                view={view}
                onViewChange={setView}
                active
                onActivate={() => {}}
                region={region}
                onRegionChange={setRegion}
                onRemove={() => removeImage(active.id)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-neutral-500">
                <div className="text-5xl mb-3">📊</div>
                <div>加载图片开始分析</div>
              </div>
            ))}
        </div>

        {/* 分析面板 */}
        <aside className="w-96 shrink-0 bg-neutral-800/60 border-l border-neutral-700 overflow-y-auto p-3 space-y-4">
          {/* ① 差异对比 */}
          <section className="space-y-2">
            <div className="text-sm font-semibold text-neutral-200">① 差异对比</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-400 shrink-0">A</span>
              <select className={selCls + " flex-1"} value={diffA} onChange={(e) => setDiffA(e.target.value)}>
                <option value="">选择图片 A</option>
                {images.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-400 shrink-0">B</span>
              <select className={selCls + " flex-1"} value={diffB} onChange={(e) => setDiffB(e.target.value)}>
                <option value="">选择图片 B</option>
                {images.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <label className="block text-xs text-neutral-300">
              <div className="flex justify-between"><span>放大倍数</span><span className="font-mono">×{amplify}</span></div>
              <input type="range" min={1} max={16} step={1} value={amplify}
                className="w-full accent-fuchsia-400"
                onChange={(e) => setAmplify(Number(e.target.value))} />
            </label>
            <button
              className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded disabled:opacity-40"
              disabled={!diffA || !diffB}
              onClick={genDiff}
            >
              生成差异图（含当前框选区域统计）
            </button>
            {diffStat && (
              <div className="text-[11px] font-mono space-y-0.5 bg-neutral-900 border border-neutral-700 rounded p-2">
                <div>mean|Δ| R/G/B：{fmt2(diffStat.meanAbs[0])} / {fmt2(diffStat.meanAbs[1])} / {fmt2(diffStat.meanAbs[2])}</div>
                <div>meanΔ R/G/B：{fmt2(diffStat.meanDiff[0])} / {fmt2(diffStat.meanDiff[1])} / {fmt2(diffStat.meanDiff[2])}</div>
                <div>最大差值：{diffStat.maxAbs.toFixed(0)}</div>
                <div>平均 ΔE(CIE76)：{fmt2(diffStat.deltaE76)}</div>
              </div>
            )}
          </section>

          {/* ② Shading */}
          <section className="space-y-2">
            <div className="text-sm font-semibold text-neutral-200">② Shading 测量（均匀灰场）</div>
            <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded disabled:opacity-40"
              disabled={!active} onClick={genShading}>
              测量当前图
            </button>
            {shading && (
              <div className="text-[11px] font-mono space-y-0.5 bg-neutral-900 border border-neutral-700 rounded p-2">
                {shading.zones.map((z) => (
                  <div key={z.name} className="flex justify-between">
                    <span className="text-neutral-400">{z.name}</span>
                    <span>Y={fmt1(z.yMean)} R/G={fmt2(z.rg)} B/G={fmt2(z.bg)}</span>
                  </div>
                ))}
                <div className="pt-0.5 border-t border-neutral-700">
                  角/中心 Y 比：{fmt2(shading.cornerRatioMin)} ~ {fmt2(shading.cornerRatioMax)}
                  （不均 {(100 * (1 - shading.cornerRatioMin)).toFixed(1)}%）
                </div>
              </div>
            )}
          </section>

          {/* ③ 裁切分析 */}
          <section className="space-y-2">
            <div className="text-sm font-semibold text-neutral-200">③ 过曝/饱和裁切</div>
            <label className="block text-xs text-neutral-300">
              <div className="flex justify-between"><span>阈值</span><span className="font-mono">≥{clipThresh}</span></div>
              <input type="range" min={240} max={255} step={1} value={clipThresh}
                className="w-full accent-amber-400"
                onChange={(e) => setClipThresh(Number(e.target.value))} />
            </label>
            <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded disabled:opacity-40"
              disabled={!active} onClick={genClip}>
              分析裁切
            </button>
            {clipStat && (
              <div className="text-[11px] font-mono space-y-0.5 bg-neutral-900 border border-neutral-700 rounded p-2">
                <div className="flex justify-between"><span className="text-red-400">R 裁切</span><span>{clipStat.r.pct.toFixed(2)}%（{clipStat.r.count.toLocaleString()} px）</span></div>
                <div className="flex justify-between"><span className="text-green-400">G 裁切</span><span>{clipStat.g.pct.toFixed(2)}%（{clipStat.g.count.toLocaleString()} px）</span></div>
                <div className="flex justify-between"><span className="text-blue-400">B 裁切</span><span>{clipStat.b.pct.toFixed(2)}%（{clipStat.b.count.toLocaleString()} px）</span></div>
                <div className="flex justify-between pt-0.5 border-t border-neutral-700">
                  <span className="text-neutral-400">任意通道</span>
                  <span>{clipStat.any.pct.toFixed(2)}%</span>
                </div>
              </div>
            )}
          </section>

          {/* ④ 噪声/SNR */}
          <section className="space-y-2">
            <div className="text-sm font-semibold text-neutral-200">④ 噪声 / SNR（需框选平坦区域）</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-400 shrink-0">对比</span>
              <select className={selCls + " flex-1"} value={noiseCmpId} onChange={(e) => setNoiseCmpId(e.target.value)}>
                <option value="">不对比</option>
                {images.filter((i) => i.id !== activeId).map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded disabled:opacity-40"
              disabled={!active} onClick={genNoise}>
              测量选区
            </button>
            {noiseErr && <div className="text-xs text-red-400">{noiseErr}</div>}
            {noiseStat && <NoiseTable stats={noiseStat} title="当前图选区" />}
            {noiseStat && noiseCmpStat && (
              <>
                <div className="border-t border-neutral-700 pt-2" />
                <NoiseTable stats={noiseCmpStat} title="对比图（同坐标区域）" />
                <div className="text-[11px] font-mono text-neutral-400">
                  ΔSNR：{fmt1(noiseCmpStat.lumaSnrDb - noiseStat.lumaSnrDb)} dB
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
