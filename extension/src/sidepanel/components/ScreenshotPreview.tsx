import { useState } from "react";
import { CheckCircle2, ImageOff, Maximize2, X, XCircle } from "lucide-react";
import type { ScreenshotInfo, ScreenshotItem } from "../types.js";

/**
 * Shows captured screenshots side-by-side in a horizontal scrolling row.
 * Placed directly under the "Capturing viewport" step.
 */
export function ScreenshotPreview({ screenshot }: { screenshot: ScreenshotInfo }) {
  const { dataUrl, saved, savedPath, error, items } = screenshot;
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Normalize screenshot list: if items array is provided, use it; otherwise fallback to single dataUrl/savedPath
  const list: ScreenshotItem[] = items && items.length > 0
    ? items
    : (dataUrl || savedPath || screenshot.url)
    ? [{
        id: "main",
        dataUrl,
        url: screenshot.url,
        savedPath,
        label: "Full Page Capture",
      }]
    : [];

  const resolveItemSrc = (item: ScreenshotItem): string => {
    return item.dataUrl || item.url || (item.savedPath ? `http://127.0.0.1:8002/${item.savedPath}` : (savedPath ? `http://127.0.0.1:8002/${savedPath}` : ""));
  };

  return (
    <div className="mt-2.5 animate-varma-rise overflow-hidden rounded-xl border border-varma-border bg-varma-surface/80 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-varma-border/70 px-3 py-1.5 bg-white/[0.02]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-semibold tracking-wider text-varma-text-dim uppercase">
            Captured {list.length > 1 ? `Screenshots (${list.length})` : "Screenshot"}
          </span>
          {list.length > 1 && (
            <span className="text-[9.5px] text-varma-signal font-normal">
              · horizontal scroll
            </span>
          )}
        </div>
        {saved ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-varma-verified/30 bg-varma-verified/10 px-2 py-0.5 text-[10.5px] font-medium text-varma-verified">
            <CheckCircle2 className="h-3 w-3" strokeWidth={2.2} />
            Saved to screenshots
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-varma-redact/30 bg-varma-redact/10 px-2 py-0.5 text-[10.5px] font-medium text-varma-redact">
            <XCircle className="h-3 w-3" strokeWidth={2.2} />
            {error?.toLowerCase().includes("offline") ? "Receiver offline" : "Save failed"}
          </span>
        )}
      </div>

      <div className="p-2.5">
        {list.length > 0 ? (
          <div className="flex flex-row items-stretch gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {list.map((item, idx) => {
              const src = resolveItemSrc(item);
              if (!src) return null;
              return (
                <div
                  key={item.id || idx}
                  className="group relative flex w-48 shrink-0 flex-col overflow-hidden rounded-lg border border-varma-border bg-varma-bg transition-all hover:border-varma-signal/50 hover:shadow-md"
                >
                  <div
                    onClick={() => setSelectedImage(src)}
                    className="relative h-28 w-full cursor-zoom-in overflow-hidden bg-black/40"
                  >
                    <img
                      src={src}
                      alt={item.label ?? `Screenshot ${idx + 1}`}
                      className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                      <Maximize2 className="h-4 w-4 text-white drop-shadow" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-varma-border/70 bg-varma-surface px-2.5 py-1.5 text-[10px] text-varma-text-dim">
                    <span className="truncate font-semibold text-varma-text" title={item.label}>
                      {item.label ?? `Slice ${idx + 1}`}
                    </span>
                    <span className="font-mono text-[9px] text-varma-signal">
                      {idx + 1}/{list.length}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-varma-border bg-varma-bg/60 text-varma-text-dim">
            <ImageOff className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[11px]">Screenshot not available</span>
          </div>
        )}

        {savedPath && (
          <p className="mt-1.5 truncate text-[10px] text-varma-text-dim" title={savedPath}>
            Saved to <span className="font-mono text-varma-text">{savedPath}</span>
          </p>
        )}
      </div>

      {/* Fullscreen modal zoom on click */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-xl border border-varma-border bg-varma-bg p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              className="absolute right-3 top-3 rounded-full bg-black/70 p-1.5 text-white transition-colors hover:bg-black"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={selectedImage} alt="Full screenshot view" className="max-h-[85vh] w-auto object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}