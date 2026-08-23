/**
 * Prenos izbora iz toka ponude u kontakt formu.
 *
 * `/ponuda/pregled` i Enterprise CTA nose kontekst kroz query do `/#ponuda`, a
 * `components/lead-form.tsx` ga čita i predpopunjava poruku čitljivim rezimeom.
 * Rezime je PREDLOG — korisnik ga slobodno menja ili briše. Sve prolazi kao običan
 * tekst kroz postojeće `message` polje `api.leads.create`; nema izmena u `convex/**`.
 */

import {
  computeOrderBreakdown,
  formatRsd,
  type BillingPeriod,
  type OrderSelection,
  type PublicTierId,
  type ServiceId,
} from "./scanme-pricing";
import { encodeSelection, parseSelection } from "./offer-url";

const SERVICE_LABEL: Record<ServiceId, string> = {
  review: "ScanMe Review",
  links: "ScanMe Links",
};
const TIER_LABEL: Record<PublicTierId, string> = {
  starter: "Starter",
  premium: "Premium",
};
const PERIOD_LABEL: Record<BillingPeriod, string> = {
  monthly: "Mesečno",
  annual: "Godišnje",
};

// Ključevi query-ja kojima kontakt link nosi kontekst. Deljeni između pisca (href)
// i čitača (readContactMessage) da nema drifta.
const SELECTION_PARAM = "ponuda";
const ENTERPRISE_PARAM = "upit";
const ENTERPRISE_VALUE = "enterprise";

// Enterprise dolazak nema konfigurator iza sebe — kratka poruka bez izmišljenih detalja.
export const ENTERPRISE_OFFER_MESSAGE =
  "Zdravo, zanima me ScanMe Enterprise ponuda. Molim vas da me kontaktirate radi uslova po meri.";

export const ENTERPRISE_CONTACT_HREF = `/?${ENTERPRISE_PARAM}=${ENTERPRISE_VALUE}#ponuda`;

/** Čitljiv rezime izbora za predpopunu poruke. Predlog, ne zaključan tekst. */
export function buildOfferMessage(selection: OrderSelection): string {
  const breakdown = computeOrderBreakdown(selection);
  const annual = selection.period === "annual";
  const designName =
    selection.design.kind === "custom" ? "Custom dizajn" : "Gotov dizajn (ScanMe šablon)";

  const lines: string[] = [
    "Zdravo, evo izbora koji sam sastavio kroz ScanMe konfigurator:",
    "",
    `Usluga: ${SERVICE_LABEL[selection.service]}`,
    `Paket: ${TIER_LABEL[selection.tier]}`,
    `Naplata: ${PERIOD_LABEL[selection.period]}`,
    "",
    "Proizvodi:",
    ...breakdown.productItems.map(
      (item) =>
        `- ${item.productName} · ${item.materialName} × ${item.quantity} — ${formatRsd(item.lineTotal)} RSD`,
    ),
    "",
    `Dizajn: ${designName}${selection.design.addOwnLogo ? " + sopstveni logo" : ""}`,
    "",
    `Za plaćanje sada: ${formatRsd(breakdown.totalDueNow)} RSD`,
    `Obnova: ${formatRsd(breakdown.renewal.amount)} RSD${annual ? "/god" : "/mes"}`,
    "",
    "(Cene su privremene radne vrednosti.)",
  ];

  return lines.join("\n");
}

/** Link ka kontakt formi koji nosi ceo izbor kroz jedan kompaktan parametar. */
export function buildSelectionContactHref(selection: OrderSelection): string {
  const encoded = encodeSelection(selection).toString();
  return `/?${SELECTION_PARAM}=${encodeURIComponent(encoded)}#ponuda`;
}

/**
 * Iz query-ja kontakt strane vadi predlog poruke, ili `null` kad konteksta nema
 * ili je nevalidan — tada se forma ponaša tačno kao bez konteksta.
 */
export function readContactMessage(params: URLSearchParams): string | null {
  if (params.get(ENTERPRISE_PARAM) === ENTERPRISE_VALUE) {
    return ENTERPRISE_OFFER_MESSAGE;
  }
  const raw = params.get(SELECTION_PARAM);
  if (!raw) return null;

  const selection = parseSelection(new URLSearchParams(raw));
  if (!selection || selection.products.length === 0) return null;
  return buildOfferMessage(selection);
}
