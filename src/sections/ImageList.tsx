import { useEffect, useRef } from "react";
import type { LoadedImage } from "@/types/image";

interface Props {
  images: LoadedImage[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Thumbnail list of all imported images. Click to make an image active
 * (it jumps into the comparison grid); hover to reveal a remove button.
 */
export default function ImageList({ images, activeId, onSelect, onRemove }: Props) {
  const activeRef = useRef<HTMLDivElement>(null);

  // keep the active item visible in the scrollable list
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  if (images.length === 0) return null;

  return (
    <aside className="w-48 shrink-0 bg-neutral-800/60 border-r border-neutral-700 overflow-y-auto p-2 space-y-1">
      <div className="text-xs text-neutral-400 px-1 pb-1">图片列表（{images.length}）</div>
      {images.map((img) => {
        const active = img.id === activeId;
        return (
          <div
            key={img.id}
            ref={active ? activeRef : undefined}
            className={`group flex items-center gap-2 rounded p-1 cursor-pointer ${
              active ? "bg-sky-600/30 ring-1 ring-sky-400" : "hover:bg-neutral-700/60"
            }`}
            onClick={() => onSelect(img.id)}
            title={img.name}
          >
            <img
              src={img.url}
              alt={img.name}
              className="w-11 h-11 object-cover rounded shrink-0 bg-neutral-900"
              draggable={false}
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-neutral-100 truncate">{img.name}</div>
              <div className="text-[10px] text-neutral-400">
                {img.width}×{img.height}
              </div>
            </div>
            <button
              className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-400 text-xs px-1 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(img.id);
              }}
              title="移除图片"
            >
              ✕
            </button>
          </div>
        );
      })}
    </aside>
  );
}
