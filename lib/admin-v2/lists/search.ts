// ADMIN v2 — Pretraga: the URL state of the sidebar (`group`, `kategorija`,
// `akter` and the scope `klijent` / `lokal` / `opseg`) and the page's own `q`
// turned into the arguments of `adminGlobalSearch.list` and
// `adminActivity.list`, the scope patch, the actor options and the same
// filters over the preview fixtures. Pure; the component casts the ids to
// `Id<…>`.

import { ACTIVITY_CATEGORIES, SEARCH_GROUPS } from "@/lib/admin-v2/sidebar/configs/search";
import type { SidebarLive, SidebarOption, SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";
import type { ReactNode } from "react";

export type SearchGroup = (typeof SEARCH_GROUPS)[number];
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** The arguments of `adminGlobalSearch.list` that the state decides. */
export type SearchListArgs = {
  term: string;
  group: SearchGroup;
  accountId?: string;
  businessId?: string;
};

/** The arguments of `adminActivity.list` that the state decides. */
export type ActivityListArgs = {
  accountId?: string;
  businessId?: string;
  category?: ActivityCategory;
  actorKey?: string;
};

function isGroup(value: string | undefined): value is SearchGroup {
  return SEARCH_GROUPS.some((group) => group === value);
}

function isCategory(value: string | undefined): value is ActivityCategory {
  return ACTIVITY_CATEGORIES.some((category) => category === value);
}

/** The scope the arguments carry: one client or one venue. */
function scopeArgs(state: SidebarState): Pick<SearchListArgs, "accountId" | "businessId"> {
  return {
    ...(state.klijent ? { accountId: state.klijent } : {}),
    ...(state.lokal ? { businessId: state.lokal } : {}),
  };
}

/** No term means no query (`null`: the page skips it); the kind of record is „clients“ until another is chosen. */
export function searchListArgs(state: SidebarState): SearchListArgs | null {
  const term = state.q?.trim();
  if (!term) return null;
  return { term, group: isGroup(state.group) ? state.group : "clients", ...scopeArgs(state) };
}

/** An empty state is the whole feed: `{}`. */
export function activityListArgs(state: SidebarState): ActivityListArgs {
  return {
    ...scopeArgs(state),
    ...(isCategory(state.kategorija) ? { category: state.kategorija } : {}),
    ...(state.akter ? { actorKey: state.akter } : {}),
  };
}

/** A scope as the picker chooses it and the page sends it: a client or a venue, with the name for the chip. */
export type SearchScope = { accountId?: string; businessId?: string; label: string };

/** The scope in the URL (`null` = none). Without a name the id stands in, so the chip can still be removed. */
export function searchScope(state: { klijent?: string; lokal?: string; opseg?: string }): SearchScope | null {
  if (!state.klijent && !state.lokal) return null;
  return {
    ...(state.klijent ? { accountId: state.klijent } : {}),
    ...(state.lokal ? { businessId: state.lokal } : {}),
    label: state.opseg || state.klijent || state.lokal || "",
  };
}

/** The URL patch of a choice: a client clears the venue and a venue clears the client; `null` clears the scope. */
export function scopePatch(scope: SearchScope | null): SidebarPatch {
  return {
    klijent: scope?.accountId ?? null,
    lokal: scope?.businessId ?? null,
    opseg: scope?.label || null,
  };
}

export type ActivityActor = { actorKey: string; actorKind: string; displayName: string };

/** Options of the group „Akter“: the key is the argument, the label is „name · kind“. */
export function actorOptions(actors: readonly ActivityActor[], actorKindLabel: (kind: string) => string): SidebarOption[] {
  return actors.map((actor) => ({ value: actor.actorKey, label: `${actor.displayName} · ${actorKindLabel(actor.actorKind)}` }));
}

/** What Pretraga sends to the sidebar: the body of „Opseg“ and, in Aktivnost, the actors. */
export function searchSidebarLive({ scope, scopeBody, actors }: {
  scope: SearchScope | null;
  scopeBody: ReactNode;
  /** Options of „Akter“; absent in Rezultati and while the actors load. */
  actors?: readonly SidebarOption[];
}): SidebarLive {
  return {
    ...(actors ? { options: { akter: actors } } : {}),
    custom: { opseg: { summary: scope?.label, body: scopeBody } },
  };
}

/** The fixture client the preview offers as the scope (a TEST name). */
export const PREVIEW_SCOPE: Required<Pick<SearchScope, "accountId" | "label">> & { smkCode: string } = {
  accountId: "preview-account",
  label: "Bistro Primer · SMK-00241",
  smkCode: "SMK-00241",
};

/** The part of a result the preview filters read. */
export type PreviewSearchRow = {
  title: string;
  code: string | null;
  ownerLabel: string | null;
  smkCode: string | null;
  venueLabel: string | null;
  smlCode: string | null;
  meta: string | null;
};

/**
 * The fixture rows the state would find: the term over every field, the kind
 * of record and the scope. The preview offers only the fixture client as a
 * scope, so any other scope finds nothing. A bare number is a local SMF suffix
 * and only means something inside a scope.
 */
export function filterPreviewResults<T extends PreviewSearchRow>(byGroup: Readonly<Record<SearchGroup, readonly T[]>>, state: SidebarState): T[] {
  const args = searchListArgs(state);
  if (!args) return [];
  const term = args.term.toLocaleLowerCase("sr-Latn-RS");
  const scoped = Boolean(args.accountId || args.businessId);
  if (scoped && (args.businessId || args.accountId !== PREVIEW_SCOPE.accountId)) return [];
  const partialProductTerm = args.group === "products" && /^#?\d+$/.test(args.term);
  if (partialProductTerm && !scoped) return [];
  return byGroup[args.group].filter(
    (row) =>
      [row.title, row.code, row.ownerLabel, row.smkCode, row.venueLabel, row.smlCode, row.meta]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("sr-Latn-RS").includes(term))
      && (!scoped || row.smkCode === PREVIEW_SCOPE.smkCode),
  );
}

/** The part of an activity row the preview filters read. */
export type PreviewActivityRow = { category: string; actorKey: string; accountId: string };

/** The fixture activity the state would show: the category, the actor and the scope (the fixture client only). */
export function filterPreviewActivity<T extends PreviewActivityRow>(rows: readonly T[], state: SidebarState): T[] {
  const args = activityListArgs(state);
  return rows.filter(
    (row) =>
      (!args.category || row.category === args.category)
      && (!args.actorKey || row.actorKey === args.actorKey)
      && !args.businessId
      && (!args.accountId || row.accountId === args.accountId),
  );
}
