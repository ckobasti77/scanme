"use client";

import { Eye, Info, RefreshCw, Snowflake, TriangleAlert } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { ConfirmAction, interactionCodeText } from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  AdminFilterBar,
  adminSecondaryButtonClass,
  type AdminColumn,
  type AdminFilterChip,
  type AdminFilterFacet,
} from "@/components/admin/admin-ui";
import { eventDateTime, Feedback, Meta, Section, type EventMessage } from "@/components/admin/events/event-ui";
import {
  applyPassportFilters,
  clearPassportFiltersPatch,
  PASSPORT_STATE_OF_PARAM,
  PASSPORT_STATE_VALUES,
  passportStateCounts,
  type PassportRow,
  type PassportState,
  type PassportStateParam,
} from "@/lib/admin-v1/passport-overview";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A7 — `interakcije/pasos` (ADMIN-UX §6 Pasoš brenda, MASTER §11):
// the passport appears by itself for every brand that meets the condition.
// Per brand: the condition and why it is not met, the state (Aktivan /
// Zamrznut / Sakriven / Nema uslov / Nije napravljen) and the models in the
// passport. Actions: Sakrij / Prikaži, the B3 emergency removal of a
// withdrawn car and "Osveži pasoše". Presentational; data and actions come
// from interakcije-section.tsx (convex/fairPassports.ts).

const p = dict.passportAuto;
/** convex/lib/fairInteractions PASSPORT_MODELS_CAP — above it the sync does not build a passport. */
const PASSPORT_MODELS_MAX = 40;

export type PassportSyncSummary = { created: number; updated: number; withdrawn: number; unchanged: number; frozen: number; too_many_models: number };
export type PassportsOutcome = { ok: true; summary?: PassportSyncSummary } | { ok: false; code: string };
export type PassportsActions = {
  refresh: () => Promise<PassportsOutcome>;
  setHidden: (passportId: string, hidden: boolean) => Promise<PassportsOutcome>;
  removeModel: (passportId: string, modelId: string) => Promise<PassportsOutcome>;
};

export type EventPassportsViewProps = {
  /** buildPassportRows(getPassportOverview, names, now); undefined = loading. */
  rows: PassportRow[] | undefined;
  eventStartsAt: number | undefined;
  exhibitors: { id: string; name: string }[];
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  actions: PassportsActions;
  /** Izlagači 2026: on one exhibitor's page (`rows` are its brands) — no exhibitor filter. */
  scoped?: boolean;
};

type Tone = ComponentProps<typeof AdminStatus>["tone"];
const STATE_TONE: Record<PassportState, Tone> = { active: "active", frozen: "active", hidden: "muted", not_eligible: "neutral", missing: "waiting" };

function usePassportRunner() {
  const [message, setMessage] = useState<EventMessage>(null);
  const [pending, setPending] = useState(false);
  async function run(action: () => Promise<PassportsOutcome>, success: (outcome: Extract<PassportsOutcome, { ok: true }>) => string) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.ok ? { tone: "ok", text: success(outcome) } : { tone: "error", text: interactionCodeText(outcome.code) });
    } finally {
      setPending(false);
    }
  }
  return { message, pending, run };
}
type Runner = ReturnType<typeof usePassportRunner>;

function problemText(problem: PassportRow["problems"][number], exhibited: number) {
  if (problem.code === "fewer_than_two_models" && problem.count === 0) return p.noExhibited;
  return fmt(p.problems[problem.code], { count: problem.count, total: exhibited });
}

function stateHint(row: PassportRow): string | null {
  switch (row.state) {
    case "active": return fmt(p.hintActive, { date: eventDateTime.format(row.freezesAt) });
    case "frozen": return fmt(p.hintFrozen, { date: eventDateTime.format(row.freezesAt) });
    case "hidden": return p.hintHidden;
    case "not_eligible": return row.passportStatus === "withdrawn" ? p.hintWithdrawn : null;
    case "missing": return row.frozen ? p.hintMissingAfter : p.hintMissingBefore;
  }
}

function ConditionBadge({ row }: { row: PassportRow }) {
  return <AdminStatus label={row.eligible ? p.conditionMet : p.conditionNotMet} tone={row.eligible ? "active" : "neutral"} />;
}

function ConditionReasons({ row }: { row: PassportRow }) {
  if (row.tooManyModels) return <Meta>{fmt(p.tooManyModels, { max: PASSPORT_MODELS_MAX })}</Meta>;
  if (!row.problems.length) return null;
  return <ul className="grid gap-0.5">{row.problems.map((problem) => <li key={problem.code}><Meta>{problemText(problem, row.exhibited)}</Meta></li>)}</ul>;
}

function StateBadge({ row }: { row: PassportRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <AdminStatus label={p.states[row.state]} tone={STATE_TONE[row.state]} />
      {row.state === "frozen" ? <Snowflake className="size-3.5 text-[var(--admin-text-muted)]" aria-hidden="true" /> : null}
    </span>
  );
}

function StateDetail({ row }: { row: PassportRow }) {
  const hint = stateHint(row);
  return (
    <>
      {hint ? <Meta>{hint}</Meta> : null}
      {row.blockingCount ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-[var(--admin-danger)]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {fmt(p.blocking, { count: row.blockingCount })}
        </p>
      ) : null}
    </>
  );
}

function Members({ row, runner, actions }: { row: PassportRow; runner: Runner; actions: PassportsActions }) {
  if (!row.members.length) return <span className="text-sm text-[var(--admin-text-muted)]">{p.noMembers}</span>;
  return (
    <ul className="grid gap-1.5" aria-label={fmt(p.membersCount, { required: row.requiredCount })}>
      {row.members.map((member) => (
        <li key={member.modelId} className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
          <span className={cn("min-w-0 break-words", member.status === "removed" && "text-[var(--admin-text-muted)]")}>{member.modelName}</span>
          {member.status === "removed" ? <AdminStatus label={member.removedByAdmin ? p.memberRemovedByAdmin : dict.passportMemberStatus.removed} tone="muted" /> : null}
          {member.blocking ? <AdminStatus label={p.memberWithdrawn} tone="problem" /> : null}
          {member.blocking && row.passportId ? (
            <ConfirmAction
              label={dict.passportRemoveModel}
              ariaLabel={`${dict.passportRemoveModel}: ${member.modelName}`}
              body={fmt(dict.passportRemoveConfirm, { model: member.modelName })}
              disabled={runner.pending}
              onConfirm={() => void runner.run(() => actions.removeModel(row.passportId!, member.modelId), () => dict.passportRemoved)}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function VisibilityAction({ row, runner, actions }: { row: PassportRow; runner: Runner; actions: PassportsActions }) {
  if (!row.passportId) return null;
  const passportId = row.passportId;
  // Only a published passport is visible, so only that one can be hidden; a hidden one can always be shown.
  if (row.hiddenAt !== undefined) {
    return (
      <button
        type="button"
        className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}
        aria-label={fmt(p.showAria, { brand: row.brandName })}
        disabled={runner.pending}
        onClick={() => void runner.run(() => actions.setHidden(passportId, false), () => p.shown)}
      >
        <Eye className="size-4" aria-hidden="true" />
        {p.show}
      </button>
    );
  }
  if (row.passportStatus !== "published") return null;
  return (
    <ConfirmAction
      label={p.hide}
      ariaLabel={fmt(p.hideAria, { brand: row.brandName })}
      body={fmt(p.hideConfirm, { brand: row.brandName })}
      disabled={runner.pending}
      onConfirm={() => void runner.run(() => actions.setHidden(passportId, true), () => p.hidden)}
    />
  );
}

function passportColumns(runner: Runner, actions: PassportsActions): AdminColumn<PassportRow>[] {
  return [
    {
      id: "brand", header: p.colBrand, rowHeader: true, width: "11rem", sortValue: (row) => row.brandName,
      cell: (row) => <><strong className="block font-semibold">{row.brandName}</strong><Meta>{row.exhibitorName}</Meta></>,
    },
    {
      id: "condition", header: p.colCondition, sortValue: (row) => (row.eligible ? 0 : 1),
      cell: (row) => <span className="grid justify-items-start gap-1"><ConditionBadge row={row} /><ConditionReasons row={row} /></span>,
    },
    {
      id: "state", header: p.colState, sortValue: (row) => p.states[row.state],
      cell: (row) => <span className="grid justify-items-start gap-1"><StateBadge row={row} /><StateDetail row={row} /></span>,
    },
    { id: "members", header: p.colMembers, sortValue: (row) => row.requiredCount, cell: (row) => <Members row={row} runner={runner} actions={actions} /> },
  ];
}

export function EventPassportsView({ rows, eventStartsAt, exhibitors, query, onQueryChange, actions, scoped = false }: EventPassportsViewProps) {
  const runner = usePassportRunner();
  const all = rows ?? [];
  const filtered = rows ? applyPassportFilters(rows, query) : undefined;
  const counts = passportStateCounts(all, query);
  const brandName = query.brend ? all.find((row) => row.brandId === query.brend)?.brandName : undefined;

  const facets: AdminFilterFacet[] = [
    ...(scoped ? [] : [{ id: "izlagac", label: p.facetExhibitor, options: exhibitors.map((row) => ({ value: row.id, label: row.name })) }]),
    { id: "stanje", label: p.facetState, options: PASSPORT_STATE_VALUES.map((value) => ({ value, label: p.states[PASSPORT_STATE_OF_PARAM[value]], count: counts[value] })) },
  ];
  const chips: AdminFilterChip[] = [];
  const exhibitor = query.izlagac && !scoped ? exhibitors.find((row) => row.id === query.izlagac) : undefined;
  if (exhibitor) chips.push({ id: "izlagac", label: `${p.facetExhibitor}: ${exhibitor.name}`, onRemove: () => onQueryChange({ izlagac: null }) });
  if (brandName) chips.push({ id: "brend", label: fmt(p.brandChip, { brand: brandName }), onRemove: () => onQueryChange({ brend: null }) });
  if (query.stanje && (PASSPORT_STATE_VALUES as readonly string[]).includes(query.stanje)) {
    chips.push({ id: "stanje", label: `${p.facetState}: ${p.states[PASSPORT_STATE_OF_PARAM[query.stanje as PassportStateParam]]}`, onRemove: () => onQueryChange({ stanje: null }) });
  }
  const clear = () => onQueryChange(clearPassportFiltersPatch());

  return (
    <div className="grid min-w-0 gap-4">
      {all.length ? (
        <AdminFilterBar
          label={p.filterLabel}
          facets={facets}
          values={scoped ? { stanje: query.stanje } : { izlagac: query.izlagac, stanje: query.stanje }}
          onFacetChange={(id, next) => onQueryChange({ [id]: next ?? null })}
          chips={chips}
          onClear={clear}
        />
      ) : null}
      <Section
        title={dict.interactionSections.pasos}
        action={(
          <button
            type="button"
            className={cn(adminSecondaryButtonClass, "min-h-10 px-3")}
            disabled={runner.pending}
            onClick={() => void runner.run(actions.refresh, (outcome) => {
              const summary = outcome.summary ?? { created: 0, updated: 0, withdrawn: 0, unchanged: 0, frozen: 0, too_many_models: 0 };
              return fmt(p.refreshDone, { created: summary.created, updated: summary.updated, withdrawn: summary.withdrawn, unchanged: summary.unchanged, frozen: summary.frozen });
            })}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {p.refresh}
          </button>
        )}
      >
        <p className="mb-3 max-w-3xl text-sm text-[var(--admin-text-muted)]">{p.help}</p>
        <div className="mb-4 grid gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3 text-sm sm:p-4">
          <p className="flex items-center gap-2 font-semibold"><Info className="size-4 shrink-0" aria-hidden="true" />{p.explainTitle}</p>
          <ul className="grid list-disc gap-1.5 pl-6 text-[var(--admin-text-muted)]">
            <li>{fmt(p.explainAuto, { date: eventStartsAt !== undefined ? eventDateTime.format(eventStartsAt) : "—" })}</li>
            <li>{p.explainFreeze}</li>
            <li>{p.explainHide}</li>
          </ul>
        </div>
        <Feedback message={runner.message} />
        <AdminDataView
          className="mt-3"
          listKey="dogadjaji.pasos"
          caption={dict.passportsTitle}
          rows={filtered}
          loadingLabel={dict.loading}
          getRowId={(row) => row.brandId}
          columns={passportColumns(runner, actions)}
          tableClassName="min-w-[56rem]"
          toolbar={rows ? <p className="text-sm font-semibold" role="status" aria-live="polite">{fmt(p.count, { shown: filtered?.length ?? 0, total: all.length })}</p> : undefined}
          empty={all.length ? (
            <div className="grid justify-items-center gap-2 pb-4">
              <AdminEmptyState title={p.noMatchTitle} body={p.noMatchBody} className="min-h-40" />
              <button type="button" onClick={clear} className={adminSecondaryButtonClass}>{adminUiSr.filters.clear}</button>
            </div>
          ) : { title: dict.passportsTitle, body: dict.passportsEmpty }}
          renderCard={(row) => (
            <AdminDataCard
              title={row.brandName}
              subtitle={row.exhibitorName}
              badges={<><ConditionBadge row={row} /><StateBadge row={row} /></>}
            >
              <ConditionReasons row={row} />
              <StateDetail row={row} />
              <div className="grid gap-1.5 border-t border-[var(--admin-border)] pt-2">
                <span className="text-xs font-semibold text-[var(--admin-text-muted)]">{p.colMembers}</span>
                <Members row={row} runner={runner} actions={actions} />
              </div>
            </AdminDataCard>
          )}
          rowActions={(row) => <VisibilityAction row={row} runner={runner} actions={actions} />}
        />
      </Section>
    </div>
  );
}
