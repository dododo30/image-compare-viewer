import { useEffect, useRef } from "react";

interface Props {
  hist: { r: number[]; gr: number[]; gb: number[]; b: number[] };
}

const CHANNELS: { key: keyof Props["hist"]; color: string; label: string }[] = [
  { key: "r", color: "#f87171", label: "R" },
  { key: "gr", color: "#a3e635", label: "Gr" },
  { key: "gb", color: "#22c55e", label: "Gb" },
  { key: "b", color: "#60a5fa", label: "B" },
];

/** RAW 分通道直方图（R/Gr/Gb/B 四条曲线，256 bin，对数刻度） */
export default function RawChannelHist({ hist }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#141417";
    ctx.fillRect(0, 0, cw, ch);

    const max = Math.max(1, ...CHANNELS.flatMap((c) => hist[c.key]));
    const logMax = Math.log10(max + 1);

    // 网格
    ctx.strokeStyle = "#2c2c33";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const y = (ch * i) / 4;
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
    }
    ctx.stroke();

    for (const { key, color } of CHANNELS) {
      const bins = hist[key];
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const v = Math.log10(bins[i] + 1) / logMax;
        const x = (i / 255) * cw;
        const y = ch - v * (ch - 4) - 1;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 图例
    ctx.font = "10px sans-serif";
    CHANNELS.forEach(({ color, label }, i) => {
      ctx.fillStyle = color;
      ctx.fillText(label, 6 + i * 28, 11);
    });
  }, [hist]);

  return <canvas ref={ref} className="w-full h-28 block rounded border border-neutral-700" />;
}
