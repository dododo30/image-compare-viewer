import { useEffect, useRef, useCallback } from "react";
import type { LoadedImage, Rect, ViewState } from "@/types/image";

interface Props {
  image: LoadedImage;
  view: ViewState;
  onViewChange: (v: ViewState) => void;
  active: boolean;
  onActivate: () => void;
  selectMode: boolean;
  region: Rect | null;
  onRegionChange: (r: Rect | null) => void;
  onRemove: () => void;
}

/**
 * Canvas-based image viewer pane with zoom (wheel/buttons), pan (drag),
 * and optional region selection (drag when selectMode is on).
 */
export default function ImagePane({
  image,
  view,
  onViewChange,
  active,
  onActivate,
  selectMode,
  region,
  onRegionChange,
  onRemove,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    kind: "pan" | "select";
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    imgStartX: number;
    imgStartY: number;
  } | null>(null);

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

    // fit scale
    const fit = Math.min(cw / image.width, ch / image.height, 1);
    const scale = fit * view.zoom;
    const dw = image.width * scale;
    const dh = image.height * scale;
    const dx = (cw - dw) / 2 + view.panX;
    const dy = (ch - dh) / 2 + view.panY;

    ctx.imageSmoothingEnabled = scale < 3;
    ctx.drawImage(image.element, dx, dy, dw, dh);

    // draw region
    if (region) {
      const rx = dx + region.x * scale;
      const ry = dy + region.y * scale;
      const rw = region.w * scale;
      const rh = region.h * scale;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(56,189,248,0.12)";
      ctx.fillRect(rx, ry, rw, rh);
    }
  }, [image, view, region]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const toImageCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width, ch = rect.height;
    const fit = Math.min(cw / image.width, ch / image.height, 1);
    const scale = fit * view.zoom;
    const dx = (cw - image.width * scale) / 2 + view.panX;
    const dy = (ch - image.height * scale) / 2 + view.panY;
    return {
      x: (clientX - rect.left - dx) / scale,
      y: (clientY - rect.top - dy) / scale,
    };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(40, Math.max(0.1, view.zoom * factor));
    // zoom towards cursor
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
    onActivate();
    if (selectMode) {
      const p = toImageCoords(e.clientX, e.clientY);
      dragRef.current = {
        kind: "select",
        startX: e.clientX,
        startY: e.clientY,
        origPanX: view.panX,
        origPanY: view.panY,
        imgStartX: p.x,
        imgStartY: p.y,
      };
      onRegionChange({ x: p.x, y: p.y, w: 0, h: 0 });
    } else {
      dragRef.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        origPanX: view.panX,
        origPanY: view.panY,
        imgStartX: 0,
        imgStartY: 0,
      };
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      onViewChange({
        ...view,
        panX: drag.origPanX + (e.clientX - drag.startX),
        panY: drag.origPanY + (e.clientY - drag.startY),
      });
    } else {
      const p = toImageCoords(e.clientX, e.clientY);
      const x0 = Math.max(0, Math.min(drag.imgStartX, p.x));
      const y0 = Math.max(0, Math.min(drag.imgStartY, p.y));
      const x1 = Math.min(image.width, Math.max(drag.imgStartX, p.x));
      const y1 = Math.min(image.height, Math.max(drag.imgStartY, p.y));
      onRegionChange({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  };

  const onMouseUp = () => {
    const drag = dragRef.current;
    if (drag?.kind === "select" && region && (region.w < 4 || region.h < 4)) {
      onRegionChange(null);
    }
    dragRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-md border-2 select-none ${
        active ? "border-sky-400" : "border-neutral-700"
      } ${selectMode ? "cursor-crosshair" : "cursor-grab"}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      <canvas ref={canvasRef} className="block" />
      <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none max-w-[80%] truncate">
        {image.name}
      </div>
      <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
        {(view.zoom * 100).toFixed(0)}%
      </div>
      <button
        className="absolute bottom-1 right-1 bg-black/60 hover:bg-red-600 text-white text-xs px-1.5 py-0.5 rounded"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="移除图片"
      >
        ✕
      </button>
    </div>
  );
}
