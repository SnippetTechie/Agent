/**
 * Short UI sound cues synthesized with the Web Audio API — no bundled
 * audio files, so nothing to source or license. Each cue is a couple of
 * soft, brief oscillator tones with a fast attack/decay envelope, in the
 * spirit of a polished assistant UI's subtle audio feedback.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private tone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    peakGain: number,
    type: OscillatorType = "sine"
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  playSend(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    this.tone(ctx, 640, ctx.currentTime, 0.09, 0.04);
  }

  playStepDone(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    this.tone(ctx, 500, ctx.currentTime, 0.05, 0.02);
  }

  playApprovalPrompt(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, 480, now, 0.08, 0.035, "triangle");
    this.tone(ctx, 600, now + 0.09, 0.08, 0.035, "triangle");
  }

  playComplete(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, 660, now, 0.12, 0.045);
    this.tone(ctx, 880, now + 0.1, 0.18, 0.045);
  }

  playDeny(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    this.tone(ctx, 220, ctx.currentTime, 0.18, 0.04, "triangle");
  }
}

export const soundEngine = new SoundEngine();
