"use client";

import { Component, type ReactNode, useDeferredValue, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ExternalLink, MoreHorizontal, Package, QrCode, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAdminUrlState } from "@/components/admin/admin-ui/use-admin-query-state";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import { filterPreviewServices, servicesAreFiltered, servicesListArgs } from "@/lib/admin-v2/lists/services";
import { SERVICES_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/services";
import { fmt } from "@/lib/i18n/format";
import { adminServicesSr as dict } from "@/lib/i18n/sr/admin-services";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminPanel, AdminStatus, AdminTable } from "./admin-primitives";

type ServiceType = "scanme_links" | "google_review" | "scanme_menu";
type Filter = "all" | "active" | "grace" | "suspended" | "inactive" | "warning" | "problem";
type ServiceRow = FunctionReturnType<typeof api.adminServiceOperations.list>["page"][number];

const pageSize = 24;

const serviceTitles: Record<ServiceType, string> = {
  scanme_links: dict.titleLinks,
  google_review: dict.titleReview,
  scanme_menu: dict.titleMenu,
};

const previewProfileId = (value: string) => value as Id<"serviceProfiles">;
const previewRows: ServiceRow[] = [
  {
    accountId: "preview-account" as Id<"accounts">,
    businessId: "preview-bistro-most" as Id<"businesses">,
    serviceProfileId: previewProfileId("preview-links-most"),
    serviceType: "scanme_links",
    subscriptionState: "active",
    warning: true,
    paidThrough: Date.parse("2026-10-08T00:00:00Z"),
    graceEndsAt: null,
    configurationState: "published",
    filterState: "warning",
    smkCode: "SMK-DEMO-01",
    smlCode: "SML-DEMO-01",
    accountName: "Demo nalog",
    ownerDisplayName: "Demo vlasnik",
    venueName: "Demo lokal — Kej",
    publicSlug: "demo-links",
    productCount: 12,
    qrCount: 11,
    nfcCount: 9,
    problemCount: 1,
    signal: { severity: "warning", causeId: "demo-warning" },
    updatedAt: Date.parse("2026-09-15T09:00:00Z"),
  },
  {
    accountId: "preview-account" as Id<"accounts">,
    businessId: "preview-bistro-centar" as Id<"businesses">,
    serviceProfileId: previewProfileId("preview-review-centar"),
    serviceType: "google_review",
    subscriptionState: "active",
    warning: false,
    paidThrough: Date.parse("2026-10-20T00:00:00Z"),
    graceEndsAt: null,
    configurationState: "configured",
    filterState: "active",
    smkCode: "SMK-DEMO-01",
    smlCode: "SML-DEMO-02",
    accountName: "Demo nalog",
    ownerDisplayName: "Demo vlasnik",
    venueName: "Demo lokal — Centar",
    publicSlug: "demo-review",
    productCount: 8,
    qrCount: 8,
    nfcCount: 8,
    problemCount: 0,
    signal: { severity: null, causeId: null },
    updatedAt: Date.parse("2026-09-14T09:00:00Z"),
  },
  {
    accountId: "preview-account" as Id<"accounts">,
    businessId: "preview-bistro-terasa" as Id<"businesses">,
    serviceProfileId: previewProfileId("preview-menu-terasa"),
    serviceType: "scanme_menu",
    subscriptionState: "grace",
    warning: false,
    paidThrough: Date.parse("2026-09-08T00:00:00Z"),
    graceEndsAt: Date.parse("2026-09-15T00:00:00Z"),
    configurationState: "draft",
    filterState: "problem",
    smkCode: "SMK-DEMO-02",
    smlCode: "SML-DEMO-03",
    accountName: "Demo ugostiteljstvo",
    ownerDisplayName: "Demo vlasnik",
    venueName: "Demo lokal — Terasa",
    publicSlug: "demo-meni",
    productCount: 7,
    qrCount: 7,
    nfcCount: 4,
    problemCount: 1,
    signal: { severity: "blocking", causeId: "demo-problem" },
    updatedAt: Date.parse("2026-09-13T09:00:00Z"),
  },
];

function labelForState(state: Exclude<Filter, "all">) {
  return state === "active" ? dict.statusActive
    : state === "grace" ? dict.statusGrace
      : state === "suspended" ? dict.statusSuspended
        : state === "inactive" ? dict.statusInactive
          : state === "warning" ? dict.statusWarning
            : dict.statusProblem;
}

function stateTone(state: Exclude<Filter, "all">) {
  return state === "active" ? "active" as const
    : state === "grace" || state === "warning" ? "waiting" as const
      : state === "problem" || state === "suspended" ? "problem" as const
        : "neutral" as const;
}

function configurationLabel(state: ServiceRow["configurationState"]) {
  return state === "published" ? dict.configurationPublished
    : state === "draft" ? dict.configurationDraft
      : state === "configured" ? dict.configurationConfigured
        : state === "inactive" ? dict.configurationInactive
          : dict.configurationUnconfigured;
}

function formatDate(value: number | null) {
  return value === null ? dict.noData : new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium" }).format(value);
}

function channels(row: ServiceRow) {
  if (row.productCount === null || row.qrCount === null || row.nfcCount === null) return dict.channelsUnavailable;
  return fmt(dict.channelsSummary, { products: row.productCount, qr: row.qrCount, nfc: row.nfcCount });
}

function previewDetail(row: ServiceRow): NonNullable<FunctionReturnType<typeof api.adminServiceOperations.detail>> {
  return {
    row,
    editorHref: "/dev/admin-services-preview",
    publicHref: null,
    clientHref: "/dev/admin-services-preview",
    googleDestination: null,
    actions: [],
  };
}

export function AdminServiceOperations({ serviceType, preview = false, initialServiceProfileId }: { serviceType: ServiceType; preview?: boolean; initialServiceProfileId?: string }) {
  // The view, search and sort are in the sidebar of the frame and in the URL (`pogled`, `q`, `sort`).
  const [urlState] = useAdminUrlState(SERVICES_URL_FIELDS);
  const [selectedId, setSelectedId] = useState<Id<"serviceProfiles"> | null>(() => preview
    ? previewRows[0]?.serviceProfileId ?? null
    : (initialServiceProfileId as Id<"serviceProfiles"> | undefined) ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [lifecycleOpen, setLifecycleOpen] = useState<"suspend" | "reactivate" | null>(null);
  const [lifecycleKey, setLifecycleKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const listState = useDeferredValue(urlState);
  const list = usePaginatedQuery(api.adminServiceOperations.list, preview ? "skip" : { serviceType, ...servicesListArgs(listState) }, { initialNumItems: pageSize });
  const rows = preview ? filterPreviewServices(previewRows, serviceType, listState) : list.results;
  const detail = useQuery(
    api.adminServiceOperations.detail,
    selectedId && !preview ? { serviceProfileId: selectedId } : "skip",
  );
  const selectedRow = rows.find((row) => row.serviceProfileId === selectedId)
    ?? (!preview && selectedId === initialServiceProfileId && detail && detail.row.serviceType === serviceType ? detail.row : null)
    ?? (preview ? rows[0] ?? null : null);
  const changeLifecycle = useMutation(api.adminServiceOperations.changeLifecycle);

  const select = (
    id: Id<"serviceProfiles">,
    mobile = false,
    mobileTrigger?: HTMLButtonElement,
  ) => {
    setSelectedId(id);
    if (mobileTrigger) mobileTriggerRef.current = mobileTrigger;
    setMobileOpen(mobile);
  };
  const openLifecycle = (operation: "suspend" | "reactivate") => {
    setLifecycleOpen(operation);
    setLifecycleKey(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  };
  const executeLifecycle = async () => {
    if (!selectedId || !lifecycleOpen || !lifecycleKey || !reason.trim()) return;
    setMutationError(null);
    if (preview) {
      setLifecycleOpen(null);
      return;
    }
    try {
      await changeLifecycle({
        serviceProfileId: selectedId,
        operation: lifecycleOpen,
        reason: reason.trim(),
        key: lifecycleKey,
      });
      setLifecycleOpen(null);
      setReason("");
    } catch {
      setMutationError(dict.changeFailed);
    }
  };

  // The detail panel sits beside the list from a 56 rem screen; below that a card opens it in a sheet.
  const detailBesideList = () => (asideRef.current?.getClientRects().length ?? 0) > 0;
  const filtered = servicesAreFiltered(listState);

  return (
    <section className="grid gap-5">
      <AdminPageHeader
        eyebrow={adminV1Sr.navServices}
        title={serviceTitles[serviceType]}
        description={preview ? dict.previewDescription : dict.subtitle}
        badge={preview ? <AdminStatus label={dict.previewBadge} tone="waiting" /> : undefined}
      />

      {/* The list and the detail panel follow the width of the screen beside the sidebar, not of the window: the panel sits beside the list from 56 rem. */}
      <div className="@container">
      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1fr)_24rem] @4xl:items-start">
      <AdminPanel className="@container">
        {!preview && list.status === "LoadingFirstPage" ? <AdminLoadingState /> : rows.length === 0 ? <AdminEmptyState title={filtered ? dict.emptyFilteredTitle : dict.emptyTitle} body={filtered ? dict.emptyFilteredBody : dict.emptyBody} /> : (
          <>
            <div className="hidden @4xl:block">
              <AdminTable caption={dict.tableCaption} className="m-3 rounded-xl" tableClassName="table-fixed">
                <thead className="border-b border-[var(--admin-border)] text-xs font-semibold text-[var(--admin-text-muted)]"><tr><th className="w-[25%] px-4 py-3">{dict.colVenue}</th><th className="w-[13%] px-3 py-3">{dict.colStatus}</th><th className="w-[14%] px-3 py-3">{dict.colSubscription}</th><th className="w-[14%] px-3 py-3">{dict.colConfiguration}</th><th className="w-[18%] px-3 py-3">{dict.colChannels}</th><th className="w-[12%] px-3 py-3">{dict.colActivity}</th><th className="w-14 px-3 py-3"><span className="sr-only">{dict.colActions}</span></th></tr></thead>
                <tbody>{rows.map((row) => <ServiceDesktopRow key={row.serviceProfileId} row={row} selected={row.serviceProfileId === selectedId} onSelect={() => select(row.serviceProfileId)} onLifecycle={openLifecycle} />)}</tbody>
              </AdminTable>
            </div>
            {/* Rows of the panel, not cards inside it; beside the detail panel the chosen venue is marked. */}
            <div className="divide-y divide-[var(--admin-border)] @4xl:hidden">{rows.map((row) => <ServiceMobileRow key={row.serviceProfileId} row={row} selected={row.serviceProfileId === selectedRow?.serviceProfileId} onSelect={(trigger) => select(row.serviceProfileId, !detailBesideList(), trigger)} />)}</div>
          </>
        )}
        {(list.status === "CanLoadMore" || list.status === "LoadingMore") ? <div className="border-t border-[var(--admin-border)] p-3"><Button type="button" variant="outline" disabled={list.status === "LoadingMore"} onClick={() => list.loadMore(pageSize)} className="min-h-11">{list.status === "LoadingMore" ? dict.loadingMore : dict.loadMore}</Button></div> : null}
      </AdminPanel>

      <aside ref={asideRef} className="hidden @4xl:block"><ServiceDetail detail={preview && selectedRow ? previewDetail(selectedRow) : detail} selectedRow={selectedRow} onLifecycle={openLifecycle} /></aside>
      </div>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="bottom" onCloseAutoFocus={(event) => { event.preventDefault(); mobileTriggerRef.current?.focus(); }} className="admin-v1 max-h-[88dvh] overflow-y-auto rounded-t-[var(--admin-radius-panel)] border-[var(--admin-border)] bg-[var(--admin-app)] p-4 sm:p-6"><SheetHeader className="sr-only"><SheetTitle>{dict.mobileDetails}</SheetTitle><SheetDescription>{dict.selectedVenue}</SheetDescription></SheetHeader><ServiceDetail detail={preview && selectedRow ? previewDetail(selectedRow) : detail} selectedRow={selectedRow} onLifecycle={openLifecycle} /></SheetContent></Sheet>

      <Dialog open={lifecycleOpen !== null} onOpenChange={(open) => { if (!open) { setLifecycleOpen(null); setLifecycleKey(null); setReason(""); setMutationError(null); } }}><DialogContent className="admin-v1 border-[var(--admin-border)] bg-[var(--admin-surface-strong)]"><DialogHeader><DialogTitle>{lifecycleOpen === "suspend" ? dict.suspend : dict.reactivate}</DialogTitle><DialogDescription>{selectedRow?.venueName ?? dict.selectedVenue}</DialogDescription></DialogHeader><div className="grid gap-2"><Label htmlFor="service-reason">{dict.actionReason}</Label><Input id="service-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={dict.actionReasonPlaceholder} autoFocus />{mutationError ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{mutationError}</p> : null}</div><DialogFooter><Button type="button" variant="outline" onClick={() => { setLifecycleOpen(null); setLifecycleKey(null); }}>{dict.cancel}</Button><Button type="button" disabled={!reason.trim()} onClick={() => void executeLifecycle()}>{lifecycleOpen === "suspend" ? dict.actionConfirmSuspend : dict.actionConfirmReactivate}</Button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}

function ServiceDesktopRow({ row, selected, onSelect, onLifecycle }: { row: ServiceRow; selected: boolean; onSelect: () => void; onLifecycle: (operation: "suspend" | "reactivate") => void }) {
  const state = row.filterState;
  return <tr className={cn("border-b border-[var(--admin-border)] last:border-b-0", selected && "bg-[var(--admin-accent-soft)]")}><td className="px-4 py-3"><button type="button" onClick={onSelect} className="block text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><span className="block font-semibold">{row.venueName}</span><span className="block text-xs text-[var(--admin-text-muted)]">{row.accountName} · {row.smlCode}</span></button></td><td className="px-3 py-3"><AdminStatus label={labelForState(state)} tone={stateTone(state)} /></td><td className="px-3 py-3 text-sm">{row.subscriptionState === "inactive" ? <span className="text-[var(--admin-text-muted)]">{dict.subscriptionMissing}</span> : <span>{formatDate(row.paidThrough)}</span>}</td><td className="px-3 py-3"><AdminStatus label={configurationLabel(row.configurationState)} tone={row.configurationState === "published" || row.configurationState === "configured" ? "active" : row.configurationState === "draft" || row.configurationState === "unconfigured" ? "waiting" : "neutral"} /></td><td className="px-3 py-3 text-xs text-[var(--admin-text-muted)]">{channels(row)}</td><td className="px-3 py-3 text-xs text-[var(--admin-text-muted)]">{row.signal.severity ? labelForState(row.signal.severity === "blocking" ? "problem" : "warning") : dict.noData}</td><td className="px-3 py-3"><RowMenu row={row} onSelect={onSelect} onLifecycle={onLifecycle} /></td></tr>;
}

function ServiceMobileRow({ row, selected, onSelect }: { row: ServiceRow; selected: boolean; onSelect: (trigger: HTMLButtonElement) => void }) {
  return <button type="button" aria-current={selected ? "true" : undefined} onClick={(event) => onSelect(event.currentTarget)} className={cn("grid w-full gap-3 px-4 py-3.5 text-left outline-none transition-colors first:rounded-t-[var(--admin-radius-panel)] last:rounded-b-[var(--admin-radius-panel)] hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]", selected && "bg-[var(--admin-surface-muted)] shadow-[inset_2px_0_0_var(--admin-nav-line)]")}><div className="flex items-start justify-between gap-3"><div><span className="block font-semibold">{row.venueName}</span><span className="block text-xs text-[var(--admin-text-muted)]">{row.accountName} · {row.smlCode}</span></div><AdminStatus label={labelForState(row.filterState)} tone={stateTone(row.filterState)} /></div><div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-[var(--admin-text-muted)]"><span>{configurationLabel(row.configurationState)}</span><span className="whitespace-nowrap">{channels(row)}</span></div></button>;
}

function RowMenu({ row, onSelect, onLifecycle }: { row: ServiceRow; onSelect: () => void; onLifecycle: (operation: "suspend" | "reactivate") => void }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" onClick={onSelect} aria-label={dict.actionsMenu} className="admin-v1-round grid size-10 place-items-center rounded-full outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><MoreHorizontal className="size-4" aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="admin-v1 min-w-56 border-[var(--admin-border)] bg-[var(--admin-surface-strong)]"><DropdownMenuLabel>{dict.actionsMenu}</DropdownMenuLabel><DropdownMenuItem disabled>{dict.sendUnavailable}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onLifecycle(row.subscriptionState === "suspended" || row.subscriptionState === "inactive" ? "reactivate" : "suspend")}>{row.subscriptionState === "suspended" || row.subscriptionState === "inactive" ? dict.reactivate : dict.suspend}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

function ServiceDetail({ detail, selectedRow, onLifecycle }: { detail: ReturnType<typeof useQuery<typeof api.adminServiceOperations.detail>>; selectedRow: ServiceRow | null; onLifecycle: (operation: "suspend" | "reactivate") => void }) {
  if (!selectedRow) return <AdminPanel><AdminEmptyState title={dict.selectVenueTitle} body={dict.selectVenueBody} /></AdminPanel>;
  if (detail === undefined) return <AdminPanel><AdminLoadingState compact /></AdminPanel>;
  if (detail === null) return <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} /></AdminPanel>;
  const row = detail.row;
  return <AdminPanel className="overflow-hidden"><div className="grid gap-5 p-4 sm:p-5"><div><p className="text-xs font-semibold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{dict.selectedVenue}</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{row.venueName}</h2><p className="mt-1 text-sm text-[var(--admin-text-muted)]">{row.accountName} · {row.smkCode} · {row.smlCode}</p></div><div className="grid gap-2"><AdminStatus label={labelForState(row.filterState)} tone={stateTone(row.filterState)} /><p className="text-sm text-[var(--admin-text-muted)]">{configurationLabel(row.configurationState)}</p></div><div className="grid gap-2 border-y border-[var(--admin-border)] py-4 text-sm"><div className="flex justify-between gap-4"><span className="text-[var(--admin-text-muted)]">{dict.subscriptionPaidThrough}</span><span>{formatDate(row.paidThrough)}</span></div>{row.graceEndsAt ? <div className="flex justify-between gap-4"><span className="text-[var(--admin-text-muted)]">{dict.subscriptionGraceEnds}</span><span>{formatDate(row.graceEndsAt)}</span></div> : null}<div className="flex gap-2 text-[var(--admin-text-muted)]"><Package className="size-4 shrink-0" aria-hidden="true" />{channels(row)}</div></div><div className="grid gap-2"><Link href={detail.editorHref ?? "#"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--admin-ink)] px-4 text-sm font-semibold text-[var(--admin-on-ink)]"><ExternalLink className="size-4" aria-hidden="true" />{dict.openEditor}</Link>{detail.publicHref ? <Link href={detail.publicHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--admin-border)] px-4 text-sm font-semibold hover:bg-[var(--admin-surface-muted)]"><ExternalLink className="size-4" aria-hidden="true" />{dict.openPublic}</Link> : null}<Link href={detail.clientHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--admin-border)] px-4 text-sm font-semibold hover:bg-[var(--admin-surface-muted)]">{dict.openClient}</Link><Link href={`/admin/operativa/proizvodi?venue=${row.businessId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--admin-border)] px-4 text-sm font-semibold hover:bg-[var(--admin-surface-muted)]"><Package className="size-4" aria-hidden="true" />{dict.openProducts}</Link><Link href="/admin/operativa/qr" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--admin-border)] px-4 text-sm font-semibold hover:bg-[var(--admin-surface-muted)]"><QrCode className="size-4" aria-hidden="true" />{dict.openQr}</Link></div>{row.serviceType === "google_review" ? <div className="grid gap-1 border-t border-[var(--admin-border)] pt-4 text-sm"><span className="text-[var(--admin-text-muted)]">{dict.googleDestination}</span>{detail.googleDestination ? <a href={detail.googleDestination} target="_blank" rel="noreferrer" className="break-all text-[var(--admin-link)] underline">{detail.googleDestination}</a> : <span className="text-[var(--admin-text-muted)]">{dict.noGoogleDestination}</span>}</div> : null}<div className="grid gap-2 border-t border-[var(--admin-border)] pt-4"><h3 className="text-sm font-semibold">{dict.actionItems}</h3>{detail.actions.length ? detail.actions.map((item) => <div key={item.causeId} className="flex gap-2 text-sm"><TriangleAlert className={cn("mt-0.5 size-4 shrink-0", item.severity === "blocking" ? "text-[var(--admin-danger)]" : "text-[var(--admin-warning)]")} aria-hidden="true" /><span>{item.description ?? item.causeId}</span></div>) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.noActionItems}</p>}</div><div className="border-t border-[var(--admin-border)] pt-4"><Button type="button" variant={row.subscriptionState === "suspended" || row.subscriptionState === "inactive" ? "default" : "outline"} className="min-h-11 w-full" onClick={() => onLifecycle(row.subscriptionState === "suspended" || row.subscriptionState === "inactive" ? "reactivate" : "suspend")}>{row.subscriptionState === "suspended" || row.subscriptionState === "inactive" ? dict.reactivate : dict.suspend}</Button></div></div></AdminPanel>;
}

export class AdminServiceOperationsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} onRetry={() => window.location.reload()} /></AdminPanel> : this.props.children; }
}
