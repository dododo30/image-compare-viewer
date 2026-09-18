import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import exifr from "exifr";
import ImagePane from "@/sections/ImagePane";
import OverlayPane from "@/sections/OverlayPane";
import StatsPanel from "@/sections/StatsPanel";
import type { ExifInfo, LayoutMode, LoadedImage, Rect, ViewState } from "@/types/image";
import { formatBytes } from "@/types/image";
import { computeStats, type ImageStats } from "@/lib/stats";

let idCounter = 0;

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === "") return null;
  return (
    <div className="flex justify-between text-xs py-0.5 border-b border-neutral-800">
      <span className="text-neutral-400 shrink-0 mr-2">{label}</span>
      <span className="text-neutral-100 font-mono text-right break-all">{value}</span>
    </div>
  );
}

export default function App() {
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutMode>(4);
  const [syncZoom, setSyncZoom] = useState(true);
  const [views, setViews] = useState<Record<string, ViewState>>({});
  const [syncedView, setSyncedView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [selectMode, setSelectMode] = useState(false);
  const [region, setRegion] = useState<Rect | null>(null);
  const [stats, setStats] = useState<ImageStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [overlayMode, setOverlayMode] = useState(false);
  const [overlayAId, setOverlayAId] = useState<string | null>(null);
  const [overlayBId, setOverlayBId] = useState<string | null>(null);

  const activeImage = images.find((i) => i.id === activeId) ?? images[0] ?? null;
  const overlayA = images.find((i) => i.id === overlayAId) ?? activeImage;
  const overlayB =
    images.find((i) => i.id === overlayBId && i.id !== overlayA?.id) ??
    images.find((i) => i.id !== overlayA?.id) ??
    null;

  const loadFiles = useCallback(async (files: FileList | File[]) => {
    setLoading(true);
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const loaded: LoadedImage[] = [];
    for (const file of list) {
      try {
        const url = URL.createObjectURL(file);
        const el = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
        let exif: ExifInfo = {};
        try {
          const raw = await exifr.parse(file, {
            pick: [
              "ExposureTime", "FNumber", "ISO", "FocalLength", "Make", "Model",
              "DateTimeOriginal", "LensModel", "ExposureBiasValue", "MeteringMode",
              "Flash", "WhiteBalance", "ColorSpace",
            ],
          });
          if (raw) {
            exif = {
              exposureTime:
                raw.ExposureTime != null
                  ? raw.ExposureTime >= 1
                    ? `${raw.ExposureTime} s`
                    : `1/${Math.round(1 / raw.ExposureTime)} s`
                  : undefined,
              fNumber: raw.FNumber,
              iso: raw.ISO,
              focalLength: raw.FocalLength,
              make: raw.Make,
              model: raw.Model,
              dateTime: raw.DateTimeOriginal ? new Date(raw.DateTimeOriginal).toLocaleString() : undefined,
              lensModel: raw.LensModel,
              exposureBias: raw.ExposureBiasValue,
              meteringMode: raw.MeteringMode,
              flash: raw.Flash,
              whiteBalance: raw.WhiteBalance,
              colorSpace: raw.ColorSpace,
            };
          }
        } catch {
          // no exif — fine
        }
        loaded.push({
          id: `img-${++idCounter}`,
          file,
          url,
          name: file.name,
          size: file.size,
          width: el.naturalWidth,
          height: el.naturalHeight,
          element: el,
          exif,
        });
      } catch (err) {
        console.error("加载失败", file.name, err);
      }
    }
    setImages((prev) => {
      const next = [...prev, ...loaded];
      if (!activeId && next.length > 0) setActiveId(next[0].id);
      return next;
    });
    setLoading(false);
  }, [activeId]);

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
    setRegion(null);
  };

  const visibleImages = images.slice(0, layout);

  const getView = (id: string): ViewState =>
    syncZoom ? syncedView : views[id] ?? { zoom: 1, panX: 0, panY: 0 };

  const setView = (id: string, v: ViewState) => {
    if (syncZoom) setSyncedView(v);
    else setViews((prev) => ({ ...prev, [id]: v }));
  };

  const zoomBy = (factor: number) => {
    if (!activeImage) return;
    const v = overlayMode ? syncedView : getView(activeImage.id);
    const nz = Math.min(40, Math.max(0.1, v.zoom * factor));
    if (overlayMode) setSyncedView({ ...v, zoom: nz });
    else setView(activeImage.id, { ...v, zoom: nz });
  };

  const resetView = () => {
    if (!activeImage) return;
    if (overlayMode) setSyncedView({ zoom: 1, panX: 0, panY: 0 });
    else setView(activeImage.id, { zoom: 1, panX: 0, panY: 0 });
  };

  // compute stats for the active image / region
  useEffect(() => {
    if (!activeImage) {
      setStats(null);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = activeImage.width;
    canvas.height = activeImage.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(activeImage.element, 0, 0);
    const data = ctx.getImageData(0, 0, activeImage.width, activeImage.height);
    setStats(computeStats(data, region));
  }, [activeImage, region]);

  // clear region when switching image
  useEffect(() => {
    setRegion(null);
  }, [activeImage?.id]);

  const gridClass = useMemo(() => {
    switch (layout) {
      case 1: return "grid-cols-1 grid-rows-1";
      case 2: return "grid-cols-2 grid-rows-1";
      case 4: return "grid-cols-2 grid-rows-2";
      case 6: return "grid-cols-3 grid-rows-2";
    }
  }, [layout]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
  };

  // demo mode: ?demo loads bundled sample images
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("demo")) return;
    (async () => {
      const files: File[] = [];
      for (const n of ["img1", "img2", "img3", "img4"]) {
        const res = await fetch(`/demo/${n}.jpg`);
        const blob = await res.blob();
        files.push(new File([blob], `${n}.jpg`, { type: "image/jpeg" }));
      }
      loadFiles(files);
      if (new URLSearchParams(window.location.search).has("overlay")) setOverlayMode(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="h-screen w-screen bg-neutral-900 text-neutral-100 flex flex-col overflow-hidden"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* toolbar */}
      <header className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700 flex-wrap">
        <span className="font-bold text-sm mr-2">🖼️ 图片对比查看器</span>
        <button
          className="bg-sky-600 hover:bg-sky-500 text-white text-sm px-3 py-1 rounded"
          onClick={() => fileInputRef.current?.click()}
        >
          {loading ? "加载中…" : "打开图片"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) loadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="text-xs text-neutral-400">（可多选，或直接拖入窗口）</span>

        <div className="h-5 w-px bg-neutral-600 mx-1" />

        {/* layout */}
        <span className="text-xs text-neutral-400">布局</span>
        {([1, 2, 4, 6] as LayoutMode[]).map((n) => (
          <button
            key={n}
            className={`text-xs px-2 py-1 rounded ${
              layout === n ? "bg-sky-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"
            }`}
            onClick={() => setLayout(n)}
          >
            {n}
          </button>
        ))}

        <div className="h-5 w-px bg-neutral-600 mx-1" />

        {/* overlay compare */}
        <button
          disabled={images.length < 2}
          className={`text-xs px-2 py-1 rounded disabled:opacity-40 ${
            overlayMode ? "bg-fuchsia-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"
          }`}
          onClick={() => setOverlayMode((v) => !v)}
          title={images.length < 2 ? "至少需要 2 张图片" : "两张图叠加划擦对比"}
        >
          {overlayMode ? "退出覆盖对比" : "覆盖对比"}
        </button>
        {overlayMode && (
          <>
            <select
              className="bg-neutral-700 text-xs rounded px-1 py-1 max-w-28"
              value={overlayA?.id ?? ""}
              onChange={(e) => setOverlayAId(e.target.value)}
              title="图 A（分割线左侧）"
            >
              {images.map((i) => (
                <option key={i.id} value={i.id}>A: {i.name}</option>
              ))}
            </select>
            <select
              className="bg-neutral-700 text-xs rounded px-1 py-1 max-w-28"
              value={overlayB?.id ?? ""}
              onChange={(e) => setOverlayBId(e.target.value)}
              title="图 B（分割线右侧）"
            >
              {images.filter((i) => i.id !== overlayA?.id).map((i) => (
                <option key={i.id} value={i.id}>B: {i.name}</option>
              ))}
            </select>
          </>
        )}

        <div className="h-5 w-px bg-neutral-600 mx-1" />

        {/* zoom */}
        <button className="bg-neutral-700 hover:bg-neutral-600 text-sm px-2 py-1 rounded" onClick={() => zoomBy(1 / 1.25)} title="缩小">−</button>
        <span className="text-xs w-12 text-center font-mono">
          {activeImage ? `${((overlayMode ? syncedView : getView(activeImage.id)).zoom * 100).toFixed(0)}%` : "—"}
        </span>
        <button className="bg-neutral-700 hover:bg-neutral-600 text-sm px-2 py-1 rounded" onClick={() => zoomBy(1.25)} title="放大">＋</button>
        <button className="bg-neutral-700 hover:bg-neutral-600 text-xs px-2 py-1 rounded" onClick={resetView}>适应窗口</button>
        {!overlayMode && (
          <label className="flex items-center gap-1 text-xs text-neutral-300 cursor-pointer">
            <input type="checkbox" checked={syncZoom} onChange={(e) => setSyncZoom(e.target.checked)} />
            同步缩放
          </label>
        )}

        <div className="h-5 w-px bg-neutral-600 mx-1" />

        <button
          className={`text-xs px-2 py-1 rounded ${
            selectMode ? "bg-amber-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"
          }`}
          onClick={() => {
            setSelectMode((s) => !s);
            if (selectMode) setRegion(null);
          }}
        >
          {selectMode ? "框选中…（点击退出）" : "框选统计"}
        </button>
        {region && (
          <button className="text-xs px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600" onClick={() => setRegion(null)}>
            清除选区
          </button>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* image grid */}
        <main className={`flex-1 grid gap-1 p-1 min-w-0 ${overlayMode ? "grid-cols-1 grid-rows-1" : gridClass}`}>
          {overlayMode ? (
            overlayA && overlayB ? (
              <OverlayPane
                imageA={overlayA}
                imageB={overlayB}
                view={syncedView}
                onViewChange={setSyncedView}
              />
            ) : (
              <div className="flex items-center justify-center text-neutral-500">覆盖对比需要 2 张图片</div>
            )
          ) : (
            <>
              {visibleImages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-neutral-500 col-span-full row-span-full">
                  <div className="text-6xl mb-4">📷</div>
                  <div className="text-lg">点击「打开图片」或将图片拖入窗口</div>
                  <div className="text-sm mt-1">支持最多 6 张图片同时对比，滚轮缩放，拖动平移</div>
                </div>
              )}
              {visibleImages.map((img) => (
                <ImagePane
                  key={img.id}
                  image={img}
                  view={getView(img.id)}
                  onViewChange={(v) => setView(img.id, v)}
                  active={activeImage?.id === img.id}
                  onActivate={() => setActiveId(img.id)}
                  selectMode={selectMode && activeImage?.id === img.id}
                  region={activeImage?.id === img.id ? region : null}
                  onRegionChange={setRegion}
                  onRemove={() => removeImage(img.id)}
                />
              ))}
            </>
          )}
        </main>

        {/* side panel */}
        <aside className="w-80 shrink-0 bg-neutral-850 bg-neutral-800/60 border-l border-neutral-700 overflow-y-auto p-3 space-y-4">
          {activeImage ? (
            <>
              <section>
                <div className="text-sm font-semibold mb-1 text-neutral-200">图片信息</div>
                <InfoRow label="文件名" value={activeImage.name} />
                <InfoRow label="尺寸" value={`${activeImage.width} × ${activeImage.height} px`} />
                <InfoRow label="文件大小" value={formatBytes(activeImage.size)} />
                <InfoRow label="曝光时间" value={activeImage.exif.exposureTime} />
                <InfoRow label="ISO" value={activeImage.exif.iso} />
                <InfoRow label="光圈值" value={activeImage.exif.fNumber != null ? `f/${activeImage.exif.fNumber}` : undefined} />
                <InfoRow label="焦距" value={activeImage.exif.focalLength != null ? `${activeImage.exif.focalLength} mm` : undefined} />
                <InfoRow label="曝光补偿" value={activeImage.exif.exposureBias != null ? `${activeImage.exif.exposureBias} EV` : undefined} />
                <InfoRow label="相机品牌" value={activeImage.exif.make} />
                <InfoRow label="相机型号" value={activeImage.exif.model} />
                <InfoRow label="镜头" value={activeImage.exif.lensModel} />
                <InfoRow label="拍摄时间" value={activeImage.exif.dateTime} />
                <InfoRow label="测光模式" value={activeImage.exif.meteringMode} />
                <InfoRow label="闪光灯" value={activeImage.exif.flash} />
                <InfoRow label="白平衡" value={activeImage.exif.whiteBalance} />
                <InfoRow label="色彩空间" value={activeImage.exif.colorSpace} />
              </section>
              <section>
                <div className="text-sm font-semibold mb-1 text-neutral-200">图像统计</div>
                <StatsPanel
                  stats={stats}
                  region={region}
                  scopeLabel={region ? "框选区域" : "全图"}
                />
              </section>
            </>
          ) : (
            <div className="text-neutral-500 text-sm">暂无图片</div>
          )}
        </aside>
      </div>
    </div>
  );
}
