"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ChevronRight,
  CircleEllipsis,
  Link2,
  MapPin,
  Nfc,
  Package,
  QrCode,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
  AdminTable,
} from "@/components/admin/admin-primitives";
import {
  channelLabel,
  productLabel,
  sharedSmfRoot,
  type AccessColor,
  type ProductType,
} from "@/lib/admin-v1/products-workspace";
import { getDict } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const dict = getDict("admin-products");

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

export type InventoryFilters = {
  search: string;
  productType: ProductType | "all";
  design: string;
  service: string;
  status: "all" | "active" | "inactive" | "problem";
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
  venues: VenueProductRow[];
  venueStatus: "loading" | "ready" | "error";
  inventory: ProductInventoryRow[];
  inventoryStatus: "loading" | "ready" | "error";
  canLoadMoreVenues?: boolean;
  canLoadMoreInventory?: boolean;
  loadingMore?: boolean;
  preview?: boolean;
  onVenueSearchChange?: (search: string, filter: "all" | "problem" | "active") => void;
  onVenueSelected?: (venue: VenueProductRow | null) => void;
  onProductSelected?: (product: ProductInventoryRow | null) => void;
  onInventoryFiltersChange?: (filters: InventoryFilters) => void;
  onLoadMoreVenues?: () => void;
  onLoadMoreInventory?: () => void;
  onRetry?: () => void;
  onBulkApply?: (draft: BulkDraft) => Promise<void>;
  destinationOptions?: DestinationOption[];
  detailMeta?: ProductDetailMeta;
  summary?: VenueProductRow;
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
  if (!services.length) return <span className="text-xs text-[var(--admin-text-muted)]">—</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--admin-text-muted)]"><Link2 className="size-3.5" aria-hidden="true" />{services.join(", ")}</span>;
}

function VenueStatus({ row }: { row: VenueProductRow }) {
  const label = row.status === "problem" ? dict.stateProblem : row.status === "inactive" ? dict.stateInactive : dict.stateActive;
  return <span className={cn("grid min-w-0 grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2 text-sm", stateTone[row.status])}><span className="mt-1.5 size-2 rounded-full bg-current" aria-hidden="true" /><span className="min-w-0"><strong className="block font-semibold">{label}</strong>{row.statusReason ? <span className="block truncate text-xs text-[var(--admin-text-muted)]">{row.statusReason}</span> : null}</span></span>;
}

function VenueFinder({ venues, status, canLoadMore, loadingMore, onSearchChange, onLoadMore, onSelect, onRetry, preview }: {
  venues: VenueProductRow[];
  status: SurfaceProps["venueStatus"];
  canLoadMore: boolean;
  loadingMore: boolean;
  onSearchChange?: SurfaceProps["onVenueSearchChange"];
  onLoadMore?: () => void;
  onSelect: (venue: VenueProductRow) => void;
  onRetry?: () => void;
  preview?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "problem" | "active">("all");
  const filtered = useMemo(() => {
    if (onSearchChange) return venues;
    const query = search.trim().toLocaleLowerCase("sr-Latn-RS");
    return venues.filter((row) => {
      const matches = !query || `${row.accountName} ${row.venueName} ${row.smkCode} ${row.smlCode}`.toLocaleLowerCase("sr-Latn-RS").includes(query);
      return matches && (filter === "all" || (filter === "problem" ? row.status === "problem" : row.status === "active"));
    });
  }, [filter, onSearchChange, search, venues]);
  const updateSearch = (value: string) => { setSearch(value); onSearchChange?.(value, filter); };
  const updateFilter = (value: "all" | "problem" | "active") => { setFilter(value); onSearchChange?.(search, value); };

  return <div className="grid min-w-0 gap-5 sm:gap-6">
    <header className="grid gap-2"><div className="flex flex-wrap items-center gap-2">{preview ? <span data-reveal="off" className="rounded-full border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-2.5 py-1 text-xs font-bold text-[var(--admin-warning)]">{dict.previewBadge}</span> : null}</div><h1 className="text-[clamp(2rem,4vw,3.4rem)] leading-none font-semibold tracking-[-0.055em]">{dict.pageTitle}</h1><p className="max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)] sm:text-base">{preview ? dict.previewDescription : dict.pageSubtitle}</p></header>
    <div data-reveal="off" className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-end"><label className="grid gap-1.5"><span className="text-xs font-semibold text-[var(--admin-text-muted)]">{dict.venueSearchLabel}</span><Input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder={dict.venueSearchPlaceholder} className="min-h-11 bg-[var(--admin-surface-strong)]" /></label><label className="grid gap-1.5"><span className="text-xs font-semibold text-[var(--admin-text-muted)]">{dict.venueFilterLabel}</span><select value={filter} onChange={(event) => updateFilter(event.target.value as typeof filter)} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold"><option value="all">{dict.venueFilterAll}</option><option value="problem">{dict.venueFilterProblem}</option><option value="active">{dict.venueFilterActive}</option></select></label><p className="min-h-11 self-end px-3 py-3 text-sm text-[var(--admin-text-muted)]">{dict.venueSortLabel}: <strong className="text-[var(--admin-text)]">{dict.venueSortUrgency}</strong></p></div>
    {status === "loading" ? <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel> : status === "error" ? <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} />{onRetry ? <div className="pb-6 text-center"><Button type="button" variant="outline" onClick={onRetry}>{dict.retry}</Button></div> : null}</AdminPanel> : filtered.length ? <><AdminTable caption={dict.venueTableCaption} className="hidden xl:block" tableClassName="min-w-[70rem]"><thead className="bg-[var(--admin-surface-muted)] text-xs text-[var(--admin-text-muted)]"><tr>{[dict.colClient, dict.colVenue, dict.colCity, dict.colProducts, dict.colChannels, dict.colServices, dict.colStatus, dict.colActions].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--admin-border)]">{filtered.map((row) => <tr key={row.id} className="transition-colors hover:bg-[var(--admin-surface-muted)]/60"><td className="px-4 py-3 align-middle"><strong className="block text-sm">{row.accountName}</strong><span className="font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{row.smkCode}</span>{row.premium ? <span data-premium className="ml-2 rounded-full border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-1.5 py-0.5 text-[0.62rem] font-bold text-[var(--admin-warning)]">{dict.premium}</span> : null}</td><td className="px-4 py-3"><strong className="block text-sm">{row.venueName}</strong><span className="font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{row.smlCode}</span></td><td className="px-4 py-3 text-sm">{row.city ?? "—"}</td><td className="px-4 py-3 font-mono text-sm tabular-nums">{row.productCount}</td><td className="px-4 py-3 font-mono text-sm tabular-nums">{row.qrCount} / {row.nfcCount}</td><td className="px-4 py-3"><Services services={row.services} /></td><td className="max-w-56 px-4 py-3"><VenueStatus row={row} /></td><td className="px-3 py-3"><button data-venue-trigger={row.id} type="button" onClick={() => onSelect(row)} className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.selectVenue}: ${row.venueName}`}><ChevronRight className="size-4" aria-hidden="true" /></button></td></tr>)}</tbody></AdminTable><div className="grid gap-2 xl:hidden">{filtered.map((row) => <button key={row.id} data-venue-trigger={row.id} type="button" onClick={() => onSelect(row)} className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-left shadow-[var(--admin-shadow-xs)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-sm">{row.venueName}</strong>{row.premium ? <span data-premium className="rounded-full bg-[var(--admin-warning-soft)] px-1.5 py-0.5 text-[0.62rem] font-bold text-[var(--admin-warning)]">{dict.premium}</span> : null}</span><span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{row.accountName} · {row.smkCode} · {row.smlCode}</span><span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--admin-text-muted)]"><span>{row.productCount} {dict.products}</span><span>{row.qrCount} {dict.qr}</span><span>{row.nfcCount} {dict.nfc}</span></span></span><span className="flex items-center gap-2"><VenueStatus row={row} /><ChevronRight className="size-4" aria-hidden="true" /></span></button>)}</div></> : <AdminPanel><AdminEmptyState title={search || filter !== "all" ? dict.noVenueResultsTitle : dict.venueEmptyTitle} body={search || filter !== "all" ? dict.noVenueResultsBody : dict.venueEmptyBody} /></AdminPanel>}
    {canLoadMore ? <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? dict.loadingMore : dict.loadMore}</Button> : null}
  </div>;
}

function Summary({ venue, inventory }: { venue: VenueProductRow; inventory: ProductInventoryRow[] }) {
  const root = venue.smfRoot ?? sharedSmfRoot(inventory.map((row) => row.smfCode));
  return <><header className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start"><div className="min-w-0"><p className="text-sm text-[var(--admin-text-muted)]">{dict.breadcrumb}</p><h1 className="mt-1 truncate text-[clamp(1.85rem,4vw,3.3rem)] leading-none font-semibold tracking-[-0.055em]">{venue.venueName}</h1><p className="mt-2 text-sm text-[var(--admin-text-muted)]">{venue.accountName} · {venue.smkCode} · {venue.smlCode}{venue.city ? ` · ${venue.city}` : ""}</p><p className="mt-1 font-mono text-xs text-[var(--admin-text-muted)]">{root ? `${dict.smfRoot}: ${root}` : ""}{venue.suffixRange ? ` · ${dict.productRange}: ${venue.suffixRange}` : ""}</p></div><div data-admin-summary className="grid min-w-0 grid-cols-4 divide-x divide-[var(--admin-border)] overflow-hidden rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] shadow-[var(--admin-shadow-xs)]"><SummaryItem icon={Package} value={venue.productCount} label={dict.products} /><SummaryItem icon={QrCode} value={venue.qrCount} label={dict.qr} /><SummaryItem icon={Nfc} value={venue.nfcCount} label={dict.nfc} /><SummaryItem icon={AlertTriangle} value={venue.problemCount} label={dict.problems} danger /></div></header></>;
}

function SummaryItem({ icon: Icon, value, label, danger = false }: { icon: typeof Package; value: number | null; label: string; danger?: boolean }) { return <div className={cn("flex min-w-0 items-center justify-center gap-1.5 px-2 py-2 text-xs sm:px-3 sm:text-sm", danger && "text-[var(--admin-danger)]")}><Icon className="size-4 shrink-0" aria-hidden="true" /><strong className="font-mono tabular-nums">{value ?? dict.unknownValue}</strong><span className="truncate">{label}</span></div>; }

function InventoryControls({ filters, onChange, view, onView }: { filters: InventoryFilters; onChange: (filters: InventoryFilters) => void; view: "table" | "visual"; onView: (view: "table" | "visual") => void }) {
  const set = <K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) => onChange({ ...filters, [key]: value });
  return <div data-reveal="off" className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_auto_auto_auto_auto_auto]"><label className="grid gap-1.5"><span className="sr-only">{dict.inventorySearchLabel}</span><Input value={filters.search} onChange={(event) => set("search", event.target.value)} placeholder={dict.inventorySearchPlaceholder} className="min-h-11 bg-[var(--admin-surface-strong)]" /></label><FilterSelect label={dict.filterType} value={filters.productType} onChange={(value) => set("productType", value as InventoryFilters["productType"])}><option value="all">{dict.filterTypeAll}</option><option value="two-piece-stand">{dict.productTypeTwoPiece}</option><option value="compact-stand">{dict.productTypeCompact}</option><option value="stickers">{dict.productTypeSticker}</option><option value="window-film">{dict.productTypeWindowFilm}</option><option value="premium-engraved-stand">{dict.productTypePremiumEngraved}</option></FilterSelect><FilterSelect label={dict.filterDesign} value={filters.design} onChange={(value) => set("design", value)}><option value="all">{dict.filterDesignAll}</option><option value="template">{dict.filterDesignTemplate}</option><option value="custom">{dict.filterDesignCustom}</option></FilterSelect><FilterSelect label={dict.filterService} value={filters.service} onChange={(value) => set("service", value)}><option value="all">{dict.filterServiceAll}</option><option value="scanme_links">{dict.serviceLinks}</option><option value="google_review">{dict.serviceReview}</option><option value="scanme_menu">{dict.serviceMenu}</option></FilterSelect><FilterSelect label={dict.filterStatus} value={filters.status} onChange={(value) => set("status", value as InventoryFilters["status"])}><option value="all">{dict.filterAll}</option><option value="active">{dict.stateActive}</option><option value="inactive">{dict.stateInactive}</option><option value="problem">{dict.stateProblem}</option></FilterSelect><div role="group" aria-label={dict.viewLabel} className="grid grid-cols-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1"><button type="button" aria-pressed={view === "table"} onClick={() => onView("table")} className={cn("min-h-9 rounded-lg px-3 text-sm font-semibold", view === "table" ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "hover:bg-[var(--admin-surface-muted)]")}>{dict.viewTable}</button><button type="button" aria-pressed={view === "visual"} onClick={() => onView("visual")} className={cn("min-h-9 rounded-lg px-3 text-sm font-semibold", view === "visual" ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "hover:bg-[var(--admin-surface-muted)]")}>{dict.viewVisual}</button></div></div>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) { return <label className="grid gap-1.5"><span className="sr-only">{label}</span><select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold">{children}</select></label>; }

function InventoryTable({ rows, selected, onToggle, onOpen }: { rows: ProductInventoryRow[]; selected: ReadonlySet<string>; onToggle: (id: string) => void; onOpen: (row: ProductInventoryRow, trigger: HTMLElement) => void }) { return <><AdminTable caption={dict.inventoryTableCaption} className="hidden lg:block" tableClassName="min-w-[70rem]"><thead className="bg-[var(--admin-surface-muted)] text-xs text-[var(--admin-text-muted)]"><tr>{[dict.colSelect, dict.colId, dict.colProduct, dict.colPosition, dict.colQrNfc, dict.colServices, dict.colDestination, dict.colStatus, dict.colUpdated, dict.colActions].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--admin-border)]">{rows.map((row) => <tr key={row.id} className={cn("transition-colors hover:bg-[var(--admin-surface-muted)]/60", selected.has(row.id) && "bg-[var(--admin-accent-soft)]/40")}><td className="px-3 py-3"><input aria-label={`${dict.selectProduct}: #${row.localSuffix}`} checked={selected.has(row.id)} onChange={() => onToggle(row.id)} type="checkbox" className="size-5 accent-[var(--admin-accent)]" /></td><td className="px-3 py-3 font-mono text-sm">#{row.localSuffix}</td><td className="px-3 py-3"><span className="flex items-center gap-2"><ProductIcon type={row.productType} /><span><strong className="block text-sm">{productLabel(dict, row.productType)}</strong>{row.designLabel ? <span className="block text-xs text-[var(--admin-text-muted)]">{row.designLabel}</span> : null}</span></span></td><td className="px-3 py-3 text-sm">{row.position ?? "—"}</td><td className="px-3 py-3"><span className="flex gap-1"><ChannelSignal kind="qr" color={row.qr} reason={row.qrReason} /><ChannelSignal kind="nfc" color={row.nfc} reason={row.nfcReason} /></span></td><td className="px-3 py-3"><Services services={row.services} /></td><td className="max-w-48 px-3 py-3 text-xs text-[var(--admin-text-muted)]"><span className="block truncate">{row.destination ?? "—"}</span></td><td className="px-3 py-3"><span className={cn("inline-flex items-center gap-2 text-sm font-semibold", stateTone[row.status])}><span className="size-2 rounded-full bg-current" aria-hidden="true" />{row.status === "problem" ? dict.stateProblem : row.status === "inactive" ? dict.stateInactive : dict.stateActive}</span></td><td className="px-3 py-3 text-xs text-[var(--admin-text-muted)]"><time dateTime={new Date(row.updatedAt).toISOString()}>{new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "short", timeStyle: "short" }).format(row.updatedAt)}</time></td><td className="px-2 py-3"><button data-product-trigger={row.id} type="button" onClick={(event) => onOpen(row, event.currentTarget)} className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.openProduct}: #${row.localSuffix}`}><CircleEllipsis className="size-5" aria-hidden="true" /></button></td></tr>)}</tbody></AdminTable><div className="grid gap-2 lg:hidden">{rows.map((row) => <article key={row.id} className={cn("grid min-h-36 grid-cols-[auto_5rem_minmax(0,1fr)_auto] gap-3 rounded-[var(--admin-radius-control)] border bg-[var(--admin-surface)] p-3 shadow-[var(--admin-shadow-xs)]", selected.has(row.id) ? "border-[var(--admin-accent)]" : "border-[var(--admin-border)]")}><input aria-label={`${dict.selectProduct}: #${row.localSuffix}`} checked={selected.has(row.id)} onChange={() => onToggle(row.id)} type="checkbox" className="mt-1 size-5 accent-[var(--admin-accent)]" /><ProductImage type={row.productType} /><div className="min-w-0"><strong className="font-mono text-sm">#{row.localSuffix}</strong><h2 className="mt-1 text-sm font-semibold">{productLabel(dict, row.productType)}</h2><p className="mt-1 truncate text-xs text-[var(--admin-text-muted)]">{row.position ?? "—"} · {row.destination ?? "—"}</p><span className="mt-3 flex gap-1"><ChannelSignal kind="qr" color={row.qr} reason={row.qrReason} /><ChannelSignal kind="nfc" color={row.nfc} reason={row.nfcReason} /></span></div><button data-product-trigger={row.id} type="button" onClick={(event) => onOpen(row, event.currentTarget)} className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.openProduct}: #${row.localSuffix}`}><ChevronRight className="size-4" aria-hidden="true" /></button></article>)}</div></>; }

function ProductIcon({ type }: { type: ProductType }) { return <span data-product-type={type} className="grid size-7 place-items-center rounded-md bg-[var(--admin-surface-muted)]"><Package className="size-4" aria-hidden="true" /></span>; }
function ProductImage({ type }: { type: ProductType }) { return <span className="relative block size-20 overflow-hidden rounded-lg bg-[var(--admin-surface-muted)]"><Image src={productImage[type]} alt={productLabel(dict, type)} fill sizes="80px" className="object-contain p-1" /></span>; }

function VisualInventory({ rows, selected, onToggle, onOpen }: { rows: ProductInventoryRow[]; selected: ReadonlySet<string>; onToggle: (id: string) => void; onOpen: (row: ProductInventoryRow, trigger: HTMLElement) => void }) { return <div className="grid grid-cols-1 gap-3 min-[30rem]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{rows.map((row) => <article key={row.id} data-product-card className={cn("grid h-52 grid-cols-[7rem_minmax(0,1fr)] gap-3 rounded-[var(--admin-radius-control)] border bg-[var(--admin-surface)] p-3 shadow-[var(--admin-shadow-xs)]", selected.has(row.id) ? "border-2 border-[var(--admin-accent)]" : "border-[var(--admin-border)]")}><div className="grid content-between"><input aria-label={`${dict.selectProduct}: #${row.localSuffix}`} checked={selected.has(row.id)} onChange={() => onToggle(row.id)} type="checkbox" className="size-5 accent-[var(--admin-accent)]" /><ProductImage type={row.productType} /></div><div className="flex min-w-0 flex-col"><div className="flex items-start justify-between gap-2"><strong className="font-mono text-sm">#{row.localSuffix}</strong><button data-product-trigger={row.id} type="button" onClick={(event) => onOpen(row, event.currentTarget)} className="-mr-2 -mt-2 inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]" aria-label={`${dict.openProduct}: #${row.localSuffix}`}><CircleEllipsis className="size-5" aria-hidden="true" /></button></div><h2 className="mt-1 line-clamp-2 text-sm font-semibold">{productLabel(dict, row.productType)}</h2><p className="mt-1 line-clamp-1 text-xs text-[var(--admin-text-muted)]">{row.designLabel ?? "—"}</p><p className="mt-auto flex items-center gap-1.5 truncate text-xs text-[var(--admin-text-muted)]"><MapPin className="size-3.5 shrink-0" aria-hidden="true" />{row.position ?? "—"}</p><span className="mt-2 flex gap-1"><ChannelSignal kind="qr" color={row.qr} reason={row.qrReason} /><ChannelSignal kind="nfc" color={row.nfc} reason={row.nfcReason} /></span><span className="mt-2"><Services services={row.services} /></span></div></article>)}</div>; }

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
    setTimeout(() => { confirmTransition.current = false; }, 200);
  };
  const submit = async () => {
    if (!canSubmit || !onApply) return;
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
        <Button type="button" disabled={!canSubmit || pending} onClick={openConfirmation} className="min-h-11">{pending ? dict.saving : dict.saveChanges}</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>{dict.cancel}</Button>
      </div>
    </SheetContent>
    </Sheet>
    <Dialog open={confirmOpen} onOpenChange={(next) => { if (next) openConfirmation(); else closeConfirmation(); }}>
      <DialogContent data-reveal="off" onEscapeKeyDown={(event) => { event.preventDefault(); event.stopPropagation(); closeConfirmation(); }} className="admin-v1 border-[var(--admin-border)] bg-[var(--admin-surface-strong)]">
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
        <section className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4"><ProductImage type={row.productType} /><div><h2 className="font-semibold">{productLabel(dict, row.productType)}</h2><p className="mt-1 font-mono text-xs text-[var(--admin-text-muted)]">{row.smfCode}</p><p className="mt-2 text-sm text-[var(--admin-text-muted)]">{row.designLabel ?? "—"}</p></div></section>
        <DetailRow label={dict.productIdentity} value={row.smfCode} mono />
        <DetailRow label={dict.productDesign} value={row.designLabel ?? "—"} />
        <DetailRow label={dict.productServices} value={row.services.join(", ") || "—"} />
        <DetailRow label={dict.productDestination} value={row.destination ?? "—"} />
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
function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <section><h3 className="text-sm font-semibold">{label}</h3><p className={cn("mt-1 break-words text-sm text-[var(--admin-text-muted)]", mono && "font-mono text-xs")}>{value}</p></section>; }

export function AdminProductsSurface(props: SurfaceProps) {
  const [venue, setVenue] = useState<VenueProductRow | null>(null);
  const [view, setView] = useState<"table" | "visual">("visual");
  const [filters, setFilters] = useState<InventoryFilters>({ search: "", productType: "all", design: "all", service: "all", status: "all" });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectionLimit, setSelectionLimit] = useState(false);
  const [detail, setDetail] = useState<ProductInventoryRow | null>(null);
  const selectVenue = (next: VenueProductRow) => {
    setVenue(next);
    setSelection(new Set());
    setSelectionLimit(false);
    setDetail(null);
    props.onProductSelected?.(null);
    props.onVenueSelected?.(next);
  };
  const leaveVenue = () => {
    const trigger = venue?.id;
    setVenue(null);
    setSelection(new Set());
    setSelectionLimit(false);
    setDetail(null);
    props.onProductSelected?.(null);
    props.onVenueSelected?.(null);
    if (trigger) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-venue-trigger="${trigger}"]`)?.focus());
  };
  const updateFilters = (next: InventoryFilters) => {
    setFilters(next);
    props.onInventoryFiltersChange?.(next);
  };
  const toggle = (id: string) => setSelection((current) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
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
  if (!venue) return <VenueFinder venues={props.venues} status={props.venueStatus} canLoadMore={Boolean(props.canLoadMoreVenues)} loadingMore={Boolean(props.loadingMore)} onSearchChange={props.onVenueSearchChange} onLoadMore={props.onLoadMoreVenues} onSelect={selectVenue} onRetry={props.onRetry} preview={props.preview} />;
  const hasFilter = Boolean(filters.search || filters.productType !== "all" || filters.design !== "all" || filters.service !== "all" || filters.status !== "all");
  return <div className="grid min-w-0 gap-5 sm:gap-6">
    <button type="button" onClick={leaveVenue} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-[var(--admin-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><ChevronRight className="size-4 rotate-180" aria-hidden="true" />{dict.backToVenues}</button>
    <Summary venue={props.summary?.id === venue.id ? props.summary : venue} inventory={props.inventory} />
    <InventoryControls filters={filters} onChange={updateFilters} view={view} onView={setView} />
    {selectionLimit ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{dict.bulkLimit}</p> : null}
    {props.inventoryStatus === "loading" ? <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel> : props.inventoryStatus === "error" ? <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} />{props.onRetry ? <div className="pb-6 text-center"><Button type="button" variant="outline" onClick={props.onRetry}>{dict.retry}</Button></div> : null}</AdminPanel> : props.inventory.length ? view === "table" ? <InventoryTable rows={props.inventory} selected={selection} onToggle={toggle} onOpen={(row) => { setDetail(row); props.onProductSelected?.(row); }} /> : <VisualInventory rows={props.inventory} selected={selection} onToggle={toggle} onOpen={(row) => { setDetail(row); props.onProductSelected?.(row); }} /> : <AdminPanel><AdminEmptyState title={hasFilter ? dict.noSearchProductsTitle : dict.noProductsTitle} body={hasFilter ? dict.noSearchProductsBody : dict.noProductsBody} /></AdminPanel>}
    {props.canLoadMoreInventory ? <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={props.loadingMore} onClick={props.onLoadMoreInventory}>{props.loadingMore ? dict.loadingMore : dict.loadMore}</Button> : null}
    <SelectionSheet selected={selection} rows={props.inventory} open={selection.size > 0} onClose={() => setSelection(new Set())} onApply={props.onBulkApply} destinationOptions={props.destinationOptions} />
    <ProductDetailSheet row={detail} meta={props.detailMeta} onClose={() => { setDetail(null); props.onProductSelected?.(null); }} />
  </div>;
}

const previewVenues: VenueProductRow[] = [{ id: "venue-most-kej", accountId: "account-most", businessId: "business-kej", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Kej", smlCode: "SML-102-01", city: "Beograd", productCount: 12, qrCount: 11, nfcCount: 9, problemCount: 2, services: ["Meni", "Review", "Links"], status: "problem", statusReason: "2 otvorena problema", premium: true, smfRoot: "SMF-0102-01", suffixRange: "#001–#012" }, { id: "venue-most-centar", accountId: "account-most", businessId: "business-centar", accountName: "Bistro Most", smkCode: "SMK-0102", venueName: "Bistro Most — Centar", smlCode: "SML-102-02", city: "Beograd", productCount: 8, qrCount: 8, nfcCount: 8, problemCount: 0, services: ["Meni"], status: "active", premium: true }, { id: "venue-forma", accountId: "account-forma", businessId: "business-forma", accountName: "Studio Forma", smkCode: "SMK-0208", venueName: "Studio Forma — Vračar", smlCode: "SML-208-01", city: "Beograd", productCount: 7, qrCount: 7, nfcCount: 4, problemCount: 1, services: ["Links", "Review"], status: "inactive", statusReason: "NFC nije aktivan" }];
const previewInventory: ProductInventoryRow[] = [{ id: "product-009", smfCode: "SMF-0102-01-009", localSuffix: "009", productType: "two-piece-stand", designLabel: "Akril · Classic", position: "Sto 4", qr: "green", nfc: "green", services: ["Meni", "Review"], destination: "meni.rs/bistromost", status: "active", updatedAt: Date.parse("2026-09-14T09:12:00Z") }, { id: "product-010", smfCode: "SMF-0102-01-010", localSuffix: "010", productType: "compact-stand", designLabel: "Drvo · Natural", position: "Sto 5", qr: "green", nfc: "orange", nfcReason: "Redirect je isključen", services: ["Meni"], destination: "meni.rs/bistromost", status: "inactive", updatedAt: Date.parse("2026-09-14T08:10:00Z") }, { id: "product-011", smfCode: "SMF-0102-01-011", localSuffix: "011", productType: "window-film", designLabel: "PVC · Green", position: "Šank", qr: "red", qrReason: "Odredište nije validno", nfc: "green", services: ["Links"], destination: "—", status: "problem", updatedAt: Date.parse("2026-09-13T15:22:00Z") }, { id: "product-012", smfCode: "SMF-0102-01-012", localSuffix: "012", productType: "stickers", designLabel: "Papir · Leaves", position: "Terasa", qr: "green", nfc: "gray", nfcReason: dict.productNoNfc, services: ["Meni"], destination: "meni.rs/bistromost", status: "active", updatedAt: Date.parse("2026-09-12T12:04:00Z") }, { id: "product-015", smfCode: "SMF-0102-01-015", localSuffix: "015", productType: "premium-engraved-stand", designLabel: "Drvo · Black", position: "Ulaz", qr: "green", nfc: "green", services: ["Review"], destination: "g.page/bistromost", status: "active", updatedAt: Date.parse("2026-09-11T10:41:00Z") }];

export function AdminProductsPreview() {
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
  return <AdminProductsSurface venues={previewVenues} venueStatus="ready" inventory={inventory} inventoryStatus="ready" preview onBulkApply={apply} destinationOptions={destinationOptions} detailMeta={{ destinationHistory: dict.noHistory, placementHistory: dict.noHistory, channelHistory: dict.noHistory, scanAttribution: dict.noHistory }} />;
}
