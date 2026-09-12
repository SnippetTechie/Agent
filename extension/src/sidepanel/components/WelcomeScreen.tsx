import { useState } from "react";
import {
  Shield,
  Sparkles,
  Database,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface WelcomeScreenProps {
  onSignIn: (customEmail?: string, customName?: string) => Promise<any>;
  loading?: boolean;
  authError?: string | null;
  onClearError?: () => void;
  redirectUrl?: string;
}

export function WelcomeScreen({
  onSignIn,
  loading,
  authError,
  onClearError,
  redirectUrl = "https://your-extension-id.chromiumapp.org/",
}: WelcomeScreenProps) {
  const [customEmail, setCustomEmail] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [showDevDetails, setShowDevDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGoogleClick = async () => {
    onClearError?.();
    setSubmitting(true);
    try {
      await onSignIn();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    onClearError?.();
    setSubmitting(true);
    try {
      await onSignIn(customEmail.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoSignIn = async () => {
    onClearError?.();
    setSubmitting(true);
    try {
      await onSignIn("vispl@gmail.com", "Vispl Zen3");
    } finally {
      setSubmitting(false);
    }
  };

  const copyRedirect = () => {
    navigator.clipboard.writeText(redirectUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isBusy = loading || submitting;

  return (
    <div className="flex h-screen flex-col justify-between overflow-y-auto bg-[#071318] p-5 text-slate-100 select-none">
      {/* Top Header */}
      <div className="flex flex-col items-center text-center mt-2">
        <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-950/80 border border-cyan-500/40 shadow-[0_0_25px_rgba(34,211,238,0.25)]">
          <Shield className="h-7 w-7 text-cyan-400" />
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-400">
            <span className="h-2 w-2 rounded-full bg-cyan-950 animate-ping" />
          </span>
        </div>

        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          V.A.R.M.A
          <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-cyan-300 border border-cyan-500/30">
            AGENT v0.1
          </span>
        </h1>
        <p className="mt-1 text-xs text-slate-400 max-w-[270px]">
          Visual Autonomous Redaction & Multimodal Action
        </p>
      </div>

      {/* Feature Cards */}
      <div className="my-3 space-y-2">
        <div className="flex items-start gap-3 rounded-xl border border-cyan-900/40 bg-cyan-950/20 p-2.5">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <div>
            <h3 className="text-xs font-semibold text-slate-200">Isolated Supabase Storage</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Every user gets their own namespace (<code className="text-cyan-300 text-[10px]">users/&#123;user_id&#125;/</code>) for screenshots, logs & tasks.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-cyan-900/40 bg-cyan-950/20 p-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <div>
            <h3 className="text-xs font-semibold text-slate-200">Layer-1 Privacy Shield</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              PII and credentials are automatically masked on-device before the AI model inspects the screen.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-cyan-900/40 bg-cyan-950/20 p-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <div>
            <h3 className="text-xs font-semibold text-slate-200">Visible Glowing Cursor</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Smooth, slow animated cursor tracks every click and navigation live on your active tabs.
            </p>
          </div>
        </div>
      </div>

      {/* Auth & Error Section */}
      <div className="flex flex-col items-center">
        {/* Auth Error Banner */}
        {authError && (
          <div className="mb-3 w-full rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-left">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-rose-200">Authentication Notice</p>
                <p className="mt-0.5 text-[11px] text-rose-300/90 leading-relaxed">{authError}</p>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-rose-900/50 pt-2">
              <button
                type="button"
                onClick={handleDemoSignIn}
                disabled={isBusy}
                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 underline underline-offset-2 cursor-pointer"
              >
                Continue as vispl@gmail.com
              </button>
              <button
                type="button"
                onClick={() => onClearError?.()}
                className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Primary Google Auth Button */}
        <button
          onClick={handleGoogleClick}
          disabled={isBusy}
          className="relative flex w-full items-center justify-center gap-3 rounded-xl border border-slate-700 bg-white py-2.5 px-4 font-medium text-slate-900 shadow-md transition hover:bg-slate-100 hover:shadow-cyan-500/10 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
        >
          {/* Google SVG Icon */}
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span className="text-sm font-semibold">
            {isBusy ? "Authenticating..." : "Sign in with Google"}
          </span>
        </button>

        {/* Custom Email Form */}
        {!showEmailInput ? (
          <button
            onClick={() => setShowEmailInput(true)}
            className="mt-2.5 text-[11px] text-cyan-400 hover:text-cyan-300 transition underline underline-offset-2 cursor-pointer"
          >
            Or enter Google email manually
          </button>
        ) : (
          <form onSubmit={handleCustomSubmit} className="mt-2.5 w-full space-y-2">
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="your.name@gmail.com"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isBusy || !customEmail.trim()}
                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-40 cursor-pointer flex items-center"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* Developer & Supabase OAuth Info Drawer */}
        <div className="mt-3 w-full border-t border-slate-800/80 pt-2 text-center">
          <button
            type="button"
            onClick={() => setShowDevDetails((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-400 transition cursor-pointer"
          >
            <span>Supabase OAuth Setup Guide</span>
            {showDevDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showDevDetails && (
            <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 text-left text-[11px]">
              <p className="text-slate-400">
                To connect Google OAuth in Supabase, add this Redirect URL to your Supabase project:
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded bg-slate-950 p-1.5 border border-slate-800">
                <code className="text-[10px] text-cyan-300 truncate select-all">{redirectUrl}</code>
                <button
                  type="button"
                  onClick={copyRedirect}
                  className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-200 hover:bg-slate-700 cursor-pointer shrink-0"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">
                In Supabase Dashboard ➔ Auth ➔ URL Configuration ➔ Add Redirect URL.
              </p>
            </div>
          )}
        </div>

        {/* Connected Footer */}
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
          <CheckCircle2 className="h-3 w-3 text-cyan-500" />
          <span>Connected to Supabase Project (zmnbhuyq)</span>
        </div>
      </div>
    </div>
  );
}
