import { useState } from "react";
import { Eye, Image as ImageIcon, X } from "lucide-react";
import type { ScreenshotPreview } from "../types.js";

export function ScreenshotPreviewCard({ preview }: { preview: ScreenshotPreview }) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!preview.image) return null;

  return (
    <>
      <div className="group relative overflow-hidden rounded-lg border border-varma-border bg-varma-surface/60 p-2 shadow-sm transition-all hover:border-varma-border-strong">
        <div className="mb-1.5 flex items-center justify-between text-xs text-varma-muted">
          <span className="flex items-center gap-1 font-medium">
            <ImageIcon className="h-3.5 w-3.5 text-varma-accent" />
            Redacted Screenshot
          </span>
          {preview.step !== undefined && (
            <span className="rounded bg-varma-bg px-1.5 py-0.5 text-[10px] font-mono">
              Step {preview.step}
            </span>
          )}
        </div>

        <div
          className="relative cursor-pointer overflow-hidden rounded border border-varma-border bg-black/40"
          onClick={() => setModalOpen(true)}
        >
          <img
            src={preview.image}
            alt="Redacted screen capture"
            className="max-h-48 w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-black/80 px-2.5 py-1 text-xs font-medium text-white shadow">
              <Eye className="h-3.5 w-3.5" />
              Click to enlarge
            </span>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg border border-varma-border bg-varma-surface p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModalOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/90"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={preview.image}
              alt="Redacted screen capture full"
              className="max-h-[85vh] w-auto object-contain rounded"
            />
          </div>
        </div>
      )}
    </>
  );
}
