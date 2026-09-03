import { useEffect, useRef, useState } from "react";
import { ArrowUp, Globe, Mic, ShieldCheck, ShieldOff, Square } from "lucide-react";
import type { ApprovalMode, TabContext } from "../types.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import { isSpeechRecognitionSupported, startSpeechRecognition, type SpeechController } from "../lib/speech.js";
import { ApprovalModeMenu } from "./ApprovalModeMenu.js";

const MAX_TEXTAREA_HEIGHT = 132;

export function InputDock({
  tabContext,
  isRunning,
  approvalMode,
  onApprovalModeChange,
  onSubmit,
  onStop,
}: {
  tabContext: TabContext;
  isRunning: boolean;
  approvalMode: ApprovalMode;
  onApprovalModeChange: (mode: ApprovalMode) => void;
  onSubmit: (prompt: string) => void;
  onStop: () => void;
}) {
  const { t, lang } = useI18n();
  const [value, setValue] = useState("");
  const [autoRedact, setAutoRedact] = useState(true);
  const [listening, setListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechRef = useRef<SpeechController | null>(null);
  const dictationBaseRef = useRef("");
  const micSupported = isSpeechRecognitionSupported();

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    return () => {
      speechRef.current?.stop();
    };
  }, []);

  const submit = () => {
    if (!value.trim() || isRunning) return;
    speechRef.current?.stop();
    onSubmit(value);
    setValue("");
  };

  const toggleListening = () => {
    if (listening) {
      speechRef.current?.stop();
      return;
    }
    dictationBaseRef.current = value;
    const controller = startSpeechRecognition({
      lang,
      onTranscript: (transcript) => {
        const base = dictationBaseRef.current;
        const joiner = base && !base.endsWith(" ") ? " " : "";
        setValue(base + joiner + transcript);
      },
      onEnd: () => {
        setListening(false);
        speechRef.current = null;
      },
      onError: () => {
        setListening(false);
        speechRef.current = null;
      },
    });
    if (controller) {
      speechRef.current = controller;
      setListening(true);
    }
  };

  const hasText = value.trim().length > 0;

  return (
    <div className="shrink-0 px-3 pb-3 pt-2">
      <div className="rounded-2xl border border-varma-border bg-varma-surface px-3 pb-2 pt-2.5 transition-colors focus-within:border-varma-border-strong">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("input.placeholder")}
          disabled={isRunning}
          className="max-h-[132px] w-full resize-none bg-transparent text-[13px] leading-snug text-varma-text placeholder:text-varma-text-faint focus:outline-none disabled:opacity-50"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <ApprovalModeMenu mode={approvalMode} onChange={onApprovalModeChange} />
            <button
              type="button"
              onClick={() => setAutoRedact((v) => !v)}
              title={t("input.autoRedact")}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-all active:scale-90 ${
                autoRedact ? "text-varma-signal" : "text-varma-text-faint hover:text-varma-text-dim"
              }`}
            >
              {autoRedact ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="hidden min-w-0 items-center gap-1 text-[10.5px] text-varma-text-faint sm:flex"
              title={tabContext.domain ?? t("context.noActiveTab")}
            >
              <Globe className="h-2.5 w-2.5 shrink-0" />
              <span className="max-w-[140px] truncate font-mono-tech">
                {tabContext.domain ?? t("context.noActiveTab")}
              </span>
            </span>

            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-varma-redact/90 text-white transition-all hover:bg-varma-redact active:scale-90"
                aria-label="Stop task"
              >
                <Square className="h-3 w-3" fill="currentColor" />
              </button>
            ) : (
              <>
                {micSupported && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    title={listening ? t("input.listening") : t("input.mic")}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                      listening
                        ? "bg-varma-redact/90 text-white"
                        : "text-varma-text-dim hover:bg-white/5 hover:text-varma-text"
                    }`}
                  >
                    <Mic className={`h-3.5 w-3.5 ${listening ? "animate-varma-pulse" : ""}`} />
                  </button>
                )}
                {hasText && (
                  <button
                    type="button"
                    onClick={submit}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-varma-signal text-varma-bg transition-all hover:bg-varma-signal/85 active:scale-90"
                    aria-label="Send"
                  >
                    <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
