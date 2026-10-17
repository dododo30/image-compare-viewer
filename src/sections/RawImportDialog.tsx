import { useRef, useState } from "react";
import {
  PACKING_LABELS,
  YUV_LABELS,
  decodeFiles,
  expectedSizeOf,
  type ImportFormat,
  type DecodedImage,
} from "@/lib/rawImport";
import type { BayerPattern, RawPacking, RawAlign, YuvFormat } from "@/lib/raw";

interface Props {
  fmt: ImportFormat;
  onFmtChange: (fmt: ImportFormat) => void;
  onClose: () => void;
  onImport: (images: DecodedImage[]) => void;
}

const PATTERNS: BayerPattern[] = ["RGGB", "BGGR", "GRBG", "GBRG"];
const PACKINGS = Object.entries(PACKING_LABELS) as [RawPacking, string][];
const YUV_FORMATS = Object.entries(YUV_LABELS) as [YuvFormat, string][];

/** RAW / YUV 裸数据导入对话框（格式状态由外部控制，便于拖放共用与记忆） */
export default function RawImportDialog({ fmt, onFmtChange, onClose, onImport }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const strideTouched = useRef(false);
  const strideUVTouched = useRef(false);

  const set = (patch: Partial<ImportFormat>) => onFmtChange({ ...fmt, ...patch });
  const isRaw16 = fmt.packing === "raw16";
  const is420SP = fmt.yuvFormat === "NV12" || fmt.yuvFormat === "NV21";
  const is420Planar = fmt.yuvFormat === "I420" || fmt.yuvFormat === "YV12";

  const expected = expectedSizeOf(fmt);

  const doImport = async () => {
    setError("");
    setBusy(true);
    try {
      onImport(await decodeFiles(files, fmt));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const numCls =
    "w-24 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs font-mono text-neutral-100";
  const selCls = "bg-neutral-700 text-xs rounded px-1.5 py-1 text-neutral-100";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[560px] max-w-full max-h-[90vh] overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">导入 RAW / YUV 数据</h2>
          <button className="text-neutral-400 hover:text-white text-sm px-2" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* 类别 */}
        <div className="flex items-center gap-2">
          {(
            [
              ["raw", "Bayer RAW"],
              ["yuv", "YUV"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              className={`text-xs px-3 py-1 rounded ${
                fmt.kind === k ? "bg-sky-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"
              }`}
              onClick={() => set({ kind: k })}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 参数 */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {fmt.kind === "raw" ? (
            <>
              <label className="flex items-center justify-between gap-2">
                打包格式
                <select className={selCls} value={fmt.packing} onChange={(e) => set({ packing: e.target.value as RawPacking })}>
                  {PACKINGS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                Bayer 排列
                <select className={selCls} value={fmt.pattern} onChange={(e) => set({ pattern: e.target.value as BayerPattern })}>
                  {PATTERNS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              {isRaw16 && (
                <>
                  <label className="flex items-center justify-between gap-2">
                    有效位深
                    <select className={selCls} value={fmt.bits} onChange={(e) => set({ bits: Number(e.target.value) })}>
                      {[10, 12, 14].map((b) => (
                        <option key={b} value={b}>{b} bit</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    数据对齐
                    <select className={selCls} value={fmt.align} onChange={(e) => set({ align: e.target.value as RawAlign })}>
                      <option value="low">低位对齐（直接存值）</option>
                      <option value="high">高位对齐（左移填充）</option>
                    </select>
                  </label>
                </>
              )}
            </>
          ) : (
            <label className="flex items-center justify-between gap-2 col-span-2">
              YUV 格式
              <select
                className={selCls}
                value={fmt.yuvFormat}
                onChange={(e) => {
                  const f = e.target.value as YuvFormat;
                  // 单次合并更新：格式 + 自动 stride（避免用旧 fmt 回写覆盖格式）
                  const patch: Partial<ImportFormat> = { yuvFormat: f };
                  if (!strideTouched.current) {
                    patch.stride = f === "UYVY" || f === "YUYV" ? fmt.width * 2 : fmt.width;
                  }
                  if (!strideUVTouched.current) patch.strideUV = fmt.width;
                  onFmtChange({ ...fmt, ...patch });
                }}
              >
                {YUV_FORMATS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center justify-between gap-2">
            宽度
            <input
              type="number"
              className={numCls}
              value={fmt.width || ""}
              placeholder="如 1920"
              onChange={(e) => {
                const w = Number(e.target.value);
                // 单次合并更新：宽度 + 自动 stride（避免用旧 fmt 回写覆盖宽度）
                const patch: Partial<ImportFormat> = { width: w };
                if (!strideTouched.current) {
                  patch.stride = fmt.yuvFormat === "UYVY" || fmt.yuvFormat === "YUYV" ? w * 2 : w;
                }
                if (!strideUVTouched.current) patch.strideUV = w;
                onFmtChange({ ...fmt, ...patch });
              }}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            高度
            <input
              type="number"
              className={numCls}
              value={fmt.height || ""}
              placeholder="如 1080"
              onChange={(e) => set({ height: Number(e.target.value) })}
            />
          </label>

          {fmt.kind === "yuv" && (
            <>
              <label className="flex items-center justify-between gap-2">
                stride (Y)
                <input
                  type="number"
                  className={numCls}
                  value={fmt.stride || ""}
                  placeholder={String(fmt.width)}
                  onChange={(e) => {
                    strideTouched.current = true;
                    set({ stride: Number(e.target.value) });
                  }}
                />
              </label>
              {(is420SP || is420Planar) && (
                <label className="flex items-center justify-between gap-2">
                  stride (UV)
                  <input
                    type="number"
                    className={numCls}
                    value={fmt.strideUV || ""}
                    placeholder={String(fmt.width)}
                    onChange={(e) => {
                      strideUVTouched.current = true;
                      set({ strideUV: Number(e.target.value) });
                    }}
                  />
                </label>
              )}
            </>
          )}
        </div>

        <p className="text-[10px] text-neutral-500 leading-relaxed">
          按连续打包解析（MIPI RAW 默认无行填充）；若 dump 每行有对齐填充请改用 16 位 unpacked 并核对文件大小。
          参数会自动记住，下次导入或拖放沿用上次的设置。
        </p>

        {/* 文件 */}
        <div className="flex items-center gap-2">
          <button
            className="bg-neutral-700 hover:bg-neutral-600 text-xs px-3 py-1 rounded"
            onClick={() => fileRef.current?.click()}
          >
            选择文件（可多选）…
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          {expected > 0 && (
            <span className="text-[10px] text-neutral-500 font-mono">预期 {expected.toLocaleString()} 字节 / 帧</span>
          )}
        </div>
        {files.length > 0 && (
          <div className="text-[11px] text-neutral-400 space-y-0.5 max-h-24 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex justify-between font-mono">
                <span className="truncate max-w-[70%]">{f.name}</span>
                <span className={f.size < expected ? "text-red-400" : f.size > expected ? "text-amber-400" : "text-emerald-400"}>
                  {f.size.toLocaleString()} B{f.size > expected ? "（偏大，截取前 " + expected.toLocaleString() + " 字节）" : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            className="bg-sky-600 hover:bg-sky-500 text-white text-sm px-4 py-1 rounded disabled:opacity-40"
            disabled={busy || files.length === 0}
            onClick={doImport}
          >
            {busy ? "解码中…" : "导入"}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>
    </div>
  );
}
