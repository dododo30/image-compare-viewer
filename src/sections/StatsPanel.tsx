import type { ImageStats, RegionRect } from "@/lib/stats";
import HistogramChart from "./HistogramChart";

interface Props {
  stats: ImageStats | null;
  region: RegionRect | null;
  scopeLabel: string;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs py-0.5 border-b border-neutral-800">
      <span className="text-neutral-400">{label}</span>
      <span className="text-neutral-100 font-mono">{value}</span>
    </div>
  );
}

export default function StatsPanel({ stats, region, scopeLabel }: Props) {
  if (!stats) {
    return (
      <div className="text-neutral-500 text-sm p-2">加载图片后显示统计信息</div>
    );
  }
  const swatch = `rgb(${Math.round(stats.mean.r)},${Math.round(stats.mean.g)},${Math.round(stats.mean.b)})`;
  return (
    <div className="space-y-3">
      <div className="text-xs text-neutral-400">
        统计范围：<span className="text-sky-400">{scopeLabel}</span>
        {region && (
          <span className="ml-1 text-neutral-500">
            ({Math.round(region.w)}×{Math.round(region.h)} px,{" "}
            {stats.pixelCount.toLocaleString()} 像素)
          </span>
        )}
        {!region && (
          <span className="ml-1 text-neutral-500">
            ({stats.pixelCount.toLocaleString()} 像素)
          </span>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-neutral-300 mb-1">直方图</div>
        <HistogramChart stats={stats} />
      </div>

      <div>
        <div className="text-xs font-semibold text-neutral-300 mb-1">RGB 均值</div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded border border-neutral-600" style={{ background: swatch }} />
          <div className="flex-1">
            <Row label="R / G / B" value={`${stats.mean.r.toFixed(1)} / ${stats.mean.g.toFixed(1)} / ${stats.mean.b.toFixed(1)}`} />
            <Row label="标准差 R/G/B" value={`${stats.stddev.r.toFixed(1)} / ${stats.stddev.g.toFixed(1)} / ${stats.stddev.b.toFixed(1)}`} />
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-neutral-300 mb-1">CIE L*a*b*</div>
        <Row label="L* (明度)" value={stats.lab.l.toFixed(2)} />
        <Row label="a* (绿-红)" value={stats.lab.a.toFixed(2)} />
        <Row label="b* (蓝-黄)" value={stats.lab.b.toFixed(2)} />
      </div>

      <div>
        <div className="text-xs font-semibold text-neutral-300 mb-1">HSV</div>
        <Row label="H (色相)" value={`${stats.hsv.h.toFixed(1)}°`} />
        <Row label="S (饱和度)" value={`${(stats.hsv.s * 100).toFixed(1)}%`} />
        <Row label="V (明度)" value={`${(stats.hsv.v * 100).toFixed(1)}%`} />
      </div>

      <div>
        <div className="text-xs font-semibold text-neutral-300 mb-1">HSL</div>
        <Row label="H (色相)" value={`${stats.hsl.h.toFixed(1)}°`} />
        <Row label="S (饱和度)" value={`${(stats.hsl.s * 100).toFixed(1)}%`} />
        <Row label="L (亮度)" value={`${(stats.hsl.l * 100).toFixed(1)}%`} />
      </div>
    </div>
  );
}
