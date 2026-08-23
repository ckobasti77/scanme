import type { Metadata } from "next";
import { OfferConfigurator } from "@/components/offer-configurator";
import { OfferFooter } from "@/components/offer-footer";
import { SiteNav } from "@/components/site-nav";
import { parseSelection } from "@/lib/offer-url";
import type {
  BillingPeriod,
  OrderSelection,
  PublicTierId,
  ServiceId,
} from "@/lib/scanme-pricing";

export const metadata: Metadata = {
  title: "Sastavite ponudu | ScanMe",
  description:
    "Izaberite fizičke proizvode, materijale i tiraž, dodajte dizajn i ScanMe pretplatu. Obračun se računa uživo dok birate.",
};

// Bezbedan default kada query nedostaje ili je nevalidan. Nevalidan query NE baca —
// pada na ovo stanje (parseSelection vraća null, mi biramo default).
const DEFAULT_SELECTION: OrderSelection = {
  service: "review",
  tier: "starter",
  period: "annual",
  products: [],
  design: { kind: "template", templateId: "standard", addOwnLogo: false },
};

const SERVICES: readonly ServiceId[] = ["review", "links"];
const TIERS: readonly PublicTierId[] = ["starter", "premium"];
const PERIODS: readonly BillingPeriod[] = ["monthly", "annual"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Početni izbor. Pun deep-link (iz encodeSelection) parsiramo do kraja; ako query
 * nije potpun — npr. CTA sa cenovnika nosi samo service/tier/period — čitamo ta tri
 * polja pojedinačno i ostatak dopunjujemo default-om. Nevalidno tiho pada na default.
 */
function resolveInitialSelection(params: URLSearchParams): OrderSelection {
  const full = parseSelection(params);
  if (full) return full;

  return {
    ...DEFAULT_SELECTION,
    service: pick(params.get("service"), SERVICES, DEFAULT_SELECTION.service),
    tier: pick(params.get("tier"), TIERS, DEFAULT_SELECTION.tier),
    period: pick(params.get("period"), PERIODS, DEFAULT_SELECTION.period),
  };
}

export default async function PonudaPage({ searchParams }: PageProps<"/ponuda">) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) params.set(key, value[0]);
  }

  const initialSelection = resolveInitialSelection(params);

  return (
    <>
      <a href="#konfigurator" className="skip-link">
        Pređi na konfigurator
      </a>
      <SiteNav />
      <main id="konfigurator">
        <section className="section-shell pt-28 pb-20 sm:pt-32 sm:pb-24 lg:pt-36">
          <div className="max-w-[52ch]">
            <p className="accent-label text-sm font-medium">ScanMe ponuda</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Sastavite svoju ponudu.
            </h1>
            <p className="mt-6 leading-7 text-foreground/62">
              Izaberite fizičke proizvode, materijal i tiraž, dodajte dizajn i ScanMe
              pretplatu. Obračun se računa uživo dok birate — bez obaveze.
            </p>
          </div>

          <div className="mt-12 lg:mt-16">
            <OfferConfigurator initialSelection={initialSelection} />
          </div>
        </section>
      </main>
      <OfferFooter />
      {/* Konfigurator ima lepljivu donju traku (lg:hidden); ovaj razmak drži
          copyright iznad nje kada se skroluje do samog dna na mobilnom. */}
      <div aria-hidden="true" className="h-20 lg:hidden" />
    </>
  );
}
