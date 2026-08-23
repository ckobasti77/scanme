import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { OfferFooter } from "@/components/offer-footer";
import { encodeSelection, parseSelection } from "@/lib/offer-url";
import { buildSelectionContactHref } from "@/lib/offer-contact";
import {
  computeOrderBreakdown,
  formatRsd,
  type BillingPeriod,
  type OrderSelection,
  type PublicTierId,
  type ServiceId,
} from "@/lib/scanme-pricing";

export const metadata: Metadata = {
  title: "Pregled ponude | ScanMe",
  description:
    "Kompletan obračun pre plaćanja: fizički proizvodi, dizajn, ScanMe pretplata za prvi period, iznos za plaćanje sada i cena naredne obnove.",
};

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

/** Jedan red zbira — ista tipografija kao obračun u konfiguratoru. */
function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className={muted ? "text-foreground/54" : "text-foreground/72"}>{label}</span>
      <span
        className={`tabular-nums ${muted ? "text-foreground/54" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}

export default async function PregledPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) params.set(key, value[0]);
  }

  const selection: OrderSelection | null = parseSelection(params);
  // Nevalidan izbor ili nijedan fizički proizvod -> ne renderuj prazan obračun.
  if (!selection || selection.products.length === 0) {
    redirect("/ponuda");
  }

  const breakdown = computeOrderBreakdown(selection);
  const annual = selection.period === "annual";
  const backHref = `/ponuda?${encodeSelection(selection).toString()}`;
  const contactHref = buildSelectionContactHref(selection);
  const isCustomDesign = selection.design.kind === "custom";

  return (
    <>
      <a href="#pregled" className="skip-link">
        Pređi na pregled
      </a>
      <SiteNav />
      <main id="pregled">
        <section className="section-shell pt-28 pb-20 sm:pt-32 sm:pb-24 lg:pt-36">
          <div className="max-w-[54ch]">
            <p className="accent-label text-sm font-medium">ScanMe ponuda</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Pregled pre plaćanja.
            </h1>
            <p className="mt-6 leading-7 text-foreground/62">
              Proverite izbor i pun obračun. Jednokratne stavke se naplaćuju jednom, a
              pretplata se obnavlja — sve je razdvojeno ispod. Cene su privremene radne
              vrednosti.
            </p>
          </div>

          <div className="mt-12 grid gap-8 lg:mt-16 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
            {/* Leva kolona: izbor + stavke */}
            <div className="grid gap-8">
              {/* Izabrano */}
              <section
                aria-labelledby="izbor-naslov"
                className="border border-foreground/14 bg-card p-6"
              >
                <h2
                  id="izbor-naslov"
                  className="text-lg font-semibold tracking-[-0.03em]"
                >
                  Vaš izbor
                </h2>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <dt className="text-xs font-medium text-foreground/54">Usluga</dt>
                    <dd className="text-sm font-medium">
                      {SERVICE_LABEL[selection.service]}
                    </dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-xs font-medium text-foreground/54">Paket</dt>
                    <dd className="text-sm font-medium">{TIER_LABEL[selection.tier]}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-xs font-medium text-foreground/54">
                      Period naplate
                    </dt>
                    <dd className="text-sm font-medium">
                      {PERIOD_LABEL[selection.period]}
                    </dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-xs font-medium text-foreground/54">Dizajn</dt>
                    <dd className="text-sm font-medium">
                      {isCustomDesign ? "Custom dizajn" : "Gotov dizajn (ScanMe šablon)"}
                      <span className="block text-xs font-normal text-foreground/54">
                        {selection.design.addOwnLogo
                          ? "Sopstveni logo dodat (besplatno)"
                          : "Bez sopstvenog logoa"}
                      </span>
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Fizički proizvodi */}
              <section
                aria-labelledby="stavke-naslov"
                className="border border-foreground/14 bg-card p-6"
              >
                <h2
                  id="stavke-naslov"
                  className="text-lg font-semibold tracking-[-0.03em]"
                >
                  Fizički proizvodi
                </h2>
                <div className="mt-5 grid gap-4">
                  {breakdown.productItems.map((item, index) => (
                    <div
                      key={`${item.productId}-${index}`}
                      className="grid gap-1 border-b border-foreground/10 pb-4 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-baseline justify-between gap-4 text-sm">
                        <span className="font-medium">
                          {item.productName}
                          <span className="text-foreground/54"> · {item.materialName}</span>
                        </span>
                        <span className="tabular-nums font-medium">
                          {formatRsd(item.lineTotal)} RSD
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-4 text-xs text-foreground/54">
                        <span>
                          {item.quantity} × {formatRsd(item.unitPrice)} RSD
                          {item.discountRate > 0
                            ? ` · popust −${Math.round(item.discountRate * 100)}%`
                            : ""}
                        </span>
                        {item.discountRate > 0 ? (
                          <span className="tabular-nums">−{formatRsd(item.lineDiscount)} RSD</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Desna kolona: zbir */}
            <aside className="border border-foreground/14 bg-card p-6 lg:sticky lg:top-24">
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Zbir</h2>

              {/* Jednokratno: proizvodi + dizajn */}
              <div className="mt-5 grid gap-2">
                <p className="accent-label text-xs font-semibold">Jednokratno</p>
                <SummaryRow
                  label="Fizički proizvodi"
                  value={`${formatRsd(breakdown.productsTotal)} RSD`}
                />
                <SummaryRow
                  label={isCustomDesign ? "Custom dizajn" : "Gotov dizajn"}
                  value={
                    breakdown.designFee > 0
                      ? `${formatRsd(breakdown.designFee)} RSD`
                      : "Uključeno"
                  }
                  muted={breakdown.designFee === 0}
                />
                {selection.design.addOwnLogo ? (
                  <SummaryRow label="Sopstveni logo" value="Besplatno" muted />
                ) : null}
                <div className="mt-1 border-t border-foreground/12 pt-3">
                  <SummaryRow
                    label="Jednokratno ukupno"
                    value={`${formatRsd(breakdown.oneTimeTotal)} RSD`}
                  />
                </div>
              </div>

              {/* SaaS sada */}
              <div className="mt-5 grid gap-2 border-t border-foreground/12 pt-4">
                <p className="accent-label text-xs font-semibold">Pretplata</p>
                <SummaryRow
                  label={`ScanMe pretplata (${annual ? "godišnje" : "prvi mesec"})`}
                  value={`${formatRsd(breakdown.saasFirstTerm)} RSD`}
                />
              </div>

              {/* Ukupno sada */}
              <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-foreground/12 pt-4">
                <span className="text-sm font-semibold tracking-[-0.02em]">
                  Za plaćanje sada
                </span>
                <span className="text-2xl font-semibold tracking-[-0.04em] tabular-nums">
                  {formatRsd(breakdown.totalDueNow)}{" "}
                  <span className="text-sm font-medium text-foreground/58">RSD</span>
                </span>
              </div>

              {/* Obnova — samo SaaS */}
              <div className="mt-5 border-t border-foreground/12 pt-4">
                <p className="accent-label text-xs font-semibold">Naredna obnova</p>
                <div className="mt-2 flex items-baseline justify-between gap-4">
                  <span className="text-sm text-foreground/72">
                    Pretplata ({annual ? "godišnje" : "mesečno"})
                  </span>
                  <span className="tabular-nums text-sm font-medium">
                    {formatRsd(breakdown.renewal.amount)} RSD
                    {annual ? "/god" : "/mes"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-foreground/54">
                  {annual
                    ? `≈ ${formatRsd(breakdown.renewal.monthlyEquivalent)} RSD/mes. `
                    : ""}
                  Obnova sadrži <strong className="font-semibold text-foreground/72">samo ScanMe pretplatu</strong> — fizički proizvodi i
                  dizajn se ne naplaćuju ponovo.
                </p>
              </div>
            </aside>
          </div>

          {/* Kraj toka — plaćanje još nije online */}
          <div className="mt-12 max-w-[62ch] border border-foreground/14 bg-foreground/[0.02] p-6 sm:p-7">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Sledeći korak</h2>
            <p className="mt-3 text-sm leading-6 text-foreground/64">
              Online plaćanje još nije uključeno. Da bismo potvrdili porudžbinu, dogovorili
              rok izrade i način plaćanja, javite se preko kontakta — poslaćemo vam potvrdu sa
              istim ovim obračunom.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={contactHref} className="button-primary focus-signal">
                Nastavi ka kontaktu
                <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
              </Link>
              <Link href={backHref} className="button-secondary focus-signal">
                Nazad na izmenu
              </Link>
            </div>
          </div>
        </section>
      </main>
      <OfferFooter contactHref={contactHref} />
    </>
  );
}
