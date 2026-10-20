// ScanMe Menu V1 (K17) — which parts of an appearance are Premium, and what
// guests get without Premium (master §2.2: Premium is on the ACCOUNT and
// unlocks "dodatne layout/dizajn varijante" and "smanjen brending").
//
// Choosing a Premium part on Standard is refused when it is chosen
// (./izbor.ts). An account that LOSES Premium keeps its draft as it is, but
// what is published falls back to the Standard parts (compileSnapshot, the
// editor preview) — the same rule as Room service and scheduled promotions.
// No colour library here: lib/menu/snapshot.ts imports this.

import type { MenuPresentationValues } from "../presentation";
import { parPoId } from "./font-pairs";
import { paletaPoId } from "./palettes";
import { varijantaRasporeda } from "./varijante";

/** The account's appearance capabilities (lib/menu/capabilities.ts). */
export type MenuIzgledPlan = { extraLayouts: boolean; reducedBranding: boolean };

export const MENU_IZGLED_SVE: MenuIzgledPlan = { extraLayouts: true, reducedBranding: true };

/** The Premium parts of an appearance (each needs the capability named in the comment). */
export function premiumDelovi(values: MenuPresentationValues): {
  /** extraLayouts */
  paleta: boolean;
  /** extraLayouts */
  par: boolean;
  /** extraLayouts */
  varijanta: boolean;
  /** reducedBranding */
  brending: boolean;
} {
  const paleta = paletaPoId(values.paletteId);
  const par = parPoId(values.fontPairId);
  return {
    // An unknown id (and "default", "brend") resolves to another palette: never Premium.
    paleta: paleta.id === values.paletteId && paleta.premium,
    par: par.id === values.fontPairId && par.premium,
    varijanta: varijantaRasporeda(values.layout, values.layoutVariant) !== null,
    brending: values.branding === "reduced",
  };
}

/**
 * What guests get on this plan: a Premium palette falls back to a Standard
 * palette of the same tone (light → the default, dark → `ponoc`), a Premium
 * font pair to the default pair, a layout variant to the layout itself and
 * reduced branding to the standard footer. Returns the SAME object when
 * nothing changes (a version's hash stays the same).
 */
export function izgledZaPlan(values: MenuPresentationValues, plan: MenuIzgledPlan): MenuPresentationValues {
  const delovi = premiumDelovi(values);
  const paleta = delovi.paleta && !plan.extraLayouts;
  const par = delovi.par && !plan.extraLayouts;
  const varijanta = values.layoutVariant !== undefined && (!plan.extraLayouts || !delovi.varijanta);
  const brending = delovi.brending && !plan.reducedBranding;
  if (!paleta && !par && !varijanta && !brending) return values;
  const next: MenuPresentationValues = { ...values };
  if (paleta) next.paletteId = paletaPoId(values.paletteId).ton === "tamna" ? "ponoc" : "default";
  if (par) next.fontPairId = "default";
  if (varijanta) delete next.layoutVariant;
  if (brending) next.branding = "standard";
  return next;
}
