"use client";

import { Printer } from "lucide-react";
import { useMemo } from "react";
import type { CatalogView } from "@/components/admin/admin-events";
import { AdminEmptyState } from "@/components/admin/admin-primitives";
import { adminPrimaryButtonClass } from "@/components/admin/admin-ui";
import { BrandQrPoster, brandQrPosterUrl, type BrandQrPosterCopy } from "@/components/admin/brand-qr-poster";
import { useAdminEvent, useCatalogViewWithoutChecks } from "@/components/admin/events/event-context";
import { useEventHeaderActions } from "@/components/admin/events/event-frame-view";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Printing the A4 poster of every brand that has a car in a paid
// package (`starter` or `advanced`; `included` are the fair's own cars that no
// visitor signs up for, `withdrawn` cars are not on the floor). The poster is
// plain DOM sized in millimetres by brand-qr-poster.module.css, so `window.print()`
// gives one brand per A4 sheet with nothing else on the page.

export type PosterRow = { key: string; url: string; copy: BrandQrPosterCopy };

function posterCopy(brandName: string, standLabel: string | null): BrandQrPosterCopy {
  return {
    standLine: standLabel
      ? fmt(dict.brandQr.standLine, { brand: brandName, stand: standLabel })
      : fmt(dict.brandQr.standLineWithoutStand, { brand: brandName }),
    title: dict.brandQr.title,
    callToAction: dict.brandQr.callToAction,
    lead: dict.brandQr.lead,
    steps: dict.brandQr.steps,
    footer: dict.brandQr.footer,
  };
}

/** One poster row per brand that has a car in a package. The stand the band shows is the
 *  stand with most of that brand's packaged cars (a brand on several stands gets one sheet, not three). */
export function brandQrPosterRows(models: CatalogView["models"], eventSlug: string): PosterRow[] {
  const byBrand = new Map<string, { brandName: string; stands: Map<string, number> }>();
  for (const model of models) {
    if (model.tier === "included" || model.status === "withdrawn") continue;
    if (!model.brandId) continue;
    const row = byBrand.get(model.brandId) ?? { brandName: model.brandName, stands: new Map() };
    // `standLabel` is the string `„—“` when the model has no stand; that is not a stand for the band.
    if (model.standLabel && model.standLabel !== "—") row.stands.set(model.standLabel, (row.stands.get(model.standLabel) ?? 0) + 1);
    byBrand.set(model.brandId, row);
  }
  return [...byBrand.entries()]
    .sort((a, b) => a[1].brandName.localeCompare(b[1].brandName, "sr", { sensitivity: "base" }))
    .map(([brandId, row]) => {
      let standLabel: string | null = null;
      let best = 0;
      for (const [stand, count] of row.stands) {
        if (count > best) { best = count; standLabel = stand; }
      }
      return {
        key: brandId,
        url: brandQrPosterUrl(eventSlug, row.brandName),
        copy: posterCopy(row.brandName, standLabel),
      };
    });
}

/** The printed board plus the controls that only exist on the screen. The same board
 *  serves the event route (rows from the context) and the fixture preview. */
export function BrandQrPosterBoard({ rows }: { rows: PosterRow[] }) {
  const actions = useMemo(
    () => (
      <button
        type="button"
        data-brand-qr-action="print"
        className={cn(adminPrimaryButtonClass, "print:hidden")}
        onClick={() => window.print()}
        disabled={rows.length === 0}
      >
        <Printer aria-hidden="true" className="size-4" />
        {dict.brandQr.printAll}
      </button>
    ),
    [rows.length],
  );
  const inHeader = useEventHeaderActions(actions);

  return (
    <div className="@container grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 print:hidden">
        <p data-admin-reveal="text" className="min-w-0 text-sm leading-5 text-[var(--admin-text-muted)]">
          {dict.brandQr.hint}
        </p>
        {/* Outside an event frame (a test of this view alone) the header does not take the actions: they stay here. */}
        {inHeader ? null : <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {rows.length === 0 ? (
        <AdminEmptyState title={dict.brandQr.emptyTitle} body={dict.brandQr.emptyBody} />
      ) : (
        <div className="grid min-w-0 justify-center gap-6" data-brand-qr-print-root>
          {rows.map((row) => (
            <BrandQrPoster key={row.key} url={row.url} copy={row.copy} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BrendoviQrSection() {
  const { base } = useAdminEvent();
  const view = useCatalogViewWithoutChecks();
  const eventSlug = base.slice(base.lastIndexOf("/") + 1);
  const rows = useMemo(() => brandQrPosterRows(view.models, eventSlug), [view.models, eventSlug]);
  return <BrandQrPosterBoard rows={rows} />;
}
