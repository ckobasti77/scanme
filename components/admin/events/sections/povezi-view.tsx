"use client";

import { ArrowRight, Check, CircleAlert, RotateCcw, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  issueText,
  type CatalogView,
  type LinkStickerActions,
  type ModelView,
  type QrDetailView,
  type RecentLinkView,
} from "@/components/admin/admin-events";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { adminPrimaryButtonClass, adminSecondaryButtonClass, adminTouchFieldClass } from "@/components/admin/admin-ui";
import { eventDateTime, modelName, modelTone } from "@/components/admin/events/event-ui";
import { ExhibitorLogo } from "@/components/admin/events/exhibitor-identity";
import {
  exhibitorCars,
  filterLinkExhibitors,
  isQrConflict,
  LINK_FLOW_START,
  linkExhibitors,
  linkFlowReducer,
  linkPlan,
  nextStickerLabel,
  stickerCodeFromInput,
  stickerNumberOf,
  type LinkExhibitor,
  type LinkFlow,
  type LinkPlan,
  type LinkStickerFacts,
} from "@/lib/admin-v1/qr-link";
import { qrPrintedLabel } from "@/lib/admin-v1/qr-filters";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import type { FairQrLabelFormat } from "@/lib/fair-qr-label";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import type { AdminEventsResolveProblem } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

// Sajam 2026 N2 — `povezi`: „Poveži nalepnicu“ on the fair floor, a phone
// in one hand. 1) the sticker number (fixed series prefix, numeric keypad,
// 16 px+), its state; 2) the exhibitor (logo, name, stand; stand order,
// search); 3) the car (status, its sticker); a sticky confirmation bar with
// every warning before the one main button; after the save a green summary
// with „Poništi“ and „Sledeća“ (keeps the exhibitor); „Poslednje veze“ with
// undo. The sticker, the exhibitor and the car live in the query string
// (`kod`, `izlagac`, `model`), so the /r/ admin shortcut and „Sledeća“ open
// the right state. Presentational: the container passes Convex data and the
// fairAdminQr.linkSticker / undoLink actions, the dev preview TEST fixtures.

const t = dict.linkSticker;

function problemText(code: string) {
  return code in dict.resolveProblems ? dict.resolveProblems[code as AdminEventsResolveProblem] : fmt(dict.unknownProblem, { code });
}

/** A channel out of service for a reason that is not its destination (lib/admin-v1/qr-filters.ts qrStateOf: neaktivan). */
function outOfService(detail: QrDetailView) {
  return detail.channelState === "inactive" || (detail.channelState === "problem" && Boolean(detail.problemReason) && !detail.problemReason!.startsWith("destination_"));
}

export function stickerFacts(detail: QrDetailView): LinkStickerFacts {
  return {
    resolverCode: detail.resolverCode,
    label: qrPrintedLabel(detail),
    kind: detail.kind ?? "sticker",
    holder: detail.current ? { modelId: detail.current.eventModelId, sameEvent: detail.current.sameEvent } : null,
    outOfService: !detail.current && outOfService(detail),
  };
}

function standText(model: ModelView) {
  return model.standLabel;
}

export type EventLinkStickerViewProps = {
  catalog: CatalogView;
  /** The inventory's sticker series (fairAdminQr.listRecentLinks `labelFormat`). */
  labelFormat: FairQrLabelFormat;
  /** `kod`, `izlagac`, `model`. */
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  /** getQrDetail of `kod`: undefined = loading (or no `kod`), null = not in this event's inventory. */
  sticker: QrDetailView | null | undefined;
  stickerFailed?: boolean;
  /** fairAdminQr.listRecentLinks; undefined = loading. */
  recent: RecentLinkView[] | undefined;
  actions: LinkStickerActions;
  /** After a save, an undo or a conflict: the container reads the sticker again. */
  onChanged?: () => void;
  /** The QR detail of a code. */
  qrHref: (code: string) => string;
  /** Dev preview and tests: the step to start in. */
  initialFlow?: LinkFlow;
};

export function EventLinkStickerView({ catalog, labelFormat, query, onQueryChange, sticker, stickerFailed, recent, actions, onChanged, qrHref, initialFlow }: EventLinkStickerViewProps) {
  const [flow, dispatch] = useReducer(linkFlowReducer, initialFlow ?? LINK_FLOW_START);
  const [typed, setTyped] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const carStep = useRef<HTMLDivElement>(null);
  const shownExhibitor = useRef(query.izlagac);
  const modelsById = useMemo(() => new Map(catalog.models.map((model) => [model.id, model])), [catalog.models]);
  const exhibitors = useMemo(() => linkExhibitors(catalog.participations, catalog.stands, catalog.models), [catalog]);
  // One hand: a newly picked exhibitor (or „Sledeća“) brings its cars into view; never on the first render.
  useEffect(() => {
    if (query.izlagac === shownExhibitor.current) return;
    shownExhibitor.current = query.izlagac;
    if (!query.izlagac || !carStep.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    carStep.current.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }, [query.izlagac]);

  if (!catalog.qrConfigured) return <AdminPanel><AdminEmptyState title={dict.sectionLabels.povezi} body={dict.qrNotConfigured} /></AdminPanel>;

  const kod = query.kod ?? null;
  const detail = kod ? sticker : undefined;
  const facts = detail ? stickerFacts(detail) : null;
  const exhibitor = exhibitors.find((row) => row.id === query.izlagac) ?? null;
  const cars = exhibitor ? exhibitorCars(catalog.models, exhibitor.id) : [];
  const model = exhibitor && query.model ? cars.find((row) => row.id === query.model) ?? null : null;
  const plan = linkPlan(facts, model);
  const inputValue = typed ?? stickerNumberOf(detail?.label, labelFormat) ?? "";
  const typedInvalid = typed !== null && typed.trim() !== "" && !stickerCodeFromInput(typed, labelFormat);

  function changeNumber(text: string) {
    setTyped(text);
    setNotice(null);
    dispatch({ type: "reset" });
    onQueryChange({ kod: stickerCodeFromInput(text, labelFormat) });
  }

  function pickExhibitor(id: string | null) {
    setNotice(null);
    dispatch({ type: "reset" });
    onQueryChange({ izlagac: id, model: null });
  }

  function pickModel(id: string) {
    setNotice(null);
    dispatch({ type: "reset" });
    onQueryChange({ model: id });
  }

  async function submit() {
    if (busy.current || flow.step !== "pick" || plan.block || !detail || !model) return;
    busy.current = true;
    setNotice(null);
    dispatch({ type: "submit" });
    try {
      const result = await actions.link({ code: detail.resolverCode, modelId: model.id, expectedHolderModelId: plan.expectedHolderModelId, replaceModelSticker: plan.replaceModelSticker });
      if (result.ok) {
        dispatch({ type: "success", done: result.value });
        onChanged?.();
      } else {
        dispatch({ type: "failure", code: result.code });
        if (isQrConflict(result.code)) {
          setNotice(t.conflictRefreshed);
          onChanged?.();
        }
      }
    } finally {
      busy.current = false;
    }
  }

  async function undo() {
    if (busy.current || flow.step !== "done" || flow.undo !== "idle") return;
    busy.current = true;
    dispatch({ type: "undo" });
    try {
      const result = await actions.undo(flow.done.assignmentId);
      if (result.ok) {
        dispatch({ type: "undone" });
        onChanged?.();
      } else {
        dispatch({ type: "undo_failed", code: result.code });
        if (isQrConflict(result.code)) onChanged?.();
      }
    } finally {
      busy.current = false;
    }
  }

  function next(label: string | null) {
    setTyped(label ? stickerNumberOf(label, labelFormat) : "");
    setNotice(null);
    dispatch({ type: "reset" });
    onQueryChange({ kod: label, model: null });
    // The same exhibitor stays: its cars are where the next tap goes.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    carStep.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div className="grid min-w-0 gap-4">
        <p className="text-sm text-[var(--admin-text-muted)]">{t.intro}</p>
        <Step number={1} title={t.stepSticker}>
          <NumberField value={inputValue} prefix={labelFormat.prefix} invalid={typedInvalid} max={labelFormat.max} disabled={flow.step === "saving"} onChange={changeNumber} />
          <StickerCard kod={kod} typedInvalid={typedInvalid} detail={detail} failed={Boolean(stickerFailed)} modelsById={modelsById} qrHref={qrHref} />
        </Step>
        <Step number={2} title={t.stepExhibitor}>
          {exhibitor ? (
            <ExhibitorChosen exhibitor={exhibitor} disabled={flow.step === "saving"} onChange={() => pickExhibitor(null)} />
          ) : (
            <ExhibitorPicker exhibitors={exhibitors} search={search} onSearch={setSearch} onPick={pickExhibitor} />
          )}
        </Step>
        <div ref={carStep} className="scroll-mt-24">
          <Step number={3} title={t.stepCar}>
            {exhibitor ? (
              <CarPicker cars={cars} selectedId={model?.id ?? null} stickerCode={detail?.resolverCode ?? null} disabled={flow.step === "saving"} onPick={pickModel} />
            ) : <p className="text-sm text-[var(--admin-text-muted)]">{t.pickExhibitorFirst}</p>}
          </Step>
        </div>
        <ConfirmBar
          flow={flow}
          plan={plan}
          label={facts?.label ?? detail?.resolverCode ?? null}
          model={model}
          modelsById={modelsById}
          notice={notice}
          problem={detail && facts?.outOfService ? problemText(detail.problemReason ?? "") : null}
          labelFormat={labelFormat}
          onSubmit={() => void submit()}
          onUndo={() => void undo()}
          onNext={next}
        />
      </div>
      <RecentLinks recent={recent} actions={actions} onChanged={onChanged} qrHref={qrHref} />
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <AdminPanel aria-labelledby={id} className="grid min-w-0 gap-3 p-4 sm:p-5">
      <h2 id={id} className="flex items-center gap-2.5 text-base font-semibold tracking-[-0.02em]">
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--admin-ink)] text-sm font-bold text-[var(--admin-on-ink)]">{number}</span>
        {title}
      </h2>
      {children}
    </AdminPanel>
  );
}

// -----------------------------------------------------------------------------
// 1. The sticker
// -----------------------------------------------------------------------------

function NumberField({ value, prefix, invalid, max, disabled, onChange }: { value: string; prefix: string; invalid: boolean; max: number; disabled: boolean; onChange: (text: string) => void }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{t.numberLabel}</label>
      <div
        data-sticker-field
        className={cn(
          "flex min-h-14 min-w-0 items-stretch overflow-hidden rounded-[var(--admin-radius-control)] border bg-[var(--admin-surface)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--admin-focus,var(--admin-ink))]",
          invalid ? "border-[var(--admin-danger-border)]" : "border-[var(--admin-border)]",
        )}
      >
        <span aria-hidden="true" className="grid shrink-0 place-items-center border-r border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-3 font-mono text-xl font-semibold text-[var(--admin-text-muted)]">{prefix}-</span>
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="numeric"
          placeholder={t.numberPlaceholder}
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-help`}
          className="min-w-0 flex-1 bg-transparent px-3 font-mono text-2xl font-semibold tracking-[0.06em] outline-none placeholder:font-normal placeholder:text-[var(--admin-text-muted)] placeholder:opacity-60 disabled:opacity-60"
        />
        {value ? (
          <button type="button" onClick={() => onChange("")} disabled={disabled} aria-label={t.clear} className="grid w-12 shrink-0 place-items-center text-[var(--admin-text-muted)] hover:text-[var(--admin-ink)] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">
            <X className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p id={`${id}-help`} className={cn("text-xs", invalid ? "font-semibold text-[var(--admin-danger)]" : "text-[var(--admin-text-muted)]")} aria-live="polite">
        {invalid ? fmt(t.numberInvalid, { max }) : fmt(t.numberHelp, { prefix })}
      </p>
    </div>
  );
}

const STATE_TONE = { free: "neutral", linked: "active", other: "waiting", panel: "muted", off: "problem" } as const;

function StickerCard({ kod, typedInvalid, detail, failed, modelsById, qrHref }: {
  kod: string | null;
  typedInvalid: boolean;
  detail: QrDetailView | null | undefined;
  failed: boolean;
  modelsById: ReadonlyMap<string, ModelView>;
  qrHref: (code: string) => string;
}) {
  let body: ReactNode;
  if (typedInvalid) return null;
  if (!kod) body = <p className="text-sm text-[var(--admin-text-muted)]">{t.stickerEmpty}</p>;
  else if (detail === undefined) body = <p className="text-sm text-[var(--admin-text-muted)]">{failed ? t.stickerError : t.stickerLoading}</p>;
  else if (detail === null) body = <p className="text-sm font-semibold text-[var(--admin-danger)]">{fmt(t.stickerNotFound, { code: kod })}</p>;
  else {
    const facts = stickerFacts(detail);
    const current = detail.current;
    const model = current?.sameEvent ? modelsById.get(current.eventModelId) ?? null : null;
    const state = facts.kind === "panel" ? "panel" : current ? (current.sameEvent ? "linked" : "other") : facts.outOfService ? "off" : "free";
    const stateLabel = { free: t.stateFree, linked: t.stateLinked, other: t.stateOther, panel: t.statePanel, off: t.stateOff }[state];
    const text = state === "panel" ? t.panelBody
      : state === "other" ? fmt(t.otherBody, { event: current?.eventTitle ?? "—" })
      : state === "linked" ? fmt(t.linkedBody, {
        model: model ? modelName(model) : current?.modelLabel ?? "—",
        exhibitor: model?.exhibitorName ?? current?.exhibitorName ?? "—",
        stand: model ? standText(model) : current?.standCode ?? "—",
      })
      : state === "off" ? fmt(t.offBody, { problem: problemText(detail.problemReason ?? "") })
      : t.freeBody;
    body = (
      <div className="grid gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <Link href={qrHref(detail.resolverCode)} className="font-mono text-xl font-semibold tracking-[0.02em] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">
            {facts.label ?? detail.resolverCode}
          </Link>
          <AdminStatus label={stateLabel} tone={STATE_TONE[state]} className="whitespace-nowrap" />
        </div>
        <p className="text-sm break-words" data-sticker-state={state}>{text}</p>
        {state === "linked" && current?.modelStatus && current.modelStatus !== "published" ? <p className="text-xs text-[var(--admin-warning)]">{t.linkedDraft}</p> : null}
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="rounded-[var(--admin-radius-control)] bg-[var(--admin-surface-muted)] p-3">
      {body}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2. The exhibitor
// -----------------------------------------------------------------------------

function standsText(exhibitor: LinkExhibitor) {
  return exhibitor.stands.length ? fmt(t.exhibitorStand, { stands: exhibitor.stands.join(", ") }) : t.exhibitorNoStand;
}

function ExhibitorChosen({ exhibitor, disabled, onChange }: { exhibitor: LinkExhibitor; disabled: boolean; onChange: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-ink)] bg-[var(--admin-surface-strong)] p-2.5" data-exhibitor-chosen>
      <ExhibitorLogo name={exhibitor.name} logoUrl={exhibitor.logoUrl} size="sm" />
      <span className="grid min-w-0 flex-1 leading-5">
        <strong className="truncate font-semibold">{exhibitor.name}</strong>
        <span className="truncate text-xs text-[var(--admin-text-muted)]">{standsText(exhibitor)}</span>
      </span>
      <button type="button" onClick={onChange} disabled={disabled} className={cn(adminSecondaryButtonClass, "min-h-11 shrink-0 px-3")}>{t.exhibitorChange}</button>
    </div>
  );
}

function ExhibitorPicker({ exhibitors, search, onSearch, onPick }: { exhibitors: LinkExhibitor[]; search: string; onSearch: (q: string) => void; onPick: (id: string) => void }) {
  const id = useId();
  const shown = filterLinkExhibitors(exhibitors, search);
  if (!exhibitors.length) return <p className="text-sm text-[var(--admin-text-muted)]">{t.exhibitorEmpty}</p>;
  return (
    <div className="grid min-w-0 gap-3">
      <label htmlFor={id} className="grid gap-1.5 text-sm font-semibold">{t.exhibitorSearch}
        <input id={id} type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t.exhibitorSearchPlaceholder} autoComplete="off" enterKeyHint="search" className={adminTouchFieldClass} />
      </label>
      {shown.length ? (
        <ul className="grid min-w-0 gap-2 sm:grid-cols-2" aria-label={t.stepExhibitor}>
          {shown.map((row) => (
            <li key={row.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onPick(row.id)}
                className="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-2.5 text-left hover:border-[var(--admin-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]"
              >
                <ExhibitorLogo name={row.name} logoUrl={row.logoUrl} size="sm" />
                <span className="grid min-w-0 flex-1 leading-5">
                  <strong className="truncate font-semibold">{row.name}</strong>
                  <span className="truncate text-xs text-[var(--admin-text-muted)]">{standsText(row)} · {fmt(t.exhibitorCars, { count: row.cars })}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-[var(--admin-text-muted)]" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-[var(--admin-text-muted)]" role="status">{t.exhibitorNone}</p>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 3. The car
// -----------------------------------------------------------------------------

function CarPicker({ cars, selectedId, stickerCode, disabled, onPick }: { cars: ModelView[]; selectedId: string | null; stickerCode: string | null; disabled: boolean; onPick: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label={t.stepCar} className="grid min-w-0 gap-2 sm:grid-cols-2">
      {cars.map((car) => {
        const selected = car.id === selectedId;
        const withdrawn = car.status === "withdrawn";
        const here = Boolean(stickerCode && car.qrCode === stickerCode);
        const sticker = here ? t.carStickerHere : car.qrCode ? fmt(t.carHasSticker, { label: car.qrLabel ?? car.qrSmq ?? car.qrCode }) : t.carNoSticker;
        return (
          <button
            key={car.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || withdrawn}
            onClick={() => onPick(car.id)}
            className={cn(
              "grid min-h-16 w-full min-w-0 gap-1.5 rounded-[var(--admin-radius-control)] border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))] disabled:cursor-not-allowed",
              selected ? "border-[var(--admin-ink)] bg-[var(--admin-surface-strong)] shadow-[inset_0_0_0_1px_var(--admin-ink)]" : "border-[var(--admin-border)] bg-[var(--admin-surface)] hover:border-[var(--admin-ink)]",
              withdrawn && "opacity-60",
            )}
          >
            <span className="flex min-w-0 items-start justify-between gap-2">
              <span className="grid min-w-0 leading-5">
                <strong className="font-semibold break-words">{modelName(car)}</strong>
                <span className="text-xs text-[var(--admin-text-muted)]">{car.brandName}</span>
              </span>
              {selected ? <Check className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : null}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <AdminStatus label={dict.modelStatus[car.status]} tone={modelTone(car.status)} className="whitespace-nowrap" />
              <span className={cn("text-xs break-words", here ? "font-semibold text-[var(--admin-success)]" : "text-[var(--admin-text-muted)]")}>
                {withdrawn ? t.carWithdrawn : sticker}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// The sticky confirmation bar
// -----------------------------------------------------------------------------

const BLOCK_TEXT: Partial<Record<NonNullable<LinkPlan["block"]>, string>> = {
  panel: t.blockPanel,
  other_event: t.blockOther,
  withdrawn: t.blockWithdrawn,
  same: t.blockSame,
};

function confirmLabel(plan: LinkPlan) {
  const move = plan.warnings.includes("move");
  const replace = plan.warnings.includes("replace");
  return move && replace ? t.confirmMoveReplace : move ? t.confirmMove : replace ? t.confirmReplace : t.confirmLink;
}

function ConfirmBar({ flow, plan, label, model, modelsById, notice, problem, labelFormat, onSubmit, onUndo, onNext }: {
  flow: LinkFlow;
  plan: LinkPlan;
  label: string | null;
  model: ModelView | null;
  modelsById: ReadonlyMap<string, ModelView>;
  notice: string | null;
  /** out_of_service: why the code does not work. */
  problem: string | null;
  labelFormat: FairQrLabelFormat;
  onSubmit: () => void;
  onUndo: () => void;
  onNext: (label: string | null) => void;
}) {
  const id = useId();
  const nameOf = (modelId: string | null | undefined) => {
    const row = modelId ? modelsById.get(modelId) : undefined;
    return row ? modelName(row) : "—";
  };
  let content: ReactNode;
  if (flow.step === "done") {
    const done = flow.done;
    const car = modelsById.get(done.modelId) ?? null;
    const nextLabel = nextStickerLabel(done.label, labelFormat);
    const undone = flow.undo === "undone";
    content = (
      <div className="grid gap-3" data-link-done>
        <div className={cn("grid gap-1.5 rounded-[var(--admin-radius-control)] border p-3", undone ? "border-[var(--admin-border)] bg-[var(--admin-surface-muted)]" : "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)]")}>
          <p className="flex items-center gap-2 font-semibold">
            {undone ? <RotateCcw className="size-5 shrink-0" aria-hidden="true" /> : <Check className="size-5 shrink-0 text-[var(--admin-success)]" aria-hidden="true" />}
            {undone ? t.undone : t.doneTitle}
          </p>
          {undone ? null : (
            <>
              <p className="text-sm break-words">
                {done.created
                  ? fmt(t.doneBody, { label: done.label, model: car ? modelName(car) : "—", exhibitor: car?.exhibitorName ?? "—", stand: car ? standText(car) : "—" })
                  : fmt(t.doneUnchanged, { label: done.label, model: car ? modelName(car) : "—" })}
              </p>
              {done.movedFromModelId ? <p className="text-sm">{fmt(t.doneMoved, { model: nameOf(done.movedFromModelId) })}</p> : null}
              {done.replacedLabel ? <p className="text-sm">{fmt(t.doneReplaced, { label: done.replacedLabel })}</p> : null}
              {done.modelStatus === "draft" ? <p className="text-sm font-semibold text-[var(--admin-warning)]">{t.doneDraft}</p> : null}
              <p className="text-xs text-[var(--admin-text-muted)]">{t.doneCheck}</p>
            </>
          )}
          {flow.error ? <p className="text-sm font-semibold text-[var(--admin-danger)]">{issueText(flow.error)}</p> : null}
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <button type="button" onClick={onUndo} disabled={flow.undo !== "idle"} aria-busy={flow.undo === "saving" || undefined} className={cn(adminSecondaryButtonClass, "min-h-12 px-3.5")}>
            <RotateCcw className="size-4" aria-hidden="true" />{flow.undo === "saving" ? t.undoing : t.undo}
          </button>
          <button type="button" onClick={() => onNext(nextLabel)} disabled={flow.undo === "saving"} className={cn(adminPrimaryButtonClass, "min-h-12 px-3.5 whitespace-nowrap")}>
            {nextLabel ? fmt(t.next, { label: nextLabel }) : t.nextPlain}<ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  } else {
    const ready = !plan.block;
    const blockText = plan.block ? BLOCK_TEXT[plan.block] : undefined;
    const saving = flow.step === "saving";
    const warnings = plan.warnings.map((warning) => warning === "draft" ? t.warnDraft
      : warning === "move" ? fmt(t.warnMove, { model: nameOf(plan.holderModelId) })
      : warning === "replace" ? fmt(t.warnReplace, { label: model?.qrLabel ?? model?.qrSmq ?? plan.replacedCode ?? "—" })
      : fmt(t.warnOutOfService, { problem: problem ?? "—" }));
    content = (
      <div className="grid gap-2.5">
        <p className="text-base font-semibold break-words" data-link-summary>
          {label && model && plan.block !== "no_sticker"
            ? fmt(t.barSummary, { label, model: modelName(model), brand: model.brandName, stand: standText(model) })
            : t.barPick}
        </p>
        {model ? <p className="-mt-1.5 text-xs text-[var(--admin-text-muted)]">{model.exhibitorName}</p> : null}
        {blockText ? (
          <p className="flex items-start gap-2 text-sm font-semibold text-[var(--admin-danger)]"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{blockText}</p>
        ) : null}
        {warnings.length ? (
          <ul className="grid gap-1.5" aria-label={dict.severityWarning}>
            {warnings.map((text) => (
              <li key={text} className="flex items-start gap-2 rounded-lg border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-2.5 py-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--admin-warning)]" aria-hidden="true" />{text}
              </li>
            ))}
          </ul>
        ) : null}
        {flow.step === "pick" && flow.error ? <p className="text-sm font-semibold text-[var(--admin-danger)]" role="alert">{issueText(flow.error)}</p> : null}
        {notice ? <p className="text-sm text-[var(--admin-text-muted)]">{notice}</p> : null}
        <button type="button" onClick={onSubmit} disabled={!ready || saving} aria-busy={saving || undefined} className={cn(adminPrimaryButtonClass, "min-h-12 w-full text-base")}>
          {saving ? t.saving : confirmLabel(plan)}
        </button>
      </div>
    );
  }
  return (
    <section
      aria-labelledby={id}
      data-link-bar
      className="sticky bottom-0 z-20 -mx-4 border-t border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/0.08)] sm:mx-0 sm:rounded-[var(--admin-radius-panel)] sm:border"
    >
      <h2 id={id} className="sr-only">{t.barLabel}</h2>
      <div aria-live="polite">{content}</div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// „Poslednje veze“
// -----------------------------------------------------------------------------

function RecentLinks({ recent, actions, onChanged, qrHref }: { recent: RecentLinkView[] | undefined; actions: LinkStickerActions; onChanged?: () => void; qrHref: (code: string) => string }) {
  const id = useId();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  async function undo(row: RecentLinkView) {
    if (pending) return;
    setPending(row.assignmentId);
    setMessage(null);
    try {
      const result = await actions.undo(row.assignmentId);
      setMessage(result.ok ? { tone: "ok", text: fmt(t.recentUndone, { label: row.label }) } : { tone: "error", text: issueText(result.code) });
      if (result.ok || isQrConflict(result.code)) onChanged?.();
    } finally {
      setPending(null);
    }
  }
  return (
    <AdminPanel aria-labelledby={id} className="grid min-w-0 gap-3 p-4 sm:p-5">
      <div className="grid gap-1">
        <h2 id={id} className="text-base font-semibold tracking-[-0.02em]">{t.recentTitle}</h2>
        <p className="text-xs text-[var(--admin-text-muted)]">{t.recentHelp}</p>
      </div>
      <div role="status" aria-live="polite">
        {message ? <p className={cn("text-sm font-semibold", message.tone === "ok" ? "text-[var(--admin-success)]" : "text-[var(--admin-danger)]")}>{message.text}</p> : null}
      </div>
      {recent === undefined ? <p className="text-sm text-[var(--admin-text-muted)]">{t.recentLoading}</p>
        : recent.length ? (
          <ol className="grid gap-2">
            {recent.map((row) => (
              <li key={row.assignmentId} className="flex min-w-0 items-center gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] p-3">
                <span className="grid min-w-0 flex-1 gap-0.5 leading-5">
                  <Link href={qrHref(row.label)} className="w-fit font-mono font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{row.label}</Link>
                  <span className="text-sm break-words">{fmt(t.recentLine, { model: row.modelName ?? "—", exhibitor: row.exhibitorName ?? "—", stand: row.standCode ? fmt(t.exhibitorStand, { stands: row.standCode }) : t.exhibitorNoStand })}</span>
                  <span className="text-xs text-[var(--admin-text-muted)]">{fmt(t.recentBy, { time: eventDateTime.format(row.linkedAt), who: row.linkedByName ?? "—" })}</span>
                </span>
                {row.canUndo ? (
                  <button type="button" onClick={() => void undo(row)} disabled={pending !== null} aria-busy={pending === row.assignmentId || undefined} aria-label={fmt(t.recentUndoAria, { label: row.label })} className={cn(adminSecondaryButtonClass, "min-h-11 shrink-0 px-3")}>
                    <RotateCcw className="size-4" aria-hidden="true" />{pending === row.assignmentId ? t.undoing : t.undo}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{t.recentEmpty}</p>}
    </AdminPanel>
  );
}
