import { useState } from "react";
import { ChevronDown, Circle, CircleCheck, CircleX, Eye, EyeOff, LoaderCircle, MinusCircle } from "lucide-react";
import type { AgentStep, AgentTurn, ScreenshotInfo } from "../types.js";
import { StatusChip } from "./StatusChip.js";
import { SanitizedCanvasPreview } from "./SanitizedCanvasPreview.js";
import { ScreenshotPreview } from "./ScreenshotPreview.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import type { TranslationKey } from "../lib/i18n/I18nContext.js";

function StepIndicator({ status }: { status: AgentStep["status"] }) {
  if (status === "done") return <CircleCheck className="h-4 w-4 text-varma-verified" strokeWidth={2} />;
  if (status === "active") return <LoaderCircle className="h-4 w-4 text-varma-signal animate-spin" strokeWidth={2} />;
  if (status === "error") return <CircleX className="h-4 w-4 text-varma-redact" strokeWidth={2} />;
  if (status === "skipped") return <MinusCircle className="h-4 w-4 text-varma-text-faint/60" strokeWidth={2} />;
  return <Circle className="h-4 w-4 text-varma-text-faint" strokeWidth={2} />;
}

function StepRow({
  step,
  screenshot,
}: {
  step: AgentStep;
  screenshot?: ScreenshotInfo;
}) {
  const { t } = useI18n();
  const [previewOpen, setPreviewOpen] = useState(false);
  const isSkipped = step.status === "skipped";
  const hasPreview = !!step.preview && !isSkipped;

  return (
    <li className={`relative animate-varma-rise pl-6 ${isSkipped ? "opacity-45 select-none" : ""}`}>
      <span className="absolute left-0 top-0.5">
        <StepIndicator status={step.status} />
      </span>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p
            className={`text-[13px] leading-tight transition-colors duration-300 ${
              isSkipped
                ? "text-varma-text-faint line-through"
                : step.status === "pending"
                ? "text-varma-text-dim"
                : "text-varma-text"
            }`}
          >
            {step.label}
          </p>
          {step.detail && (
            <p className="text-[11px] leading-snug text-varma-text-dim">
              {isSkipped ? "Skipped (local redaction bypassed)" : step.detail}
            </p>
          )}
        </div>
        <StatusChip category={step.category} status={step.status} />
      </div>

      {/* Captured Screenshot section nested directly under Capturing Viewport */}
      {screenshot && (screenshot.dataUrl || (screenshot.items && screenshot.items.length > 0) || screenshot.savedPath || screenshot.url) && (
        <ScreenshotPreview screenshot={screenshot} />
      )}

      {hasPreview && step.status !== "pending" && (
        <div className="mt-2 animate-varma-rise">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-varma-signal transition-colors hover:text-varma-signal/80 active:scale-[0.97]"
          >
            {previewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {previewOpen ? t("steps.hidePreview") : t("steps.showPreview")}
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: previewOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <div className="mt-2">
                <SanitizedCanvasPreview boxes={step.preview!.boxes} />
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

const STATUS_KEY: Record<AgentTurn["status"], TranslationKey> = {
  running: "card.statusRunning",
  "awaiting-approval": "card.statusAwaitingApproval",
  completed: "card.statusCompleted",
  denied: "card.statusDenied",
  stopped: "card.statusStopped",
  error: "card.statusError",
};

export function ActionCard({
  turn,
  screenshot,
}: {
  turn: AgentTurn;
  screenshot?: ScreenshotInfo;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(turn.status === "running" || turn.status === "awaiting-approval");
  const activeStep = turn.steps.find((s) => s.status === "active");
  const effectiveScreenshot = screenshot || turn.screenshot;

  return (
    <div className="rounded-xl border border-varma-border bg-varma-surface/70 backdrop-blur-sm transition-shadow">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-varma-text-dim transition-transform duration-300 ${expanded ? "" : "-rotate-90"}`}
          />
          <span className="truncate text-[12px] font-medium text-varma-text-dim">
            {t("card.steps", { n: turn.steps.length })}
            {!expanded && (
              <span className="text-varma-text"> · {activeStep ? activeStep.label : t(STATUS_KEY[turn.status])}</span>
            )}
          </span>
        </div>
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-varma-border px-3.5 py-3">
            <ol className="space-y-3.5">
              {turn.steps.map((step, idx) => {
                const isCapturing = idx === 0 || step.label.toLowerCase().includes("captur");
                return (
                  <StepRow
                    key={step.id}
                    step={step}
                    screenshot={isCapturing ? effectiveScreenshot : undefined}
                  />
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
