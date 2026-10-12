"use client";

import { AdminClearFilters } from "@/components/admin/admin-ui/admin-clear-filters";
import Image from "next/image";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleEllipsis,
  Link2,
  MapPin,
  Nfc,
  Package,
  QrCode,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPanel,
  AdminStatus,
  AdminTable,
} from "@/components/admin/admin-primitives";
import { adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { useAdminUrlState, type AdminUrlWrite } from "@/components/admin/admin-ui/use-admin-query-state";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import {
  channelLabel,
  productLabel,
  sharedSmfRoot,
  type AccessColor,
  type ProductType,
} from "@/lib/admin-v1/products-workspace";
import {
  filterPreviewInventory,
  filterPreviewVenues,
  hasInventoryFilter,
  inventoryFilterKey,
} from "@/lib/admin-v2/lists/products";
import { PRODUCTS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/operations";
import type { SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";
import { getDict } from "@/lib/i18n";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";

const dict = getDict("admin-products");

function restoreFocusWhenGone(selector: string, target: () => HTMLElement | null) {
  let frame = 0;
  const restore = () => {
    frame += 1;
    if (document.querySelector(selector) && frame < 30) {
      requestAnimationFrame(restore);
      return;
    }
    target()?.focus();
  };
  requestAnimationFrame(restore);
}

/** The list comes back one render after the URL changes: focus the trigger as soon as it is there. */
function focusWhenPresent(selector: string) {
  let frame = 0;
  const focus = () => {
    frame += 1;
    const element = document.querySelector<HTMLElement>(selector);
    if (element) element.focus();
    else if (frame < 30) requestAnimationFrame(focus);
  };
  requestAnimationFrame(focus);
}

export type VenueProductRow = {
  id: string;
  accountId: string;
  businessId: string;
  accountName: string;
  smkCode: string;
  venueName: string;
  smlCode: string;
  city: string | null;
  productCount: number | null;
  qrCount: number | null;
  nfcCount: number | null;
  problemCount: number | null;
  services: string[];
  status: "active" | "problem" | "inactive";
  statusReason?: string;
  premium?: boolean;
  smfRoot?: string | null;
  suffixRange?: string | null;
};

export type ProductInventoryRow = {
  id: string;
  smfCode: string;
  localSuffix: string;
  productType: ProductType;
  designLabel: string | null;
  position: string | null;
  qr: AccessColor;
  nfc: AccessColor;
  qrReason?: string | null;
  nfcReason?: string | null;
  services: string[];
  destination: string | null;
  status: "active" | "problem" | "inactive";
  updatedAt: number;
};

export type BulkDraft = {
  productIds: string[];
  kind: "status" | "qr" | "nfc" | "destination" | "position";
  value: string;
  reason: string;
};

export type DestinationOption = {
  id: string;
  label: string;
};

export type ProductDetailMeta = {
  destinationHistory: string;
  placementHistory: string;
  channelHistory: string;
  scanAttribution: string;
};

type SurfaceProps = {
  /** The URL state of the page (`venue` and the sidebar filters) and its writer. */
  state: SidebarState;
  setState: (patch: SidebarPatch, write?: AdminUrlWrite) => void;
  /** The rows to show; the container (or the preview) has already applied the sidebar filters. */
  venues: VenueProductRow[];
  venueStatus: "loading" | "ready" | "error";
  inventory: ProductInventoryRow[];
  inventoryStatus: "loading" | "ready" | "error";
  /** The venue `state.venue` names, with its summary once known; null while it is not found. */
  venue?: VenueProductRow | null;
  canLoadMoreVenues?: boolean;
  canLoadMoreInventory?: boolean;
  loadingMore?: boolean;
  preview?: boolean;
  onVenueSelected?: (venue: VenueProductRow) => void;
  onProductSelected?: (product: ProductInventoryRow | null) => void;
  onLoadMoreVenues?: () => void;
  onLoadMoreInventory?: () => void;
  onRetry?: () => void;
  onBulkApply?: (draft: BulkDraft) => Promise<void>;
  destinationOptions?: DestinationOption[];
  detailMeta?: ProductDetailMeta;
  initialProductId?: string;
};

const productImage: Record<ProductType, string> = {
  "two-piece-stand": "/offer/products/two-piece-stand.png",
  "compact-stand": "/offer/products/compact-stand.png",
  stickers: "/offer/products/stickers.png",
  "window-film": "/offer/products/window-film.png",
  "premium-engraved-stand": "/offer/products/premium-engraved-stand.png",
};

const stateTone = {
  active: "text-[var(--admin-success)]",
  inactive: "text-[var(--admin-warning)]",
  problem: "text-[var(--admin-danger)]",
} as const;

function channelTone(color: AccessColor) {
  if (color === "green") return "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]";
  if (color === "orange") return "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]";
  if (color === "red") return "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]";
  return "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]";
}

function channelTooltip(kind: "qr" | "nfc", color: AccessColor, reason?: string | null) {
  return [kind === "qr" ? dict.channelQr : dict.channelNfc, channelLabel(dict, color), reason].filter(Boolean).join(" · ");
}

export function ChannelSignal({ kind, color, reason }: { kind: "qr" | "nfc"; color: AccessColor; reason?: string | null }) {
  const Icon = kind === "qr" ? QrCode : Nfc;
  const label = channelTooltip(kind, color, reason);
  return (
    <span title={label} aria-label={label} className={cn("inline-grid size-9 shrink-0 place-items-center rounded-lg border", channelTone(color))}>
      <Icon className="size-[1.1rem]" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}


function Services({ services }: { services: string[] }) {
  if (!services.length) return null;
  return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--admin-text-muted)]"><Link2 className="size-3.5" aria-hidden="true" />{services.join(", ")}</span>;
}

function VenueStatus({ row }: { row: VenueProductRow }) {
  const label = row.status === "problem" ? dict.stateProblem : row.status === "inactive" ? dict.stateInactive : dict.stateActive;
  return <span className={cn("grid min-w-0 grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2 text-sm", stateTone[row.status])}><span className="mt-1.5 size-2 rounded-full bg-current" aria-hidden="true" /><span className="min-w-0"><strong className="block font-semibold">{label}</strong>{row.statusReason ? <span className="block truncate text-xs text-[var(--admin-text-muted)]">{row.statusReason}</span> : null}</span></span>;
}

/** The wide-only columns: beside the sidebar the screen is narrower than the window, so they show from a 72 rem list. */
const WIDE_COLUMN = "hidden @6xl:table-cell";

const countText = (value: number | null, label: string) => (value === null ? null : `${value} ${label}`);
const joinText = (parts: readonly (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** „QR 11 · NFC 9“: each count with its name, nothing where the count is not known. */
const channelCounts = (row: VenueProductRow) => joinText([row.qrCount === null ? null : `${dict.qr} ${row.qrCount}`, row.nfcCount === null ? null : `${dict.nfc} ${row.nfcCount}`]);

function BackToVenues({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className={adminSecondaryButtonClass}><ChevronLeft className="size-4" aria-hidden="true" />{dict.backToVenues}</button>;
}

function PreviewBadge() {
  return <AdminStatus label={dict.previewBadge} tone="waiting" />;
}

function VenueFinder({ venues, status, narrowed, canLoadMore, loadingMore, onLoadMore, onSelect, onRetry, preview }: {
  venues: VenueProductRow[];
  status: SurfaceProps["venueStatus"];
  /** The sidebar search or filter is set: an empty list then means no match, not no venues. */
  narrowed: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
  onSelect: (venue: VenueProductRow) => void;
  onRetry?: () => void;
  preview?: boolean;
}) {
  return <div className="@container grid min-w-0 gap-5 sm:gap-6">
    <AdminPageHeader eyebrow={adminV1Sr.navOperations} title={dict.pageTitle} badge={preview ? <PreviewBadge /> : undefined} description={preview ? dict.previewDescription : dict.pageSubtitle} />
    {status === "loading" ? <AdminPanel><AdminLoadingState shape="table" label={dict.loading} /></AdminPanel> : status === "error" ? <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} />{onRetry ? <div className="pb-6 text-center"><Button type="button" variant="outline" onClick={onRetry}>{dict.retry}</Button></div> : null}</AdminPanel> : venues.length ? <>
      <AdminTable caption={dict.venueTableCaption} className="hidden @4xl:block"><thead className="bg-[var(--admin-surface-muted)] text-xs text-[var(--admin-text-muted)]"><tr><th className="px-4 py-3 font-semibold">{dict.colClient}</th><th className="px-4 py-3 font-semibold">{dict.colVenue}</th><th className={cn("px-4 py-3 font-semibold", WIDE_COLUMN)}>{dict.colCity}</th><th className="px-4 py-3 font-semibold">{dict.colProducts}</th><th className="px-4 py-3 font-semibold">{dict.colChannels}</th><th className={cn("px-4 py-3 font-semibold", WIDE_COLUMN)}>{dict.colServices}</th><th className="px-4 py-3 font-semibold">{dict.colStatus}</th><th className="px-4 py-3 font-semibold">{dict.colActions}</th></tr></thead><tbody className="divide-y divide-[var(--admin-border)]">{venues.map((row) => <tr key={row.id} className="transition-colors hover:bg-[var(--admin-surface-muted)]/60"><td className="px-4 py-3 align-middle"><strong className="block text-sm">{row.accountName}</strong><span className="font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{row.smkCode}</span>{row.premium ? <span data-premium className="ml-2 rounded-full border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-1.5 py-0.5 text-[0.62rem] font-bold text-[var(--admin-warning)]">{dict.premium}</span> : null}</td><td className="px-4 py-3"><strong className="block text-sm">{row.venueName}</strong><span className="font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{row.smlCode}</span></td><td className={cn("px-4 py-3 text-sm", WIDE_COLUMN)}>{row.city}</td><td className="px-4 py-3 font-mono text-sm tabular-nums">{row.productCount}</td><td className="px-4 py-3 text-sm whitespace-nowrap tabular-nums">{channelCounts(row)}</td><td className={cn("px-4 py-3", WIDE_COLUMN)}><Services services={row.services} /></td><td className="max-w-56 px-4 py-3"><VenueStatus row={row} /></td><td className="px-3 py-3"><button data-venue-trigger={row.id} type="button" onClick={() => onSelect(row)} className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.selectVenue}: ${row.venueName}`}><ChevronRight className="size-4" aria-hidden="true" /></button></td></tr>)}</tbody></AdminTable>
      <div className="grid gap-2 @4xl:hidden">{venues.map((row) => <button key={row.id} data-venue-trigger={row.id} type="button" onClick={() => onSelect(row)} className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-left shadow-[var(--admin-shadow-xs)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-sm">{row.venueName}</strong>{row.premium ? <span data-premium className="rounded-full bg-[var(--admin-warning-soft)] px-1.5 py-0.5 text-[0.62rem] font-bold text-[var(--admin-warning)]">{dict.premium}</span> : null}</span><span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{row.accountName} · {row.smkCode} · {row.smlCode}</span><span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--admin-text-muted)]">{[countText(row.productCount, dict.products), countText(row.qrCount, dict.qr), countText(row.nfcCount, dict.nfc)].map((text) => text ? <span key={text}>{text}</span> : null)}</span></span><span className="flex items-center gap-2"><VenueStatus row={row} /><ChevronRight className="size-4" aria-hidden="true" /></span></button>)}</div>
    </> : <AdminPanel><AdminEmptyState action={<AdminClearFilters />} title={narrowed ? dict.noVenueResultsTitle : dict.venueEmptyTitle} body={narrowed ? dict.noVenueResultsBody : dict.venueEmptyBody} /></AdminPanel>}
    {canLoadMore ? <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? dict.loadingMore : dict.loadMore}</Button> : null}
  </div>;
}

function MissingVenue({ loading, onBack, preview }: { loading: boolean; onBack: () => void; preview?: boolean }) {
  return <div className="grid min-w-0 gap-5 sm:gap-6">
    <AdminPageHeader eyebrow={adminV1Sr.navOperations} title={dict.pageTitle} badge={preview ? <PreviewBadge /> : undefined} actions={<BackToVenues onClick={onBack} />} />
    <AdminPanel>{loading ? <AdminLoadingState label={dict.loading} /> : <AdminEmptyState action={<AdminClearFilters />} title={dict.noVenueResultsTitle} body={dict.noVenueResultsBody} />}</AdminPanel>
  </div>;
}

function Summary({ venue, inventory }: { venue: VenueProductRow; inventory: ProductInventoryRow[] }) {
  const root = venue.smfRoot ?? sharedSmfRoot(inventory.map((row) => row.smfCode));
  const codes = joinText([root ? `${dict.smfRoot}: ${root}` : null, venue.suffixRange ? `${dict.productRange}: ${venue.suffixRange}` : null]);
  return <div className="@container flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">{codes ? <p className="font-mono text-xs text-[var(--admin-text-muted)]">{codes}</p> : <span />}<div data-admin-summary className="grid w-full min-w-0 max-w-full grid-cols-2 overflow-hidden rounded-2xl border @md:w-auto @md:grid-cols-4 @md:divide-x @md:divide-[var(--admin-border)] @md:rounded-full border-[var(--admin-border)] bg-[var(--admin-surface-strong)] shadow-[var(--admin-shadow-xs)]"><SummaryItem icon={Package} value={venue.productCount} label={dict.products} /><SummaryItem icon={QrCode} value={venue.qrCount} label={dict.qr} /><SummaryItem icon={Nfc} value={venue.nfcCount} label={dict.nfc} /><SummaryItem icon={AlertTriangle} value={venue.problemCount} label={dict.problems} danger /></div></div>;
}

function SummaryItem({ icon: Icon, value, label, danger = false }: { icon: typeof Package; value: number | null; label: string; danger?: boolean }) { return <div className={cn("flex min-w-0 items-center justify-center gap-1.5 px-2 py-2 text-xs sm:px-3 sm:text-sm", danger && "text-[var(--admin-danger)]")}><Icon className="size-4 shrink-0" aria-hidden="true" /><strong className="font-mono tabular-nums">{value ?? dict.unknownValue}</strong><span className="whitespace-nowrap">{label}</span></div>; }

function ViewToggle({ view, onView }: { view: "table" | "visual"; onView: (view: "table" | "visual") => void }) {
  const option = (value: "table" | "visual", label: string) => <button type="button" aria-pressed={view === value} onClick={() => onView(value)} className={cn("min-h-11 rounded-lg px-3 text-sm font-semibold", view === value ? "bg-[var(--admin-accent-soft)] text-[var(--admin-accent-ink)]" : "hover:bg-[var(--admin-surface-muted)]")}>{label}</button>;
  return <div data-reveal="off" role="group" aria-label={dict.viewLabel} className="grid w-fit grid-cols-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1">{option("table", dict.viewTable)}{option("visual", dict.viewVisual)}</div>;
}

function InventoryTable({ rows, selected, onToggle, onOpen }: { rows: ProductInventoryRow[]; selected: ReadonlySet<string>; onToggle: (id: string) => void; onOpen: (row: ProductInventoryRow, trigger: HTMLElement) => void }) { return <><AdminTable caption={dict.inventoryTableCaption} className="hidden @4xl:block"><thead className="bg-[var(--admin-surface-muted)] text-xs text-[var(--admin-text-muted)]"><tr><th className="px-3 py-3 font-semibold">{dict.colSelect}</th><th className="px-3 py-3 font-semibold">{dict.colId}</th><th className="px-3 py-3 font-semibold">{dict.colProduct}</th><th className="px-3 py-3 font-semibold">{dict.colPosition}</th><th className="px-3 py-3 font-semibold">{dict.colQrNfc}</th><th className={cn("px-3 py-3 font-semibold", WIDE_COLUMN)}>{dict.colServices}</th><th className="px-3 py-3 font-semibold">{dict.colDestination}</th><th className="px-3 py-3 font-semibold">{dict.colStatus}</th><th className={cn("px-3 py-3 font-semibold", WIDE_COLUMN)}>{dict.colUpdated}</th><th className="px-3 py-3 font-semibold">{dict.colActions}</th></tr></thead><tbody className="divide-y divide-[var(--admin-border)]">{rows.map((row) => <tr key={row.id} className={cn("transition-colors hover:bg-[var(--admin-surface-muted)]/60", selected.has(row.id) && "bg-[var(--admin-accent-soft)]/40")}><td className="px-3 py-3"><input aria-label={`${dict.selectProduct}: #${row.localSuffix}`} checked={selected.has(row.id)} onChange={() => onToggle(row.id)} type="checkbox" className="size-5 accent-[var(--admin-accent)]" /></td><td className="px-3 py-3 font-mono text-sm">#{row.localSuffix}</td><td className="px-3 py-3"><span className="flex items-center gap-2"><ProductIcon type={row.productType} /><span><strong className="block text-sm">{productLabel(dict, row.productType)}</strong>{row.designLabel ? <span className="block text-xs text-[var(--admin-text-muted)]">{row.designLabel}</span> : null}</span></span></td><td className="px-3 py-3 text-sm">{row.position}</td><td className="px-3 py-3"><span className="flex gap-1"><ChannelSignal kind="qr" color={row.qr} reason={row.qrReason} /><ChannelSignal kind="nfc" color={row.nfc} reason={row.nfcReason} /></span></td><td className={cn("px-3 py-3", WIDE_COLUMN)}><Services services={row.services} /></td><td className="max-w-48 px-3 py-3 text-xs text-[var(--admin-text-muted)]"><span className="block truncate">{row.destination}</span></td><td className="px-3 py-3"><span className={cn("inline-flex items-center gap-2 text-sm font-semibold", stateTone[row.status])}><span className="size-2 rounded-full bg-current" aria-hidden="true" />{row.status === "problem" ? dict.stateProblem : row.status === "inactive" ? dict.stateInactive : dict.stateActive}</span></td><td className={cn("px-3 py-3 text-xs text-[var(--admin-text-muted)]", WIDE_COLUMN)}><time dateTime={new Date(row.updatedAt).toISOString()}>{new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "short", timeStyle: "short" }).format(row.updatedAt)}</time></td><td className="px-2 py-3"><button data-product-trigger={row.id} type="button" onClick={(event) => onOpen(row, event.currentTarget)} className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.openProduct}: #${row.localSuffix}`}><CircleEllipsis className="size-5" aria-hidden="true" /></button></td></tr>)}</tbody></AdminTable><div className="grid gap-2 @4xl:hidden">{rows.map((row) => <article key={row.id} className={cn("grid min-h-36 grid-cols-[auto_5rem_minmax(0,1fr)_auto] gap-3 rounded-[var(--admin-radius-control)] border bg-[var(--admin-surface)] p-3 shadow-[var(--admin-shadow-xs)]", selected.has(row.id) ? "border-[var(--admin-accent)]" : "border-[var(--admin-border)]")}><input aria-label={`${dict.selectProduct}: #${row.localSuffix}`} checked={selected.has(row.id)} onChange={() => onToggle(row.id)} type="checkbox" className="mt-1 size-5 accent-[var(--admin-accent)]" /><ProductImage type={row.productType} /><div className="min-w-0"><strong className="font-mono text-sm">#{row.localSuffix}</strong><h2 className="mt-1 text-sm font-semibold">{productLabel(dict, row.productType)}</h2>{row.position || row.destination ? <p className="mt-1 truncate text-xs text-[var(--admin-text-muted)]">{joinText([row.position, row.destination])}</p> : null}<span className="mt-3 flex gap-1"><ChannelSignal kind="qr" color={row.qr} reason={row.qrReason} /><ChannelSignal kind="nfc" color={row.nfc} reason={row.nfcReason} /></span></div><button data-product-trigger={row.id} type="button" onClick={(event) => onOpen(row, event.currentTarget)} className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.openProduct}: #${row.localSuffix}`}><ChevronRight className="size-4" aria-hidden="true" /></button></article>)}</div></>; }

function ProductIcon({ type }: { type: ProductType }) { return <span data-product-type={type} className="grid size-7 place-items-center rounded-md bg-[var(--admin-surface-muted)]"><Package className="size-4" aria-hidden="true" /></span>; }
function ProductImage({ type }: { type: ProductType }) { return <span className="relative block size-20 overflow-hidden rounded-lg bg-[var(--admin-surface-muted)]"><Image src={productImage[type]} alt={productLabel(dict, type)} fill sizes="80px" className="object-contain p-1" /></span>; }

function VisualInventory({ rows, selected, onToggle, onOpen }: { rows: ProductInventoryRow[]; selected: ReadonlySet<string>; onToggle: (id: string) => void; onOpen: (row: ProductInventoryRow, trigger: HTMLElement) => void }) { return <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">{rows.map((row) => <article key={row.id} data-product-card className={cn("grid h-52 grid-cols-[7rem_minmax(0,1fr)] gap-3 rounded-[var(--admin-radius-control)] border bg-[var(--admin-surface)] p-3 shadow-[var(--admin-shadow-xs)]", selected.has(row.id) ? "border-2 border-[var(--admin-accent)]" : "border-[var(--admin-border)]")}><div className="grid content-between"><input aria-label={`${dict.selectProduct}: #${row.localSuffix}`} checked={selected.has(row.id)} onChange={() => onToggle(row.id)} type="checkbox" className="size-5 accent-[var(--admin-accent)]" /><ProductImage type={row.productType} /></div><div className="flex min-w-0 flex-col"><div className="flex items-start justify-between gap-2"><strong className="font-mono text-sm">#{row.localSuffix}</strong><button data-product-trigger={row.id} type="button" onClick={(event) => onOpen(row, event.currentTarget)} className="-mr-2 -mt-2 inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.openProduct}: #${row.localSuffix}`}><CircleEllipsis className="size-5" aria-hidden="true" /></button></div><h2 className="mt-1 line-clamp-2 text-sm font-semibold">{productLabel(dict, row.productType)}</h2>{row.designLabel ? <p className="mt-1 line-clamp-1 text-xs text-[var(--admin-text-muted)]">{row.designLabel}</p> : null}<p className="mt-auto flex min-h-4 items-center gap-1.5 truncate text-xs text-[var(--admin-text-muted)]">{row.position ? <><MapPin className="size-3.5 shrink-0" aria-hidden="true" />{row.position}</> : null}</p><span className="mt-2 flex gap-1"><ChannelSignal kind="qr" color={row.qr} reason={row.qrReason} /><ChannelSignal kind="nfc" color={row.nfc} reason={row.nfcReason} /></span><span className="mt-2"><Services services={row.services} /></span></div></article>)}</div>; }

function SelectionSheet({ selected, rows, open, onClose, onApply, destinationOptions = [] }: {
  selected: ReadonlySet<string>;
  rows: ProductInventoryRow[];
  open: boolean;
  onClose: () => void;
  onApply?: (draft: BulkDraft) => Promise<void>;
  destinationOptions?: DestinationOption[];
}) {
  const [kind, setKind] = useState<BulkDraft["kind"]>("status");
  const [value, setValue] = useState("inactive");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmTransition = useRef(false);
  const confirmTrigger = useRef<HTMLButtonElement | null>(null);
  const submitLocked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const rowsSelected = rows.filter((row) => selected.has(row.id));
  const suffixes = rowsSelected.map((row) => `#${row.localSuffix}`).join(" · ");
  const mixed = rowsSelected.some((row) => row.status !== rowsSelected[0]?.status);
  const applicable = kind === "qr" ? rowsSelected.some((row) => row.qr !== "gray") : kind === "nfc" ? rowsSelected.some((row) => row.nfc !== "gray") : true;
  const canSubmit = Boolean(onApply && reason.trim() && applicable && (kind !== "destination" || value));
  const changeKind = (next: BulkDraft["kind"]) => {
    setKind(next);
    setSaved(false);
    setError(null);
    setValue(next === "position" ? "" : next === "destination" ? destinationOptions[0]?.id ?? "" : "inactive");
  };
  const openConfirmation = () => {
    confirmTransition.current = true;
    setConfirmOpen(true);
  };
  const closeConfirmation = () => {
    setConfirmOpen(false);
    restoreFocusWhenGone("[data-bulk-confirmation]", () => confirmTrigger.current);
    setTimeout(() => { confirmTransition.current = false; }, 200);
  };
  const submit = async () => {
    if (!canSubmit || !onApply || submitLocked.current) return;
    submitLocked.current = true;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await onApply({ productIds: rowsSelected.map((row) => row.id), kind, value, reason });
      setSaved(true);
      closeConfirmation();
    } catch {
      setError(dict.mutationError);
    } finally {
      submitLocked.current = false;
      setPending(false);
    }
  };
  return <>
    <Sheet open={open} onOpenChange={(next) => { if (!next && !confirmTransition.current) onClose(); }}>
    <SheetContent side="right" data-reveal="off" onEscapeKeyDown={(event) => { if (confirmOpen) event.preventDefault(); }} className="admin-v1 w-full max-w-none overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 sm:max-w-[27rem] motion-reduce:duration-0">
      <SheetHeader className="border-b border-[var(--admin-border)] p-5 pr-14 text-left">
        <SheetTitle>{selected.size} {dict.selectedProducts}</SheetTitle>
        <SheetDescription className="line-clamp-2 font-mono">{suffixes}</SheetDescription>
      </SheetHeader>
      <div className="grid gap-5 p-5">
        <p className="text-sm text-[var(--admin-text-muted)]">{mixed ? dict.mixedValue : rowsSelected[0] ? `${dict.bulkStatus}: ${rowsSelected[0].status === "problem" ? dict.stateProblem : rowsSelected[0].status === "inactive" ? dict.stateInactive : dict.stateActive}` : ""}</p>
        <label className="grid gap-2 text-sm font-semibold">{dict.change}
          <select value={kind} onChange={(event) => changeKind(event.target.value as BulkDraft["kind"])} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3">
            <option value="status">{dict.bulkStatus}</option>
            <option value="qr">{dict.bulkQrState}</option>
            <option value="nfc">{dict.bulkNfcState}</option>
            {destinationOptions.length ? <option value="destination">{dict.bulkDestination}</option> : null}
            <option value="position">{dict.bulkPosition}</option>
          </select>
        </label>
        {kind === "position" ? <label className="grid gap-2 text-sm font-semibold">{dict.bulkPosition}<Input value={value} onChange={(event) => setValue(event.target.value)} className="min-h-11 bg-[var(--admin-surface)]" /></label> : kind === "destination" ? <label className="grid gap-2 text-sm font-semibold">{dict.bulkDestination}<select value={value} onChange={(event) => setValue(event.target.value)} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3">{destinationOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : <label className="grid gap-2 text-sm font-semibold">{dict.channelState}<select value={value} onChange={(event) => setValue(event.target.value)} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3"><option value="active">{dict.stateActive}</option><option value="inactive">{dict.stateInactive}</option><option value="problem">{dict.stateProblem}</option></select></label>}
        <label className="grid gap-2 text-sm font-semibold">{dict.reasonLabel}<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={dict.reasonPlaceholder} className="min-h-24 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3 text-sm" /></label>
        {!applicable ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{dict.noApplicableSelection}</p> : null}
        {error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{error}</p> : null}
        {saved ? <p role="status" className="text-sm text-[var(--admin-success)]">{dict.changeSaved}</p> : null}
        <Button ref={confirmTrigger} type="button" disabled={!canSubmit || pending} onClick={openConfirmation} className="min-h-11">{pending ? dict.saving : dict.saveChanges}</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>{dict.cancel}</Button>
      </div>
    </SheetContent>
    </Sheet>
    <Dialog open={confirmOpen} onOpenChange={(next) => { if (next) openConfirmation(); else closeConfirmation(); }}>
      <DialogContent data-bulk-confirmation data-reveal="off" onEscapeKeyDown={(event) => { event.preventDefault(); event.stopPropagation(); closeConfirmation(); }} className="admin-v1 border-[var(--admin-border)] bg-[var(--admin-surface-strong)]">
        <DialogHeader><DialogTitle>{dict.confirmationTitle}</DialogTitle><DialogDescription>{dict.confirmationBody}</DialogDescription></DialogHeader>
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={closeConfirmation}>{dict.cancel}</Button><Button type="button" disabled={pending} onClick={() => void submit()}>{pending ? dict.saving : dict.saveChanges}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function ProductDetailSheet({ row, meta, onClose }: { row: ProductInventoryRow | null; meta?: ProductDetailMeta; onClose: () => void }) {
  const close = () => {
    const id = row?.id;
    onClose();
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-product-trigger="${id}"]`)?.focus());
  };
  return <Sheet open={Boolean(row)} onOpenChange={(open) => { if (!open) close(); }}>
    <SheetContent side="right" data-reveal="off" className="admin-v1 w-full max-w-none overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 sm:max-w-[32rem] motion-reduce:duration-0">
      <SheetHeader className="border-b border-[var(--admin-border)] p-5 pr-14 text-left"><SheetTitle>{row ? `${dict.detailTitle} · #${row.localSuffix}` : dict.detailTitle}</SheetTitle><SheetDescription>{dict.detailDescription}</SheetDescription></SheetHeader>
      {row ? <div className="grid gap-6 p-5">
        <section className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4"><ProductImage type={row.productType} /><div><h2 className="font-semibold">{productLabel(dict, row.productType)}</h2><p className="mt-1 font-mono text-xs text-[var(--admin-text-muted)]">{row.smfCode}</p>{row.designLabel ? <p className="mt-2 text-sm text-[var(--admin-text-muted)]">{row.designLabel}</p> : null}</div></section>
        <DetailRow label={dict.productIdentity} value={row.smfCode} mono />
        <DetailRow label={dict.productDesign} value={row.designLabel ?? ""} />
        <DetailRow label={dict.productServices} value={row.services.join(", ")} />
        <DetailRow label={dict.productDestination} value={row.destination ?? ""} />
        <section><h3 className="text-sm font-semibold">{dict.channelState}</h3><div className="mt-3 grid grid-cols-2 gap-3"><ChannelSignal kind="qr" color={row.qr} reason={row.qrReason} /><ChannelSignal kind="nfc" color={row.nfc} reason={row.nfcReason} /></div></section>
        <DetailRow label={dict.placementHistory} value={meta?.placementHistory ?? dict.loading} />
        <DetailRow label={dict.destinationHistory} value={meta?.destinationHistory ?? dict.loading} />
        <DetailRow label={dict.channelHistory} value={meta?.channelHistory ?? dict.loading} />
        <DetailRow label={dict.scanAttribution} value={meta?.scanAttribution ?? dict.loading} />
        <DetailRow label={dict.auditUpdated} value={new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" }).format(row.updatedAt)} />
      </div> : null}
    </SheetContent>
  </Sheet>;
}
function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return value ? <section><h3 className="text-sm font-semibold">{label}</h3><p className={cn("mt-1 break-words text-sm text-[var(--admin-text-muted)]", mono && "font-mono text-xs")}>{value}</p></section> : null; }

const LEAVE_VENUE: SidebarPatch = { venue: null, q: null, tip: null, dizajn: null, usluga: null, status: null };

// ADMIN v2 — the chosen venue (`?venue=`) and the filters of both states are
// in the URL and in the sidebar (lib/admin-v2/lists/products.ts); the
// container passes the rows they already selected. Choosing a venue is a step
// Back undoes, so it is written with "push".
export function AdminProductsSurface(props: SurfaceProps) {
  const { state, venue } = props;
  const [view, setView] = useState<"table" | "visual">("visual");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionLimit, setSelectionLimit] = useState(false);
  const [detailSelection, setDetail] = useState<ProductInventoryRow | null | undefined>(undefined);
  const selectionTrigger = useRef<HTMLButtonElement | null>(null);
  const detail = detailSelection === undefined
    ? props.inventory.find((row) => row.id === props.initialProductId) ?? null
    : detailSelection;
  // Another venue or other filters (also by Back / Forward): the selection would point at rows that are no longer there.
  const venueKey = state.venue ?? "";
  const filterKey = inventoryFilterKey(state);
  const [seen, setSeen] = useState({ venueKey, filterKey });
  if (seen.venueKey !== venueKey || seen.filterKey !== filterKey) {
    setSeen({ venueKey, filterKey });
    setSelection(new Set());
    setSelectionOpen(false);
    setSelectionLimit(false);
    if (seen.venueKey !== venueKey) setDetail(null);
  }
  const selectVenue = (next: VenueProductRow) => {
    props.onVenueSelected?.(next);
    props.setState({ venue: next.businessId, q: null, lokali: null }, "push");
  };
  const leaveVenue = () => {
    const trigger = venue?.id;
    props.setState(LEAVE_VENUE, "push");
    if (trigger) focusWhenPresent(`[data-venue-trigger="${trigger}"]`);
  };
  const toggle = (id: string) => setSelection((current) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
      if (next.size === 0) setSelectionOpen(false);
      setSelectionLimit(false);
      return next;
    }
    if (next.size >= 50) {
      setSelectionLimit(true);
      return current;
    }
    next.add(id);
    setSelectionLimit(false);
    return next;
  });
  if (!venue) {
    if (state.venue) return <MissingVenue loading={props.venueStatus === "loading"} onBack={leaveVenue} preview={props.preview} />;
    return <VenueFinder venues={props.venues} status={props.venueStatus} narrowed={Boolean(state.q || state.lokali)} canLoadMore={Boolean(props.canLoadMoreVenues)} loadingMore={Boolean(props.loadingMore)} onLoadMore={props.onLoadMoreVenues} onSelect={selectVenue} onRetry={props.onRetry} preview={props.preview} />;
  }
  const hasFilter = hasInventoryFilter(state);
  return <div className="@container grid min-w-0 gap-5 sm:gap-6">
    <AdminPageHeader eyebrow={dict.breadcrumb} title={venue.venueName} badge={props.preview ? <PreviewBadge /> : undefined} description={joinText([venue.accountName, venue.smkCode, venue.smlCode, venue.city])} actions={<BackToVenues onClick={leaveVenue} />} />
    <Summary venue={venue} inventory={props.inventory} />
    <ViewToggle view={view} onView={setView} />
    {selectionLimit ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{dict.bulkLimit}</p> : null}
    {selection.size ? <AdminPanel className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4"><p className="text-sm font-semibold"><span className="font-mono tabular-nums">{selection.size}</span> {dict.selectedProducts}</p><div className="flex flex-wrap gap-2"><Button ref={selectionTrigger} type="button" className="min-h-11" onClick={() => setSelectionOpen(true)}>{dict.editSelection}</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => { setSelection(new Set()); setSelectionOpen(false); }}>{dict.clearSelection}</Button></div></AdminPanel> : null}
    {props.inventoryStatus === "loading" ? <AdminPanel><AdminLoadingState shape="table" label={dict.loading} /></AdminPanel> : props.inventoryStatus === "error" ? <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} />{props.onRetry ? <div className="pb-6 text-center"><Button type="button" variant="outline" onClick={props.onRetry}>{dict.retry}</Button></div> : null}</AdminPanel> : props.inventory.length ? view === "table" ? <InventoryTable rows={props.inventory} selected={selection} onToggle={toggle} onOpen={(row) => { setDetail(row); props.onProductSelected?.(row); }} /> : <VisualInventory rows={props.inventory} selected={selection} onToggle={toggle} onOpen={(row) => { setDetail(row); props.onProductSelected?.(row); }} /> : <AdminPanel><AdminEmptyState title={hasFilter ? dict.noSearchProductsTitle : dict.noProductsTitle} body={hasFilter ? dict.noSearchProductsBody : dict.noProductsBody} /></AdminPanel>}
    {props.canLoadMoreInventory ? <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={props.loadingMore} onClick={props.onLoadMoreInventory}>{props.loadingMore ? dict.loadingMore : dict.loadMore}</Button> : null}
    <SelectionSheet selected={selection} rows={props.inventory} open={selectionOpen && selection.size > 0} onClose={() => { setSelectionOpen(false); restoreFocusWhenGone('[data-slot="sheet-content"]', () => selectionTrigger.current); }} onApply={props.onBulkApply} destinationOptions={props.destinationOptions} />
    <ProductDetailSheet row={detail} meta={props.detailMeta} onClose={() => { setDetail(null); props.onProductSelected?.(null); }} />
  </div>;
}

const previewVenues: VenueProductRow[] = [{ id: "venue-most-kej", accountId: "account-most", businessId: "business-kej", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Kej", smlCode: "SML-102-01", city: "Beograd", productCount: 12, qrCount: 11, nfcCount: 9, problemCount: 2, services: ["Meni", "Review", "Links"], status: "problem", statusReason: "2 otvorena problema", premium: true, smfRoot: "SMF-0102-01", suffixRange: "#001–#012" }, { id: "venue-most-centar", accountId: "account-most", businessId: "business-centar", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Centar", smlCode: "SML-102-02", city: "Beograd", productCount: 8, qrCount: 8, nfcCount: 8, problemCount: 0, services: ["Meni"], status: "active", premium: true }, { id: "venue-forma", accountId: "account-forma", businessId: "business-forma", accountName: "Studio Forma", smkCode: "SMK-0208", venueName: "Studio Forma — Vračar", smlCode: "SML-208-01", city: "Beograd", productCount: 7, qrCount: 7, nfcCount: 4, problemCount: 1, services: ["Links", "Review"], status: "inactive", statusReason: "NFC nije aktivan" }];
const previewInventory: ProductInventoryRow[] = [{ id: "product-009", smfCode: "SMF-0102-01-009", localSuffix: "009", productType: "two-piece-stand", designLabel: "Akril · Classic", position: "Sto 4", qr: "green", nfc: "green", services: ["Meni", "Review"], destination: "meni.rs/bistromost", status: "active", updatedAt: Date.parse("2026-09-14T09:12:00Z") }, { id: "product-010", smfCode: "SMF-0102-01-010", localSuffix: "010", productType: "compact-stand", designLabel: "Drvo · Natural", position: "Sto 5", qr: "green", nfc: "orange", nfcReason: "Preusmeravanje je isključeno", services: ["Meni"], destination: "meni.rs/bistromost", status: "inactive", updatedAt: Date.parse("2026-09-14T08:10:00Z") }, { id: "product-011", smfCode: "SMF-0102-01-011", localSuffix: "011", productType: "window-film", designLabel: "PVC · Green", position: "Šank", qr: "red", qrReason: "Odredište nije ispravno", nfc: "green", services: ["Links"], destination: null, status: "problem", updatedAt: Date.parse("2026-09-13T15:22:00Z") }, { id: "product-012", smfCode: "SMF-0102-01-012", localSuffix: "012", productType: "stickers", designLabel: "Papir · Leaves", position: "Terasa", qr: "green", nfc: "gray", nfcReason: dict.productNoNfc, services: ["Meni"], destination: "meni.rs/bistromost", status: "active", updatedAt: Date.parse("2026-09-12T12:04:00Z") }, { id: "product-015", smfCode: "SMF-0102-01-015", localSuffix: "015", productType: "premium-engraved-stand", designLabel: "Drvo · Black", position: "Ulaz", qr: "green", nfc: "green", services: ["Review"], destination: "g.page/bistromost", status: "active", updatedAt: Date.parse("2026-09-11T10:41:00Z") }];


export function AdminProductsPreview() {
  const [state, setState] = useAdminUrlState(PRODUCTS_URL_FIELDS);
  const [inventory, setInventory] = useState(previewInventory);
  const destinationOptions = [{ id: "preview-links", label: dict.serviceLinks }, { id: "preview-review", label: dict.serviceReview }, { id: "preview-menu", label: dict.serviceMenu }];
  const apply = async (draft: BulkDraft) => {
    setInventory((current) => current.map((row) => {
      if (!draft.productIds.includes(row.id)) return row;
      if (draft.kind === "position") return { ...row, position: draft.value, updatedAt: Date.now() };
      if (draft.kind === "destination") return { ...row, destination: destinationOptions.find((option) => option.id === draft.value)?.label ?? row.destination, updatedAt: Date.now() };
      const color = draft.value === "active" ? "green" : draft.value === "inactive" ? "orange" : "red" as AccessColor;
      return { ...row, ...(draft.kind === "qr" ? { qr: color } : draft.kind === "nfc" ? { nfc: color } : { status: draft.value as ProductInventoryRow["status"] }), updatedAt: Date.now() };
    }));
  };
  const venue = previewVenues.find((row) => row.businessId === state.venue) ?? null;
  return <AdminProductsSurface state={state} setState={setState} venues={filterPreviewVenues(previewVenues, state)} venueStatus="ready" venue={venue} inventory={filterPreviewInventory(inventory, state)} inventoryStatus="ready" preview onBulkApply={apply} destinationOptions={destinationOptions} detailMeta={{ destinationHistory: dict.noHistory, placementHistory: dict.noHistory, channelHistory: dict.noHistory, scanAttribution: dict.noHistory }} />;
}
