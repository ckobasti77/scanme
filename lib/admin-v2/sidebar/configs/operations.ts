// ADMIN v2 — sidebars of `Operativa`: the area navigation (Proizvodi, QR
// kodovi, Porudžbine) and the filters of each page. The values are the
// arguments of the Convex lists (`adminOrders.list`, `adminProductReads.*`).
// Proizvodi has two states on one route: the venue list and, with `?venue=`,
// the inventory of that venue.

import type { AdminRoute } from "@/lib/admin-v2/frame/routes";
import { sidebarUrlFields, type UrlField } from "@/lib/admin-v2/query/url-state";
import { adminOrdersSr as orders } from "@/lib/i18n/sr/admin-orders";
import { adminProductsSr as products } from "@/lib/i18n/sr/admin-products";
import { adminUiSr as ui } from "@/lib/i18n/sr/admin-ui";
import type { SidebarConfig } from "../types";
import { areaNav } from "./area-nav";

type Filters = Omit<SidebarConfig, "nav" | "navLabel">;

// ---- Porudžbine

export const ORDER_VIEWS = ["active", "completed", "archived"] as const;
export const ORDER_PAYMENTS = ["awaiting_payment", "paid", "reversed"] as const;
export const ORDER_DESIGNS = ["template_selected", "in_progress", "awaiting_approval", "approved"] as const;
export const ORDER_FULFILLMENTS = [
  "awaiting_conditions",
  "smf_assigned",
  "ready_for_printer",
  "at_printer",
  "received",
  "quality_control",
  "ready_for_delivery",
  "in_delivery",
  "delivered",
  "cancelled",
] as const;
export const ORDER_SORTS = ["updated_desc", "updated_asc"] as const;
/** `?problem=da`: only orders with an open problem. */
export const ORDER_PROBLEMS_ONLY = "da";

const ORDER_VIEW_LABELS: Record<(typeof ORDER_VIEWS)[number], string> = { active: orders.tabActive, completed: orders.tabCompleted, archived: orders.tabArchived };
const ORDER_PAYMENT_LABELS: Record<(typeof ORDER_PAYMENTS)[number], string> = { awaiting_payment: orders.paymentAwaiting, paid: orders.paymentPaid, reversed: orders.paymentReversed };
const ORDER_DESIGN_LABELS: Record<(typeof ORDER_DESIGNS)[number], string> = {
  template_selected: orders.designTemplateSelected,
  in_progress: orders.designInProgress,
  awaiting_approval: orders.designAwaitingApproval,
  approved: orders.designApproved,
};
const ORDER_FULFILLMENT_LABELS: Record<(typeof ORDER_FULFILLMENTS)[number], string> = {
  awaiting_conditions: orders.fulfillmentAwaitingConditions,
  smf_assigned: orders.fulfillmentSmfAssigned,
  ready_for_printer: orders.fulfillmentReadyForPrinter,
  at_printer: orders.fulfillmentAtPrinter,
  received: orders.fulfillmentReceived,
  quality_control: orders.fulfillmentQualityControl,
  ready_for_delivery: orders.fulfillmentReadyForDelivery,
  in_delivery: orders.fulfillmentInDelivery,
  delivered: orders.fulfillmentDelivered,
  cancelled: orders.fulfillmentCancelled,
};

export const ordersFilters: Filters = {
  id: "operativa/porudzbine",
  views: { key: "pogled", label: ui.filters.views, defaultValue: "active", items: ORDER_VIEWS.map((value) => ({ value, label: ORDER_VIEW_LABELS[value] })) },
  search: { key: "q", label: orders.searchLabel, placeholder: orders.searchPlaceholder },
  groups: [
    { id: "assignee", label: orders.filterAssignee },
    { id: "uplata", label: orders.filterPayment, options: ORDER_PAYMENTS.map((value) => ({ value, label: ORDER_PAYMENT_LABELS[value] })) },
    { id: "dizajn", label: orders.filterDesign, options: ORDER_DESIGNS.map((value) => ({ value, label: ORDER_DESIGN_LABELS[value] })) },
    { id: "izvrsenje", label: orders.filterFulfillment, options: ORDER_FULFILLMENTS.map((value) => ({ value, label: ORDER_FULFILLMENT_LABELS[value] })) },
    { id: "problem", label: orders.problems, options: [{ value: ORDER_PROBLEMS_ONLY, label: orders.filterProblems }] },
  ],
  sort: {
    key: "sort",
    label: orders.sortLabel,
    defaultValue: "updated_desc",
    options: [
      { value: "updated_desc", label: orders.sortNewest },
      { value: "updated_asc", label: orders.sortOldest },
    ],
  },
};

export const ORDERS_URL_FIELDS = sidebarUrlFields(ordersFilters);

// ---- QR kodovi

export const qrFilters: Filters = {
  id: "operativa/qr",
  search: { key: "q", label: products.channelSearchLabel, placeholder: products.channelSearchPlaceholder },
  groups: [
    { id: "veza", label: products.bindingFilter, options: [{ value: "digital", label: products.bindingDigital }, { value: "physical", label: products.bindingPhysical }] },
    { id: "vrsta", label: products.kindFilter, options: [{ value: "qr", label: products.channelQr }, { value: "nfc", label: products.channelNfc }] },
    {
      id: "status",
      label: products.colStatus,
      options: [
        { value: "active", label: products.stateActive },
        { value: "inactive", label: products.stateInactive },
        { value: "problem", label: products.stateProblem },
      ],
    },
  ],
};

export const QR_URL_FIELDS = sidebarUrlFields(qrFilters);

// ---- Proizvodi

export const PRODUCT_TYPES = ["two-piece-stand", "compact-stand", "stickers", "window-film", "premium-engraved-stand"] as const;

const PRODUCT_TYPE_LABELS: Record<(typeof PRODUCT_TYPES)[number], string> = {
  "two-piece-stand": products.productTypeTwoPiece,
  "compact-stand": products.productTypeCompact,
  stickers: products.productTypeSticker,
  "window-film": products.productTypeWindowFilm,
  "premium-engraved-stand": products.productTypePremiumEngraved,
};

/** No venue chosen: the list of venues. */
export const productVenuesFilters: Filters = {
  id: "operativa/proizvodi",
  search: { key: "q", label: products.venueSearchLabel, placeholder: products.venueSearchPlaceholder },
  groups: [
    { id: "lokali", label: products.venueFilterLabel, options: [{ value: "problem", label: products.venueFilterProblem }, { value: "active", label: products.venueFilterActive }] },
  ],
};

/** `?venue=<id>`: the inventory of that venue. */
export const productInventoryFilters: Filters = {
  id: "operativa/proizvodi/lokal",
  search: { key: "q", label: products.inventorySearchLabel, placeholder: products.inventorySearchPlaceholder },
  groups: [
    { id: "tip", label: products.filterType, options: PRODUCT_TYPES.map((value) => ({ value, label: PRODUCT_TYPE_LABELS[value] })) },
    { id: "dizajn", label: products.filterDesign, options: [{ value: "template", label: products.filterDesignTemplate }, { value: "custom", label: products.filterDesignCustom }] },
    { id: "usluga", label: products.filterService, options: [{ value: "scanme_links", label: products.serviceLinks }, { value: "google_review", label: products.serviceReview }] },
    {
      id: "status",
      label: products.filterStatus,
      options: [
        { value: "active", label: products.stateActive },
        { value: "inactive", label: products.stateInactive },
        { value: "problem", label: products.stateProblem },
      ],
    },
  ],
};

/** The chosen venue is the page's own key: the sidebar has no control for it. */
const VENUE_FIELD: UrlField = { key: "venue" };

/** Every key of Proizvodi (both states), for the page: it reads one state and clears the other when the venue changes. */
export const PRODUCTS_URL_FIELDS: UrlField[] = [
  VENUE_FIELD,
  ...sidebarUrlFields(productVenuesFilters),
  ...sidebarUrlFields(productInventoryFilters).filter((field) => field.key !== "q"),
];

export function operationsSidebar(route: AdminRoute, search: URLSearchParams): SidebarConfig | null {
  const filters =
    route.key === "/admin/operativa/porudzbine" ? ordersFilters
    : route.key === "/admin/operativa/qr" ? qrFilters
    : route.key === "/admin/operativa/proizvodi" ? (search.get("venue") ? productInventoryFilters : productVenuesFilters)
    : null;
  return filters ? { ...filters, nav: areaNav("operations", route), navLabel: ui.frame.areaNav } : null;
}
