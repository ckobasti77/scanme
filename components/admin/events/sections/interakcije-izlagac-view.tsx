"use client";

import { ArrowLeft, CarFront, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { adminSecondaryButtonClass } from "@/components/admin/admin-ui";
import { AdminEventsNotFound } from "@/components/admin/events/event-not-found";
import { Section } from "@/components/admin/events/event-ui";
import { ExhibitorLogo, ExhibitorWebsiteLink } from "@/components/admin/events/exhibitor-identity";
import { ExhibitorPackages, PACKAGE_TONE, type PackageModel, type PackageUpgradeOutcome } from "@/components/admin/events/exhibitor-packages";
import { INTERACTION_PARTS, type InteractionPart } from "@/lib/admin-v1/event-sections";
import type { InteractionExhibitorRow } from "@/lib/admin-v1/interaction-exhibitors";
import type { FairPackageTier } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Izlagači 2026 — `interakcije/<participationId>`: one exhibitor on one page.
// On top who it is (logo, website, client profile) and the packages of its
// cars; below, when at least one car has Starter or Napredni, Glas publike,
// Ankete, Pasoš brenda and Forme of only this exhibitor's cars, one after the
// other with a jump row (`#glas-publike`…, also the targets of the Modeli
// detail links). The four parts are the A6/A7 views, given by the container.

const t = dict.exhibitorPage;
const s = dict.interactionSections;
const PART_LABEL: Record<InteractionPart, string> = { "glas-publike": s.glasPublike, ankete: s.ankete, pasos: s.pasos, forme: s.forme };

export type EventInteractionExhibitorViewProps = {
  /** buildInteractionExhibitorRows(...) row of this exhibitor; null = not in the event. */
  exhibitor: InteractionExhibitorRow | null;
  /** The exhibitor's live cars with their packages. */
  models: PackageModel[];
  now: number;
  /** The list with its filters ("Svi izlagači"). */
  listHref: string;
  /** `/admin/klijenti/<accountId>`; null in the preview. */
  profileHref: string | null;
  /** Modeli filtered to the exhibitor. */
  modelsHref: string;
  importHref: string;
  modelHref?: (modelId: string) => string;
  onUpgrade: (modelId: string, to: FairPackageTier) => Promise<PackageUpgradeOutcome>;
  /** The A6/A7 views of this exhibitor only (scoped). */
  parts: Record<InteractionPart, ReactNode>;
};

/** A short state next to each jump link, from the list row (null = still loading). */
function partState(row: InteractionExhibitorRow, part: InteractionPart): string | null {
  switch (part) {
    case "glas-publike": return row.questions && row.questions.required ? `${row.questions.covered}/${row.questions.required}` : null;
    case "ankete": return row.surveys && row.surveys.advanced ? `${row.surveys.published}/${row.surveys.advanced}` : null;
    case "pasos": return row.passports && row.passports.length ? String(row.passports.length) : null;
    case "forme": return null;
  }
}

function Header({ row, profileHref, modelsHref }: { row: InteractionExhibitorRow; profileHref: string | null; modelsHref: string }) {
  const tiers: FairPackageTier[] = ["advanced", "starter", "included"];
  return (
    <AdminPanel className="min-w-0 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start gap-4">
        <ExhibitorLogo name={row.name} logoUrl={row.logoUrl} size="lg" />
        <div className="grid min-w-0 flex-1 basis-60 gap-1">
          <h2 className="text-xl font-semibold tracking-[-0.025em] [overflow-wrap:anywhere]">{row.name}</h2>
          {row.websiteUrl ? <ExhibitorWebsiteLink url={row.websiteUrl} ariaLabel={fmt(dict.interactionExhibitors.websiteAria, { name: row.name })} className="w-fit text-sm" /> : <span className="text-sm text-[var(--admin-text-muted)]">{t.noWebsite}</span>}
          {row.brands.length ? <p className="text-sm text-[var(--admin-text-muted)]">{row.brands.join(", ")}</p> : null}
          <span className="mt-1 flex flex-wrap gap-1.5">
            {row.models.total ? tiers.map((tier) => (row.models[tier] ? <AdminStatus key={tier} label={`${row.models[tier]} × ${dict.tiers[tier]}`} tone={PACKAGE_TONE[tier]} className="whitespace-nowrap" /> : null))
              : <AdminStatus label={dict.interactionExhibitors.noModels} tone="muted" />}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {profileHref ? (
            <Link href={profileHref} className={cn(adminSecondaryButtonClass, "min-h-10 px-3")}><UserRound className="size-4" aria-hidden="true" />{t.profile}</Link>
          ) : null}
          <Link href={modelsHref} className={cn(adminSecondaryButtonClass, "min-h-10 px-3")}><CarFront className="size-4" aria-hidden="true" />{t.models}</Link>
        </div>
      </div>
    </AdminPanel>
  );
}

export function EventInteractionExhibitorView({ exhibitor, models, now, listHref, profileHref, modelsHref, importHref, modelHref, onUpgrade, parts }: EventInteractionExhibitorViewProps) {
  if (!exhibitor) return <AdminEventsNotFound title={t.notFoundTitle} body={t.notFoundBody} href={listHref} linkLabel={t.back} />;
  return (
    <div className="grid min-w-0 gap-4">
      <Link href={listHref} className="inline-flex min-h-10 w-fit items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">
        <ArrowLeft className="size-4" aria-hidden="true" />{t.back}
      </Link>
      <Header row={exhibitor} profileHref={profileHref} modelsHref={modelsHref} />
      <Section title={t.packagesTitle}>
        {/* Once the exhibitor has interactions, the cars fold away so the four parts come first. */}
        <ExhibitorPackages models={models} now={now} onUpgrade={onUpgrade} importHref={importHref} modelHref={modelHref} collapsible defaultOpen={!exhibitor.hasInteractions} />
      </Section>
      {exhibitor.hasInteractions ? (
        <>
          <nav aria-label={t.jumpLabel} className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--admin-text-muted)]">{t.jumpLabel}</span>
            {INTERACTION_PARTS.map((part) => {
              const state = partState(exhibitor, part);
              return (
                <a key={part} href={`#${part}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3.5 text-sm font-semibold hover:bg-[var(--admin-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">
                  {PART_LABEL[part]}
                  {state ? <span className="text-xs tabular-nums text-[var(--admin-text-muted)]">{state}</span> : null}
                </a>
              );
            })}
          </nav>
          {INTERACTION_PARTS.map((part) => (
            <section key={part} id={part} aria-label={PART_LABEL[part]} data-interaction-part={part} className="grid min-w-0 scroll-mt-24 gap-4">
              {parts[part]}
            </section>
          ))}
        </>
      ) : exhibitor.models.total ? (
        // Cars without Starter/Napredni: the parts open after a package (an exhibitor without cars sees only the import above).
        <AdminPanel>
          <AdminEmptyState title={t.noInteractionsTitle} body={t.noInteractionsBody} className="min-h-40" />
        </AdminPanel>
      ) : null}
    </div>
  );
}
