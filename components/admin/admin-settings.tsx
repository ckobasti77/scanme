"use client";

import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, CircleAlert, LockKeyhole, Save } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { adminSettingsSr as dict } from "@/lib/i18n/sr/admin-settings";
import { cn } from "@/lib/utils";
import { AdminErrorState, AdminLoadingState, AdminPanel, AdminStatus } from "./admin-primitives";
import { AdminDataView } from "./admin-ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const SETTINGS_TABS = ["general", "subscriptions", "payments", "communication", "pricing", "referral"] as const;
const tabs = SETTINGS_TABS;
type Tab = (typeof tabs)[number];
type AgreementKind = "standard" | "founders" | "enterprise" | "individual";
type PremiumDraftError = "amount" | "date" | "reason" | null;

export function premiumDraftError({ amountMinor, validFrom, validUntil, reason, now }: { amountMinor: number; validFrom: number; validUntil: number | null; reason: string; now: number }): PremiumDraftError {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return "amount";
  if (!Number.isFinite(validFrom) || validFrom <= now || validUntil !== null && (!Number.isFinite(validUntil) || validUntil <= validFrom)) return "date";
  return reason.trim() ? null : "reason";
}

const previewSettings = { premiumReference: { amountMinor: 1_490, currency: "RSD" as const, validFrom: null, validUntil: null, version: 0, temporary: true } };
const previewEmail = { configured: false, syncEnabled: false, outboundEnabled: false };
const previewDirectory = {
  accounts: [{ accountId: "preview-account" as never, name: "Demo nalog · neprodukcijski" }],
  friendTags: [{ accountId: "preview-account" as never, tagId: "preview-friend-tag" as never }],
  agreements: [{ id: "preview-agreement" as never, accountId: "preview-account" as never, period: "monthly" as const, kind: "individual" as const, priceMinor: 1_190, validFrom: Date.parse("2026-10-01T00:00:00Z"), validUntil: null, reason: "Testni ugovor — ne predstavlja poslovnu odluku" }],
  referrals: [{ id: "preview-referral" as never, referrerAccountId: "preview-account" as never, referredAccountId: "preview-account-2" as never, status: "pending" as const, updatedAt: Date.parse("2026-09-15T10:00:00Z") }],
};
const previewTargets = [{ target: { kind: "account_premium" as const }, period: "monthly" as const }];

function money(amountMinor: number) {
  return new Intl.NumberFormat("sr-Latn-RS", { style: "currency", currency: "RSD", maximumFractionDigits: 0 }).format(amountMinor);
}
function datetimeLocal(value: number | null) {
  if (value === null) return "";
  return new Date(value - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function targetLabel(target: { kind: "account_premium" } | { kind: "service_instance"; serviceProfileId: string }, period: "monthly" | "annual") {
  return `${target.kind === "account_premium" ? "Premium" : dict.serviceSubscription} · ${period === "monthly" ? dict.monthly : dict.annual}`;
}
function ReadOnlyFact({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-[var(--admin-border)] py-3 last:border-0"><dt className="text-xs font-semibold text-[var(--admin-text-muted)]">{label}</dt><dd className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</dd></div>;
}
function FieldError({ message }: { message: string }) {
  return message ? <p role="alert" className="mt-1 flex items-center gap-2 text-sm text-[var(--admin-danger)]"><CircleAlert className="size-4" aria-hidden="true" />{message}</p> : null;
}

function useSubmissionLock() {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  async function run(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    try {
      await work();
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return { pending, run };
}

function AgreementRules({ section, preview = false, onDirtyChange }: { section: "pricing" | "referral"; preview?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const liveDirectory = useQuery(api.adminSettings.agreementDirectory, preview ? "skip" : {});
  const directory = preview ? previewDirectory : liveDirectory;
  const createAgreement = useMutation(api.adminSettings.createAgreement);
  const setFriendWaiver = useMutation(api.adminSettings.setFriendWaiver);
  const registerReferral = useMutation(api.adminSettings.registerReferral);
  const rewardReferral = useMutation(api.adminSettings.rewardReferral);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [agreementAccountId, setAgreementAccountId] = useState("");
  const liveAgreementTargets = useQuery(api.adminSettings.targetsForAccount, !preview && agreementAccountId ? { accountId: agreementAccountId as never } : "skip");
  const agreementTargets = preview ? previewTargets : liveAgreementTargets;
  const [agreementTargetIndex, setAgreementTargetIndex] = useState("");
  const [kind, setKind] = useState<AgreementKind>("standard");
  const [reference, setReference] = useState("");
  const [price, setPrice] = useState("");
  const [agreementFrom, setAgreementFrom] = useState("");
  const [agreementUntil, setAgreementUntil] = useState("");
  const [agreementReason, setAgreementReason] = useState("");
  const [waiverAccountId, setWaiverAccountId] = useState("");
  const liveWaiverTargets = useQuery(api.adminSettings.targetsForAccount, !preview && waiverAccountId ? { accountId: waiverAccountId as never } : "skip");
  const waiverTargets = preview ? previewTargets : liveWaiverTargets;
  const [waiverTargetIndex, setWaiverTargetIndex] = useState("");
  const [waiverFrom, setWaiverFrom] = useState("");
  const [waiverUntil, setWaiverUntil] = useState("");
  const [waiverReason, setWaiverReason] = useState("");
  const [referrer, setReferrer] = useState("");
  const [referred, setReferred] = useState("");
  const [referralReason, setReferralReason] = useState("");
  const [referralId, setReferralId] = useState("");
  const selectedReferral = directory?.referrals.find((row) => row.id === referralId);
  const liveRewardTargets = useQuery(api.adminSettings.targetsForAccount, !preview && selectedReferral ? { accountId: selectedReferral.referrerAccountId } : "skip");
  const rewardTargets = preview ? previewTargets : liveRewardTargets;
  const [rewardTargetIndex, setRewardTargetIndex] = useState("");
  const [rewardType, setRewardType] = useState<"fixed" | "percentage">("percentage");
  const [rewardValue, setRewardValue] = useState("");
  const [rewardFrom, setRewardFrom] = useState("");
  const [rewardUntil, setRewardUntil] = useState("");
  const [rewardReason, setRewardReason] = useState("");
  const { pending, run: runLocked } = useSubmissionLock();
  const dirty = section === "pricing"
    ? Boolean(agreementAccountId || agreementTargetIndex || kind !== "standard" || reference || price || agreementFrom || agreementUntil || agreementReason || waiverAccountId || waiverTargetIndex || waiverFrom || waiverUntil || waiverReason)
    : Boolean(referrer || referred || referralReason || referralId || rewardTargetIndex || rewardType !== "percentage" || rewardValue || rewardFrom || rewardUntil || rewardReason);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  if (!directory) return <AdminLoadingState compact label={dict.loading} />;

  const accountName = (id: string) => directory.accounts.find((account) => account.accountId === id)?.name ?? id;
  const agreementValidity = (row: { validFrom: number; validUntil?: number | null }) => `${dict.from} ${new Date(row.validFrom).toLocaleDateString("sr-Latn-RS")} · ${row.validUntil ? `${dict.until} ${new Date(row.validUntil).toLocaleDateString("sr-Latn-RS")}` : dict.lifetime}`;
  const agreementTarget = agreementTargetIndex && agreementTargets ? agreementTargets[Number(agreementTargetIndex)] : null;
  const waiverTarget = waiverTargetIndex && waiverTargets ? waiverTargets[Number(waiverTargetIndex)] : null;
  const rewardTarget = rewardTargetIndex && rewardTargets ? rewardTargets[Number(rewardTargetIndex)] : null;
  const friendTag = directory.friendTags.find((tag) => tag.accountId === waiverAccountId);
  const parseFuture = (from: string, until: string) => {
    const validFrom = Date.parse(from), validUntil = until ? Date.parse(until) : null;
    return Number.isFinite(validFrom) && validFrom > Date.now() && (validUntil === null || Number.isFinite(validUntil) && validUntil > validFrom) ? { validFrom, validUntil } : null;
  };
  const finish = (message: string) => { setError(""); setNotice(message); };
  const field = "min-h-11 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";
  const submitClass = "min-h-11 justify-self-end rounded-lg bg-[var(--admin-ink)] px-4 text-sm font-semibold text-[var(--admin-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";
  const accountOptions = directory.accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.name}</option>);
  const targetOptions = (items: typeof agreementTargets) => items?.map((row, index) => <option key={index} value={index}>{targetLabel(row.target, row.period)}</option>);

  async function saveAgreement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validity = parseFuture(agreementFrom, agreementUntil);
    if (!agreementAccountId || !agreementTarget || !validity || !Number.isSafeInteger(Number(reference)) || Number(reference) < 0 || !Number.isSafeInteger(Number(price)) || Number(price) < 0 || !agreementReason.trim()) { setError(dict.invalidAgreement); return; }
    await runLocked(async () => {
      try {
        if (!preview) await createAgreement({ accountId: agreementAccountId as never, target: agreementTarget.target, period: agreementTarget.period, kind, referenceMinor: Number(reference), priceMinor: Number(price), ...validity, reason: agreementReason.trim(), key: crypto.randomUUID() });
        setAgreementAccountId(""); setAgreementTargetIndex(""); setKind("standard"); setReference(""); setPrice(""); setAgreementFrom(""); setAgreementUntil(""); setAgreementReason(""); finish(dict.agreementSaved);
      } catch { setError(dict.saveFailed); }
    });
  }
  async function saveWaiver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validity = parseFuture(waiverFrom, waiverUntil);
    if (!waiverAccountId || !friendTag || !waiverTarget || !validity || !waiverReason.trim()) { setError(dict.invalidWaiver); return; }
    await runLocked(async () => {
      try {
        if (!preview) await setFriendWaiver({ accountId: waiverAccountId as never, target: waiverTarget.target, tagId: friendTag.tagId, ...validity, reason: waiverReason.trim(), key: crypto.randomUUID() });
        setWaiverAccountId(""); setWaiverTargetIndex(""); setWaiverFrom(""); setWaiverUntil(""); setWaiverReason(""); finish(dict.waiverSaved);
      } catch { setError(dict.saveFailed); }
    });
  }
  async function saveReferral(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!referrer || !referred || referrer === referred || !referralReason.trim()) { setError(dict.invalidReferral); return; }
    await runLocked(async () => {
      try {
        if (!preview) await registerReferral({ referrerAccountId: referrer as never, referredAccountId: referred as never, reason: referralReason.trim(), key: crypto.randomUUID() });
        setReferrer(""); setReferred(""); setReferralReason(""); finish(dict.referralSaved);
      } catch { setError(dict.saveFailed); }
    });
  }
  async function saveReward(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validity = parseFuture(rewardFrom, rewardUntil), value = Number(rewardValue);
    const validValue = rewardType === "percentage" ? Number.isSafeInteger(value) && value >= 0 && value <= 10_000 : Number.isSafeInteger(value) && value >= 0;
    if (!selectedReferral || selectedReferral.status !== "qualified" || !rewardTarget || !validity || !validValue || !rewardReason.trim()) { setError(dict.invalidReward); return; }
    await runLocked(async () => {
      try {
        if (!preview) await rewardReferral({ referralId: selectedReferral.id, targets: [rewardTarget.target], value: rewardType === "percentage" ? { kind: "percentage", basisPoints: value } : { kind: "fixed", amount: { amountMinor: value, currency: "RSD" } }, ...validity, reason: rewardReason.trim(), key: crypto.randomUUID() });
        setReferralId(""); setRewardTargetIndex(""); setRewardType("percentage"); setRewardValue(""); setRewardFrom(""); setRewardUntil(""); setRewardReason(""); finish(dict.rewardSaved);
      } catch { setError(dict.saveFailed); }
    });
  }

  return <div className="mt-6 grid gap-6 border-t border-[var(--admin-border)] pt-5">
    {notice ? <p role="status" className="text-sm font-medium text-[var(--admin-success)]">{notice}</p> : null}<FieldError message={error} />
    {section === "pricing" ? <>
      <section><h3 className="font-semibold">{dict.agreements}</h3>{directory.agreements.length ? <AdminDataView
        className="mt-3"
        listKey="podesavanja.ugovori"
        caption={dict.agreements}
        rows={directory.agreements}
        getRowId={(row) => row.id}
        columns={[
          { id: "account", header: dict.agreementAccount, rowHeader: true, sortValue: (row) => accountName(row.accountId), cell: (row) => <strong>{accountName(row.accountId)}</strong> },
          { id: "kind", header: dict.agreementKind, sortValue: (row) => dict[row.kind], cell: (row) => dict[row.kind] },
          { id: "period", header: dict.colPeriod, cell: (row) => (row.period === "monthly" ? dict.monthly : dict.annual) },
          { id: "price", header: dict.agreementPrice, align: "end", sortValue: (row) => row.priceMinor, cell: (row) => <span className="font-mono tabular-nums">{money(row.priceMinor)}</span> },
          { id: "validity", header: dict.colValidity, sortValue: (row) => row.validFrom, className: "text-xs text-[var(--admin-text-muted)]", cell: (row) => agreementValidity(row) },
          { id: "reason", header: dict.reason, className: "text-xs text-[var(--admin-text-muted)]", cell: (row) => row.reason },
        ]}
        tableClassName="min-w-[48rem]"
        renderCard={(row) => <span className="grid gap-1 text-sm"><span><strong>{accountName(row.accountId)}</strong> · {dict[row.kind]} · {row.period === "monthly" ? dict.monthly : dict.annual}</span><span className="font-mono tabular-nums">{money(row.priceMinor)}</span><span className="text-xs text-[var(--admin-text-muted)]">{agreementValidity(row)} · {row.reason}</span></span>}
      /> : <p className="mt-3 text-sm text-[var(--admin-text-muted)]">{dict.agreementEmpty}</p>}
        <form className="mt-4 grid gap-3 rounded-xl bg-[var(--admin-surface-muted)] p-3" onSubmit={saveAgreement} noValidate><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">{dict.agreementAccount}<select value={agreementAccountId} onChange={(event) => { setAgreementAccountId(event.target.value); setAgreementTargetIndex(""); }} className={field}><option value="">{dict.chooseAccount}</option>{accountOptions}</select></label><label className="grid gap-1 text-sm font-semibold">{dict.agreementTarget}<select value={agreementTargetIndex} onChange={(event) => setAgreementTargetIndex(event.target.value)} disabled={!agreementTargets?.length} className={field}><option value="">{dict.chooseTarget}</option>{targetOptions(agreementTargets)}</select></label><label className="grid gap-1 text-sm font-semibold">{dict.agreementKind}<select value={kind} onChange={(event) => setKind(event.target.value as AgreementKind)} className={field}><option value="standard">{dict.standard}</option><option value="founders">{dict.founders}</option><option value="enterprise">{dict.enterprise}</option><option value="individual">{dict.individual}</option></select></label><label className="grid gap-1 text-sm font-semibold">{dict.agreementReference}<input value={reference} onChange={(event) => setReference(event.target.value)} inputMode="numeric" className={field} /></label><label className="grid gap-1 text-sm font-semibold">{dict.agreementPrice}<input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="numeric" className={field} /></label><label className="grid gap-1 text-sm font-semibold">{dict.validFrom}<input type="datetime-local" value={agreementFrom} onChange={(event) => setAgreementFrom(event.target.value)} className={field} /></label><label className="grid gap-1 text-sm font-semibold">{dict.validUntil}<input type="datetime-local" value={agreementUntil} onChange={(event) => setAgreementUntil(event.target.value)} className={field} /></label></div><p className="text-xs text-[var(--admin-text-muted)]">{dict.foundersNote}</p><label className="grid gap-1 text-sm font-semibold">{dict.reason}<input value={agreementReason} onChange={(event) => setAgreementReason(event.target.value)} className={field} /></label><button type="submit" disabled={pending} className={submitClass}>{dict.agreementCreate}</button></form></section>
      <section><h3 className="font-semibold">{dict.friendWaiver}</h3><p className="mt-2 text-sm text-[var(--admin-text-muted)]">{dict.friendWaiverNote}</p><form className="mt-4 grid gap-3 rounded-xl bg-[var(--admin-surface-muted)] p-3" onSubmit={saveWaiver} noValidate><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">{dict.agreementAccount}<select value={waiverAccountId} onChange={(event) => { setWaiverAccountId(event.target.value); setWaiverTargetIndex(""); }} className={field}><option value="">{dict.chooseFriend}</option>{directory.accounts.filter((account) => directory.friendTags.some((tag) => tag.accountId === account.accountId)).map((account) => <option key={account.accountId} value={account.accountId}>{account.name}</option>)}</select></label><label className="grid gap-1 text-sm font-semibold">{dict.agreementTarget}<select value={waiverTargetIndex} onChange={(event) => setWaiverTargetIndex(event.target.value)} disabled={!waiverTargets?.length} className={field}><option value="">{dict.chooseTarget}</option>{targetOptions(waiverTargets)}</select></label><label className="grid gap-1 text-sm font-semibold">{dict.validFrom}<input type="datetime-local" value={waiverFrom} onChange={(event) => setWaiverFrom(event.target.value)} className={field} /></label><label className="grid gap-1 text-sm font-semibold">{dict.validUntil}<input type="datetime-local" value={waiverUntil} onChange={(event) => setWaiverUntil(event.target.value)} className={field} /></label></div><label className="grid gap-1 text-sm font-semibold">{dict.reason}<input value={waiverReason} onChange={(event) => setWaiverReason(event.target.value)} className={field} /></label><button type="submit" disabled={pending} className={submitClass}>{dict.friendWaiverCreate}</button></form></section>
    </> : <>
      <section><h3 className="font-semibold">{dict.referral}</h3>{directory.referrals.length ? <AdminDataView
        className="mt-3"
        listKey="podesavanja.preporuke"
        caption={dict.referral}
        rows={directory.referrals}
        getRowId={(row) => row.id}
        columns={[
          { id: "referrer", header: dict.referrer, rowHeader: true, sortValue: (row) => accountName(row.referrerAccountId), cell: (row) => accountName(row.referrerAccountId) },
          { id: "referred", header: dict.referred, sortValue: (row) => accountName(row.referredAccountId), cell: (row) => accountName(row.referredAccountId) },
          { id: "status", header: dict.colStatus, sortValue: (row) => dict[row.status], cell: (row) => <span className="font-semibold">{dict[row.status]}</span> },
        ]}
        autoBreakpoint="md"
        renderCard={(row) => <span className="flex flex-wrap justify-between gap-2 text-sm"><span>{accountName(row.referrerAccountId)} → {accountName(row.referredAccountId)}</span><span className="font-semibold">{dict[row.status]}</span></span>}
      /> : <p className="mt-3 text-sm text-[var(--admin-text-muted)]">{dict.referralEmpty}</p>}<form className="mt-4 grid gap-3 rounded-xl bg-[var(--admin-surface-muted)] p-3 sm:grid-cols-2" onSubmit={saveReferral} noValidate><label className="grid gap-1 text-sm font-semibold">{dict.referrer}<select value={referrer} onChange={(event) => setReferrer(event.target.value)} className={field}><option value="">{dict.chooseAccount}</option>{accountOptions}</select></label><label className="grid gap-1 text-sm font-semibold">{dict.referred}<select value={referred} onChange={(event) => setReferred(event.target.value)} className={field}><option value="">{dict.chooseAccount}</option>{accountOptions}</select></label><label className="grid gap-1 text-sm font-semibold sm:col-span-2">{dict.reason}<input value={referralReason} onChange={(event) => setReferralReason(event.target.value)} className={field} /></label><button type="submit" disabled={pending} className={`${submitClass} sm:col-span-2`}>{dict.referralRegister}</button></form></section>
      <section><h3 className="font-semibold">{dict.rewardAgreement}</h3><p className="mt-2 text-sm text-[var(--admin-text-muted)]">{dict.rewardNote}</p><form className="mt-4 grid gap-3 rounded-xl bg-[var(--admin-surface-muted)] p-3" onSubmit={saveReward} noValidate><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">{dict.referral}<select value={referralId} onChange={(event) => { setReferralId(event.target.value); setRewardTargetIndex(""); }} className={field}><option value="">{dict.chooseReferral}</option>{directory.referrals.map((row) => <option key={row.id} value={row.id} disabled={row.status !== "qualified"}>{accountName(row.referrerAccountId)} → {accountName(row.referredAccountId)} · {dict[row.status]}</option>)}</select></label><label className="grid gap-1 text-sm font-semibold">{dict.agreementTarget}<select value={rewardTargetIndex} onChange={(event) => setRewardTargetIndex(event.target.value)} disabled={!rewardTargets?.length} className={field}><option value="">{dict.chooseTarget}</option>{targetOptions(rewardTargets)}</select></label><label className="grid gap-1 text-sm font-semibold">{dict.rewardType}<select value={rewardType} onChange={(event) => setRewardType(event.target.value as typeof rewardType)} className={field}><option value="percentage">{dict.percentage}</option><option value="fixed">{dict.fixedAmount}</option></select></label><label className="grid gap-1 text-sm font-semibold">{rewardType === "percentage" ? dict.basisPoints : dict.agreementPrice}<input value={rewardValue} onChange={(event) => setRewardValue(event.target.value)} inputMode="numeric" className={field} /></label><label className="grid gap-1 text-sm font-semibold">{dict.validFrom}<input type="datetime-local" value={rewardFrom} onChange={(event) => setRewardFrom(event.target.value)} className={field} /></label><label className="grid gap-1 text-sm font-semibold">{dict.validUntil}<input type="datetime-local" value={rewardUntil} onChange={(event) => setRewardUntil(event.target.value)} className={field} /></label></div><label className="grid gap-1 text-sm font-semibold">{dict.reason}<input value={rewardReason} onChange={(event) => setRewardReason(event.target.value)} className={field} /></label><button type="submit" disabled={pending} className={submitClass}>{dict.rewardCreate}</button></form></section>
    </>}
  </div>;
}

/** Dev preview: `?tab=` opens one of SETTINGS_TABS (e.g. `pricing` for the agreements list). */
export function AdminSettingsPreview({ tab }: { tab?: string }) {
  const initialTab = SETTINGS_TABS.find((value) => value === tab) ?? "general";
  return <AdminSettingsWorkspace key={initialTab} initialTab={initialTab} preview />;
}

export function AdminSettingsWorkspace({ initialTab = "general", preview = false }: { initialTab?: Tab; preview?: boolean }) {
  const liveSettings = useQuery(api.adminSettings.overview, preview ? "skip" : {});
  const liveEmail = useQuery(api.emailProviderFoundation.getStatus, preview ? "skip" : {});
  const settings = preview ? previewSettings : liveSettings;
  const email = preview ? previewEmail : liveEmail;
  const save = useMutation(api.adminSettings.setPremiumReference);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [amount, setAmount] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [rulesDirty, setRulesDirty] = useState(false);
  const { pending, run: runLocked } = useSubmissionLock();
  const [draftValidationNow] = useState(() => Date.now());
  const firstInvalid = useRef<HTMLInputElement | null>(null);
  const leaveTrigger = useRef<HTMLElement | null>(null);
  const priceDirty = Boolean(amount || validFrom || validUntil || reason);
  const dirty = priceDirty || rulesDirty;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.origin !== window.location.origin || anchor.pathname === window.location.pathname) return;
      event.preventDefault(); leaveTrigger.current = anchor; setPendingHref(anchor.href);
    };
    document.addEventListener("click", intercept, true); return () => document.removeEventListener("click", intercept, true);
  }, [dirty]);
  const initial = useMemo(() => settings ? { amount: String(settings.premiumReference.amountMinor), validFrom: datetimeLocal(settings.premiumReference.validFrom) } : null, [settings]);
  if (!settings || !email) return <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>;
  const formAmount = amount || initial?.amount || "", formFrom = validFrom || initial?.validFrom || "", currentVersion = settings.premiumReference.version;
  const draftAmountMinor = Number(formAmount), draftFrom = Date.parse(formFrom), draftUntil = validUntil ? Date.parse(validUntil) : null;
  const priceDraftErrorKind = premiumDraftError({ amountMinor: draftAmountMinor, validFrom: draftFrom, validUntil: draftUntil, reason, now: draftValidationNow });
  const priceDraftError = priceDraftErrorKind === "amount" ? dict.invalidAmount : priceDraftErrorKind === "date" ? dict.invalidDate : priceDraftErrorKind === "reason" ? dict.invalidReason : "";
  const priceDraftValid = !priceDraftError;
  function reset() { setAmount(""); setValidFrom(""); setValidUntil(""); setReason(""); setError(""); setNotice(""); }
  function closeLeaveDialog() {
    const trigger = leaveTrigger.current;
    const triggerTab = pendingTab;
    setPendingHref(null);
    setPendingTab(null);
    let frame = 0;
    const restoreFocus = () => {
      frame += 1;
      if (document.querySelector('[role="dialog"]') && frame < 30) {
        requestAnimationFrame(restoreFocus);
        return;
      }
      const tabTrigger = triggerTab ? document.querySelector<HTMLElement>(`[data-settings-tab="${triggerTab}"]`) : null;
      (tabTrigger ?? trigger)?.focus();
    };
    requestAnimationFrame(restoreFocus);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice("");
    if (priceDraftError) { setError(priceDraftError); firstInvalid.current?.focus(); return; }
    await runLocked(async () => {
      try { if (!preview) await save({ amountMinor: draftAmountMinor, validFrom: draftFrom, validUntil: draftUntil, reason: reason.trim(), key: crypto.randomUUID(), expectedVersion: currentVersion }); reset(); setNotice(dict.saved); } catch (caught) { setError(caught instanceof Error && caught.message.includes("admin_settings_conflict") ? dict.conflict : dict.saveFailed); }
    });
  }
  const connected = email.configured && email.syncEnabled && email.outboundEnabled;
  return <div className="grid min-w-0 gap-5">{preview ? <div><span className="rounded-full bg-[var(--admin-warning-soft)] px-2.5 py-1 text-xs font-bold text-[var(--admin-warning)]">{dict.previewBadge}</span><p className="mt-2 text-sm text-[var(--admin-text-muted)]">{dict.previewDescription}</p></div> : null}<header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{dict.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-text-muted)]">{dict.subtitle}</p></div>{dirty ? <AdminStatus label={dict.unsaved} tone="waiting" /> : null}</header>
    {notice ? <p role="status" className="flex items-center gap-2 rounded-xl bg-[var(--admin-success-soft)] px-3 py-2 text-sm font-medium text-[var(--admin-success)]"><CheckCircle2 className="size-4" aria-hidden="true" />{notice}</p> : null}
    <Dialog open={pendingHref !== null || pendingTab !== null} onOpenChange={(open) => { if (!open) closeLeaveDialog(); }}><DialogContent showCloseButton={false} onCloseAutoFocus={(event) => event.preventDefault()}><DialogHeader><DialogTitle>{dict.leaveDraftTitle}</DialogTitle><DialogDescription>{dict.leaveDraftBody}</DialogDescription></DialogHeader><DialogFooter><button type="button" onClick={closeLeaveDialog} className="min-h-11 rounded-lg border border-[var(--admin-border)] px-4 text-sm font-semibold">{dict.leaveDraftStay}</button><button type="button" onClick={() => { if (pendingHref) { window.location.assign(pendingHref); return; } if (pendingTab) { reset(); setRulesDirty(false); setTab(pendingTab); closeLeaveDialog(); } }} className="min-h-11 rounded-lg bg-[var(--admin-danger)] px-4 text-sm font-semibold text-white">{dict.leaveDraftLeave}</button></DialogFooter></DialogContent></Dialog>
    <div role="tablist" aria-label={dict.title} className="flex max-w-full gap-1 overflow-x-auto border-b border-[var(--admin-border)] pb-2">{tabs.map((item) => <button key={item} type="button" role="tab" data-settings-tab={item} aria-selected={tab === item} onClick={(event) => { if (dirty && item !== tab) { leaveTrigger.current = event.currentTarget; setPendingTab(item); } else setTab(item); }} className={cn("min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]", tab === item ? "bg-[var(--admin-ink)] text-[var(--admin-surface)]" : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)]")}>{dict[item]}</button>)}</div>
    <AdminPanel className="p-4 sm:p-6">
      {tab === "general" ? <section aria-labelledby="settings-general"><h2 id="settings-general" className="text-lg font-semibold">{dict.general}</h2><dl className="mt-4"><ReadOnlyFact label={dict.timezone} value="Europe/Belgrade" /><ReadOnlyFact label={dict.currency} value="RSD" /><ReadOnlyFact label={dict.policyVersion} value="ADMIN-V1" /></dl></section> : null}
      {tab === "subscriptions" ? <section aria-labelledby="settings-subscriptions"><h2 id="settings-subscriptions" className="text-lg font-semibold">{dict.subscriptions}</h2><p className="mt-2 text-sm text-[var(--admin-text-muted)]">{dict.readOnly}</p><dl className="mt-4 grid gap-x-8 sm:grid-cols-2"><ReadOnlyFact label={dict.monthlyWarning} value={`7 ${dict.days}`} /><ReadOnlyFact label={dict.annualWarning} value={`15 ${dict.days}`} /><ReadOnlyFact label={dict.monthlyGrace} value={`7 ${dict.days}`} /><ReadOnlyFact label={dict.annualGrace} value={`15 ${dict.days}`} /></dl><p className="mt-4 text-sm leading-6 text-[var(--admin-text-muted)]">{dict.lifecycleNote}</p></section> : null}
      {tab === "payments" ? <section aria-labelledby="settings-payments"><h2 id="settings-payments" className="text-lg font-semibold">{dict.payments}</h2><dl className="mt-4"><ReadOnlyFact label={dict.bankTransfer} value={dict.supported} /><ReadOnlyFact label={dict.card} value={dict.unavailable} /><ReadOnlyFact label={dict.cash} value={dict.notConfigured} /></dl><p className="mt-4 text-sm leading-6 text-[var(--admin-text-muted)]">{dict.paymentNote}</p></section> : null}
      {tab === "communication" ? <section aria-labelledby="settings-communication"><h2 id="settings-communication" className="text-lg font-semibold">{dict.communication}</h2><div className="mt-4 flex flex-wrap gap-2"><AdminStatus label={dict.foundation} tone="active" /><AdminStatus label={connected ? dict.configured : dict.needsConfiguration} tone={connected ? "active" : "waiting"} /><AdminStatus label={connected ? dict.configured : dict.notConnected} tone={connected ? "active" : "problem"} /></div><p className="mt-4 text-sm leading-6 text-[var(--admin-text-muted)]">{dict.communicationNote}</p></section> : null}
      {tab === "pricing" ? <section aria-labelledby="settings-pricing"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="settings-pricing" className="text-lg font-semibold">{dict.pricing}</h2><p className="mt-1 text-sm text-[var(--admin-text-muted)]">{dict.temporary}</p></div><strong className="font-mono text-xl tabular-nums">{money(settings.premiumReference.amountMinor)} / {dict.monthly}</strong></div><p className="mt-4 text-sm leading-6 text-[var(--admin-text-muted)]">{dict.priceNote}</p><p className="mt-3 rounded-xl bg-[var(--admin-surface-muted)] p-3 text-sm leading-6 text-[var(--admin-text-muted)]"><LockKeyhole className="mr-2 inline size-4" aria-hidden="true" />{dict.agreementNote}</p><form className="mt-6 grid gap-4 border-t border-[var(--admin-border)] pt-5" onSubmit={submit} noValidate><h3 className="font-semibold">{dict.futurePrice}</h3><FieldError message={error} /><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-semibold">{dict.amount}<input ref={firstInvalid} value={formAmount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" className="min-h-11 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 font-mono tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]" /></label><label className="grid gap-1.5 text-sm font-semibold">{dict.validFrom}<input type="datetime-local" value={formFrom} onChange={(event) => setValidFrom(event.target.value)} className="min-h-11 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]" /></label><label className="grid gap-1.5 text-sm font-semibold">{dict.validUntil}<input type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="min-h-11 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]" /></label><label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">{dict.reason}<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={dict.reasonPlaceholder} className="min-h-11 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]" /></label></div><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={pending} onClick={reset} className="min-h-11 rounded-lg border border-[var(--admin-border)] px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]">{dict.cancel}</button><button type="submit" disabled={pending || !priceDraftValid} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 text-sm font-semibold text-[var(--admin-surface)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]"><Save className="size-4" aria-hidden="true" />{dict.save}</button></div></form><AgreementRules section="pricing" preview={preview} onDirtyChange={setRulesDirty} /></section> : null}
      {tab === "referral" ? <section aria-labelledby="settings-referral"><h2 id="settings-referral" className="text-lg font-semibold">{dict.referral}</h2><p className="mt-4 text-sm leading-6 text-[var(--admin-text-muted)]">{dict.referralNote}</p><AgreementRules section="referral" preview={preview} onDirtyChange={setRulesDirty} /></section> : null}
    </AdminPanel>
  </div>;
}
export class AdminSettingsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    return this.state.failed ? <AdminPanel><AdminErrorState title={dict.error} onRetry={() => window.location.reload()} /></AdminPanel> : this.props.children;
  }
}
