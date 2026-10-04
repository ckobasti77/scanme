// TASK-68 (RFC-004 §2.10) — the panel alert: sound + vibration, best-effort
// while the page is alive. Client-only; a MODULE singleton on purpose, so the
// unlocked AudioContext survives the PIN screen being swapped for the queue and
// any router refresh in between.
//
// Mobile browsers gate audio behind a user gesture. The PIN submit tap is that
// gesture: unlockAlertAudio() must be called SYNCHRONOUSLY inside its handler
// (creating the context and calling resume() before any await), which is why
// it is a separate function from playAlert() and why the panel calls it first.
//
// Reliability is NOT this module's job (§2.10): a locked or sleeping tablet
// cannot be reached by a web page, and the heartbeat turns that into the
// single honest "ordering unavailable" state. This is the ping for a tablet
// that is on and in front of someone.

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

function contextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Call from inside a user gesture. Resolves true once the context is running. */
export async function unlockAlertAudio(): Promise<boolean> {
  try {
    const Ctor = contextCtor();
    if (!Ctor) return false;
    if (!context) context = new Ctor();
    // A silent one-sample buffer: the iOS unlock idiom, harmless elsewhere.
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
    if (context.state !== "running") await context.resume();
    return context.state === "running";
  } catch {
    return false;
  }
}

export function isAlertAudioUnlocked(): boolean {
  return context !== null && context.state === "running";
}

/** A two-note ping (~0.4 s). No-op until unlocked. */
export function playAlert(): void {
  if (!context || context.state !== "running") return;
  try {
    const t0 = context.currentTime;
    const notes: Array<[number, number]> = [
      [880, 0],
      [1175, 0.2],
    ];
    for (const [frequency, offset] of notes) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.5, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.18);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.2);
    }
  } catch {
    // Best-effort by design.
  }
}

/** Android Chrome only in practice; only while the page is visible (§2.10). */
export function vibrateAlert(): void {
  if (typeof navigator === "undefined" || typeof document === "undefined") return;
  if (document.visibilityState !== "visible") return;
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // Best-effort by design.
  }
}
