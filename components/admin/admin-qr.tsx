"use client";

import { ChevronRight, CircleEllipsis } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { AdminDataView, type AdminColumn } from "@/components/admin/admin-ui";
import { ChannelSignal } from "@/components/admin/admin-products-surface";
import type { AccessColor } from "@/lib/admin-v1/products-workspace";
import { getDict } from "@/lib/i18n";
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

type ChannelFilters = {
  search: string;
  binding: "all" | "digital" | "physical";
  kind: "all" | "qr" | "nfc";
  state: "all" | "active" | "inactive" | "problem";
};

type Props = {
  channels: TechnicalChannelRow[];
  status: "loading" | "ready" | "error";
  canLoadMore?: boolean;
  loadingMore?: boolean;
  preview?: boolean;
  onFiltersChange?: (filters: ChannelFilters) => void;
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

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><span className="sr-only">{label}</span><select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold">{children}</select></label>;
}

function ChannelDrawer({ row, meta, onClose }: { row: TechnicalChannelRow | null; meta?: ChannelDetailMeta; onClose: () => void }) {
  const close = () => { const id = row?.id; onClose(); if (id) requestAnimationFrame(() => [...document.querySelectorAll<HTMLElement>(`[data-channel-trigger="${id}"]`)].find((element) => element.offsetParent !== null)?.focus()); };
  return <Sheet open={Boolean(row)} onOpenChange={(open) => { if (!open) close(); }}><SheetContent side="right" data-reveal="off" className="admin-v1 w-full max-w-none overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 sm:max-w-[32rem] motion-reduce:duration-0"><SheetHeader className="border-b border-[var(--admin-border)] p-5 pr-14 text-left"><SheetTitle>{dict.technicalDetail}</SheetTitle><SheetDescription>{row?.resolverCode ?? ""}</SheetDescription></SheetHeader>{row ? <div className="grid gap-5 p-5"><section className="flex items-center gap-3"><ChannelSignal kind={row.kind} color={row.color} reason={row.reason} /><div><strong className="block font-mono text-sm">{row.smqCode ?? row.smfCode ?? row.resolverCode}</strong><span className="text-sm text-[var(--admin-text-muted)]">{row.binding === "digital" ? dict.bindingDigital : dict.bindingPhysical}</span></div></section><TechnicalField label={dict.colContext} value={`${row.accountName} · ${row.smkCode}\n${row.venueName} · ${row.smlCode}${row.city ? ` · ${row.city}` : ""}`} /><TechnicalField label={dict.channelState} value={row.state === "active" ? dict.stateActive : row.state === "inactive" ? dict.stateInactive : dict.stateProblem} /><TechnicalField label={dict.colHealth} value={healthLabel(row.health)} /><TechnicalField label={dict.channelReason} value={row.reason ?? dict.unknownValue} /><TechnicalField label={dict.destinationHistory} value={meta?.destinationHistory ?? dict.loading} /><TechnicalField label={dict.channelHistory} value={meta?.channelHistory ?? dict.loading} /><TechnicalField label={dict.scanAttribution} value={meta?.scanAttribution ?? dict.loading} /><TechnicalField label={dict.auditUpdated} value={new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" }).format(row.updatedAt)} /></div> : null}</SheetContent></Sheet>;
}
function TechnicalField({ label, value }: { label: string; value: string }) { return <section><h3 className="text-sm font-semibold">{label}</h3><p className="mt-1 whitespace-pre-line break-words text-sm text-[var(--admin-text-muted)]">{value}</p></section>; }

const channelUpdated = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "short", timeStyle: "short" });

function channelColumns(onOpen: (row: TechnicalChannelRow) => void): AdminColumn<TechnicalChannelRow>[] {
  return [
    { id: "code", header: dict.colCode, rowHeader: true, sortValue: (row) => row.smqCode ?? row.smfCode ?? row.resolverCode, cell: (row) => <><strong className="block font-mono text-sm">{row.smqCode ?? row.smfCode ?? row.resolverCode}</strong><span className="block truncate font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{row.resolverCode}</span></> },
    { id: "kind", header: dict.colKind, sortValue: (row) => row.kind, cell: (row) => <span className="flex items-center gap-2"><ChannelSignal kind={row.kind} color={row.color} reason={row.reason} /><span className="text-sm font-semibold">{row.kind === "qr" ? dict.channelQr : dict.channelNfc}</span></span> },
    { id: "context", header: dict.colContext, sortValue: (row) => row.venueName, cell: (row) => <><strong className="block text-sm">{row.venueName}</strong><span className="text-xs text-[var(--admin-text-muted)]">{row.accountName} · {row.smkCode} · {row.smlCode}</span></> },
    { id: "status", header: dict.colStatus, sortValue: (row) => row.state, cell: (row) => <State row={row} /> },
    { id: "health", header: dict.colHealth, sortValue: (row) => healthLabel(row.health), className: "text-sm text-[var(--admin-text-muted)]", cell: (row) => healthLabel(row.health) },
    { id: "updated", header: dict.colUpdated, sortValue: (row) => row.updatedAt, className: "text-xs text-[var(--admin-text-muted)]", cell: (row) => <time dateTime={new Date(row.updatedAt).toISOString()}>{channelUpdated.format(row.updatedAt)}</time> },
    { id: "actions", header: dict.colActions, cell: (row) => <button data-channel-trigger={row.id} type="button" onClick={() => onOpen(row)} className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.technicalDetail}: ${row.resolverCode}`}><CircleEllipsis className="size-5" aria-hidden="true" /></button> },
  ];
}

function ChannelCard({ row, onOpen }: { row: TechnicalChannelRow; onOpen: (row: TechnicalChannelRow) => void }) {
  return <button data-channel-trigger={row.id} type="button" onClick={() => onOpen(row)} className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--admin-focus)]"><ChannelSignal kind={row.kind} color={row.color} reason={row.reason} /><span className="min-w-0"><strong className="block truncate font-mono text-sm">{row.smqCode ?? row.smfCode ?? row.resolverCode}</strong><span className="mt-1 block truncate text-xs text-[var(--admin-text-muted)]">{row.venueName} · {row.smlCode}</span><span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{row.binding === "digital" ? dict.bindingDigital : dict.bindingPhysical} · {healthLabel(row.health)}</span></span><ChevronRight className="size-4" aria-hidden="true" /></button>;
}

export function AdminQrSurface(props: Props) {
  const [filters, setFilters] = useState<ChannelFilters>({ search: "", binding: "all", kind: "all", state: "all" });
  const [detailSelection, setDetail] = useState<TechnicalChannelRow | null | undefined>(undefined);
  const detail = detailSelection === undefined
    ? props.channels.find((row) => row.id === props.initialChannelId) ?? null
    : detailSelection;
  const set = <K extends keyof ChannelFilters>(key: K, value: ChannelFilters[K]) => { const next = { ...filters, [key]: value }; setFilters(next); props.onFiltersChange?.(next); };
  const visible = useMemo(() => { if (props.onFiltersChange) return props.channels; const term = filters.search.trim().toLocaleLowerCase("sr-Latn-RS"); return props.channels.filter((row) => (!term || `${row.resolverCode} ${row.smqCode ?? ""} ${row.smfCode ?? ""} ${row.accountName} ${row.venueName} ${row.smkCode} ${row.smlCode}`.toLocaleLowerCase("sr-Latn-RS").includes(term)) && (filters.binding === "all" || row.binding === filters.binding) && (filters.kind === "all" || row.kind === filters.kind) && (filters.state === "all" || row.state === filters.state)); }, [filters, props.channels, props.onFiltersChange]);
  const openDetail = (row: TechnicalChannelRow) => { setDetail(row); props.onChannelSelected?.(row); };
  const closeDetail = () => { setDetail(null); props.onChannelSelected?.(null); };
  return <div className="grid min-w-0 gap-5 sm:gap-6"><header className="grid gap-2">{props.preview ? <span data-reveal="off" className="w-fit rounded-full border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-2.5 py-1 text-xs font-bold text-[var(--admin-warning)]">{dict.previewBadge}</span> : null}<h1 className="text-[clamp(2rem,4vw,3.4rem)] leading-none font-semibold tracking-[-0.055em]">{dict.qrModuleTitle}</h1><p className="max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)] sm:text-base">{props.preview ? dict.previewDescription : dict.qrModuleSubtitle}</p></header><div data-reveal="off" className="grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_auto_auto_auto]"><label className="grid gap-1.5"><span className="sr-only">{dict.channelSearchLabel}</span><Input value={filters.search} onChange={(event) => set("search", event.target.value)} placeholder={dict.channelSearchPlaceholder} className="min-h-11 bg-[var(--admin-surface-strong)]" /></label><Filter label={dict.bindingFilter} value={filters.binding} onChange={(value) => set("binding", value as ChannelFilters["binding"])}><option value="all">{dict.bindingAll}</option><option value="digital">{dict.bindingDigital}</option><option value="physical">{dict.bindingPhysical}</option></Filter><Filter label={dict.kindFilter} value={filters.kind} onChange={(value) => set("kind", value as ChannelFilters["kind"])}><option value="all">{dict.kindAll}</option><option value="qr">{dict.channelQr}</option><option value="nfc">{dict.channelNfc}</option></Filter><Filter label={dict.healthFilter} value={filters.state} onChange={(value) => set("state", value as ChannelFilters["state"])}><option value="all">{dict.filterAll}</option><option value="active">{dict.stateActive}</option><option value="inactive">{dict.stateInactive}</option><option value="problem">{dict.stateProblem}</option></Filter></div>{props.status === "loading" ? <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel> : props.status === "error" ? <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} />{props.onRetry ? <div className="pb-6 text-center"><Button type="button" variant="outline" onClick={props.onRetry}>{dict.retry}</Button></div> : null}</AdminPanel> : visible.length ? <AdminDataView listKey="operativa.qr" caption={dict.channelTableCaption} rows={visible} getRowId={(row) => row.id} columns={channelColumns(openDetail)} tableClassName="min-w-[64rem]" renderCard={(row) => <ChannelCard row={row} onOpen={openDetail} />} /> : <AdminPanel><AdminEmptyState title={dict.noChannelsTitle} body={dict.noChannelsBody} /></AdminPanel>}{props.canLoadMore ? <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? dict.loadingMore : dict.loadMore}</Button> : null}<ChannelDrawer row={detail} meta={props.detailMeta} onClose={closeDetail} /></div>;
}

const previewChannels: TechnicalChannelRow[] = [{ id: "channel-digital", accountId: "account-most", businessId: "business-kej", resolverCode: "r-9QM4Z", smqCode: "SMQ-0102-01-016", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Kej", smlCode: "SML-102-01", city: "Beograd", binding: "digital", kind: "qr", color: "green", state: "active", health: "healthy", updatedAt: Date.parse("2026-09-14T09:12:00Z") }, { id: "channel-problem", accountId: "account-most", businessId: "business-kej", resolverCode: "r-YC91Q", smfCode: "SMF-0102-01-011", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Kej", smlCode: "SML-102-01", city: "Beograd", binding: "physical", kind: "qr", color: "red", state: "problem", health: "broken", reason: "Odredište nije validno", updatedAt: Date.parse("2026-09-13T15:22:00Z") }, { id: "channel-nfc", accountId: "account-most", businessId: "business-kej", resolverCode: "nfc-RZ11", smfCode: "SMF-0102-01-010", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Kej", smlCode: "SML-102-01", city: "Beograd", binding: "physical", kind: "nfc", color: "orange", state: "inactive", health: "healthy", reason: "Redirect je isključen", updatedAt: Date.parse("2026-09-14T08:10:00Z") }];

export function AdminQrPreview() { return <AdminQrSurface channels={previewChannels} status="ready" preview detailMeta={{ destinationHistory: dict.noHistory, channelHistory: dict.noHistory, scanAttribution: dict.noHistory }} />; }
