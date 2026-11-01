"use client";

import { Component, type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  AdminProductsSurface,
  type BulkDraft,
  type ProductDetailMeta,
  type ProductInventoryRow,
  type VenueProductRow,
} from "@/components/admin/admin-products-surface";
import { AdminErrorState, AdminPanel } from "@/components/admin/admin-primitives";
import { useAdminUrlState } from "@/components/admin/admin-ui/use-admin-query-state";
import { inventoryListArgs, venueListArgs } from "@/lib/admin-v2/lists/products";
import { PRODUCTS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/operations";
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

export function AdminProductsWorkspace({ initialProductId }: { initialProductId?: string }) {
  // The chosen venue (`venue`) and the filters of both states are in the URL; the sidebar writes the filters.
  const [state, setState] = useAdminUrlState(PRODUCTS_URL_FIELDS);
  const [selectedVenueOverride, setSelectedVenue] = useState<VenueProductRow | null>(null);
  const [selectedProductOverride, setSelectedProduct] = useState<ProductInventoryRow | null | undefined>(undefined);
  const [seenVenue, setSeenVenue] = useState(state.venue);
  if (seenVenue !== state.venue) {
    // Another venue (also by Back / Forward): a product of the old one is no longer selected.
    setSeenVenue(state.venue);
    setSelectedProduct(null);
  }
  // Typing in the sidebar search does not hit the queries on every key.
  const venueArgs = useDeferredValue(useMemo(() => venueListArgs(state), [state]));
  const inventoryArgs = useDeferredValue(useMemo(() => inventoryListArgs(state), [state]));
  const venues = usePaginatedQuery(api.adminProductReads.listVenues, venueArgs, { initialNumItems: pageSize });
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
  }));
  // The row the user opened stays while the list reloads without the search it was found with.
  const selectedVenue = !state.venue ? null
    : selectedVenueOverride?.businessId === state.venue ? selectedVenueOverride
    : venueRows.find((row) => row.businessId === state.venue) ?? null;
  const inventory = usePaginatedQuery(api.adminProductReads.listInventory, selectedVenue ? {
    accountId: selectedVenue.accountId as Id<"accounts">,
    businessId: selectedVenue.businessId as Id<"businesses">,
    ...inventoryArgs,
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
    state={state}
    setState={setState}
    venues={venueRows}
    venueStatus={venues.status === "LoadingFirstPage" ? "loading" : "ready"}
    inventory={inventoryRows}
    inventoryStatus={inventory.status === "LoadingFirstPage" ? "loading" : "ready"}
    canLoadMoreVenues={venues.status === "CanLoadMore" || venues.status === "LoadingMore"}
    canLoadMoreInventory={inventory.status === "CanLoadMore" || inventory.status === "LoadingMore"}
    loadingMore={venues.status === "LoadingMore" || inventory.status === "LoadingMore"}
    onVenueSelected={setSelectedVenue}
    onProductSelected={setSelectedProduct}
    onLoadMoreVenues={() => venues.loadMore(pageSize)}
    onLoadMoreInventory={() => inventory.loadMore(pageSize)}
    onBulkApply={applyBulk}
    destinationOptions={(destinationProfiles?.profiles ?? []).map((profile) => ({ id: profile.profileId, label: serviceLabel(profile.type) }))}
    detailMeta={detailMeta}
    venue={selectedVenueWithSummary}
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
