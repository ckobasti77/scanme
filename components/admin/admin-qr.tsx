"use client";

import { ChevronRight, CircleEllipsis } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminPanel, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";
import { useAdminUrlState } from "@/components/admin/admin-ui/use-admin-query-state";
import { ChannelSignal } from "@/components/admin/admin-products-surface";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import type { AccessColor } from "@/lib/admin-v1/products-workspace";
import { filterPreviewChannels } from "@/lib/admin-v2/lists/qr";
import { QR_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/operations";
import { getDict } from "@/lib/i18n";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";

const dict = getDict("admin-products");

export type TechnicalChannelRow = {
  id: string;
  accountId: string;
  businessId: string;
  resolverCode: string;
  smqCode?: string | null;
  smfCode?: string | null;
  accountName: string;
  smkCode: string;
  venueName: string;
  smlCode: string;
  city: string | null;
  binding: "digital" | "physical";
  kind: "qr" | "nfc";
  color: AccessColor;
  state: "active" | "inactive" | "problem";
  health: "healthy" | "unverified" | "broken";
  reason?: string | null;
  updatedAt: number;
};

export type ChannelDetailMeta = {
  destinationHistory: string;
  channelHistory: string;
  scanAttribution: string;
};

type Props = {
  channels: TechnicalChannelRow[];
  status: "loading" | "ready" | "error";
  canLoadMore?: boolean;
  loadingMore?: boolean;
  preview?: boolean;
  onChannelSelected?: (channel: TechnicalChannelRow | null) => void;
  onLoadMore?: () => void;
  onRetry?: () => void;
  detailMeta?: ChannelDetailMeta;
  initialChannelId?: string;
};

function State({ row }: { row: TechnicalChannelRow }) {
  const label = row.state === "active" ? dict.stateActive : row.state === "inactive" ? dict.stateInactive : dict.stateProblem;
  const tone = row.state === "active" ? "text-[var(--admin-success)]" : row.state === "inactive" ? "text-[var(--admin-warning)]" : "text-[var(--admin-danger)]";
  return <span className={cn("inline-flex items-center gap-2 text-sm font-semibold", tone)}><span className="size-2 rounded-full bg-current" aria-hidden="true" />{label}</span>;
}

function healthLabel(health: TechnicalChannelRow["health"]) {
  return health === "healthy" ? dict.healthHealthy : health === "unverified" ? dict.healthUnverified : dict.healthBroken;
}

function ChannelDrawer({ row, meta, onClose }: { row: TechnicalChannelRow | null; meta?: ChannelDetailMeta; onClose: () => void }) {
  const close = () => { const id = row?.id; onClose(); if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-channel-trigger="${id}"]`)?.focus()); };
  return <Sheet open={Boolean(row)} onOpenChange={(open) => { if (!open) close(); }}><SheetContent side="right" data-reveal="off" className="admin-v1 w-full max-w-none overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 sm:max-w-[32rem] motion-reduce:duration-0"><SheetHeader className="border-b border-[var(--admin-border)] p-5 pr-14 text-left"><SheetTitle>{dict.technicalDetail}</SheetTitle><SheetDescription>{row?.resolverCode ?? ""}</SheetDescription></SheetHeader>{row ? <div className="grid gap-5 p-5"><section className="flex items-center gap-3"><ChannelSignal kind={row.kind} color={row.color} reason={row.reason} /><div><strong className="block font-mono text-sm">{row.smqCode ?? row.smfCode ?? row.resolverCode}</strong><span className="text-sm text-[var(--admin-text-muted)]">{row.binding === "digital" ? dict.bindingDigital : dict.bindingPhysical}</span></div></section><TechnicalField label={dict.colContext} value={`${row.accountName} · ${row.smkCode}\n${row.venueName} · ${row.smlCode}${row.city ? ` · ${row.city}` : ""}`} /><TechnicalField label={dict.channelState} value={row.state === "active" ? dict.stateActive : row.state === "inactive" ? dict.stateInactive : dict.stateProblem} /><TechnicalField label={dict.colHealth} value={healthLabel(row.health)} /><TechnicalField label={dict.channelReason} value={row.reason ?? dict.unknownValue} /><TechnicalField label={dict.destinationHistory} value={meta?.destinationHistory ?? dict.loading} /><TechnicalField label={dict.channelHistory} value={meta?.channelHistory ?? dict.loading} /><TechnicalField label={dict.scanAttribution} value={meta?.scanAttribution ?? dict.loading} /><TechnicalField label={dict.auditUpdated} value={new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" }).format(row.updatedAt)} /></div> : null}</SheetContent></Sheet>;
}
function TechnicalField({ label, value }: { label: string; value: string }) { return <section><h3 className="text-sm font-semibold">{label}</h3><p className="mt-1 whitespace-pre-line break-words text-sm text-[var(--admin-text-muted)]">{value}</p></section>; }

const UPDATED_COLUMN = "hidden @6xl:table-cell";

// ADMIN v2 — the filters (search, povezanost, vrsta, status) are in the
// sidebar and in the URL (lib/admin-v2/lists/qr.ts); the container passes the
// rows they already selected. The table / cards break on the width of the
// screen, which is narrower than the window beside the sidebar.
export function AdminQrSurface(props: Props) {
  const [detailSelection, setDetail] = useState<TechnicalChannelRow | null | undefined>(undefined);
  const detail = detailSelection === undefined
    ? props.channels.find((row) => row.id === props.initialChannelId) ?? null
    : detailSelection;
  const openDetail = (row: TechnicalChannelRow) => { setDetail(row); props.onChannelSelected?.(row); };
  const closeDetail = () => { setDetail(null); props.onChannelSelected?.(null); };
  return <div className="@container grid min-w-0 gap-5 sm:gap-6">
    <AdminPageHeader eyebrow={adminV1Sr.navOperations} title={dict.qrModuleTitle} badge={props.preview ? <AdminStatus label={dict.previewBadge} tone="waiting" /> : undefined} description={props.preview ? dict.previewDescription : dict.qrModuleSubtitle} />
    {props.status === "loading" ? <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel> : props.status === "error" ? <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} />{props.onRetry ? <div className="pb-6 text-center"><Button type="button" variant="outline" onClick={props.onRetry}>{dict.retry}</Button></div> : null}</AdminPanel> : props.channels.length ? <>
      <AdminTable caption={dict.channelTableCaption} className="hidden @4xl:block"><thead className="bg-[var(--admin-surface-muted)] text-xs text-[var(--admin-text-muted)]"><tr>{[dict.colCode, dict.colKind, dict.colContext, dict.colStatus, dict.colHealth].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}<th className={cn("px-4 py-3 font-semibold", UPDATED_COLUMN)}>{dict.colUpdated}</th><th className="px-4 py-3 font-semibold">{dict.colActions}</th></tr></thead><tbody className="divide-y divide-[var(--admin-border)]">{props.channels.map((row) => <tr key={row.id} className="hover:bg-[var(--admin-surface-muted)]/60"><td className="px-4 py-3"><strong className="block font-mono text-sm">{row.smqCode ?? row.smfCode ?? row.resolverCode}</strong><span className="block truncate font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{row.resolverCode}</span></td><td className="px-4 py-3"><span className="flex items-center gap-2"><ChannelSignal kind={row.kind} color={row.color} reason={row.reason} /><span className="text-sm font-semibold">{row.kind === "qr" ? dict.channelQr : dict.channelNfc}</span></span></td><td className="px-4 py-3"><strong className="block text-sm">{row.venueName}</strong><span className="text-xs text-[var(--admin-text-muted)]">{row.accountName} · {row.smkCode} · {row.smlCode}</span></td><td className="px-4 py-3"><State row={row} /></td><td className="px-4 py-3 text-sm text-[var(--admin-text-muted)]">{healthLabel(row.health)}</td><td className={cn("px-4 py-3 text-xs text-[var(--admin-text-muted)]", UPDATED_COLUMN)}><time dateTime={new Date(row.updatedAt).toISOString()}>{new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "short", timeStyle: "short" }).format(row.updatedAt)}</time></td><td className="px-3 py-3"><button data-channel-trigger={row.id} type="button" onClick={() => openDetail(row)} className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.technicalDetail}: ${row.resolverCode}`}><CircleEllipsis className="size-5" aria-hidden="true" /></button></td></tr>)}</tbody></AdminTable>
      <div className="grid gap-2 @4xl:hidden">{props.channels.map((row) => <button key={row.id} data-channel-trigger={row.id} type="button" onClick={() => openDetail(row)} className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-left shadow-[var(--admin-shadow-xs)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><ChannelSignal kind={row.kind} color={row.color} reason={row.reason} /><span className="min-w-0"><strong className="block truncate font-mono text-sm">{row.smqCode ?? row.smfCode ?? row.resolverCode}</strong><span className="mt-1 block truncate text-xs text-[var(--admin-text-muted)]">{row.venueName} · {row.smlCode}</span><span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{row.binding === "digital" ? dict.bindingDigital : dict.bindingPhysical} · {healthLabel(row.health)}</span></span><ChevronRight className="size-4" aria-hidden="true" /></button>)}</div>
    </> : <AdminPanel><AdminEmptyState title={dict.noChannelsTitle} body={dict.noChannelsBody} /></AdminPanel>}
    {props.canLoadMore ? <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? dict.loadingMore : dict.loadMore}</Button> : null}
    <ChannelDrawer row={detail} meta={props.detailMeta} onClose={closeDetail} />
  </div>;
}

const previewChannels: TechnicalChannelRow[] = [{ id: "channel-digital", accountId: "account-most", businessId: "business-kej", resolverCode: "r-9QM4Z", smqCode: "SMQ-0102-01-016", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Kej", smlCode: "SML-102-01", city: "Beograd", binding: "digital", kind: "qr", color: "green", state: "active", health: "healthy", updatedAt: Date.parse("2026-09-14T09:12:00Z") }, { id: "channel-problem", accountId: "account-most", businessId: "business-kej", resolverCode: "r-YC91Q", smfCode: "SMF-0102-01-011", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Kej", smlCode: "SML-102-01", city: "Beograd", binding: "physical", kind: "qr", color: "red", state: "problem", health: "broken", reason: "Odredište nije validno", updatedAt: Date.parse("2026-09-13T15:22:00Z") }, { id: "channel-nfc", accountId: "account-most", businessId: "business-kej", resolverCode: "nfc-RZ11", smfCode: "SMF-0102-01-010", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Kej", smlCode: "SML-102-01", city: "Beograd", binding: "physical", kind: "nfc", color: "orange", state: "inactive", health: "healthy", reason: "Redirect je isključen", updatedAt: Date.parse("2026-09-14T08:10:00Z") }];


export function AdminQrPreview() {
  const [state] = useAdminUrlState(QR_URL_FIELDS);
  return <AdminQrSurface channels={filterPreviewChannels(previewChannels, state)} status="ready" preview detailMeta={{ destinationHistory: dict.noHistory, channelHistory: dict.noHistory, scanAttribution: dict.noHistory }} />;
}
