// ADMIN v2 — Porudžbine: the URL state of the sidebar (`?pogled=&q=&assignee=
// &uplata=&dizajn=&izvrsenje=&problem=&sort=`) turned into the arguments of
// `adminOrders.list` and into the filter of the dev preview rows. Pure.

import type { Id } from "@/convex/_generated/dataModel";
import {
  ORDER_DESIGNS,
  ORDER_FULFILLMENTS,
  ORDER_PAYMENTS,
  ORDER_PROBLEMS_ONLY,
  ORDER_SORTS,
  ORDER_VIEWS,
} from "@/lib/admin-v2/sidebar/configs/operations";
import type { SidebarLive, SidebarOption, SidebarState } from "@/lib/admin-v2/sidebar/types";

type View = (typeof ORDER_VIEWS)[number];
type Sort = (typeof ORDER_SORTS)[number];

/** The arguments of `adminOrders.list` without the pagination. */
export type OrdersListArgs = {
  view: View;
  search?: string;
  assigneeId?: Id<"users">;
  paymentState?: (typeof ORDER_PAYMENTS)[number];
  designState?: (typeof ORDER_DESIGNS)[number];
  fulfillmentState?: (typeof ORDER_FULFILLMENTS)[number];
  sort?: Sort;
  problemsOnly?: true;
};

const DEFAULT_VIEW: View = "active";
const DEFAULT_SORT: Sort = "updated_desc";

function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | undefined {
  return values.find((candidate) => candidate === value);
}

/** An absent key is the default; a search has no `sort` (it is ordered by relevance). */
export function ordersListArgs(state: SidebarState): OrdersListArgs {
  const search = (state.q ?? "").trim() ? state.q : undefined;
  const paymentState = oneOf(ORDER_PAYMENTS, state.uplata);
  const designState = oneOf(ORDER_DESIGNS, state.dizajn);
  const fulfillmentState = oneOf(ORDER_FULFILLMENTS, state.izvrsenje);
  return {
    view: oneOf(ORDER_VIEWS, state.pogled) ?? DEFAULT_VIEW,
    ...(search ? { search } : {}),
    ...(state.assignee ? { assigneeId: state.assignee as Id<"users"> } : {}),
    ...(paymentState ? { paymentState } : {}),
    ...(designState ? { designState } : {}),
    ...(fulfillmentState ? { fulfillmentState } : {}),
    ...(!search ? { sort: oneOf(ORDER_SORTS, state.sort) ?? DEFAULT_SORT } : {}),
    ...(state.problem === ORDER_PROBLEMS_ONLY ? { problemsOnly: true as const } : {}),
  };
}

/** Is some filter chosen (the view and the sort are not filters)? Picks the empty state. */
export function ordersAreFiltered(state: SidebarState): boolean {
  return Boolean((state.q ?? "").trim() || state.assignee || state.uplata || state.dizajn || state.izvrsenje || state.problem === ORDER_PROBLEMS_ONLY);
}

/** A non-default sort is ignored while a search runs: the page says so. */
export function ordersSortIgnored(state: SidebarState): boolean {
  return Boolean((state.q ?? "").trim() && state.sort && state.sort !== DEFAULT_SORT);
}

export function ordersAssigneeOptions(admins: readonly { id: string; name: string }[]): SidebarOption[] {
  return admins.map((admin) => ({ value: admin.id, label: admin.name }));
}

/** What the page sends to the sidebar: the people an order can be assigned to. */
export function ordersSidebarLive(admins: readonly { id: string; name: string }[]): SidebarLive {
  return { options: { assignee: ordersAssigneeOptions(admins) } };
}

export type PreviewOrderRow = {
  view: string;
  assigneeId: string;
  paymentState: string;
  designState: string;
  fulfillmentState: string;
  problemCount: number;
  updatedAt: number;
  smpCode: string;
  accountName: string;
  smkCode: string;
  primaryBusinessName: string | null;
  primarySmlCode: string | null;
};

/** The preview rows the way the sidebar chose them (the same rules as the list query). */
export function filterPreviewOrders<T extends PreviewOrderRow>(rows: readonly T[], state: SidebarState): T[] {
  const view = oneOf(ORDER_VIEWS, state.pogled) ?? DEFAULT_VIEW;
  const needle = (state.q ?? "").trim().toLocaleLowerCase("sr-Latn-RS");
  const filtered = rows.filter((row) => {
    if (row.view !== view) return false;
    if (state.assignee && row.assigneeId !== state.assignee) return false;
    if (state.uplata && row.paymentState !== state.uplata) return false;
    if (state.dizajn && row.designState !== state.dizajn) return false;
    if (state.izvrsenje && row.fulfillmentState !== state.izvrsenje) return false;
    if (state.problem === ORDER_PROBLEMS_ONLY && row.problemCount === 0) return false;
    return !needle || `${row.smpCode} ${row.accountName} ${row.smkCode} ${row.primaryBusinessName} ${row.primarySmlCode}`.toLocaleLowerCase("sr-Latn-RS").includes(needle);
  });
  if (needle) return filtered;
  const ascending = state.sort === "updated_asc";
  return [...filtered].sort((left, right) => (ascending ? left.updatedAt - right.updatedAt : right.updatedAt - left.updatedAt));
}
