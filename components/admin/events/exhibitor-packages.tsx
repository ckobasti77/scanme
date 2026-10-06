"use client";

import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { interactionCodeText } from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminStatus } from "@/components/admin/admin-primitives";
import { adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/components/admin/admin-ui";
import { eventDateTime, Feedback, Meta, type EventMessage } from "@/components/admin/events/event-ui";
import { bulkUpgradeModels, upgradeTargets } from "@/lib/admin-v1/interaction-exhibitors";
import type { FairModelStatus, FairPackageTier } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Izlagači 2026 — packages of one exhibitor's cars, given right where the
// interactions are (the exhibitor's Interakcije page and an opened card of the
// list). A package belongs to a car (MASTER §4.4) and only goes up, so every
// change — one car or all of them — is confirmed first. The calls are the
// same fairAdmin.upgradePackage the Modeli detail uses, one per car.

const t = dict.exhibitorPage;

/** The same colors as the Glas publike quota panel: Napredni, Starter, Za sve. */
export const PACKAGE_TONE: Record<FairPackageTier, "sponsored" | "active" | "neutral"> = { advanced: "sponsored", starter: "active", included: "neutral" };

export type PackageModel = { id: string; name: string; brandName: string; tier: FairPackageTier; packageActivatedAt: number; status: FairModelStatus };
export type PackageUpgradeOutcome = { ok: true } | { ok: false; code: string };

type Confirming = { kind: "bulk"; to: "starter" | "advanced"; ids: string[] } | { kind: "model"; to: FairPackageTier; id: string } | null;

export type ExhibitorPackagesProps = {
  /** Live (not withdrawn) cars of the exhibitor. */
  models: readonly PackageModel[];
  now: number;
  onUpgrade: (modelId: string, to: FairPackageTier) => Promise<PackageUpgradeOutcome>;
  importHref: string;
  modelHref?: (modelId: string) => string;
  /** The list's opened card: no explanation paragraph. */
  compact?: boolean;
  /** The per-car list behind "Prikaži automobile" (the exhibitor's page once it has interactions); the bulk row stays visible. */
  collapsible?: boolean;
  defaultOpen?: boolean;
};

function ConfirmBox({ text, pending, onConfirm, onCancel }: { text: string; pending: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="group" aria-label={text} className="grid gap-2 rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3 text-sm sm:max-w-xl">
      <p className="font-semibold">{text}</p>
      <span className="flex flex-wrap gap-2">
        <button type="button" autoFocus className={cn(adminPrimaryButtonClass, "min-h-10")} disabled={pending} onClick={onConfirm}>{t.confirm}</button>
        <button type="button" className={cn(adminSecondaryButtonClass, "min-h-10")} disabled={pending} onClick={onCancel}>{t.cancel}</button>
      </span>
    </div>
  );
}

export function PackageBadge({ model, now }: { model: Pick<PackageModel, "tier" | "packageActivatedAt">; now: number }) {
  return (
    <span className="grid justify-items-start gap-0.5">
      <AdminStatus label={dict.tiers[model.tier]} tone={PACKAGE_TONE[model.tier]} className="whitespace-nowrap" />
      {model.packageActivatedAt > now && model.tier !== "included" ? <Meta>{fmt(t.pendingFrom, { date: eventDateTime.format(model.packageActivatedAt) })}</Meta> : null}
    </span>
  );
}

export function ExhibitorPackages({ models, now, onUpgrade, importHref, modelHref, compact = false, collapsible = false, defaultOpen = true }: ExhibitorPackagesProps) {
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<EventMessage>(null);
  const [open, setOpen] = useState(defaultOpen || !collapsible);
  const listId = useId();
  const live = models.filter((model) => model.status !== "withdrawn");
  const names = new Map(live.map((model) => [model.id, model.name]));

  if (!live.length) {
    return (
      <div className="grid justify-items-center gap-2 pb-2">
        <AdminEmptyState title={t.packagesEmptyTitle} body={t.packagesEmptyBody} className="min-h-32" />
        <Link href={importHref} className={adminSecondaryButtonClass}>{t.packagesEmptyAction}</Link>
      </div>
    );
  }

  async function run(confirmed: NonNullable<Confirming>) {
    setPending(true);
    setMessage(null);
    try {
      if (confirmed.kind === "model") {
        const outcome = await onUpgrade(confirmed.id, confirmed.to);
        setMessage(outcome.ok
          ? { tone: "ok", text: fmt(t.upgraded, { model: names.get(confirmed.id) ?? "—", tier: dict.tiers[confirmed.to] }) }
          : { tone: "error", text: interactionCodeText(outcome.code) });
        return;
      }
      // One call per car (the same mutation as one car): a failure stops nothing else and is reported.
      let done = 0;
      let firstError: string | null = null;
      for (const id of confirmed.ids) {
        const outcome = await onUpgrade(id, confirmed.to);
        if (outcome.ok) done += 1;
        else firstError ??= `${names.get(id) ?? "—"}: ${interactionCodeText(outcome.code)}`;
      }
      setMessage(firstError
        ? { tone: "error", text: fmt(t.bulkPartial, { done, count: confirmed.ids.length, error: firstError }) }
        : { tone: "ok", text: fmt(t.bulkDone, { tier: dict.tiers[confirmed.to], count: done }) });
    } finally {
      setPending(false);
      setConfirming(null);
    }
  }

  const confirmText = (value: NonNullable<Confirming>) => value.kind === "bulk"
    ? fmt(t.bulkConfirm, { count: value.ids.length, tier: dict.tiers[value.to] })
    : fmt(t.upgradeConfirm, { model: names.get(value.id) ?? "—", tier: dict.tiers[value.to] });

  return (
    <div className="@container grid min-w-0 gap-3">
      {compact ? null : <p className="max-w-3xl text-sm text-[var(--admin-text-muted)]">{t.packagesHelp}</p>}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.bulkLabel}>
        <span className="text-sm font-semibold">{t.bulkLabel}</span>
        {(["starter", "advanced"] as const).map((to) => {
          const ids = bulkUpgradeModels(live, to).map((model) => model.id);
          return (
            <button
              key={to}
              type="button"
              className={cn(adminSecondaryButtonClass, "min-h-10 px-3")}
              disabled={pending || !ids.length}
              aria-label={fmt(t.bulkAria, { tier: dict.tiers[to], count: ids.length })}
              onClick={() => { setMessage(null); setConfirming({ kind: "bulk", to, ids }); }}
            >
              <ArrowUpRight className="size-4" aria-hidden="true" />
              {fmt(t.bulkTo, { tier: dict.tiers[to], count: ids.length })}
            </button>
          );
        })}
      </div>
      {confirming?.kind === "bulk" ? <ConfirmBox text={confirmText(confirming)} pending={pending} onConfirm={() => void run(confirming)} onCancel={() => setConfirming(null)} /> : null}
      <Feedback message={message} />
      {collapsible ? (
        <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)} className={cn(adminSecondaryButtonClass, "min-h-10 w-fit px-3")}>
          {open ? t.carsHide : fmt(t.carsShow, { count: live.length })}
          {open ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        </button>
      ) : null}
      <div id={listId} hidden={!open}>
        <ul className="grid divide-y divide-[var(--admin-border)] overflow-hidden rounded-[var(--admin-radius-control)] border border-[var(--admin-border)]" aria-label={t.packagesTitle}>
          {live.map((model) => {
            const targets = upgradeTargets(model.tier);
            const asking = confirming?.kind === "model" && confirming.id === model.id ? confirming : null;
            return (
              <li key={model.id} className="grid min-w-0 gap-2 bg-[var(--admin-surface)] px-3 py-2.5 @xl:grid-cols-[minmax(0,1fr)_auto_auto] @xl:items-center @xl:gap-4">
                <span className="grid min-w-0">
                  {modelHref ? (
                    <Link href={modelHref(model.id)} className="font-semibold underline-offset-4 [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{model.name}</Link>
                  ) : <span className="font-semibold [overflow-wrap:anywhere]">{model.name}</span>}
                  <Meta>{model.brandName}</Meta>
                </span>
                <PackageBadge model={model} now={now} />
                <span className="flex flex-wrap items-center gap-2 @xl:justify-end">
                  {targets.length ? targets.map((to) => (
                    <button
                      key={to}
                      type="button"
                      className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}
                      disabled={pending}
                      aria-label={fmt(t.upgradeAria, { tier: dict.tiers[to], model: model.name })}
                      onClick={() => { setMessage(null); setConfirming({ kind: "model", to, id: model.id }); }}
                    >
                      {fmt(t.upgradeTo, { tier: dict.tiers[to] })}
                    </button>
                  )) : <span className="text-xs font-semibold text-[var(--admin-text-muted)]">{t.highestTier}</span>}
                </span>
                {asking ? (
                  <div className="@xl:col-span-3">
                    <ConfirmBox text={confirmText(asking)} pending={pending} onConfirm={() => void run(asking)} onCancel={() => setConfirming(null)} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
