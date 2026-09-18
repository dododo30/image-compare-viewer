import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadedImage, ViewState } from "@/types/image";

interface Props {
  imageA: LoadedImage;
  imageB: LoadedImage;
  view: ViewState;
  onViewChange: (v: ViewState) => void;
}

type DragKind = "pan" | "split" | null;

/**
 * Overlay comparison: two images stacked on one canvas.
 * - Vertical draggable split line wipes between A (left) and B (right).
 * - Opacity slider blends B over A.
 * - Wheel zooms towards cursor, drag (outside the split handle) pans.
 */
export default function OverlayPane({ imageA, imageB, view, onViewChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(0.5); // 0..1, fraction of canvas width
  const [opacity, setOpacity] = useState(1); // B opacity in the B region
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; panX: number; panY: number }>({
    kind: null, startX: 0, startY: 0, panX: 0, panY: 0,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#1a1a1e";
    ctx.fillRect(0, 0, cw, ch);

    // fit the larger of the two images so both are framed reasonably
    const fitW = Math.max(imageA.width, imageB.width);
    const fitH = Math.max(imageA.height, imageB.height);
    const fit = Math.min(cw / fitW, ch / fitH, 1);
    const scale = fit * view.zoom;

    const drawImg = (img: LoadedImage, alpha: number, clipRight?: number, clipLeft?: number) => {
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = (cw - dw) / 2 + view.panX;
      const dy = (ch - dh) / 2 + view.panY;
      ctx.save();
      if (clipRight !== undefined) {
        ctx.beginPath();
        ctx.rect(0, 0, clipRight, ch);
        ctx.clip();
      } else if (clipLeft !== undefined) {
        ctx.beginPath();
        ctx.rect(clipLeft, 0, cw - clipLeft, ch);
        ctx.clip();
      }
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = scale < 3;
      ctx.drawImage(img.element, dx, dy, dw, dh);
      ctx.restore();
    };

    const splitX = cw * split;
    drawImg(imageA, 1, splitX);          // A on the left
    drawImg(imageB, opacity, undefined, splitX); // B on the right with opacity

    // split line + handle
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, ch);
    ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    const hy = ch / 2;
    ctx.beginPath();
    ctx.moveTo(splitX, hy - 14);
    ctx.lineTo(splitX - 8, hy);
    ctx.lineTo(splitX, hy + 14);
    ctx.lineTo(splitX + 8, hy);
    ctx.closePath();
    ctx.fill();
  }, [imageA, imageB, view, split, opacity]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(40, Math.max(0.1, view.zoom * factor));
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const k = newZoom / view.zoom;
    onViewChange({
      zoom: newZoom,
      panX: cx - (cx - view.panX) * k,
      panY: cy - (cy - view.panY) * k,
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const splitX = rect.width * split;
    const nearSplit = Math.abs(x - splitX) < 12;
    dragRef.current = {
      kind: nearSplit ? "split" : "pan",
      startX: e.clientX,
      startY: e.clientY,
      panX: view.panX,
      panY: view.panY,
    };
    if (nearSplit) {
      setSplit(Math.min(1, Math.max(0, x / rect.width)));
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d.kind) return;
    if (d.kind === "split") {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      setSplit(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
    } else {
      onViewChange({
        ...view,
        panX: d.panX + (e.clientX - d.startX),
        panY: d.panY + (e.clientY - d.startY),
      });
    }
  };

  const onMouseUp = () => { dragRef.current.kind = null; };

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-md border-2 border-sky-400 select-none cursor-grab"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      <canvas ref={canvasRef} className="block" />
      <div className="absolute top-1 left-1 bg-sky-600/80 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none max-w-[40%] truncate">
        A: {imageA.name}
      </div>
      <div className="absolute top-1 right-1 bg-fuchsia-600/80 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none max-w-[40%] truncate">
        B: {imageB.name}
      </div>
      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
        {(view.zoom * 100).toFixed(0)}%
      </div>
      {/* opacity slider */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-neutral-300 whitespace-nowrap">B 不透明度</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => setOpacity(Number(e.target.value) / 100)}
          className="w-40 accent-sky-400"
        />
        <span className="text-xs text-neutral-200 font-mono w-9">{Math.round(opacity * 100)}%</span>
        <button
          className="text-xs bg-neutral-700 hover:bg-neutral-600 px-2 py-0.5 rounded"
          onClick={() => setSplit(0.5)}
        >
          分割居中
        </button>
      </div>
    </div>
  );
}
