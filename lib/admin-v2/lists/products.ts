// ADMIN v2 — Proizvodi: one route, two states. Without `?venue=` the list of
// venues (`productVenuesFilters`), with it the inventory of that venue
// (`productInventoryFilters`). The sidebar filters arrive as URL state; this
// turns that state into the arguments of `adminProductReads.listVenues` /
// `listInventory` and filters the rows of the dev preview. Same arguments as
// the filter blocks above the lists sent before.

import { PRODUCT_TYPES } from "@/lib/admin-v2/sidebar/configs/operations";
import type { SidebarState } from "@/lib/admin-v2/sidebar/types";

type VenueFilter = "all" | "problem" | "active";
type ProductType = (typeof PRODUCT_TYPES)[number];
type Design = "template" | "custom";
type Service = "scanme_links" | "google_review";
type State = "active" | "inactive" | "problem";

const VENUE_FILTERS: readonly string[] = ["problem", "active"];
const TYPES: readonly string[] = PRODUCT_TYPES;
const DESIGNS: readonly string[] = ["template", "custom"];
const SERVICES: readonly string[] = ["scanme_links", "google_review"];
const STATES: readonly string[] = ["active", "inactive", "problem"];

function pick<Value extends string>(allowed: readonly string[], value: string | undefined): Value | undefined {
  return value !== undefined && allowed.includes(value) ? (value as Value) : undefined;
}

const fold = (text: string) => text.toLocaleLowerCase("sr-Latn-RS");

// ---- Lokali

export type VenueListArgs = { search?: string; filter: VenueFilter; sort: "urgency" };

export function venueListArgs(state: SidebarState): VenueListArgs {
  return {
    ...(state.q?.trim() ? { search: state.q } : {}),
    filter: pick<"problem" | "active">(VENUE_FILTERS, state.lokali) ?? "all",
    sort: "urgency",
  };
}

export type VenuePreviewRow = { accountName: string; venueName: string; smkCode: string; smlCode: string; status: State };

export function filterPreviewVenues<Row extends VenuePreviewRow>(rows: readonly Row[], state: SidebarState): Row[] {
  const { search, filter } = venueListArgs(state);
  const term = search?.trim() ? fold(search.trim()) : "";
  return rows.filter((row) => {
    const matches = !term || fold(`${row.accountName} ${row.venueName} ${row.smkCode} ${row.smlCode}`).includes(term);
    return matches && (filter === "all" || row.status === filter);
  });
}

// ---- Inventar lokala

export type InventoryFilterArgs = {
  search?: string;
  productType?: ProductType;
  design?: Design;
  service?: Service;
  state?: State;
};

export type InventoryListArgs = InventoryFilterArgs & { sort: "smf"; direction: "asc" };

function inventoryFilterArgs(state: SidebarState): InventoryFilterArgs {
  const productType = pick<ProductType>(TYPES, state.tip);
  const design = pick<Design>(DESIGNS, state.dizajn);
  const service = pick<Service>(SERVICES, state.usluga);
  const productState = pick<State>(STATES, state.status);
  return {
    ...(state.q?.trim() ? { search: state.q } : {}),
    ...(productType ? { productType } : {}),
    ...(design ? { design } : {}),
    ...(service ? { service } : {}),
    ...(productState ? { state: productState } : {}),
  };
}

/** Without `accountId` and `businessId`: the component adds the venue. */
export function inventoryListArgs(state: SidebarState): InventoryListArgs {
  return { ...inventoryFilterArgs(state), sort: "smf", direction: "asc" };
}

/** True while any inventory filter (also the search) narrows the list. */
export function hasInventoryFilter(state: SidebarState): boolean {
  return Object.keys(inventoryFilterArgs(state)).length > 0;
}

/** Changes whenever the inventory filters change: the page drops the selection of products then. */
export function inventoryFilterKey(state: SidebarState): string {
  return JSON.stringify(inventoryFilterArgs(state));
}

export type InventoryPreviewRow = {
  smfCode: string;
  localSuffix: string;
  productType: ProductType;
  position: string | null;
  destination: string | null;
  services: readonly string[];
  status: State;
};

/**
 * The dev preview filters the fixture rows by search (SMF, suffix, position,
 * destination), type, status and service. `dizajn` is not applied: the
 * fixture rows carry a free-text design label, not template / custom.
 */
export function filterPreviewInventory<Row extends InventoryPreviewRow>(rows: readonly Row[], state: SidebarState): Row[] {
  const { search, productType, service, state: productState } = inventoryListArgs(state);
  const term = search?.trim() ? fold(search.trim()) : "";
  const serviceToken = service === "scanme_links" ? "links" : service === "google_review" ? "review" : "";
  return rows.filter(
    (row) =>
      (!term || fold(`${row.smfCode} ${row.localSuffix} ${row.position ?? ""} ${row.destination ?? ""}`).includes(term)) &&
      (!productType || row.productType === productType) &&
      (!productState || row.status === productState) &&
      (!serviceToken || row.services.some((name) => fold(name).includes(serviceToken))),
  );
}
