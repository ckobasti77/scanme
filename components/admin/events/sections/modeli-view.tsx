"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { issueText, type CatalogView, type EventsActions, type ModelView, type Outcome } from "@/components/admin/admin-events";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  type AdminColumn,
} from "@/components/admin/admin-ui";
import { checkLabel, eventDateTime, Fact, Feedback, IssueList, Meta, modelName, modelTone, Section, type EventMessage } from "@/components/admin/events/event-ui";
import { FAIR_PACKAGE_TIERS, type FairPackageTier } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A2 — `modeli` (list) and `modeli/[modelId]` (detail with publish,
// withdraw and upgrade). Presentational; A3 adds the filter bar and grouping.

const modelColumns: AdminColumn<ModelView>[] = [
  { id: "model", header: dict.colModel, rowHeader: true, sortValue: modelName, cell: (model) => <strong className="font-semibold">{modelName(model)}</strong> },
  { id: "brand", header: dict.colBrand, sortValue: (model) => model.brandName, cell: (model) => <><span className="block">{model.brandName}</span><Meta>{model.exhibitorName} · {model.standLabel}</Meta></> },
  { id: "qr", header: dict.colQr, sortValue: (model) => model.qrCode, cell: (model) => <span className="font-mono text-xs">{model.qrCode ?? dict.noQr}</span> },
  { id: "check", header: dict.colCheck, sortValue: (model) => model.issues.length, cell: (model) => checkLabel(model.issues) },
  { id: "package", header: dict.colPackage, sortValue: (model) => FAIR_PACKAGE_TIERS.indexOf(model.tier), cell: (model) => <AdminStatus label={dict.tiers[model.tier]} tone="neutral" /> },
  { id: "status", header: dict.colStatus, sortValue: (model) => dict.modelStatus[model.status], cell: (model) => <AdminStatus label={dict.modelStatus[model.status]} tone={modelTone(model.status)} /> },
];

/** The model table (Pregled and Modeli); every row opens the model's own page. */
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
          fields={[{ label: dict.colQr, value: <span className="font-mono">{model.qrCode ?? dict.noQr}</span> }, { label: dict.colCheck, value: checkLabel(model.issues) }]}
        />
      )}
      rowActions={(model) => <Link href={modelHref(model.id)} className={adminSecondaryButtonClass}>{dict.openModel}</Link>}
    />
  );
}

export function EventModelsView({ catalog, modelHref }: { catalog: CatalogView; modelHref: (modelId: string) => string }) {
  return (
    <Section title={dict.sectionLabels.modeli}>
      <EventModelsTable listKey="dogadjaji.modeli" models={catalog.models} modelHref={modelHref} />
    </Section>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="w-fit text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">← {label}</Link>;
}

export function EventModelDetailView({ catalog, modelId, actions, listHref, qrHref }: {
  catalog: CatalogView;
  modelId: string;
  actions: Pick<EventsActions, "publish" | "withdraw" | "upgrade">;
  listHref: string;
  qrHref: (code: string) => string;
}) {
  const model = catalog.models.find((row) => row.id === modelId) ?? null;
  const [message, setMessage] = useState<EventMessage>(null);
  const [pending, setPending] = useState(false);
  const [target, setTarget] = useState<FairPackageTier | "">("");
  const [confirming, setConfirming] = useState(false);
  const higher = model ? FAIR_PACKAGE_TIERS.slice(FAIR_PACKAGE_TIERS.indexOf(model.tier) + 1) : [];
  const effectiveTarget = target && higher.includes(target) ? target : higher[0] ?? "";

  async function run(action: () => Promise<Outcome>, success: string) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.ok ? { tone: "ok", text: success, issues: outcome.warnings?.length ? outcome.warnings : undefined } : { tone: "error", text: issueText(outcome.code), issues: outcome.issues });
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
  return (
    <div className="grid min-w-0 gap-5">
      <BackLink href={listHref} label={dict.backToList} />
      <Section title={modelName(model)} action={<span className="flex flex-wrap gap-2"><AdminStatus label={dict.tiers[model.tier]} tone="neutral" /><AdminStatus label={dict.modelStatus[model.status]} tone={modelTone(model.status)} /></span>}>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Fact label={dict.fieldExternalKey} value={<span className="font-mono text-xs">{model.externalKey}</span>} />
          <Fact label={dict.fieldSlug} value={<span className="font-mono text-xs">{model.slug}</span>} />
          <Fact label={dict.colBrand} value={`${model.brandName} · ${model.exhibitorName}`} />
          <Fact label={dict.fieldStand} value={model.standLabel} />
          <Fact label={dict.fieldPrice} value={model.priceText} />
          <Fact label={dict.fieldSpecifications} value={fmt(dict.specCount, { count: model.specCount, highlights: model.highlightCount })} />
          <Fact label={dict.fieldPhoto} value={model.hasPhoto ? dict.photoYes : dict.photoNo} />
          <Fact label={dict.fieldQr} value={model.qrCode ? <Link href={qrHref(model.qrCode)} className="font-mono underline underline-offset-4">{model.qrCode}</Link> : <span className="font-mono">{dict.noQr}</span>} />
          <Fact label={dict.fieldPackageSince} value={eventDateTime.format(model.packageActivatedAt)} />
          <Fact label={dict.fieldPassport} value={model.passportEligible ? dict.yes : dict.no} />
        </dl>
      </Section>
      <Section title={dict.validationTitle}>
        {model.issues.length ? <IssueList issues={model.issues} /> : <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-[var(--admin-success)]" aria-hidden="true" />{dict.validationOk}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={adminPrimaryButtonClass} disabled={pending || model.status === "published"} onClick={() => void run(() => actions.publish(model.id), dict.publishDone)}>{dict.publish}</button>
          <button type="button" className={adminSecondaryButtonClass} disabled={pending || model.status === "withdrawn"} onClick={() => void run(() => actions.withdraw(model.id), dict.withdrawDone)}>{dict.withdraw}</button>
        </div>
        {model.issues.some((issue) => issue.severity === "error") && model.status !== "published" ? <p className="mt-2 text-xs text-[var(--admin-text-muted)]">{dict.publishBlocked}</p> : null}
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
      <Feedback message={message} />
    </div>
  );
}
