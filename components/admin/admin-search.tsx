"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Activity, ArrowRight, Search, X } from "lucide-react";
import Link from "next/link";
import { Component, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAdminUrlState } from "@/components/admin/admin-ui/use-admin-query-state";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import { useAdminSidebarLive } from "@/components/admin/frame/admin-sidebar-store";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  actorOptions,
  activityListArgs,
  filterPreviewActivity,
  filterPreviewResults,
  PREVIEW_SCOPE,
  scopePatch,
  searchListArgs,
  searchScope,
  searchSidebarLive,
  type ActivityCategory,
  type SearchGroup,
  type SearchScope,
} from "@/lib/admin-v2/lists/search";
import { SEARCH_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/search";
import type { SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";
import { fmt } from "@/lib/i18n/format";
import { adminSearchSr as dict } from "@/lib/i18n/sr/admin-search";
import { adminUiSr as ui } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminPanel, AdminStatus } from "./admin-primitives";

type SearchResult = FunctionReturnType<typeof api.adminGlobalSearch.list>["page"][number];

/** The typed text waits this long before it is written to the URL. */
const SEARCH_DELAY_MS = 250;

const GROUPS: { value: SearchGroup; label: string }[] = [
  { value: "clients", label: dict.groupClients },
  { value: "venues", label: dict.groupVenues },
  { value: "contacts", label: dict.groupContacts },
  { value: "products", label: dict.groupProducts },
  { value: "channels", label: dict.groupChannels },
  { value: "orders", label: dict.groupOrders },
];

const CATEGORIES: { value: ActivityCategory; label: string }[] = [
  { value: "client", label: dict.activityClient },
  { value: "communication", label: dict.activityCommunication },
  { value: "task", label: dict.activityTask },
  { value: "order", label: dict.activityOrder },
  { value: "finance", label: dict.activityFinance },
  { value: "subscription", label: dict.activitySubscription },
  { value: "problem", label: dict.activityProblem },
  { value: "product", label: dict.activityProduct },
  { value: "service", label: dict.activityService },
  { value: "support", label: dict.activitySupport },
];

const PREVIEW_RESULTS = {
  clients: [{
    id: "preview-account",
    group: "clients",
    title: "Bistro Primer",
    code: "SMK-00241",
    ownerLabel: "Mila Petrović",
    smkCode: "SMK-00241",
    venueLabel: null,
    smlCode: null,
    meta: "kontakt@bistro-primer.rs",
    status: "active",
    href: "/admin/klijenti/preview-account",
  }],
  venues: [{
    id: "preview-business",
    group: "venues",
    title: "Bistro Primer · Centar",
    code: "SML-00618",
    ownerLabel: "Mila Petrović",
    smkCode: "SMK-00241",
    venueLabel: "Bistro Primer · Centar",
    smlCode: "SML-00618",
    meta: "Beograd",
    status: "active",
    href: "/admin/klijenti/preview-account?section=venues&venue=preview-business",
  }, {
    id: "preview-business-duplicate",
    group: "venues",
    title: "Bistro Primer · Centar",
    code: "SML-00944",
    ownerLabel: "Petar Jovanović",
    smkCode: "SMK-00983",
    venueLabel: "Bistro Primer · Centar",
    smlCode: "SML-00944",
    meta: "Novi Sad",
    status: "archived",
    href: "/admin/klijenti/preview-account-duplicate?section=venues&venue=preview-business-duplicate",
  }],
  contacts: [{
    id: "preview-contact",
    group: "contacts",
    title: "Mila Petrović",
    code: null,
    ownerLabel: "Bistro Primer",
    smkCode: "SMK-00241",
    venueLabel: null,
    smlCode: null,
    meta: "+381 60 123 4567",
    status: "active",
    href: "/admin/klijenti/preview-account?contact=preview-contact",
  }],
  products: [{
    id: "preview-product",
    group: "products",
    title: "Premium stalak",
    code: "SMF-00241-031",
    ownerLabel: "Bistro Primer",
    smkCode: "SMK-00241",
    venueLabel: "Bistro Primer · Centar",
    smlCode: "SML-00618",
    meta: null,
    status: "active",
    href: "/admin/operativa/proizvodi?venue=preview-business&product=preview-product&smf=SMF-00241-031",
  }, {
    id: "preview-product-duplicate",
    group: "products",
    title: "Premium stalak",
    code: "SMF-00983-031",
    ownerLabel: "Drugi vlasnik",
    smkCode: "SMK-00983",
    venueLabel: "Bistro Primer · Centar",
    smlCode: "SML-00944",
    meta: null,
    status: "active",
    href: "/admin/operativa/proizvodi?venue=preview-business-duplicate&product=preview-product-duplicate&smf=SMF-00983-031",
  }, {
    id: "preview-product-same-account",
    group: "products",
    title: "Kompaktni stalak",
    code: "SMF-00241-031",
    ownerLabel: "Bistro Primer",
    smkCode: "SMK-00241",
    venueLabel: "Bistro Primer · Vračar",
    smlCode: "SML-00619",
    meta: null,
    status: "active",
    href: "/admin/operativa/proizvodi?venue=preview-business-2&product=preview-product-same-account&smf=SMF-00241-031",
  }],
  channels: [{
    id: "preview-channel",
    group: "channels",
    title: dict.channelQr,
    code: "SMQ-00187",
    ownerLabel: "Bistro Primer",
    smkCode: "SMK-00241",
    venueLabel: "Bistro Primer · Centar",
    smlCode: "SML-00618",
    meta: null,
    status: "active",
    href: "/admin/operativa/qr?channel=preview-channel&code=SMQ-00187",
  }],
  orders: [{
    id: "preview-order",
    group: "orders",
    title: "Bistro Primer",
    code: "SMP-00092",
    ownerLabel: "Bistro Primer",
    smkCode: "SMK-00241",
    venueLabel: "Bistro Primer · Centar",
    smlCode: "SML-00618",
    meta: null,
    status: "completed",
    href: "/admin/operativa/porudzbine?order=preview-order",
  }],
} satisfies Record<SearchGroup, SearchResult[]>;

export const adminSearchCommandPreviewGroups = GROUPS.map((group) => ({
  group: group.value,
  results: PREVIEW_RESULTS[group.value],
  hasMore: false,
}));

function statusLabel(status: string | null) {
  if (status === "active") return dict.statusActive;
  if (status === "archived") return dict.statusArchived;
  if (status === "inactive") return dict.statusInactive;
  if (status === "completed") return dict.statusCompleted;
  if (status === "problem") return dict.statusProblem;
  return status;
}

function actorKindLabel(kind: string) {
  if (kind === "admin") return dict.actorAdmin;
  if (kind === "system") return dict.actorSystem;
  if (kind === "shared_mailbox") return dict.actorSharedMailbox;
  if (kind === "external") return dict.actorExternal;
  return dict.actorUnknown;
}

function ResultCard({ result }: { result: SearchResult }) {
  const detailParts = Array.from(new Set(
    [result.code, result.ownerLabel, result.smkCode, result.venueLabel, result.smlCode, result.meta].filter(Boolean),
  ));
  const groupLabel = GROUPS.find((group) => group.value === result.group)?.label;
  return (
    <Link
      href={result.href}
      className="group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-4 shadow-[var(--admin-shadow-xs)] transition-colors hover:border-[var(--admin-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-ink)]"
    >
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{result.title}</span>
          {groupLabel ? <span className="rounded-full border border-[var(--admin-border)] px-2 py-0.5 text-[0.68rem] font-semibold text-[var(--admin-text-muted)]">{groupLabel}</span> : null}
          {result.status ? (
            <span className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-2 py-0.5 text-[0.68rem] font-semibold text-[var(--admin-text-muted)]">
              {statusLabel(result.status)}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-xs text-[var(--admin-text-muted)]">
          {detailParts.join(" · ")}
        </span>
      </span>
      <span className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-xs font-semibold">
        <span className="hidden sm:inline">{dict.resultOpen}</span>
        <ArrowRight className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

type ScopePickerProps = { scope: SearchScope | null; onScope: (scope: SearchScope | null) => void };

const suggestionClass = "block min-h-11 w-full min-w-0 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--admin-surface-muted)] lg:min-h-9";

/** The body of the sidebar group „Opseg“: the chosen scope with its remove button, or the picker (`children`). */
function ScopeBody({ scope, onClear, children }: { scope: SearchScope | null; onClear: () => void; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2">
      {scope ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={fmt(ui.filters.removeChip, { label: scope.label })}
          className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-left text-sm font-semibold lg:min-h-9"
        >
          <span className="min-w-0 truncate">{scope.label}</span>
          <X className="size-4 shrink-0" aria-hidden="true" />
        </button>
      ) : children}
      <p className="text-xs leading-4 text-[var(--admin-text-muted)]">{dict.scopeSuffixNote}</p>
    </div>
  );
}

/** Suggestions are in the flow of the group: a floating list would be clipped by the scroll of the sidebar. */
function ScopePicker({ scope, onScope }: ScopePickerProps) {
  const [term, setTerm] = useState("");
  const deferred = useDeferredValue(term.trim());
  const groups = useQuery(api.adminGlobalSearch.preview, deferred ? { term: deferred, limitPerGroup: 4 } : "skip");
  const options = useMemo(
    () => (groups ?? []).flatMap((group) => group.results).filter((row) => row.group === "clients" || row.group === "venues"),
    [groups],
  );
  return (
    <ScopeBody scope={scope} onClear={() => onScope(null)}>
      <div className="grid min-w-0 gap-1">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={dict.scopePlaceholder}
            aria-label={dict.scopePlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] pr-3 pl-9 text-sm max-sm:text-base lg:min-h-9"
          />
        </div>
        {deferred && options.length ? (
          <div className="grid min-w-0 gap-px">
            {options.map((option) => (
              <button
                key={`${option.group}:${option.id}`}
                type="button"
                onClick={() => {
                  onScope({
                    ...(option.group === "clients" ? { accountId: option.id } : {}),
                    ...(option.group === "venues" ? { businessId: option.id } : {}),
                    label: [option.title, option.smkCode, option.smlCode].filter(Boolean).join(" · "),
                  });
                  setTerm("");
                }}
                className={suggestionClass}
              >
                <span className="block truncate text-sm font-semibold">{option.title}</span>
                <span className="block truncate text-xs text-[var(--admin-text-muted)]">{[option.smkCode, option.smlCode].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </ScopeBody>
  );
}

/** The preview has one suggestion: the fixture client. */
function PreviewScopePicker({ scope, onScope }: ScopePickerProps) {
  return (
    <ScopeBody scope={scope} onClear={() => onScope(null)}>
      <div className="grid min-w-0 gap-1">
        <p className="px-2 text-xs text-[var(--admin-text-muted)]">{dict.scopePlaceholder}</p>
        <button type="button" onClick={() => onScope(PREVIEW_SCOPE)} className={suggestionClass}>
          <span className="block truncate text-sm font-semibold">{PREVIEW_SCOPE.label}</span>
        </button>
      </div>
    </ScopeBody>
  );
}

/** The scope in the URL and the body of „Opseg“ for the sidebar; a choice is written to the URL. */
function useScope(state: SidebarState, setState: (patch: SidebarPatch) => void, picker: (props: ScopePickerProps) => ReactNode) {
  const { klijent, lokal, opseg } = state;
  const scope = useMemo(() => searchScope({ klijent, lokal, opseg }), [klijent, lokal, opseg]);
  const body = useMemo(() => picker({ scope, onScope: (next) => setState(scopePatch(next)) }), [picker, scope, setState]);
  return { scope, body };
}

const renderScopePicker = (props: ScopePickerProps) => <ScopePicker {...props} />;
const renderPreviewScopePicker = (props: ScopePickerProps) => <PreviewScopePicker {...props} />;

/**
 * The one field that stays on the screen. The text is local while typing and
 * is written to the URL after a pause; a change from outside (Back, a link)
 * replaces the text unless the user is still typing.
 */
function SearchInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (value !== seen) {
    setSeen(value);
    if (!typing) setText(value);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(next: string) {
    setText(next);
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setTyping(false);
      onCommit(next.trim());
    }, SEARCH_DELAY_MS);
  }

  return (
    <div data-admin-reveal="text" className="relative min-w-0">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
      <Input
        value={text}
        onChange={(event) => change(event.target.value)}
        aria-label={dict.searchLabel}
        placeholder={dict.searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
        className="min-h-12 rounded-xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] pl-9 text-base"
      />
    </div>
  );
}

type ViewProps = { state: SidebarState; setState: (patch: SidebarPatch) => void };

function SearchView({ state, setState }: ViewProps) {
  const args = searchListArgs(state);
  const results = usePaginatedQuery(
    api.adminGlobalSearch.list,
    args
      ? {
          term: args.term,
          group: args.group,
          ...(args.accountId ? { accountId: args.accountId as Id<"accounts"> } : {}),
          ...(args.businessId ? { businessId: args.businessId as Id<"businesses"> } : {}),
        }
      : "skip",
    { initialNumItems: 20 },
  );
  const { scope, body } = useScope(state, setState, renderScopePicker);
  const sidebar = useMemo(() => searchSidebarLive({ scope, scopeBody: body }), [scope, body]);
  useAdminSidebarLive(sidebar);
  const loading = args && results.status === "LoadingFirstPage";
  return (
    <div className="grid min-w-0 gap-4">
      <SearchInput value={state.q ?? ""} onCommit={(value) => setState({ q: value || null })} />
      {!args ? (
        <AdminPanel><AdminEmptyState title={dict.initialTitle} body={dict.initialBody} /></AdminPanel>
      ) : loading ? (
        <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>
      ) : results.results.length === 0 ? (
        <AdminPanel><AdminEmptyState title={dict.emptyTitle} body={dict.emptyBody} /></AdminPanel>
      ) : (
        <div data-admin-reveal="rows" className="grid gap-2">
          {results.results.map((result) => <ResultCard key={`${result.group}:${result.id}`} result={result} />)}
          {results.status === "CanLoadMore" || results.status === "LoadingMore" ? (
            <button type="button" disabled={results.status === "LoadingMore"} onClick={() => results.loadMore(20)} className="mx-auto mt-2 min-h-11 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 text-sm font-semibold">
              {results.status === "LoadingMore" ? dict.loadingMore : dict.loadMore}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

type ActivityRow = {
  id: string;
  objectLabel: string;
  category: string;
  actorDisplayName: string;
  actorKind: string;
  reason: string | null;
  occurredAt: number;
  href: string;
};

function ActivityRowCard({ row }: { row: ActivityRow }) {
  return (
    <article className="grid gap-3 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-4 shadow-[var(--admin-shadow-xs)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      <span className="grid size-10 place-items-center rounded-xl bg-[var(--admin-surface-muted)]"><Activity className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{row.objectLabel}</h3>
          <span className="rounded-full border border-[var(--admin-border)] px-2 py-0.5 text-[0.68rem] font-semibold text-[var(--admin-text-muted)]">{CATEGORIES.find((item) => item.value === row.category)?.label}</span>
        </div>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{row.actorDisplayName} · {actorKindLabel(row.actorKind)}</p>
        {row.reason ? <p className="mt-2 text-sm"><span className="font-semibold">{dict.activityReason}:</span> {row.reason}</p> : null}
        <time className="mt-2 block text-xs text-[var(--admin-text-muted)]" dateTime={new Date(row.occurredAt).toISOString()}>{new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" }).format(row.occurredAt)}</time>
      </div>
      <Link href={row.href} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--admin-border)] px-3 text-xs font-semibold hover:border-[var(--admin-ink)]">
        {dict.activityOpenSource}<ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </article>
  );
}

function ActivityHeader() {
  return (
    <header data-admin-reveal="text">
      <h2 className="text-2xl font-semibold tracking-[-0.03em]">{dict.activityTitle}</h2>
      <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{dict.activitySubtitle}</p>
    </header>
  );
}

function ActivityView({ state, setState }: ViewProps) {
  const args = activityListArgs(state);
  const actors = useQuery(api.adminActivity.listActors);
  const rows = usePaginatedQuery(api.adminActivity.list, {
    ...(args.accountId ? { accountId: args.accountId as Id<"accounts"> } : {}),
    ...(args.businessId ? { businessId: args.businessId as Id<"businesses"> } : {}),
    ...(args.category ? { category: args.category } : {}),
    ...(args.actorKey ? { actorKey: args.actorKey } : {}),
  }, { initialNumItems: 20 });
  const { scope, body } = useScope(state, setState, renderScopePicker);
  const sidebar = useMemo(
    () => searchSidebarLive({ scope, scopeBody: body, actors: actors ? actorOptions(actors, actorKindLabel) : undefined }),
    [scope, body, actors],
  );
  useAdminSidebarLive(sidebar);
  return (
    <div className="grid min-w-0 gap-4">
      <ActivityHeader />
      {rows.status === "LoadingFirstPage" ? (
        <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>
      ) : rows.results.length === 0 ? (
        <AdminPanel><AdminEmptyState title={dict.activityEmptyTitle} body={dict.activityEmptyBody} /></AdminPanel>
      ) : (
        <div data-admin-reveal="rows" className="grid gap-2">
          {rows.results.map((row) => <ActivityRowCard key={row.id} row={row} />)}
          {rows.status === "CanLoadMore" || rows.status === "LoadingMore" ? (
            <button type="button" disabled={rows.status === "LoadingMore"} onClick={() => rows.loadMore(20)} className="mx-auto mt-2 min-h-11 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 text-sm font-semibold">
              {rows.status === "LoadingMore" ? dict.loadingMore : dict.loadMore}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

const PREVIEW_ACTORS = [
  { actorKey: "user:preview-admin", actorKind: "admin", displayName: "Ana Admin" },
  { actorKey: "kind:shared_mailbox", actorKind: "shared_mailbox", displayName: dict.sharedMailboxEvent },
];

const PREVIEW_ACTIVITY = [
  {
    id: "preview-activity-admin",
    objectLabel: "Bistro Primer · SMK-00241",
    category: "client" as const,
    accountId: PREVIEW_SCOPE.accountId,
    actorKey: PREVIEW_ACTORS[0].actorKey,
    actorDisplayName: PREVIEW_ACTORS[0].displayName,
    actorKind: PREVIEW_ACTORS[0].actorKind,
    reason: "Ažuriran kontakt klijenta",
    occurredAt: Date.UTC(2026, 8, 16, 9, 15),
    href: "/dev/admin-18-preview",
  },
  {
    id: "preview-activity-mailbox",
    objectLabel: "Bistro Primer · podrška",
    category: "communication" as const,
    accountId: PREVIEW_SCOPE.accountId,
    actorKey: PREVIEW_ACTORS[1].actorKey,
    actorDisplayName: PREVIEW_ACTORS[1].displayName,
    actorKind: PREVIEW_ACTORS[1].actorKind,
    reason: null,
    occurredAt: Date.UTC(2026, 8, 16, 8, 40),
    href: "/dev/admin-18-preview",
  },
];

const PREVIEW_ACTOR_OPTIONS = actorOptions(PREVIEW_ACTORS, actorKindLabel);

export function AdminSearchPreviewWorkspace({
  initialState = "loaded",
}: {
  initialState?: "loaded" | "loading" | "empty" | "error";
}) {
  const [state, setState] = useAdminUrlState(SEARCH_URL_FIELDS);
  const [fixtureState, setFixtureState] = useState(initialState);
  // „Učitaj još“ opens the rest of the rows for this search only; another term, kind or scope starts folded again.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const { scope, body } = useScope(state, setState, renderPreviewScopePicker);
  const sidebar = useMemo(() => searchSidebarLive({ scope, scopeBody: body, actors: PREVIEW_ACTOR_OPTIONS }), [scope, body]);
  useAdminSidebarLive(sidebar);
  const searching = Boolean(searchListArgs(state));
  const rows = filterPreviewResults<SearchResult>(PREVIEW_RESULTS, state);
  const searchKey = [state.q, state.group, state.klijent, state.lokal].join("|");
  const visibleRows = openedFor === searchKey ? rows : rows.slice(0, 1);
  const previewActivityRows = filterPreviewActivity(PREVIEW_ACTIVITY, state);

  return (
    <div className="grid min-w-0 gap-5">
      <AdminPageHeader title={dict.pageTitle} description={dict.pageSubtitle} badge={<AdminStatus label={adminV1Sr.fixtureBadge} tone="waiting" />} />

      {state.view !== "activity" ? (
        <div className="grid min-w-0 gap-4">
          <SearchInput value={state.q ?? ""} onCommit={(value) => setState({ q: value || null })} />
          {fixtureState === "loading" ? (
            <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>
          ) : fixtureState === "error" ? (
            <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} /><div className="border-t border-[var(--admin-border)] p-3 text-center"><button type="button" onClick={() => setFixtureState("loaded")} className="min-h-11 rounded-full border border-[var(--admin-border)] px-5 text-sm font-semibold">{dict.retry}</button></div></AdminPanel>
          ) : !searching ? (
            <AdminPanel><AdminEmptyState title={dict.initialTitle} body={dict.initialBody} /></AdminPanel>
          ) : fixtureState !== "empty" && rows.length ? (
            <div data-admin-reveal="rows" className="grid gap-2">
              {visibleRows.map((result) => <ResultCard key={`${result.group}:${result.id}`} result={result} />)}
              {rows.length > visibleRows.length ? <button type="button" onClick={() => setOpenedFor(searchKey)} className="mx-auto mt-2 min-h-11 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 text-sm font-semibold">{dict.loadMore}</button> : null}
            </div>
          ) : (
            <AdminPanel><AdminEmptyState title={dict.emptyTitle} body={dict.emptyBody} /></AdminPanel>
          )}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4">
          <ActivityHeader />
          {previewActivityRows.length ? <div data-admin-reveal="rows" className="grid gap-2">
            {previewActivityRows.map((row) => <ActivityRowCard key={row.id} row={row} />)}
          </div> : <AdminPanel><AdminEmptyState title={dict.activityEmptyTitle} body={dict.activityEmptyBody} /></AdminPanel>}
        </div>
      )}
    </div>
  );
}

export function AdminSearchWorkspace() {
  const [state, setState] = useAdminUrlState(SEARCH_URL_FIELDS);
  return (
    <div className="grid min-w-0 gap-5">
      <AdminPageHeader title={dict.pageTitle} description={dict.pageSubtitle} />
      {state.view === "activity" ? <ActivityView state={state} setState={setState} /> : <SearchView state={state} setState={setState} />}
    </div>
  );
}

export class AdminSearchErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} /><div className="border-t border-[var(--admin-border)] p-3 text-center"><button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-full border border-[var(--admin-border)] px-5 text-sm font-semibold">{dict.retry}</button></div></AdminPanel>;
  }
}
