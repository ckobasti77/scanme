// Progressive enhancement only: Android Chrome vibrates, iOS Safari has no
// Vibration API and simply does nothing. Never the only feedback of an action.
export function fairHaptic(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    // Blocked by the browser or the embedding frame.
  }
}
