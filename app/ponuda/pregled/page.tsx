import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, FileText, ImageIcon } from "lucide-react";
import { OfferFooter } from "@/components/offer-footer";
import { SiteNav } from "@/components/site-nav";
import { fmt } from "@/lib/i18n/format";
import { offerSr as dict } from "@/lib/i18n/sr/offer";
import { buildSelectionContactHref } from "@/lib/offer-contact";
import { encodeSelection, parseSelection } from "@/lib/offer-url";
import {
  computeOrderBreakdown,
  formatRsd,
  getProduct,
  type ProductLineItem,
} from "@/lib/scanme-pricing";

export const metadata: Metadata = {
  title: dict.reviewMetaTitle,
  description: dict.reviewMetaDescription,
};

function SummaryRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className={muted ? "text-foreground/50" : "text-foreground/68"}>{label}</span>
      <span className={`font-mono tabular-nums ${muted ? "text-foreground/50" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}

function configurationEntries(item: ProductLineItem): { label: string; value: string }[] {
  const product = getProduct(item.productId);
  if (!product) return [];

  return product.controlIds.map((controlId) => {
    if (controlId === "orientation") {
      return {
        label: dict.orientationHeading,
        value: item.orientation === "landscape" ? dict.landscape : dict.portrait,
      };
    }
    if (controlId === "shape") {
      return { label: dict.shapeHeading, value: item.shape ? dict.shapeNames[item.shape] : "" };
    }
    if (controlId === "background") {
      return {
        label: dict.backgroundHeading,
        value: item.background ? dict.backgroundNames[item.background] : "",
      };
    }
    if (controlId === "finish") {
      return {
        label: dict.finishHeading,
        value: item.finish ? dict.finishNames[item.finish] : "",
      };
    }
    if (controlId === "woodType") {
      return {
        label: dict.woodTypeHeading,
        value: item.woodType ? dict.woodTypeNames[item.woodType] : "",
      };
    }
    if (controlId === "material") {
      return {
        label: dict.materialHeading,
        value: item.material ? dict.materialNames[item.material] : "",
      };
    }
    return { label: dict.dimensionsHeading, value: dict.dimensionNames[item.dimension] };
  });
}

export default async function PregledPage({ searchParams }: PageProps<"/ponuda/pregled">) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) params.set(key, value[0]);
  }

  const selection = parseSelection(params);
  if (!selection?.products.length) redirect("/ponuda");

  const breakdown = computeOrderBreakdown(selection);
  const encoded = encodeSelection(selection).toString();
  const backHref = `/ponuda?${encoded}`;
  const contactHref = buildSelectionContactHref(selection);
  const annual = selection.period === "annual";

  return (
    <>
      <a href="#pregled" className="skip-link">{dict.skipReview}</a>
      <SiteNav />
      <main id="pregled" className="offer-page">
        <section className="section-shell pb-24 pt-28 sm:pt-32 lg:pb-32 lg:pt-36">
          <div className="max-w-[58ch]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/52">
              {dict.eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              {dict.reviewTitle}
            </h1>
            <p className="mt-5 max-w-[52ch] leading-7 text-foreground/62">{dict.reviewIntro}</p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="grid gap-5">
              <section aria-labelledby="izbor-naslov" className="border border-foreground/12 bg-card/54 p-5 sm:p-6">
                <h2 id="izbor-naslov" className="text-lg font-semibold tracking-[-0.025em]">{dict.yourSelection}</h2>
                <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium text-foreground/48">{dict.service}</dt>
                    <dd className="mt-1 text-sm font-semibold">{dict.serviceNames[selection.service]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-foreground/48">{dict.tier}</dt>
                    <dd className="mt-1 text-sm font-semibold">{dict.tierNames[selection.tier]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-foreground/48">{dict.billingPeriod}</dt>
                    <dd className="mt-1 text-sm font-semibold">{dict.periodNames[selection.period]}</dd>
                  </div>
                </dl>
              </section>

              <section aria-labelledby="stavke-naslov" className="border border-foreground/12 bg-card/54 p-5 sm:p-6">
                <h2 id="stavke-naslov" className="text-lg font-semibold tracking-[-0.025em]">{dict.physicalProducts}</h2>
                <div className="mt-5 grid gap-3">
                  {breakdown.productItems.map((item) => {
                    const product = dict.products[item.productId];
                    const designName = item.design.kind === "template" ? dict.templateNames[item.design.templateId] : dict.customDesign;
                    const configuration = configurationEntries(item);
                    return (
                      <article key={item.productId} className="border border-foreground/10 bg-background/38 p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-5">
                          <div>
                            <h3 className="font-semibold tracking-[-0.015em]">{product.name}</h3>
                            <p className="mt-1 text-xs leading-5 text-foreground/50">{product.subtitle}</p>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{formatRsd(item.lineTotal)} RSD</span>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-foreground/10 pt-4 text-sm sm:grid-cols-4">
                          <div>
                            <dt className="text-xs text-foreground/46">{dict.quantity}</dt>
                            <dd className="mt-1 font-mono font-medium">{item.quantity}</dd>
                          </div>
                          {configuration.map((entry) => (
                            <div key={entry.label}>
                              <dt className="text-xs text-foreground/46">{entry.label}</dt>
                              <dd className="mt-1 font-medium">{entry.value}</dd>
                            </div>
                          ))}
                          <div>
                            <dt className="text-xs text-foreground/46">{dict.design}</dt>
                            <dd className="mt-1 font-medium">{designName}</dd>
                          </div>
                        </dl>
                        {item.design.kind === "custom" && item.design.brief.trim() ? (
                          <div className="mt-4 flex gap-3 border-t border-foreground/10 pt-4 text-sm leading-6 text-foreground/64">
                            <FileText aria-hidden="true" className="mt-1 size-4 shrink-0" strokeWidth={1.5} />
                            <p>{item.design.brief.trim()}</p>
                          </div>
                        ) : null}
                        {item.discountRate > 0 ? (
                          <p className="mt-3 text-xs text-foreground/46">
                            {item.quantity} × {formatRsd(item.unitPrice)} RSD · {fmt(dict.discount, { percent: Math.round(item.discountRate * 100) })}
                          </p>
                        ) : null}
                        {item.optionSurcharge > 0 ? (
                          <p className="mt-3 text-xs leading-5 text-foreground/52">
                            {fmt(dict.compactBlackReason, {
                              price: formatRsd(item.optionSurcharge),
                            })}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="border border-foreground/12 bg-card/54 p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center border border-foreground/12 bg-background/48">
                    {selection.logoUploadId ? <Check aria-hidden="true" className="size-4" /> : <ImageIcon aria-hidden="true" className="size-4" />}
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">{dict.logo}</h2>
                    <p className="mt-0.5 text-xs text-foreground/50">{selection.logoUploadId ? dict.logoAdded : dict.logoNotAdded}</p>
                  </div>
                </div>
              </section>
            </div>

            <aside className="offer-configurator-glass p-5 sm:p-6 lg:sticky lg:top-24">
              <h2 className="text-lg font-semibold tracking-[-0.025em]">{dict.summary}</h2>
              <div className="mt-5 grid gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/46">{dict.oneTime}</p>
                <SummaryRow label={dict.productsSubtotal} value={`${formatRsd(breakdown.productsTotal)} RSD`} />
                <SummaryRow label={dict.logo} value={dict.logoFree} muted />
                {breakdown.requiresCustomDesignQuote ? <SummaryRow label={dict.customDesign} value={dict.customPrice} muted /> : <SummaryRow label={dict.design} value={dict.templateIncluded} muted />}
              </div>
              <div className="mt-5 grid gap-3 border-t border-foreground/12 pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/46">{dict.subscription}</p>
                <SummaryRow
                  label={`${dict.saasSubscription} (${annual ? dict.annual : dict.firstMonth})`}
                  value={`${formatRsd(breakdown.saasFirstTerm)} RSD`}
                />
              </div>
              <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-foreground/14 pt-5">
                <span className="text-sm font-semibold">{breakdown.requiresCustomDesignQuote ? dict.subtotalWithoutCustom : dict.totalNow}</span>
                <span className="font-mono text-2xl font-semibold tracking-[-0.04em] tabular-nums">
                  {formatRsd(breakdown.totalDueNow)} <span className="text-xs">RSD</span>
                </span>
              </div>
              <p className="mt-4 text-xs leading-5 text-foreground/50">
                {dict.renewal}: {formatRsd(breakdown.renewal.amount)} {annual ? dict.renewalAnnual : dict.renewalMonthly}. {dict.renewalNote}
              </p>
            </aside>
          </div>

          <section className="mt-8 max-w-[700px] border border-foreground/12 bg-foreground/[0.025] p-5 sm:p-6">
            <h2 className="text-lg font-semibold tracking-[-0.025em]">{dict.nextStep}</h2>
            <p className="mt-3 text-sm leading-6 text-foreground/62">{dict.nextStepBody}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={contactHref} className="button-primary focus-signal">
                {dict.continueToContact}
                <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
              </Link>
              <Link href={backHref} className="button-secondary focus-signal">
                <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.7} />
                {dict.backToEdit}
              </Link>
            </div>
          </section>
        </section>
      </main>
      <OfferFooter contactHref={contactHref} />
    </>
  );
}
