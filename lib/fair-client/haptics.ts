// Progressive enhancement only: Android Chrome vibrates, iOS Safari has no
// Vibration API and simply does nothing. Never the only feedback of an action.
export function fairHaptic(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      // D1: before the first tap Chrome blocks the call and logs a console error (survey head on load).
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (activation && !activation.hasBeenActive) return;
      navigator.vibrate(pattern);
    }
  } catch {
    // Blocked by the browser or the embedding frame.
  }
}
