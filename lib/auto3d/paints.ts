// Boje laka (A10, A03 §2.4). Čisto: id, boja i parametri laka po boji; nazivi su u rečniku
// (fair-auto3d.ts, `paint*`). Boja nije u URL-u (odluka E8).
//
// Podrazumevana boja je tamni grafit metalik (napomena nadzora 17. 10. u 08:55): tamna boja sa
// clearcoat-om skriva talase lima i nosi refleksiju okruženja, a svetla srebrna je na webu ličila
// na glineni model. Metal i hrapavost su po boji: bela je jednobojni lak (bez metala), srebro je
// najviše metalno.

export type PaintId = "grafit" | "plava" | "crvena" | "zelena" | "srebro" | "bela";

export type Paint = {
  id: PaintId;
  /** sRGB heks osnovne boje. */
  hex: string;
  metalness: number;
  roughness: number;
};

export const PAINTS: readonly Paint[] = [
  { id: "grafit", hex: "#2A2E35", metalness: 0.7, roughness: 0.34 },
  { id: "plava", hex: "#1B2740", metalness: 0.7, roughness: 0.34 },
  { id: "crvena", hex: "#58101A", metalness: 0.55, roughness: 0.32 },
  { id: "zelena", hex: "#1F3A2E", metalness: 0.65, roughness: 0.34 },
  { id: "srebro", hex: "#9DA4AB", metalness: 0.9, roughness: 0.3 },
  { id: "bela", hex: "#E8E6E1", metalness: 0.05, roughness: 0.24 },
];

export const DEFAULT_PAINT: PaintId = "grafit";

const BY_ID = new Map<string, Paint>(PAINTS.map((p) => [p.id, p]));

export function isPaintId(v: unknown): v is PaintId {
  return typeof v === "string" && BY_ID.has(v);
}

/** Boja po id-ju; nepoznat id daje podrazumevanu. */
export function paintById(id: string): Paint {
  return BY_ID.get(id) ?? (BY_ID.get(DEFAULT_PAINT) as Paint);
}
