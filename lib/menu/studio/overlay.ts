// ScanMe Menu V1 — what the editor shows before the server confirms a save
// (K10, K09 §1.4). The list and the preview read the server data with the
// queued prices laid over it, so a typed price is visible everywhere at once
// (every standard page shares it) and never jumps back while it is being
// saved. Rows and sections no queued value touches keep their identity, so
// React.memo skips them.

import type { CasValue } from "../cas";
import { kljucCene } from "./autosave-queue";
import type { StudioRadniSadrzaj } from "./model";

export function sadrzajSaCekanjem(
  sadrzaj: StudioRadniSadrzaj,
  naCekanju: ReadonlyMap<string, CasValue>,
): StudioRadniSadrzaj {
  if (naCekanju.size === 0) return sadrzaj;
  let promenjeno = false;
  const sekcije = sadrzaj.sekcije.map((sekcija) => {
    let redoviPromenjeni = false;
    const redovi = sekcija.redovi.map((red) => {
      const kljuc = kljucCene(red.artikal.id);
      if (!naCekanju.has(kljuc)) return red;
      const vrednost = naCekanju.get(kljuc);
      const cena = typeof vrednost === "number" ? vrednost : null;
      if (cena === red.artikal.cena) return red;
      redoviPromenjeni = true;
      return { ...red, artikal: { ...red.artikal, cena } };
    });
    if (!redoviPromenjeni) return sekcija;
    promenjeno = true;
    return { ...sekcija, redovi };
  });
  return promenjeno ? { ...sadrzaj, sekcije } : sadrzaj;
}
