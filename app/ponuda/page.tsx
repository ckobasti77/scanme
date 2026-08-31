import type { Metadata } from "next";
import { OfferConfigurator } from "@/components/offer-configurator";
import { OfferFooter } from "@/components/offer-footer";
import { SiteNav } from "@/components/site-nav";
import { offerSr as dict } from "@/lib/i18n/sr/offer";
import { parseSelection } from "@/lib/offer-url";
import {
  DEFAULT_ORDER_SELECTION,
  type BillingPeriod,
  type OrderSelection,
  type PublicTierId,
  type ServiceId,
} from "@/lib/scanme-pricing";

export const metadata: Metadata = {
  title: dict.metaTitle,
  description: dict.metaDescription,
};

const SERVICES: readonly ServiceId[] = ["review", "links"];
const TIERS: readonly PublicTierId[] = ["starter", "premium"];
const PERIODS: readonly BillingPeriod[] = ["monthly", "annual"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function resolveInitialSelection(params: URLSearchParams): OrderSelection {
  const full = parseSelection(params);
  if (full?.products.length) return full;

  return {
    ...DEFAULT_ORDER_SELECTION,
    products: [],
    service: pick(params.get("service"), SERVICES, DEFAULT_ORDER_SELECTION.service),
    tier: pick(params.get("tier"), TIERS, DEFAULT_ORDER_SELECTION.tier),
    period: pick(params.get("period"), PERIODS, DEFAULT_ORDER_SELECTION.period),
  };
}

export default async function PonudaPage({ searchParams }: PageProps<"/ponuda">) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) params.set(key, value[0]);
  }

  return (
    <>
      <a href="#konfigurator" className="skip-link">
        {dict.skipConfigurator}
      </a>
      <SiteNav />
      <main className="offer-page">
        <section className="section-shell pb-10 pt-20 lg:pb-12 lg:pt-20">
          <OfferConfigurator initialSelection={resolveInitialSelection(params)} />
        </section>
      </main>
      <OfferFooter />
      <div aria-hidden="true" className="h-20 lg:hidden" />
    </>
  );
}
