"use client";

import { Component, type ReactNode, useDeferredValue, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  AdminProductsSurface,
  type BulkDraft,
  type InventoryFilters,
  type ProductDetailMeta,
  type ProductInventoryRow,
  type VenueProductRow,
} from "@/components/admin/admin-products-surface";
import { AdminErrorState, AdminPanel } from "@/components/admin/admin-primitives";
import { getDict } from "@/lib/i18n";

const dict = getDict("admin-products");
const pageSize = 20;

function commandKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function serviceLabel(type: string) {
  if (type === "scanme_links") return dict.serviceLinks;
  if (type === "google_review") return dict.serviceReview;
  return dict.serviceMenu;
}

function destinationLabel(kind: string, types: readonly string[] | undefined) {
  if (types?.length) return types.map(serviceLabel).join(", ");
  if (kind === "service") return dict.destinationService;
  if (kind === "links_splitter") return dict.destinationLinksSplitter;
  if (kind === "generic_splitter") return dict.destinationGenericSplitter;
  if (kind === "dynamic_url") return dict.destinationDynamicUrl;
  return dict.destinationLegacy;
}

function designLabel(snapshot: { material?: string; woodType?: string; design: { kind: string; templateId?: string; brief?: string } } | undefined) {
  if (!snapshot) return null;
  const design = snapshot.design.kind === "template" ? snapshot.design.templateId : snapshot.design.brief;
  return [snapshot.material, snapshot.woodType, design].filter(Boolean).join(" · ") || null;
}

function listText<Row>(rows: readonly Row[] | undefined, line: (row: Row) => string) {
  if (!rows) return dict.loading;
  if (!rows.length) return dict.noHistory;
  return rows.slice(0, 5).map(line).join("\n");
}

export function AdminProductsWorkspace({ initialVenueId, initialProductId, initialSmfCode }: { initialVenueId?: string; initialProductId?: string; initialSmfCode?: string }) {
  const [venueSearch, setVenueSearch] = useState(initialSmfCode ?? "");
  const [venueFilter, setVenueFilter] = useState<"all" | "problem" | "active">("all");
  const [selectedVenueOverride, setSelectedVenue] = useState<VenueProductRow | null | undefined>(undefined);
  const [filters, setFilters] = useState<InventoryFilters>({ search: initialSmfCode ?? "", productType: "all", design: "all", service: "all", status: "all" });
  const [selectedProductOverride, setSelectedProduct] = useState<ProductInventoryRow | null | undefined>(undefined);
  const deferredVenueSearch = useDeferredValue(venueSearch);
  const deferredInventorySearch = useDeferredValue(filters.search);
  const venues = usePaginatedQuery(api.adminProductReads.listVenues, {
    ...(deferredVenueSearch.trim() ? { search: deferredVenueSearch } : {}),
    filter: venueFilter,
    sort: "urgency",
  }, { initialNumItems: pageSize });
  const venueRows: VenueProductRow[] = venues.results.map((row) => ({
    id: row.businessId,
    accountId: row.accountId,
    businessId: row.businessId,
    accountName: row.ownerDisplayName,
    smkCode: row.smkCode,
    venueName: row.venueName,
    smlCode: row.smlCode,
    city: row.city,
    productCount: row.productCount,
    qrCount: row.qrCount,
    nfcCount: row.nfcCount,
    problemCount: row.problemCount,
    services: row.serviceTypes.map(serviceLabel),
    status: row.problemCount && row.problemCount > 0 ? "problem" : row.clientStatus === "active" ? "active" : "inactive",
    statusReason: row.isProductProjectionComplete ? undefined : dict.unknownValue,
  }));
  const selectedVenue = selectedVenueOverride === undefined
    ? venueRows.find((row) => row.businessId === initialVenueId) ?? null
    : selectedVenueOverride;
  const inventory = usePaginatedQuery(api.adminProductReads.listInventory, selectedVenue ? {
    accountId: selectedVenue.accountId as Id<"accounts">,
    businessId: selectedVenue.businessId as Id<"businesses">,
    ...(deferredInventorySearch.trim() ? { search: deferredInventorySearch } : {}),
    ...(filters.productType !== "all" ? { productType: filters.productType } : {}),
    ...(filters.design !== "all" ? { design: filters.design as "template" | "custom" } : {}),
    ...(filters.service !== "all" ? { service: filters.service as "scanme_links" | "google_review" | "scanme_menu" } : {}),
    ...(filters.status !== "all" ? { state: filters.status } : {}),
    sort: "smf",
    direction: "asc",
  } : "skip", { initialNumItems: pageSize });
  const inventoryRows: ProductInventoryRow[] = inventory.results.map((row) => ({
    id: row.productId,
    smfCode: row.smfCode,
    localSuffix: row.localSuffix,
    productType: row.productType,
    designLabel: designLabel(row.designSnapshot),
    position: row.position || null,
    qr: row.qr,
    nfc: row.nfc,
    qrReason: row.qrProblemReason,
    nfcReason: row.nfcProblemReason,
    services: (row.destinationServiceTypes ?? row.boundServices ?? []).map(serviceLabel),
    destination: destinationLabel(row.destinationKind, row.destinationServiceTypes),
    status: row.state,
    updatedAt: row.updatedAt,
  }));
  const selectedProduct = selectedProductOverride === undefined
    ? inventoryRows.find((row) => row.id === initialProductId) ?? null
    : selectedProductOverride;
  const summary = useQuery(api.adminProductReads.getVenueProductSummary, selectedVenue ? {
    accountId: selectedVenue.accountId as Id<"accounts">,
    businessId: selectedVenue.businessId as Id<"businesses">,
  } : "skip");
  const destinationProfiles = useQuery(api.adminProductReads.listDestinationProfiles, selectedVenue ? {
    accountId: selectedVenue.accountId as Id<"accounts">,
    businessId: selectedVenue.businessId as Id<"businesses">,
  } : "skip");
  const detail = useQuery(api.adminProductReads.getProductDetail, selectedProduct && selectedVenue ? {
    accountId: selectedVenue.accountId as Id<"accounts">,
    businessId: selectedVenue.businessId as Id<"businesses">,
    productId: selectedProduct.id as Id<"physicalProducts">,
  } : "skip");
  const destinations = usePaginatedQuery(api.adminProductReads.destinationHistory, detail && selectedVenue ? {
    accountId: selectedVenue.accountId as Id<"accounts">,
    businessId: selectedVenue.businessId as Id<"businesses">,
    subjectId: detail.subject._id,
  } : "skip", { initialNumItems: 5 });
  const placements = usePaginatedQuery(api.adminProductReads.placementHistory, detail && selectedVenue ? {
    accountId: selectedVenue.accountId as Id<"accounts">,
    businessId: selectedVenue.businessId as Id<"businesses">,
    productId: detail.product._id,
  } : "skip", { initialNumItems: 5 });
  const primaryChannel = detail?.channels.find((channel) => channel.kind === "qr") ?? detail?.channels[0];
  const events = usePaginatedQuery(api.adminProductReads.channelHistory, primaryChannel && selectedVenue ? {
    accountId: selectedVenue.accountId as Id<"accounts">,
    businessId: selectedVenue.businessId as Id<"businesses">,
    channelId: primaryChannel._id,
  } : "skip", { initialNumItems: 5 });
  const scans = usePaginatedQuery(api.adminProductReads.dailyMetrics, primaryChannel && selectedVenue ? {
    accountId: selectedVenue.accountId as Id<"accounts">,
    businessId: selectedVenue.businessId as Id<"businesses">,
    channelId: primaryChannel._id,
  } : "skip", { initialNumItems: 5 });
  const setChannels = useMutation(api.adminProducts.bulkSetChannelState);
  const changePlacement = useMutation(api.adminProducts.bulkChangePlacement);
  const retarget = useMutation(api.adminProducts.bulkRetarget);

  const detailMeta: ProductDetailMeta | undefined = detail === undefined ? undefined : {
    destinationHistory: listText(destinations.status === "LoadingFirstPage" ? undefined : destinations.results, (row) => new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "short", timeStyle: "short" }).format(row.createdAt)),
    placementHistory: listText(placements.status === "LoadingFirstPage" ? undefined : placements.results, (row) => `${row.name} · ${new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "short" }).format(row.startedAt)}`),
    channelHistory: listText(events.status === "LoadingFirstPage" ? undefined : events.results, (row) => new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "short", timeStyle: "short" }).format(row.createdAt)),
    scanAttribution: listText(scans.status === "LoadingFirstPage" ? undefined : scans.results, (row) => `${row.dateKey} · ${row.scans}`),
  };
  const selectedVenueWithSummary = selectedVenue && summary ? {
    ...selectedVenue,
    productCount: summary.productCount,
    qrCount: summary.qrCount,
    nfcCount: summary.nfcCount,
    problemCount: summary.problemChannelCount,
    suffixRange: summary.firstSuffix && summary.lastSuffix ? `#${summary.firstSuffix}–#${summary.lastSuffix}` : null,
  } : selectedVenue;
  const applyBulk = async (draft: BulkDraft) => {
    if (!selectedVenue) throw new Error("venue_required");
    const scope = { accountId: selectedVenue.accountId as Id<"accounts">, businessId: selectedVenue.businessId as Id<"businesses"> };
    const productIds = draft.productIds.map((id) => id as Id<"physicalProducts">);
    if (draft.kind === "position") {
      await changePlacement({ ...scope, productIds, name: draft.value, reason: draft.reason, key: commandKey() });
      return;
    }
    if (draft.kind === "destination") {
      await retarget({ ...scope, productIds, channelIds: [], destination: { kind: "services", serviceProfileIds: [draft.value as Id<"serviceProfiles">] }, reason: draft.reason, key: commandKey() });
      return;
    }
    await setChannels({ ...scope, productIds, kinds: draft.kind === "qr" ? ["qr"] : draft.kind === "nfc" ? ["nfc"] : ["qr", "nfc"], state: draft.value as "active" | "inactive" | "problem", reason: draft.reason, key: commandKey() });
  };

  return <AdminProductsSurface
    venues={venueRows}
    venueStatus={venues.status === "LoadingFirstPage" ? "loading" : "ready"}
    inventory={inventoryRows}
    inventoryStatus={inventory.status === "LoadingFirstPage" ? "loading" : "ready"}
    canLoadMoreVenues={venues.status === "CanLoadMore" || venues.status === "LoadingMore"}
    canLoadMoreInventory={inventory.status === "CanLoadMore" || inventory.status === "LoadingMore"}
    loadingMore={venues.status === "LoadingMore" || inventory.status === "LoadingMore"}
    onVenueSearchChange={(search, filter) => { setVenueSearch(search); setVenueFilter(filter); }}
    onVenueSelected={setSelectedVenue}
    onProductSelected={setSelectedProduct}
    onInventoryFiltersChange={setFilters}
    onLoadMoreVenues={() => venues.loadMore(pageSize)}
    onLoadMoreInventory={() => inventory.loadMore(pageSize)}
    onBulkApply={applyBulk}
    destinationOptions={(destinationProfiles?.profiles ?? []).map((profile) => ({ id: profile.profileId, label: serviceLabel(profile.type) }))}
    detailMeta={detailMeta}
    summary={selectedVenueWithSummary ?? undefined}
    initialVenueId={initialVenueId}
    initialProductId={initialProductId}
  />;
}

export class AdminProductsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} onRetry={() => window.location.reload()} /></AdminPanel>;
    return this.props.children;
  }
}
