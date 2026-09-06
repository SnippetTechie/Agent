import { CheckCircle2, ImageOff, XCircle } from "lucide-react";
import type { ScreenshotInfo } from "../types.js";

/**
 * Shows the real screenshot captured for a turn (chrome.tabs.captureVisibleTab)
 * and confirms it was saved to the screenshots folder via chrome.downloads.
 */
export function ScreenshotPreview({ screenshot }: { screenshot: ScreenshotInfo }) {
  const { dataUrl, saved, savedPath, error } = screenshot;

  return (
    <div className="animate-varma-rise overflow-hidden rounded-xl border border-varma-border bg-varma-surface/70">
      <div className="flex items-center justify-between gap-2 border-b border-varma-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-varma-text-dim">
          Captured Screenshot
        </span>
        {saved ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-varma-verified/30 bg-varma-verified/10 px-2 py-0.5 text-[11px] font-medium text-varma-verified">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
            Saved to screenshots
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-varma-redact/30 bg-varma-redact/10 px-2 py-0.5 text-[11px] font-medium text-varma-redact">
            <XCircle className="h-3.5 w-3.5" strokeWidth={2.2} />
            {error?.toLowerCase().includes("offline") ? "Receiver offline" : "Save failed"}
          </span>
        )}
      </div>

      <div className="p-2.5">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Captured tab screenshot"
            className="w-full rounded-md border border-varma-border bg-varma-bg object-contain"
          />
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-varma-border bg-varma-bg/60 text-varma-text-dim">
            <ImageOff className="h-6 w-6" strokeWidth={1.75} />
            <span className="text-[11px]">Screenshot not available</span>
          </div>
        )}

        <p className="mt-2 truncate text-[10px] leading-snug text-varma-text-dim" title={savedPath ?? error}>
          {saved ? (
            <>Saved to <span className="text-varma-text">{savedPath ?? "screenshots folder"}</span></>
          ) : (
            <>Reason: {error ?? "unknown"}</>
          )}
        </p>
      </div>
    </div>
  );
}