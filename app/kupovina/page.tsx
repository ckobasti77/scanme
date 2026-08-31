import type { Metadata } from "next";
import { OfferFooter } from "@/components/offer-footer";
import { PurchaseShell } from "@/components/purchase/purchase-shell";
import { SiteNav } from "@/components/site-nav";
import { purchaseSr as dict } from "@/lib/i18n/sr/purchase";
import { parsePurchaseSelection, type PurchaseSelection } from "@/lib/offer-url";

export const metadata: Metadata = {
  title: dict.metaTitle,
  description: dict.metaDescription,
};

const EMPTY_SELECTION: PurchaseSelection = {
  services: [],
  plan: "basic",
  products: [],
  step: 1,
};

export default async function KupovinaPage({ searchParams }: PageProps<"/kupovina">) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) params.set(key, value[0]);
  }

  const initialSelection = parsePurchaseSelection(params) ?? EMPTY_SELECTION;

  return (
    <>
      <a href="#kupovina" className="skip-link">
        {dict.skipToFlow}
      </a>
      <SiteNav />
      <main className="offer-page">
        <section id="kupovina" className="section-shell pb-10 pt-20 lg:pb-12 lg:pt-20">
          <PurchaseShell initialSelection={initialSelection} />
        </section>
      </main>
      <OfferFooter />
      <div aria-hidden="true" className="h-20 lg:hidden" />
    </>
  );
}
