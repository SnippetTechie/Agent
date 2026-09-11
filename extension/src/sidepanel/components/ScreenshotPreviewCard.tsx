import { useState, useMemo, useEffect } from "react";
import { Eye, ShieldCheck, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { ScreenshotItem, ScreenshotPreview } from "../types.js";

export interface ScreenshotPreviewCardProps {
  preview?: ScreenshotPreview;
  screenshots?: ScreenshotItem[];
}

export function ScreenshotPreviewCard({
  preview,
  screenshots,
}: ScreenshotPreviewCardProps) {
  const allScreenshots: ScreenshotItem[] = useMemo(() => {
    if (screenshots && screenshots.length > 0) {
      return screenshots;
    }
    if (preview?.image) {
      return [
        {
          id: "preview-single",
          image: preview.image,
          label: "Redacted Screenshot",
          step: preview.step,
          timestamp: Date.now(),
        },
      ];
    }
    return [];
  }, [preview, screenshots]);

  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, allScreenshots.length - 1)
  );
  const [modalOpen, setModalOpen] = useState(false);

  // Automatically select the newest screenshot as new ones arrive
  useEffect(() => {
    if (allScreenshots.length > 0) {
      setCurrentIndex(allScreenshots.length - 1);
    }
  }, [allScreenshots.length]);

  if (allScreenshots.length === 0) return null;

  const current = allScreenshots[currentIndex] ?? allScreenshots[allScreenshots.length - 1];
  if (!current?.image) return null;

  const hasMultiple = allScreenshots.length > 1;

  const goPrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : allScreenshots.length - 1));
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev < allScreenshots.length - 1 ? prev + 1 : 0));
  };

  return (
    <>
      <div className="group relative overflow-hidden rounded-xl border border-varma-border bg-varma-surface/70 p-2.5 shadow-sm transition-all hover:border-varma-border-strong">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-varma-muted">
          <span className="flex items-center gap-1.5 font-medium text-varma-text">
            <ShieldCheck className="h-3.5 w-3.5 text-varma-verified" />
            <span>{current.label || "Redacted Screenshot"}</span>
          </span>
          <div className="flex items-center gap-1.5">
            {current.step !== undefined && (
              <span className="rounded bg-varma-border/70 px-1.5 py-0.5 text-[10px] font-mono text-varma-text-dim">
                Step {current.step}
              </span>
            )}
            {hasMultiple && (
              <span className="rounded bg-varma-signal/15 px-1.5 py-0.5 text-[10px] font-medium text-varma-signal">
                {currentIndex + 1} of {allScreenshots.length}
              </span>
            )}
          </div>
        </div>

        {/* Multi-screenshot tab/pill selector */}
        {hasMultiple && (
          <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-1">
            {allScreenshots.map((item, idx) => (
              <button
                key={item.id || idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  idx === currentIndex
                    ? "bg-varma-signal text-varma-bg shadow-sm"
                    : "bg-varma-surface border border-varma-border/60 text-varma-text-dim hover:text-varma-text"
                }`}
              >
                {item.label ? item.label.slice(0, 20) : `Shot #${idx + 1}`}
                {item.step !== undefined ? ` (S${item.step})` : ""}
              </button>
            ))}
          </div>
        )}

        {/* Thumbnail Preview Area */}
        <div
          className="relative cursor-pointer overflow-hidden rounded-lg border border-varma-border/80 bg-black/40"
          onClick={() => setModalOpen(true)}
        >
          <img
            src={current.image}
            alt={current.label || "Redacted screen capture"}
            className="max-h-48 w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-xs font-medium text-white shadow-md">
              <Eye className="h-3.5 w-3.5" />
              {hasMultiple ? `Expand Gallery (${allScreenshots.length})` : "Click to enlarge"}
            </span>
          </div>
        </div>
      </div>

      {/* Full Modal Gallery */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative flex max-h-[92vh] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-varma-border bg-varma-surface p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="mb-2.5 flex items-center justify-between border-b border-varma-border/70 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-varma-verified" />
                <span className="text-[13px] font-semibold text-varma-text">
                  {current.label || "Redacted Screenshot"}
                </span>
                {current.step !== undefined && (
                  <span className="rounded bg-varma-border/70 px-1.5 py-0.5 text-[10.5px] font-mono text-varma-text-dim">
                    Step {current.step}
                  </span>
                )}
                {hasMultiple && (
                  <span className="text-[11.5px] text-varma-text-dim">
                    ({currentIndex + 1} of {allScreenshots.length})
                  </span>
                )}
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/80"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Image Display */}
            <div className="relative flex flex-1 items-center justify-center overflow-auto rounded bg-black/50 p-1">
              <img
                src={current.image}
                alt="Redacted capture full"
                className="max-h-[75vh] w-auto object-contain rounded"
              />

              {hasMultiple && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goPrev();
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white shadow-lg transition-transform hover:scale-110 hover:bg-black/90"
                    title="Previous screenshot"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goNext();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white shadow-lg transition-transform hover:scale-110 hover:bg-black/90"
                    title="Next screenshot"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail strip in modal */}
            {hasMultiple && (
              <div className="mt-2.5 flex items-center justify-center gap-2 overflow-x-auto py-1">
                {allScreenshots.map((item, idx) => (
                  <button
                    key={item.id || idx}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`group relative h-12 w-16 shrink-0 overflow-hidden rounded border transition-all ${
                      idx === currentIndex
                        ? "border-varma-signal ring-2 ring-varma-signal/50 scale-105"
                        : "border-varma-border/70 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={item.image}
                      alt={`Thumb ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white text-center truncate">
                      {item.step !== undefined ? `S${item.step}` : `#${idx + 1}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
