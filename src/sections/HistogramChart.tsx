import { useEffect, useRef } from "react";
import type { ImageStats } from "@/lib/stats";

interface Props {
  stats: ImageStats;
}

type Channel = "rgb" | "lum" | "r" | "g" | "b";

export default function HistogramChart({ stats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const channelRef = useRef<Channel>("rgb");

  const draw = (channel: Channel) => {
    channelRef.current = channel;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.clientWidth || 280;
    const ch = 120;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    const { r, g, b, lum } = stats.histogram;
    const drawChannel = (bins: number[], color: string, composite: GlobalCompositeOperation) => {
      const max = Math.max(1, ...bins);
      ctx.globalCompositeOperation = composite;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, ch);
      for (let i = 0; i < 256; i++) {
        // log scale for visibility
        const v = Math.log10(1 + bins[i]) / Math.log10(1 + max);
        ctx.lineTo((i / 255) * cw, ch - v * (ch - 4));
      }
      ctx.lineTo(cw, ch);
      ctx.closePath();
      ctx.fill();
    };

    ctx.globalCompositeOperation = "source-over";
    if (channel === "rgb") {
      drawChannel(r, "rgba(239,68,68,0.6)", "source-over");
      drawChannel(g, "rgba(34,197,94,0.6)", "lighter");
      drawChannel(b, "rgba(59,130,246,0.6)", "lighter");
    } else if (channel === "lum") {
      drawChannel(lum, "rgba(229,231,235,0.8)", "source-over");
    } else if (channel === "r") {
      drawChannel(r, "rgba(239,68,68,0.8)", "source-over");
    } else if (channel === "g") {
      drawChannel(g, "rgba(34,197,94,0.8)", "source-over");
    } else {
      drawChannel(b, "rgba(59,130,246,0.8)", "source-over");
    }
    ctx.globalCompositeOperation = "source-over";
  };

  useEffect(() => {
    draw(channelRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  const channels: { key: Channel; label: string }[] = [
    { key: "rgb", label: "RGB" },
    { key: "lum", label: "亮度" },
    { key: "r", label: "R" },
    { key: "g", label: "G" },
    { key: "b", label: "B" },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-1">
        {channels.map((c) => (
          <button
            key={c.key}
            className={`text-xs px-2 py-0.5 rounded ${
              channelRef.current === c.key
                ? "bg-sky-600 text-white"
                : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
            }`}
            onClick={() => draw(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <canvas ref={canvasRef} className="w-full" style={{ height: 120 }} />
    </div>
  );
}
