// Pravilo slotova materijala u rendgenu (isto kao `apply_xray` u 3d/auto3d/lib/views.py, parity sa posterima):
// - karoserija: staklo i sočiva → rendgen staklo, svi ostali slotovi → rendgen ljuska;
// - ostali sistemi: LED, sočiva i staklo ostaju izvorni, sve ostalo dobija boju sistema;
// - gume (`mat_rubber` u sistemu kočnica) ostaju tamna guma i u rendgenu (A07, napomena nadzora).

export type XrayKind = "shell" | "glass" | "system" | "keep";

/** Stakla i sočiva: u rendgenu su providna, pa ih picking preskače (viewer/picking.ts). */
export const GLASSY: ReadonlySet<string> = new Set(["mat_glass", "mat_lens"]);
const EMISSIVE = new Set(["mat_led", "mat_led_red"]);

export function xrayKind(system: string, slot: string): XrayKind {
  if (system === "karoserija") return GLASSY.has(slot) ? "glass" : "shell";
  if (GLASSY.has(slot) || EMISSIVE.has(slot)) return "keep";
  if (system === "kocnice" && slot === "mat_rubber") return "keep";
  return "system";
}
