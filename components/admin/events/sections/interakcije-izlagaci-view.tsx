"use client";

import { ChevronRight, Layers } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminEmptyState, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  AdminFilterBar,
  adminSecondaryButtonClass,
  type AdminColumn,
  type AdminFilterChip,
} from "@/components/admin/admin-ui";
import { ExhibitorLogo, ExhibitorWebsiteLink } from "@/components/admin/events/exhibitor-identity";
import { ExhibitorPackages, PACKAGE_TONE, type PackageModel, type PackageUpgradeOutcome } from "@/components/admin/events/exhibitor-packages";
import { Meta, Section } from "@/components/admin/events/event-ui";
import {
  applyInteractionExhibitorFilters,
  clearInteractionExhibitorFiltersPatch,
  interactionPackageCounts,
  interactionPackageFilter,
  type InteractionExhibitorRow,
  type InteractionPackageFilter,
} from "@/lib/admin-v1/interaction-exhibitors";
import { PASSPORT_STATE_OF_PARAM, PASSPORT_STATE_VALUES, type PassportState, type PassportStateParam } from "@/lib/admin-v1/passport-overview";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import type { FairPackageTier } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Izlagači 2026 — `interakcije`: one card per exhibitor instead of four pages
// that each start with an exhibitor picker. The default view shows only the
// exhibitors with a Starter or Napredni car ("Sa interakcijama"); "Svi
// izlagači" shows everyone. "Paketi" opens the exhibitor's cars right in the
// list to give them Starter or Napredni; a card opens the exhibitor's page
// with Glas publike, Ankete, Pasoš brenda and Forme together.

const t = dict.interactionExhibitors;
const PACKAGE_FILTERS: readonly InteractionPackageFilter[] = ["interakcije", "svi", "napredni", "starter", "za-sve"];
const PASSPORT_TONE: Record<PassportState, "active" | "waiting" | "neutral" | "muted"> = { active: "active", frozen: "active", hidden: "muted", not_eligible: "neutral", missing: "waiting" };

function ModelsSummary({ row }: { row: InteractionExhibitorRow }) {
  if (!row.models.total) return <span className="text-xs text-[var(--admin-text-muted)]">{t.noModels}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {row.models.advanced ? <AdminStatus label={`${row.models.advanced} × ${dict.tiers.advanced}`} tone={PACKAGE_TONE.advanced} className="whitespace-nowrap" /> : null}
      {row.models.starter ? <AdminStatus label={`${row.models.starter} × ${dict.tiers.starter}`} tone={PACKAGE_TONE.starter} className="whitespace-nowrap" /> : null}
      {row.models.included ? <AdminStatus label={`${row.models.included} × ${dict.tiers.included}`} tone={PACKAGE_TONE.included} className="whitespace-nowrap" /> : null}
    </span>
  );
}

function QuestionsValue({ row, dayLabel }: { row: InteractionExhibitorRow; dayLabel: string | null }) {
  if (!row.questions) return <span className="text-[var(--admin-text-muted)]">{t.loading}</span>;
  if (!row.questions.required) return <span className="text-[var(--admin-text-muted)]">{t.questionsNone}</span>;
  const missing = row.questions.covered < row.questions.required;
  return (
    <span className="grid gap-0.5">
      <AdminStatus label={fmt(t.questionsValue, { covered: row.questions.covered, required: row.questions.required })} tone={missing ? "waiting" : "active"} className="w-fit whitespace-nowrap tabular-nums" />
      {dayLabel ? <Meta>{fmt(t.questionsDay, { day: dayLabel })}</Meta> : null}
    </span>
  );
}

function SurveysValue({ row }: { row: InteractionExhibitorRow }) {
  if (!row.surveys) return <span className="text-[var(--admin-text-muted)]">{t.loading}</span>;
  if (!row.surveys.advanced) return <span className="text-[var(--admin-text-muted)]">{t.surveysNone}</span>;
  return <span className="tabular-nums">{fmt(t.surveysValue, { published: row.surveys.published, advanced: row.surveys.advanced })}</span>;
}

function PassportValue({ row }: { row: InteractionExhibitorRow }) {
  if (!row.passports) return <span className="text-[var(--admin-text-muted)]">{t.loading}</span>;
  if (!row.passports.length) return <span className="text-[var(--admin-text-muted)]">{t.passportNone}</span>;
  // One badge per state, with the number of brands when more than one shares it.
  const counts = new Map<PassportState, number>();
  for (const state of row.passports) counts.set(state, (counts.get(state) ?? 0) + 1);
  return (
    <span className="flex flex-wrap gap-1.5">
      {[...counts].map(([state, count]) => (
        <AdminStatus key={state} label={count > 1 ? `${count} × ${dict.passportAuto.states[state]}` : dict.passportAuto.states[state]} tone={PASSPORT_TONE[state]} className="whitespace-nowrap" />
      ))}
    </span>
  );
}

function NameCell({ row, href }: { row: InteractionExhibitorRow; href: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <ExhibitorLogo name={row.name} logoUrl={row.logoUrl} size="sm" />
      <span className="grid min-w-0">
        <Link href={href} className="font-semibold underline-offset-4 [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{row.name}</Link>
        {row.websiteUrl ? <ExhibitorWebsiteLink url={row.websiteUrl} ariaLabel={fmt(t.websiteAria, { name: row.name })} className="min-h-6 w-fit max-w-full" /> : null}
      </span>
    </span>
  );
}

function columns(href: (id: string) => string, dayLabel: string | null): AdminColumn<InteractionExhibitorRow>[] {
  return [
    { id: "name", header: t.colExhibitor, rowHeader: true, width: "26%", sortValue: (row) => row.name, cell: (row) => <NameCell row={row} href={href(row.id)} /> },
    { id: "models", header: t.colModels, sortValue: (row) => row.models.advanced * 1000 + row.models.starter * 100 + row.models.total, cell: (row) => <ModelsSummary row={row} /> },
    { id: "questions", header: t.colQuestions, sortValue: (row) => (row.questions?.required ? row.questions.covered / row.questions.required : null), cell: (row) => <QuestionsValue row={row} dayLabel={dayLabel} /> },
    { id: "surveys", header: t.colSurveys, sortValue: (row) => row.surveys?.published ?? null, cell: (row) => <SurveysValue row={row} /> },
    { id: "passport", header: t.colPassport, cell: (row) => <PassportValue row={row} /> },
  ];
}

/** "Sa interakcijama · Svi izlagači · …" — one tap between the default view and everyone. */
function PackageSwitch({ value, counts, onChange }: { value: InteractionPackageFilter; counts: Record<InteractionPackageFilter, number>; onChange: (next: InteractionPackageFilter) => void }) {
  return (
    <div role="group" aria-label={t.facetPackage} className="flex min-w-0 flex-wrap gap-1.5">
      {PACKAGE_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          aria-pressed={value === filter}
          onClick={() => onChange(filter)}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]",
            value === filter
              ? "border-[var(--admin-ink)] bg-[var(--admin-ink)] text-[var(--admin-surface)]"
              : "border-[var(--admin-border)] bg-[var(--admin-surface)] hover:bg-[var(--admin-surface-muted)]",
          )}
        >
          {t.packages[filter]}
          <span className={cn("tabular-nums text-xs", value === filter ? "opacity-80" : "text-[var(--admin-text-muted)]")}>{counts[filter]}</span>
        </button>
      ))}
    </div>
  );
}

export type EventInteractionExhibitorsViewProps = {
  /** buildInteractionExhibitorRows(...) — every participation of the event. */
  rows: InteractionExhibitorRow[];
  /** Label of the day the Glas publike numbers are for (null = the event has no days). */
  dayLabel: string | null;
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  /** `interakcije/<participationId>` with the kept filters. */
  exhibitorHref: (participationId: string) => string;
  /** The exhibitor's live cars, for "Paketi" in the list. */
  packagesOf: (participationId: string) => PackageModel[];
  onUpgrade: (modelId: string, to: FairPackageTier) => Promise<PackageUpgradeOutcome>;
  now: number;
  importHref: string;
  modelHref?: (modelId: string) => string;
};

export function EventInteractionExhibitorsView({ rows, dayLabel, query, onQueryChange, exhibitorHref, packagesOf, onUpgrade, now, importHref, modelHref }: EventInteractionExhibitorsViewProps) {
  // One exhibitor's cars open under its row/card at a time.
  const [openId, setOpenId] = useState<string | null>(null);
  const filter = interactionPackageFilter(query.paket);
  const filtered = applyInteractionExhibitorFilters(rows, query);
  const counts = interactionPackageCounts(rows, query);
  const chips: AdminFilterChip[] = [];
  if (query.q) chips.push({ id: "q", label: fmt(t.searchChip, { q: query.q }), onRemove: () => onQueryChange({ q: null }) });
  if (query.stanje && (PASSPORT_STATE_VALUES as readonly string[]).includes(query.stanje)) {
    chips.push({ id: "stanje", label: fmt(t.passportChip, { state: dict.passportAuto.states[PASSPORT_STATE_OF_PARAM[query.stanje as PassportStateParam]] }), onRemove: () => onQueryChange({ stanje: null }) });
  }
  const clear = () => onQueryChange(clearInteractionExhibitorFiltersPatch());
  const setFilter = (next: InteractionPackageFilter) => onQueryChange({ paket: next === "interakcije" ? null : next });

  return (
    <div className="grid min-w-0 gap-4">
      {rows.length ? (
        <AdminFilterBar
          label={t.filterLabel}
          search={{ value: query.q ?? "", onChange: (q) => onQueryChange({ q: q || null }), label: t.searchLabel, placeholder: t.searchPlaceholder }}
          hierarchy={<PackageSwitch value={filter} counts={counts} onChange={setFilter} />}
          chips={chips}
          onClear={clear}
        />
      ) : null}
      <Section title={dict.sectionLabels.interakcije}>
        <p className="mb-4 max-w-3xl text-sm text-[var(--admin-text-muted)]">{t.subtitle}</p>
        {!rows.length ? (
          <AdminEmptyState title={t.noExhibitorsTitle} body={t.noExhibitorsBody} className="min-h-40" />
        ) : (
          <AdminDataView
            listKey="dogadjaji.interakcije.izlagaci"
            caption={dict.sectionLabels.interakcije}
            rows={filtered}
            getRowId={(row) => row.id}
            columns={columns(exhibitorHref, dayLabel)}
            tableClassName="min-w-[52rem]"
            // An opened "Paketi" makes one card tall; the others keep their height.
            cardsClassName="items-start"
            view={query.prikaz === "tabela" || query.prikaz === "kartice" ? query.prikaz : null}
            onViewChange={(mode) => onQueryChange({ prikaz: mode })}
            toolbar={<p className="text-sm font-semibold" role="status" aria-live="polite">{fmt(t.count, { shown: filtered.length, total: rows.length })}</p>}
            empty={
              filter === "interakcije" && !query.q && !query.stanje ? (
                <div className="grid justify-items-center gap-2 pb-4">
                  <AdminEmptyState title={t.emptyTitle} body={t.emptyBody} className="min-h-40" />
                  <button type="button" onClick={() => setFilter("svi")} className={adminSecondaryButtonClass}>{t.emptyShowAll}</button>
                </div>
              ) : (
                <div className="grid justify-items-center gap-2 pb-4">
                  <AdminEmptyState title={t.noMatchTitle} body={t.noMatchBody} className="min-h-40" />
                  <button type="button" onClick={clear} className={adminSecondaryButtonClass}>{adminUiSr.filters.clear}</button>
                </div>
              )
            }
            renderCard={(row) => (
              <AdminDataCard
                title={
                  <span className="flex min-w-0 items-center gap-3">
                    <ExhibitorLogo name={row.name} logoUrl={row.logoUrl} size="md" />
                    <span className="grid min-w-0">
                      <Link href={exhibitorHref(row.id)} className="text-base underline-offset-4 [overflow-wrap:anywhere] hover:underline">{row.name}</Link>
                      {row.brands.length ? <span className="text-xs font-normal text-[var(--admin-text-muted)]">{row.brands.join(", ")}</span> : null}
                    </span>
                  </span>
                }
                subtitle={row.websiteUrl ? <ExhibitorWebsiteLink url={row.websiteUrl} ariaLabel={fmt(t.websiteAria, { name: row.name })} className="min-h-6" /> : undefined}
                badges={<ModelsSummary row={row} />}
                fields={row.hasInteractions ? [
                  { label: t.colQuestions, value: <QuestionsValue row={row} dayLabel={dayLabel} /> },
                  { label: t.colSurveys, value: <SurveysValue row={row} /> },
                  { label: t.colPassport, value: <PassportValue row={row} /> },
                ] : []}
              />
            )}
            rowActions={(row) => (
              <>
                <button
                  type="button"
                  aria-expanded={openId === row.id}
                  aria-label={fmt(t.packagesAria, { name: row.name })}
                  onClick={() => setOpenId((current) => (current === row.id ? null : row.id))}
                  className={cn(adminSecondaryButtonClass, "min-h-9 px-3 whitespace-nowrap", openId === row.id && "border-[var(--admin-ink)]")}
                >
                  <Layers className="size-4" aria-hidden="true" />{openId === row.id ? t.packagesClose : t.packagesOpen}
                </button>
                <Link href={exhibitorHref(row.id)} aria-label={fmt(t.openAria, { name: row.name })} className={cn(adminSecondaryButtonClass, "min-h-9 px-3 whitespace-nowrap")}>
                  {t.open}<ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              </>
            )}
            rowDetail={(row) => (openId === row.id ? (
              <div className="grid gap-2 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3">
                <p className="text-sm font-semibold">{fmt(t.packagesFor, { name: row.name })}</p>
                <ExhibitorPackages models={packagesOf(row.id)} now={now} onUpgrade={onUpgrade} importHref={importHref} modelHref={modelHref} compact />
              </div>
            ) : null)}
          />
        )}
      </Section>
    </div>
  );
}
