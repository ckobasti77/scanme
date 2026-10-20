// ScanMe Menu V1 — what may start a drag (K11, K09 §4.3). The whole free area
// of an article card or a section header drags (mouse: after 6 px; touch: a
// long press), but a press on a control never does: typing a price, opening
// the row menu or ticking a checkbox must not move the card. The drag handle
// is a button marked `data-drag-ok`: it drags, and a plain click on it opens
// `Premesti` (the keyboard way to move). Pure over a minimal element
// interface, so it is tested without a DOM.

export const STUDIO_KONTROLE_SELEKTOR = [
  "input",
  "textarea",
  "select",
  "button:not([data-drag-ok])",
  "a",
  "label",
  "[role='menuitem']",
  "[role='checkbox']",
  "[contenteditable]",
  "[data-no-drag]",
].join(", ");

export type DragCilj = { closest(selektor: string): unknown } | null | undefined;

/** True when the press landed on (or inside) a control, so it must not start a drag. */
export function jeInteraktivnaMeta(cilj: DragCilj): boolean {
  if (!cilj || typeof (cilj as { closest?: unknown }).closest !== "function") return false;
  return cilj.closest(STUDIO_KONTROLE_SELEKTOR) != null;
}
