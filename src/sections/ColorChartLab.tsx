import { useCallback, useEffect, useRef, useState } from "react";
import ImagePane from "@/sections/ImagePane";
import {
  samplePatches,
  analyzeChart,
  patchCenters,
  quadPoint,
  quadValid,
  CC_PATCHES,
  type ChartResult,
  type Corner,
} from "@/lib/colorchart";
import type { RgbaData } from "@/lib/analysis";
import type { LoadedImage, ViewState } from "@/types/image";

interface Props {
  onExit: () => void;
}

let ccId = 0;

/** 色卡分析页：ColorChecker 24 色四点标定 + ΔE + 白平衡/曝光评估 */
export default function ColorChartLab({ onExit }: Props) {
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [pickMode, setPickMode] = useState(false);
  const [corners, setCorners] = useState<Corner[]>([]);
  const [result, setResult] = useState<ChartResult | null>(null);
  const [hint, setHint] = useState("");
  const dataCache = useRef(new Map<string, RgbaData>());
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const active = images.find((i) => i.id === activeId) ?? null;

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
          id: `cc-${++ccId}`,
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
        // 跳过
      }
    }
    if (loaded.length) {
      setImages((prev) => [...prev, ...loaded]);
      if (!activeId) setActiveId(loaded[0].id);
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
      setCorners([]);
      setResult(null);
    }
  };

  // 标定点击：overlay 捕获 → 图像坐标
  const onPick = (e: React.MouseEvent) => {
    if (!active || !cellRef.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    const fit = Math.min(cw / active.width, ch / active.height, 1);
    const scale = fit * view.zoom;
    const dx = (cw - active.width * scale) / 2 + view.panX;
    const dy = (ch - active.height * scale) / 2 + view.panY;
    const x = (e.clientX - rect.left - dx) / scale;
    const y = (e.clientY - rect.top - dy) / scale;
    const next = [...corners, [x, y]] as Corner[];
    setCorners(next);
    if (next.length === 4) {
      setPickMode(false);
      if (!quadValid(next)) {
        setHint("标定区域过小，请重新标定（四角尽量对齐色卡外沿）");
        setCorners([]);
        return;
      }
      const measured = samplePatches(getData(active), next);
      setResult(analyzeChart(measured));
      setHint("");
    }
  };

  // 覆盖层绘制：角点 + 4×6 网格 + 编号
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const cell = cellRef.current;
    if (!canvas || !cell) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw === 0 || ch === 0 || !active) return;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const fit = Math.min(cw / active.width, ch / active.height, 1);
    const scale = fit * view.zoom;
    const dx = (cw - active.width * scale) / 2 + view.panX;
    const dy = (ch - active.height * scale) / 2 + view.panY;
    const sx = (x: number) => dx + x * scale;
    const sy = (y: number) => dy + y * scale;

    // 已选角点连线
    if (corners.length >= 2) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      corners.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(sx(x), sy(y));
        else ctx.lineTo(sx(x), sy(y));
      });
      if (corners.length === 4) ctx.closePath();
      ctx.stroke();
    }
    // 角点标记
    corners.forEach(([x, y], i) => {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(sx(x), sy(y), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText(String(i + 1), sx(x) - 3, sy(y) + 3);
    });
    // 四点齐全 → 网格
    if (corners.length === 4) {
      ctx.strokeStyle = "rgba(56,189,248,0.55)";
      ctx.lineWidth = 1;
      for (let c = 1; c < 6; c++) {
        const t0 = quadPoint(corners, c / 6, 0);
        const t1 = quadPoint(corners, c / 6, 1);
        ctx.beginPath();
        ctx.moveTo(sx(t0[0]), sy(t0[1]));
        ctx.lineTo(sx(t1[0]), sy(t1[1]));
        ctx.stroke();
      }
      for (let r = 1; r < 4; r++) {
        const t0 = quadPoint(corners, 0, r / 4);
        const t1 = quadPoint(corners, 1, r / 4);
        ctx.beginPath();
        ctx.moveTo(sx(t0[0]), sy(t0[1]));
        ctx.lineTo(sx(t1[0]), sy(t1[1]));
        ctx.stroke();
      }
      // 编号
      ctx.font = "bold 10px sans-serif";
      patchCenters(corners).forEach(([x, y], i) => {
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.beginPath();
        ctx.arc(sx(x), sy(y), 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(String(i + 1), sx(x) - (i + 1 < 10 ? 3 : 6), sy(y) + 3.5);
      });
    }
  }, [corners, view, active]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  useEffect(() => {
    const ro = new ResizeObserver(drawOverlay);
    if (cellRef.current) ro.observe(cellRef.current);
    return () => ro.disconnect();
  }, [drawOverlay]);

  // a*b 散点图
  const scatterRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = scatterRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const chh = canvas.clientHeight;
    if (cw === 0 || chh === 0) return;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(chh * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#141417";
    ctx.fillRect(0, 0, cw, chh);
    const RANGE = 65;
    const px = (a: number) => cw / 2 + (a / RANGE) * (cw / 2 - 14);
    const py = (b: number) => chh / 2 - (b / RANGE) * (chh / 2 - 14);
    // 轴线
    ctx.strokeStyle = "#33333a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(-RANGE), py(0));
    ctx.lineTo(px(RANGE), py(0));
    ctx.moveTo(px(0), py(-RANGE));
    ctx.lineTo(px(0), py(RANGE));
    ctx.stroke();
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#777";
    ctx.fillText("a*", px(RANGE) - 16, py(0) - 5);
    ctx.fillText("b*", px(0) + 5, py(RANGE) + 12);
    ctx.fillText("+绿", px(RANGE) - 26, py(0) + 12);
    ctx.fillText("+红", px(-RANGE) + 4, py(0) + 12);
    ctx.fillText("+黄", px(0) + 5, py(-RANGE) + 10);
    ctx.fillText("+蓝", px(0) + 5, py(RANGE) - 4);
    if (!result) return;
    // 参考 = 黑边白心；测量 = 本色点；连线
    result.patches.forEach((p) => {
      const [ , ra, rb ] = p.refLab;
      const [ , ma, mb ] = p.measLab;
      const [r, g, b] = CC_PATCHES[p.index - 1].srgb;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px(ra), py(rb));
      ctx.lineTo(px(ma), py(mb));
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.beginPath();
      ctx.arc(px(ra), py(rb), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(px(ma), py(mb), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }, [result]);

  const startPick = () => {
    setCorners([]);
    setResult(null);
    setPickMode(true);
    setHint("请按顺序点击色卡的四个角：左上 → 右上 → 右下 → 左下");
  };

  const deColor = (dE: number) => (dE < 3 ? "text-emerald-400" : dE < 6 ? "text-amber-400" : "text-red-400");

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
        <span className="font-bold text-sm">🎯 色卡分析（ColorChecker 24）</span>
        <label className="bg-sky-600 hover:bg-sky-500 text-white text-xs px-3 py-1 rounded cursor-pointer">
          打开图片
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) loadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className={`text-xs px-3 py-1 rounded ${pickMode ? "bg-amber-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"}`}
          disabled={!active}
          onClick={startPick}
        >
          {pickMode ? "标定中…（点击四角）" : "开始标定"}
        </button>
        {pickMode && (
          <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-2 py-1 rounded" onClick={() => { setPickMode(false); setCorners([]); setHint(""); }}>
            取消
          </button>
        )}
        {hint && <span className="text-xs text-amber-400">{hint}</span>}
        {corners.length > 0 && corners.length < 4 && !pickMode && (
          <span className="text-xs text-neutral-400">已选 {corners.length}/4 角</span>
        )}
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
                setCorners([]);
                setResult(null);
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
          {images.length === 0 && <div className="text-[11px] text-neutral-500 px-1">加载色卡照片</div>}
        </aside>

        {/* 中央视图 + 覆盖层 */}
        <div ref={cellRef} className="flex-1 min-w-0 p-1 grid relative">
          {active ? (
            <ImagePane
              image={active}
              view={view}
              onViewChange={setView}
              active
              onActivate={() => {}}
              region={null}
              onRegionChange={() => {}}
              onRemove={() => removeImage(active.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-neutral-500">
              <div className="text-5xl mb-3">🎯</div>
              <div>加载 ColorChecker 照片，点「开始标定」后依次点击四角</div>
            </div>
          )}
          <canvas ref={overlayRef} className="absolute inset-1 pointer-events-none z-10" />
          {pickMode && (
            <div
              className="absolute inset-1 z-20 cursor-crosshair"
              onMouseDown={(e) => {
                e.stopPropagation();
                onPick(e);
              }}
            />
          )}
        </div>

        {/* 结果面板 */}
        <aside className="w-96 shrink-0 bg-neutral-800/60 border-l border-neutral-700 overflow-y-auto p-3 space-y-3">
          {!result && (
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              使用步骤：① 拍一张正对照射均匀的 ColorChecker（避免反光）② 点「开始标定」③
              按 左上→右上→右下→左下 点击色卡外沿四角 ④ 自动出结果。
              ΔE 为 CIE76；参考值为 X-Rite 官方 sRGB 数据，测量与参考经同一 rgb→Lab 变换。
              相机 RGB 未做光谱适配，绝对 ΔE 仅供参考趋势（&lt;3 优秀 / &lt;6 可接受）。
            </p>
          )}
          {result && (
            <>
              <div className="text-[11px] font-mono space-y-0.5 bg-neutral-900 border border-neutral-700 rounded p-2">
                <div className="flex justify-between"><span className="text-neutral-400">平均 ΔE</span><span className={deColor(result.meanDeltaE)}>{result.meanDeltaE.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">最大 ΔE</span><span className={deColor(result.maxDeltaE)}>{result.maxDeltaE.toFixed(2)}（{result.maxPatch}）</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">WB 增益 R/G·B/G</span><span>{result.wbGain[0].toFixed(3)} · {result.wbGain[2].toFixed(3)}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">中性灰曝光比</span><span>{(result.neutralYRatio * 100).toFixed(1)}%</span></div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-neutral-400">a*b* 色度（点=测量，圈=参考）</div>
                <canvas ref={scatterRef} className="w-full h-56 block rounded border border-neutral-700" />
              </div>

              <div className="space-y-0.5">
                <div className="text-xs text-neutral-400">逐格结果</div>
                <div className="max-h-64 overflow-y-auto bg-neutral-900 border border-neutral-700 rounded">
                  {result.patches.map((p) => (
                    <div key={p.index} className="flex items-center justify-between px-2 py-1 text-[11px] font-mono border-b border-neutral-800 last:border-0">
                      <span className="flex items-center gap-1.5 w-20 shrink-0">
                        <span
                          className="inline-block w-3 h-3 rounded-sm border border-neutral-600"
                          style={{ background: `rgb(${CC_PATCHES[p.index - 1].srgb.join(",")})` }}
                        />
                        {p.index}. {p.name}
                      </span>
                      <span className="text-neutral-500">
                        {p.measured.map((v) => v.toFixed(0)).join(",")}
                      </span>
                      <span className={`w-12 text-right ${deColor(p.deltaE)}`}>{p.deltaE.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded" onClick={startPick}>
                重新标定
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
