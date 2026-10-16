// Progressive enhancement only: Android Chrome vibrates; iOS Safari has no
// Vibration API and does nothing, unless the caller opts into `iosTick`: one
// system tick from a hidden native switch (<input type="checkbox" switch>,
// Safari 18+) whose label is clicked (stamp passport). Never the only feedback
// of an action.
let switchLabel: HTMLLabelElement | null = null;

function iosSwitchTick() {
  if (typeof document === "undefined" || !document.body) return;
  if (!switchLabel || !switchLabel.isConnected) {
    switchLabel = document.createElement("label");
    switchLabel.setAttribute("aria-hidden", "true");
    switchLabel.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden";
    switchLabel.innerHTML = '<input type="checkbox" switch tabindex="-1" aria-hidden="true">';
    document.body.appendChild(switchLabel);
  }
  switchLabel.click();
}

export function fairHaptic(pattern: number | number[], options?: { iosTick?: boolean }): void {
  try {
    if (typeof navigator === "undefined") return;
    // D1: before the first tap Chrome blocks the call and logs a console error (survey head on load).
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
      return;
    }
    if (options?.iosTick) iosSwitchTick();
  } catch {
    // Blocked by the browser or the embedding frame.
  }
}
