// ScanStory („Od fizičkog predmeta do digitalnog prostora“): šta radi klik na karticu.
//
// - Dok prelaz traje, svaki klik se ignoriše (ista ili druga kartica, miš,
//   dodir ili tastatura): nema restarta, vraćanja ni reda čekanja.
// - Klik na karticu na kojoj je ivica već sletela ne radi ništa.
// - Klik na drugu karticu pokreće prelaz koji se uvek izvrši do kraja;
//   uz prefers-reduced-motion promena je trenutna, po istim pravilima.
export type ScanStoryClickDecision = "ignore" | "animate" | "instant";

export function decideScanStoryClick({
  activeIndex,
  targetIndex,
  transitionInFlight,
  reducedMotion,
}: {
  activeIndex: number;
  targetIndex: number;
  transitionInFlight: boolean;
  reducedMotion: boolean;
}): ScanStoryClickDecision {
  if (transitionInFlight || targetIndex === activeIndex) return "ignore";
  return reducedMotion ? "instant" : "animate";
}
