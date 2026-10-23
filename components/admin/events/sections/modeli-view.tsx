"use client";

import { CarFront, CheckCircle2, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { issueText, type CatalogView, type EventsActions, type ModelView, type Outcome, type QrDetailView, type Result } from "@/components/admin/admin-events";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  AdminFilterBar,
  AdminHierarchyPicker,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminTouchFieldClass,
  type AdminColumn,
  type AdminFilterChip,
  type AdminFilterFacet,
} from "@/components/admin/admin-ui";
import { BackLink, checkLabel, eventDateTime, Fact, Feedback, IssueList, Meta, modelName, modelTone, Section, type EventMessage } from "@/components/admin/events/event-ui";
import { ResolvePanel } from "@/components/admin/events/sections/qr-view";
import type { EventSectionPath, InteractionPart } from "@/lib/admin-v1/event-sections";
import type { HierarchyValue } from "@/lib/admin-v1/hierarchy";
import {
  adjacentModels,
  applyModelFilters,
  clearModelFiltersPatch,
  hierarchyCountedIds,
  MODEL_FACET_VALUES,
  MODEL_FACETS,
  modelFacetCounts,
  modelGroupKey,
  modelGroups,
  modelHierarchy,
  type ModelFacet,
} from "@/lib/admin-v1/model-filters";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import { FAIR_PACKAGE_TIERS, type FairPackageTier, type FairPassportConfigStatus, type FairSurveyStatus } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A3 — `modeli` (filters Izlagač → Brend → Model + search + facets,
// Tabela/Kartice grouped by izlagač · brend) and `modeli/[modelId]` (every
// model action, QR, resolve test, linked summaries, prethodni / sledeći in
// the list's filter). Presentational: the containers pass the catalog, the
// query string and the actions; the dev preview passes TEST fixtures.

const list = dict.modelList;
const detail = dict.modelDetail;

const modelColumns: AdminColumn<ModelView>[] = [
  { id: "model", header: dict.colModel, rowHeader: true, sortValue: modelName, cell: (model) => <strong className="font-semibold">{modelName(model)}</strong> },
  { id: "brand", header: dict.colBrand, sortValue: (model) => model.brandName, cell: (model) => <><span className="block">{model.brandName}</span><Meta>{model.exhibitorName} · {model.standLabel}</Meta></> },
  { id: "qr", header: dict.colQr, sortValue: (model) => model.qrLabel ?? model.qrCode, cell: (model) => <span className="font-mono text-xs">{model.qrLabel ?? model.qrCode ?? dict.noQr}</span> },
  { id: "check", header: dict.colCheck, sortValue: (model) => model.issues.length, cell: (model) => checkLabel(model.issues) },
  { id: "package", header: dict.colPackage, sortValue: (model) => FAIR_PACKAGE_TIERS.indexOf(model.tier), cell: (model) => <AdminStatus label={dict.tiers[model.tier]} tone="neutral" /> },
  { id: "status", header: dict.colStatus, sortValue: (model) => dict.modelStatus[model.status], cell: (model) => <AdminStatus label={dict.modelStatus[model.status]} tone={modelTone(model.status)} /> },
];

/** The compact model table of Pregled; every row opens the model's own page. */
export function EventModelsTable({ listKey, models, modelHref }: { listKey: string; models: ModelView[]; modelHref: (modelId: string) => string }) {
  return (
    <AdminDataView
      listKey={listKey}
      caption={dict.modelsTitle}
      rows={models}
      getRowId={(model) => model.id}
      columns={modelColumns}
      tableClassName="min-w-[56rem]"
      empty={{ title: dict.emptyCatalogTitle, body: dict.emptyCatalogBody }}
      renderCard={(model) => (
        <AdminDataCard
          title={modelName(model)}
          subtitle={`${model.brandName} · ${model.exhibitorName} · ${model.standLabel}`}
          badges={<><AdminStatus label={dict.tiers[model.tier]} tone="neutral" /><AdminStatus label={dict.modelStatus[model.status]} tone={modelTone(model.status)} /></>}
          fields={[{ label: dict.colQr, value: <span className="font-mono">{model.qrLabel ?? model.qrCode ?? dict.noQr}</span> }, { label: dict.colCheck, value: checkLabel(model.issues) }]}
        />
      )}
      rowActions={(model) => <Link href={modelHref(model.id)} className={adminSecondaryButtonClass}>{dict.openModel}</Link>}
    />
  );
}

// -----------------------------------------------------------------------------
// Modeli: list
// -----------------------------------------------------------------------------

function issueCounts(model: ModelView) {
  const errors = model.issues.filter((issue) => issue.severity === "error").length;
  return { errors, warnings: model.issues.length - errors };
}

function TierBadge({ model }: { model: ModelView }) {
  return <AdminStatus label={dict.tiers[model.tier]} tone={model.tier === "advanced" ? "active" : "neutral"} className="whitespace-nowrap" />;
}

function StatusBadge({ model }: { model: ModelView }) {
  return <AdminStatus label={dict.modelStatus[model.status]} tone={modelTone(model.status)} className="whitespace-nowrap" />;
}

function QrCell({ model }: { model: ModelView }) {
  if (!model.qrCode) return <span className="text-xs text-[var(--admin-text-muted)]">{list.qrNone}</span>;
  return (
    <span className="grid font-mono text-xs leading-5 whitespace-nowrap">
      {/* N2 — the printed sticker label first (`SA26-007`), then SMQ and resolver code. */}
      {model.qrLabel && model.qrLabel !== model.qrCode ? <strong className="text-sm font-semibold">{model.qrLabel}</strong> : null}
      <span>{model.qrSmq ?? "—"}</span>
      <span className="text-[var(--admin-text-muted)]">{model.qrCode}</span>
    </span>
  );
}

function ProblemsCell({ model }: { model: ModelView }) {
  const { errors, warnings } = issueCounts(model);
  if (!errors && !warnings) return <span className="text-xs text-[var(--admin-text-muted)]">{list.problemsNone}</span>;
  return <AdminStatus label={fmt(list.problemsCount, { errors, warnings })} tone={errors ? "problem" : "waiting"} className="whitespace-nowrap" />;
}

function ModelPhoto({ model }: { model: ModelView }) {
  if (model.photoUrl) {
    return (
      <div className="h-28 overflow-hidden rounded-[var(--admin-radius-control)] bg-[var(--admin-surface-muted)]">
        {/* The admin catalog has external photo URLs of any host; next/image would need next.config (outside the admin). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={model.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
      </div>
    );
  }
  const Icon = model.hasPhoto ? ImageIcon : CarFront;
  return (
    <div className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-[var(--admin-radius-control)] border border-dashed border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-3 text-center text-xs text-[var(--admin-text-muted)]">
      <Icon className="size-6" aria-hidden="true" />
      {model.hasPhoto ? list.photoStored : list.photoFallback}
    </div>
  );
}

function listColumns(modelHref: (modelId: string) => string): AdminColumn<ModelView>[] {
  return [
    {
      id: "model", header: dict.colModel, rowHeader: true, sortValue: modelName,
      cell: (model) => (
        <>
          <Link href={modelHref(model.id)} className="font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{model.displayName}</Link>
          {model.variant ? <Meta>{model.variant}</Meta> : null}
        </>
      ),
    },
    { id: "brand", header: dict.colBrand, sortValue: (model) => model.brandName, cell: (model) => model.brandName },
    { id: "exhibitor", header: list.colExhibitor, sortValue: (model) => model.exhibitorName, cell: (model) => model.exhibitorName },
    { id: "stand", header: list.colStand, hideBelow: "2xl", sortValue: (model) => model.standLabel, cell: (model) => <span className="text-xs">{model.standLabel}</span> },
    { id: "package", header: dict.colPackage, sortValue: (model) => FAIR_PACKAGE_TIERS.indexOf(model.tier), cell: (model) => <TierBadge model={model} /> },
    { id: "status", header: dict.colStatus, sortValue: (model) => dict.modelStatus[model.status], cell: (model) => <StatusBadge model={model} /> },
    { id: "qr", header: dict.colQr, sortValue: (model) => model.qrSmq ?? model.qrCode, cell: (model) => <QrCell model={model} /> },
    { id: "problems", header: list.colProblems, sortValue: (model) => { const { errors, warnings } = issueCounts(model); return errors * 1000 + warnings; }, cell: (model) => <ProblemsCell model={model} /> },
    { id: "photo", header: list.colPhoto, sortValue: (model) => (model.hasPhoto ? 1 : 0), cell: (model) => (model.hasPhoto ? list.photoYes : <span className="text-[var(--admin-text-muted)]">{list.photoNo}</span>) },
  ];
}

export type EventModelsViewProps = {
  catalog: CatalogView;
  /** The query string of the page (filters and `prikaz`). */
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  /** Detail link; the container keeps the list filters in it. */
  modelHref: (modelId: string) => string;
  importHref: string;
};

export function EventModelsView({ catalog, query, onQueryChange, modelHref, importHref }: EventModelsViewProps) {
  const models = catalog.models;
  const hierarchy = useMemo(() => modelHierarchy(models, modelName), [models]);
  const filtered = applyModelFilters(models, query);
  const groups = modelGroups(filtered);
  const counted = hierarchyCountedIds(models, query);
  const counts = modelFacetCounts(models, query);
  const value: HierarchyValue = { exhibitorId: query.izlagac, brandId: query.brend, modelId: query.model };
  const columns = useMemo(() => listColumns(modelHref), [modelHref]);

  if (!models.length) {
    return (
      <Section title={dict.sectionLabels.modeli}>
        <div className="grid justify-items-center gap-2 pb-4">
          <AdminEmptyState title={list.emptyTitle} body={list.emptyBody} className="min-h-40" />
          <Link href={importHref} className={adminPrimaryButtonClass}>{list.emptyAction}</Link>
        </div>
      </Section>
    );
  }

  const facets: AdminFilterFacet[] = MODEL_FACETS.map((facet) => ({
    id: facet,
    label: list.facets[facet],
    options: MODEL_FACET_VALUES[facet].map((option) => ({ value: option, label: facetLabel(facet, option), count: counts[facet][option] })),
  }));
  const chips: AdminFilterChip[] = [];
  const exhibitor = hierarchy.exhibitors.find((row) => row.id === query.izlagac);
  const brand = hierarchy.brands.find((row) => row.id === query.brend);
  const model = hierarchy.models.find((row) => row.id === query.model);
  if (exhibitor) chips.push({ id: "izlagac", label: `${dict.colExhibitor}: ${exhibitor.label}`, onRemove: () => onQueryChange({ izlagac: null, brend: null, model: null }) });
  if (brand) chips.push({ id: "brend", label: `${dict.colBrand}: ${brand.label}`, onRemove: () => onQueryChange({ brend: null, model: null }) });
  if (model) chips.push({ id: "model", label: `${dict.colModel}: ${model.label}`, onRemove: () => onQueryChange({ model: null }) });
  if (query.q) chips.push({ id: "q", label: fmt(list.searchChip, { q: query.q }), onRemove: () => onQueryChange({ q: null }) });
  for (const facet of MODEL_FACETS) {
    const selected = query[facet];
    if (selected && MODEL_FACET_VALUES[facet].includes(selected)) {
      chips.push({ id: facet, label: `${list.facets[facet]}: ${facetLabel(facet, selected)}`, onRemove: () => onQueryChange({ [facet]: null }) });
    }
  }
  const clear = () => onQueryChange(clearModelFiltersPatch());

  return (
    <div className="grid min-w-0 gap-4">
      <AdminFilterBar
        label={list.hierarchyLabel}
        search={{ value: query.q ?? "", onChange: (q) => onQueryChange({ q: q || null }), label: list.searchLabel, placeholder: list.searchPlaceholder }}
        hierarchy={
          <AdminHierarchyPicker
            data={hierarchy}
            value={value}
            counted={counted}
            label={list.hierarchyLabel}
            onChange={(next) => onQueryChange({ izlagac: next.exhibitorId ?? null, brend: next.brandId ?? null, model: next.modelId ?? null })}
          />
        }
        facets={facets}
        values={query}
        onFacetChange={(id, next) => onQueryChange({ [id]: next ?? null })}
        chips={chips}
        onClear={clear}
      />
      <Section title={dict.sectionLabels.modeli}>
        <AdminDataView
          listKey="dogadjaji.modeli"
          caption={dict.sectionLabels.modeli}
          rows={filtered}
          getRowId={(row) => row.id}
          columns={columns}
          tableClassName="min-w-[64rem]"
          toolbar={<p className="text-sm font-semibold" role="status" aria-live="polite">{fmt(list.count, { shown: filtered.length, total: models.length })}</p>}
          groupBy={groups ? {
            key: modelGroupKey,
            label: (_key, rows) => (
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span>{fmt(list.groupLabel, { exhibitor: rows[0].exhibitorName, brand: rows[0].brandName })}</span>
                <span className="font-normal text-[var(--admin-text-muted)]">{fmt(list.groupCount, { count: rows.length })}</span>
              </span>
            ),
          } : undefined}
          empty={
            <div className="grid justify-items-center gap-2 pb-4">
              <AdminEmptyState title={list.noMatchTitle} body={list.noMatchBody} className="min-h-40" />
              <button type="button" onClick={clear} className={adminSecondaryButtonClass}>{adminUiSr.filters.clear}</button>
            </div>
          }
          renderCard={(row) => (
            <>
              <ModelPhoto model={row} />
              <AdminDataCard
                title={<Link href={modelHref(row.id)} className="underline-offset-4 hover:underline">{modelName(row)}</Link>}
                subtitle={`${row.brandName} · ${row.exhibitorName} · ${row.standLabel}`}
                badges={<><TierBadge model={row} /><StatusBadge model={row} /><ProblemsCell model={row} /></>}
                fields={[{ label: dict.colQr, value: <QrCell model={row} /> }]}
              />
            </>
          )}
          rowActions={(row) => (
            <Link href={modelHref(row.id)} aria-label={fmt(list.openAria, { model: modelName(row) })} className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}>{list.open}</Link>
          )}
        />
      </Section>
    </div>
  );
}

function facetLabel(facet: ModelFacet, value: string): string {
  return (list.values[facet] as Record<string, string>)[value] ?? value;
}

// -----------------------------------------------------------------------------
// modeli/[modelId]: detail
// -----------------------------------------------------------------------------

/** Linked summaries of one model; a missing field is still loading. */
export type ModelDetailSummary = {
  questions?: { dayLabel: string; published: number; draft: number; closed: number }[];
  survey?: { version: number; status: FairSurveyStatus } | null;
  /** A7: `hidden` = the admin hid the brand passport from visitors. */
  passport?: { status: FairPassportConfigStatus; member: boolean; hidden?: boolean } | null;
  forms?: { interest: boolean; testDrive: boolean };
  leads?: { interest: number; testDrive: number; undelivered: number; capped: boolean };
  sponsored?: { state: "active"; order: number } | { state: "candidate" } | { state: "none" };
};

export type ModelDetailActions = Pick<EventsActions, "publish" | "withdraw" | "upgrade" | "assignQr" | "resolveTest"> & {
  /** N2 — the typed sticker (label, SMQ or code) before the confirmation step (fairAdminQr.getQrDetail); null = not in the inventory. */
  lookupQr?: (code: string) => Promise<Result<QrDetailView | null>>;
};

export type EventModelDetailViewProps = {
  catalog: CatalogView;
  modelId: string;
  actions: ModelDetailActions;
  /** The list filters: prethodni / sledeći move inside them. */
  query: AdminQueryState;
  /** The list with its filters (Nazad na listu). */
  listHref: string;
  /** Another model's detail, keeping the list filters. */
  modelHref: (modelId: string) => string;
  qrHref: (code: string) => string;
  sectionHref: (path: EventSectionPath, query?: AdminQueryState) => string;
  /** Izlagači 2026 — the exhibitor's Interakcije page at one part (`#glas-publike`…) with that part's keys. */
  interactionHref: (participationId: string, part: InteractionPart, query?: AdminQueryState) => string;
  summary?: ModelDetailSummary;
};

export function EventModelDetailView({ catalog, modelId, actions, query, listHref, modelHref, qrHref, sectionHref, interactionHref, summary = {} }: EventModelDetailViewProps) {
  const model = catalog.models.find((row) => row.id === modelId) ?? null;
  const [message, setMessage] = useState<EventMessage>(null);
  const [pending, setPending] = useState(false);
  const [target, setTarget] = useState<FairPackageTier | "">("");
  const [confirming, setConfirming] = useState(false);
  const higher = model ? FAIR_PACKAGE_TIERS.slice(FAIR_PACKAGE_TIERS.indexOf(model.tier) + 1) : [];
  const effectiveTarget = target && higher.includes(target) ? target : higher[0] ?? "";
  const position = adjacentModels(applyModelFilters(catalog.models, query), modelId);

  async function run(action: () => Promise<Outcome>, success: string, after?: () => void) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.ok ? { tone: "ok", text: success, issues: outcome.warnings?.length ? outcome.warnings : undefined } : { tone: "error", text: issueText(outcome.code), issues: outcome.issues });
      if (outcome.ok) after?.();
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  if (!model) {
    return (
      <div className="grid min-w-0 gap-4">
        <BackLink href={listHref} label={dict.backToList} />
        <AdminPanel><AdminEmptyState title={dict.detailModelTitle} body={dict.modelNotFoundBody} /></AdminPanel>
      </div>
    );
  }

  const name = modelName(model);
  const errors = model.issues.some((issue) => issue.severity === "error");
  return (
    <div className="grid min-w-0 gap-5">
      <nav aria-label={dict.detailModelTitle} className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <BackLink href={listHref} label={dict.backToList} />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--admin-text-muted)]">
            {position.index >= 0 ? fmt(detail.position, { index: position.index + 1, total: position.total }) : detail.notInFilter}
          </span>
          <NeighbourLink model={position.previous} href={modelHref} label={detail.previous} aria={detail.previousAria} icon={<ChevronLeft className="size-4" aria-hidden="true" />} />
          <NeighbourLink model={position.next} href={modelHref} label={detail.next} aria={detail.nextAria} icon={<ChevronRight className="size-4" aria-hidden="true" />} after />
        </div>
      </nav>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="grid min-w-0 gap-5">
          <Section title={name} action={<span className="flex flex-wrap gap-2"><TierBadge model={model} /><StatusBadge model={model} /></span>}>
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label={dict.colBrand} value={`${model.brandName} · ${model.exhibitorName}`} />
              <Fact label={dict.fieldStand} value={model.standLabel} />
              <Fact label={dict.fieldPrice} value={model.priceText} />
              <Fact label={dict.fieldSpecifications} value={fmt(dict.specCount, { count: model.specCount, highlights: model.highlightCount })} />
              <Fact label={dict.fieldPhoto} value={model.hasPhoto ? dict.photoYes : dict.photoNo} />
              <Fact label={dict.fieldPackageSince} value={eventDateTime.format(model.packageActivatedAt)} />
              <Fact label={dict.fieldPassport} value={model.passportEligible ? dict.yes : dict.no} />
              <Fact label={dict.fieldExternalKey} value={<span className="font-mono text-xs">{model.externalKey}</span>} />
              <Fact label={dict.fieldSlug} value={<span className="font-mono text-xs">{model.slug}</span>} />
            </dl>
          </Section>
          <Section title={dict.validationTitle}>
            {model.issues.length ? (
              <div className="grid gap-3">
                <p className="text-sm text-[var(--admin-text-muted)]">{detail.validationExplain}</p>
                <IssueList issues={model.issues} />
              </div>
            ) : <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-[var(--admin-success)]" aria-hidden="true" />{dict.validationOk}</p>}
          </Section>
          <Section title={detail.publishTitle}>
            <p className="text-sm text-[var(--admin-text-muted)]">{detail.publishHelp}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={adminPrimaryButtonClass} disabled={pending || model.status === "published"} onClick={() => void run(() => actions.publish(model.id), dict.publishDone)}>{dict.publish}</button>
              <button type="button" className={adminSecondaryButtonClass} disabled={pending || model.status === "withdrawn"} onClick={() => void run(() => actions.withdraw(model.id), dict.withdrawDone)}>{dict.withdraw}</button>
            </div>
            {errors && model.status !== "published" ? <p className="mt-2 text-xs text-[var(--admin-text-muted)]">{dict.publishBlocked}</p> : null}
          </Section>
          <Section title={dict.upgradeTitle}>
            <p className="text-sm text-[var(--admin-text-muted)]">{dict.upgradeHelp}</p>
            {higher.length ? (
              confirming && effectiveTarget ? (
                <div className="mt-4 grid gap-3 rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-4">
                  <h3 className="font-semibold">{dict.upgradeConfirmTitle}</h3>
                  <p className="text-sm">{fmt(dict.upgradeConfirmBody, { model: model.displayName, from: dict.tiers[model.tier], to: dict.tiers[effectiveTarget] })}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" autoFocus className={adminPrimaryButtonClass} disabled={pending} onClick={() => void run(() => actions.upgrade(model.id, effectiveTarget), dict.upgradeDone)}>{dict.upgradeConfirm}</button>
                    <button type="button" className={adminSecondaryButtonClass} disabled={pending} onClick={() => setConfirming(false)}>{dict.cancel}</button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end sm:justify-start">
                  <label className="grid gap-1.5 text-sm font-semibold">{dict.upgradeTarget}
                    <select value={effectiveTarget} onChange={(event) => setTarget(event.target.value as FairPackageTier)} className={adminFieldClass}>
                      {higher.map((tier) => <option key={tier} value={tier}>{dict.tiers[tier]}</option>)}
                    </select>
                  </label>
                  <button type="button" className={adminSecondaryButtonClass} disabled={pending} onClick={() => setConfirming(true)}>{dict.upgradeStart}</button>
                </div>
              )
            ) : <p className="mt-3 text-sm">{dict.upgradeNone}</p>}
          </Section>
          <Section title={detail.qrTitle} action={model.qrCode ? <Link href={qrHref(model.qrCode)} className={adminSecondaryButtonClass}>{detail.qrOpen}</Link> : undefined}>
            {model.qrCode ? (
              <dl className="grid gap-4 sm:grid-cols-3">
                <Fact label={detail.qrLabel} value={<Link href={qrHref(model.qrCode)} className="font-mono text-base font-semibold underline underline-offset-4">{model.qrLabel ?? model.qrCode}</Link>} />
                <Fact label={detail.qrSmq} value={<span className="font-mono">{model.qrSmq ?? "—"}</span>} />
                <Fact label={detail.qrResolver} value={<span className="font-mono">{model.qrCode}</span>} />
              </dl>
            ) : catalog.qrConfigured ? (
              <ModelStickerForm
                model={model}
                actions={actions}
                pending={pending}
                onAssign={(code) => run(() => actions.assignQr(model.id, code), dict.assignDone)}
                linkHref={(kod) => sectionHref("povezi", { kod, izlagac: model.participationId, model: model.id })}
              />
            ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.qrNotConfigured}</p>}
          </Section>
          <Feedback message={message} />
          <ResolvePanel key={model.qrCode ?? ""} actions={actions} initialCode={model.qrCode ?? ""} help={detail.resolveHelp} />
        </div>
        <ModelSummary model={model} summary={summary} sectionHref={sectionHref} interactionHref={interactionHref} />
      </div>
    </div>
  );
}

export type StickerStep =
  | { kind: "edit" }
  | { kind: "finding" }
  /** `sticker` = what getQrDetail found; "unknown" = no lookup available (the typed code is named as typed). */
  | { kind: "confirm"; code: string; sticker: QrDetailView | "unknown" };

/**
 * N2 — „Štampani kod“ of a car without a sticker: the label (`7`, `SA26-007`),
 * SMQ or resolver code, then a confirmation step that names the sticker, the
 * car and the exhibitor before assignQr. A sticker on another car, of the
 * other event or a panel is not assigned here (moving goes through „Poveži
 * nalepnicu“, which asks for the holder).
 */
export function ModelStickerForm({ model, actions, pending, onAssign, linkHref, initialStep }: {
  model: ModelView;
  actions: ModelDetailActions;
  pending: boolean;
  onAssign: (code: string) => Promise<void>;
  linkHref: (kod: string) => string;
  /** Tests: start in this step. */
  initialStep?: StickerStep;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  const [step, setStep] = useState<StickerStep>(initialStep ?? { kind: "edit" });
  const [problem, setProblem] = useState<string | null>(null);

  async function review() {
    const text = code.trim();
    if (!text) return;
    setProblem(null);
    if (!actions.lookupQr) return setStep({ kind: "confirm", code: text, sticker: "unknown" });
    setStep({ kind: "finding" });
    const found = await actions.lookupQr(text);
    if (!found.ok || !found.value) {
      setStep({ kind: "edit" });
      setProblem(issueText(found.ok ? "FAIR_QR_NOT_FOUND" : found.code));
      return;
    }
    setStep({ kind: "confirm", code: text, sticker: found.value });
  }

  if (step.kind === "confirm") {
    const sticker = step.sticker === "unknown" ? null : step.sticker;
    const name = sticker ? sticker.label ?? sticker.smqCode ?? sticker.resolverCode : step.code.toUpperCase();
    const current = sticker?.current ?? null;
    const block = sticker?.kind === "panel" ? detail.qrPanel
      : current && !current.sameEvent ? detail.qrTakenOther
      : current && current.eventModelId !== model.id ? fmt(detail.qrTaken, { model: current.modelLabel ?? "—" })
      : null;
    return (
      <div role="group" aria-labelledby={`${id}-title`} data-sticker-confirm className="grid gap-3 rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-4">
        <h3 id={`${id}-title`} className="font-semibold">{detail.qrConfirmTitle}</h3>
        {block ? (
          <p className="text-sm font-semibold text-[var(--admin-danger)]">{block}</p>
        ) : (
          <p className="text-sm break-words">{fmt(detail.qrConfirmBody, { sticker: name, model: modelName(model), exhibitor: model.exhibitorName, stand: model.standLabel })}</p>
        )}
        {!block && model.status === "draft" ? <p className="text-sm">{detail.qrConfirmDraft}</p> : null}
        <div className="flex flex-wrap gap-2">
          {block ? (
            sticker && sticker.kind !== "panel" && current?.sameEvent ? <Link href={linkHref(sticker.resolverCode)} className={adminPrimaryButtonClass}>{detail.qrOpenLink}</Link> : null
          ) : (
            <button type="button" autoFocus className={adminPrimaryButtonClass} disabled={pending} aria-busy={pending || undefined} onClick={() => void onAssign(sticker?.resolverCode ?? step.code).then(() => setStep({ kind: "edit" }))}>{detail.qrConfirm}</button>
          )}
          <button type="button" className={adminSecondaryButtonClass} disabled={pending} onClick={() => setStep({ kind: "edit" })}>{dict.cancel}</button>
        </div>
      </div>
    );
  }

  const finding = step.kind === "finding";
  return (
    <form className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end sm:justify-start" onSubmit={(event) => { event.preventDefault(); void review(); }}>
      <p className="text-sm text-[var(--admin-text-muted)] sm:col-span-2">{detail.qrNone}</p>
      <label className="grid gap-1.5 text-sm font-semibold">{dict.assignCode}
        <input value={code} onChange={(event) => { setCode(event.target.value); setProblem(null); }} placeholder={dict.assignCodePlaceholder} autoComplete="off" spellCheck={false} aria-describedby={`${id}-help`} className={cn(adminTouchFieldClass, "font-mono uppercase placeholder:font-sans placeholder:normal-case")} />
      </label>
      <button type="submit" className={adminPrimaryButtonClass} disabled={pending || finding || !code.trim()} aria-busy={finding || undefined}>{finding ? detail.qrFinding : dict.assignSubmit}</button>
      <p id={`${id}-help`} className="text-xs text-[var(--admin-text-muted)] sm:col-span-2">{detail.qrCodeHelp}</p>
      {problem ? <p role="alert" className="text-sm font-semibold text-[var(--admin-danger)] sm:col-span-2">{problem}</p> : null}
    </form>
  );
}

function NeighbourLink({ model, href, label, aria, icon, after = false }: {
  model: ModelView | null;
  href: (modelId: string) => string;
  label: string;
  aria: string;
  icon: ReactNode;
  after?: boolean;
}) {
  const className = cn(adminSecondaryButtonClass, "min-h-9 px-3");
  const content = <>{after ? null : icon}{label}{after ? icon : null}</>;
  if (!model) return <span aria-disabled="true" className={cn(className, "opacity-50")}>{content}</span>;
  return <Link href={href(model.id)} aria-label={fmt(aria, { model: modelName(model) })} className={className}>{content}</Link>;
}

function ModelSummary({ model, summary, sectionHref, interactionHref }: { model: ModelView; summary: ModelDetailSummary; sectionHref: EventModelDetailViewProps["sectionHref"]; interactionHref: EventModelDetailViewProps["interactionHref"] }) {
  const advanced = model.tier === "advanced";
  const loading = <p className="text-sm text-[var(--admin-text-muted)]">{dict.loading}</p>;
  const line = (text: string) => <p className="text-sm">{text}</p>;
  const muted = (text: string) => <p className="text-sm text-[var(--admin-text-muted)]">{text}</p>;
  const rows: { id: string; title: string; href: string; body: ReactNode }[] = [
    {
      id: "questions", title: detail.questions, href: interactionHref(model.participationId, "glas-publike", { model: model.id }),
      body: model.tier === "included" ? muted(detail.starterOnly) : !summary.questions ? loading : summary.questions.length
        ? <ul className="grid gap-1 text-sm">{summary.questions.map((day) => <li key={day.dayLabel}>{fmt(detail.questionsDay, { day: day.dayLabel, published: day.published, draft: day.draft, closed: day.closed })}</li>)}</ul>
        : muted(detail.questionsNone),
    },
    {
      id: "survey", title: detail.survey, href: interactionHref(model.participationId, "ankete", { anketa: model.id }),
      body: !advanced ? muted(detail.advancedOnly) : summary.survey === undefined ? loading : summary.survey
        ? line(fmt(detail.surveyVersion, { version: summary.survey.version, status: dict.surveyStatus[summary.survey.status] }))
        : muted(detail.surveyNone),
    },
    {
      id: "passport", title: detail.passport, href: interactionHref(model.participationId, "pasos", { brend: model.brandId }),
      body: summary.passport === undefined ? loading : summary.passport
        ? line(fmt(summary.passport.member ? detail.passportMember : detail.passportNotMember, { status: summary.passport.hidden ? dict.passportAuto.states.hidden : dict.passportStatus[summary.passport.status] }))
        : muted(detail.passportNone),
    },
    {
      id: "forms", title: detail.forms, href: interactionHref(model.participationId, "forme", { forma: model.id }),
      body: !summary.forms ? loading : (
        <ul className="grid gap-1 text-sm">
          <li>{detail.formInterest}: {model.tier === "included" ? detail.formNotInPackage : summary.forms.interest ? detail.formOn : detail.formOff}</li>
          <li>{detail.formTestDrive}: {!advanced ? detail.formNotInPackage : summary.forms.testDrive ? detail.formOn : detail.formOff}</li>
        </ul>
      ),
    },
    {
      id: "leads", title: detail.leads, href: sectionHref("leadovi", { izlagac: model.participationId }),
      body: !summary.leads ? loading : (
        <>
          {line(fmt(detail.leadsValue, { interest: summary.leads.interest, testDrive: summary.leads.testDrive, undelivered: summary.leads.undelivered }))}
          {summary.leads.capped ? muted(detail.leadsCapped) : null}
        </>
      ),
    },
    {
      id: "sponsored", title: detail.sponsored, href: sectionHref("sponzorisano"),
      body: !summary.sponsored ? loading : summary.sponsored.state === "active"
        ? line(fmt(detail.sponsoredActive, { order: summary.sponsored.order }))
        : summary.sponsored.state === "candidate" ? line(detail.sponsoredCandidate) : muted(detail.sponsoredNone),
    },
  ];
  return (
    <Section title={detail.summaryTitle}>
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.id} className="grid min-w-0 gap-1.5 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{row.title}</h3>
              <Link href={row.href} aria-label={fmt(detail.summaryOpenAria, { section: row.title })} className="shrink-0 text-xs font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{detail.summaryOpen}</Link>
            </div>
            {row.body}
          </li>
        ))}
      </ul>
    </Section>
  );
}
