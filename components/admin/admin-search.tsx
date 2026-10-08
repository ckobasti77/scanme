"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Activity, ArrowRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Component, useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { adminSearchSr as dict } from "@/lib/i18n/sr/admin-search";
import { cn } from "@/lib/utils";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminPanel } from "./admin-primitives";

type SearchGroup = "clients" | "venues" | "contacts" | "products" | "channels" | "orders";
type ActivityCategory = "client" | "communication" | "task" | "order" | "finance" | "subscription" | "problem" | "product" | "service" | "support";
type SearchResult = FunctionReturnType<typeof api.adminGlobalSearch.list>["page"][number];
type Scope = { accountId?: Id<"accounts">; businessId?: Id<"businesses">; label: string };

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

function ScopePicker({ scope, onScope }: { scope: Scope | null; onScope: (scope: Scope | null) => void }) {
  const [term, setTerm] = useState("");
  const deferred = useDeferredValue(term.trim());
  const groups = useQuery(api.adminGlobalSearch.preview, deferred ? { term: deferred, limitPerGroup: 4 } : "skip");
  const options = useMemo(
    () => (groups ?? []).flatMap((group) => group.results).filter((row) => row.group === "clients" || row.group === "venues"),
    [groups],
  );
  if (scope) {
    return (
      <button type="button" onClick={() => onScope(null)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold">
        <span className="max-w-64 truncate">{scope.label}</span>
        <X className="size-4" aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className="relative min-w-0 sm:max-w-sm">
      <label className="relative block">
        <span className="sr-only">{dict.groupClients}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
        <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={dict.scopePlaceholder} className="min-h-11 rounded-xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] pl-9" />
      </label>
      {deferred && options.length ? (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1 shadow-[var(--admin-shadow-md)]">
          {options.map((option) => (
            <button
              key={`${option.group}:${option.id}`}
              type="button"
              onClick={() => {
                onScope({
                  accountId: option.group === "clients" ? option.id as Id<"accounts"> : undefined,
                  businessId: option.group === "venues" ? option.id as Id<"businesses"> : undefined,
                  label: [option.title, option.smkCode, option.smlCode].filter(Boolean).join(" · "),
                });
                setTerm("");
              }}
              className="block min-h-11 w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--admin-surface-muted)]"
            >
              <span className="block truncate text-sm font-semibold">{option.title}</span>
              <span className="block text-xs text-[var(--admin-text-muted)]">{[option.smkCode, option.smlCode].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchView() {
  const searchParams = useSearchParams();
  const [term, setTerm] = useState(searchParams.get("q") ?? "");
  const [group, setGroup] = useState<SearchGroup>((searchParams.get("group") as SearchGroup | null) ?? "clients");
  const [scope, setScope] = useState<Scope | null>(null);
  const deferred = useDeferredValue(term.trim());
  const results = usePaginatedQuery(
    api.adminGlobalSearch.list,
    deferred
      ? {
          term: deferred,
          group,
          ...(scope?.accountId ? { accountId: scope.accountId } : {}),
          ...(scope?.businessId ? { businessId: scope.businessId } : {}),
        }
      : "skip",
    { initialNumItems: 20 },
  );
  const loading = deferred && results.status === "LoadingFirstPage";
  return (
    <div className="grid min-w-0 gap-4">
      <AdminPanel className="relative z-10 grid min-w-0 gap-3 p-3 sm:p-4">
        <label className="relative block min-w-0">
          <span className="sr-only">{dict.searchLabel}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
          <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={dict.searchPlaceholder} className="min-h-12 rounded-xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] pl-9 text-base" />
        </label>
        <div className="flex min-w-0 flex-wrap gap-2">
          {GROUPS.map((item) => (
            <button key={item.value} type="button" onClick={() => setGroup(item.value)} aria-pressed={group === item.value} className={cn("min-h-10 rounded-full border px-3 text-xs font-semibold", group === item.value ? "border-[var(--admin-ink)] bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "border-[var(--admin-border)] bg-[var(--admin-surface-strong)]")}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ScopePicker scope={scope} onScope={setScope} />
          <p className="text-xs text-[var(--admin-text-muted)]">{dict.scopeSuffixNote}</p>
        </div>
      </AdminPanel>
      {!deferred ? (
        <AdminPanel><AdminEmptyState title={dict.initialTitle} body={dict.initialBody} /></AdminPanel>
      ) : loading ? (
        <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>
      ) : results.results.length === 0 ? (
        <AdminPanel><AdminEmptyState title={dict.emptyTitle} body={dict.emptyBody} /></AdminPanel>
      ) : (
        <div className="grid gap-2">
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

function ActivityView() {
  const [scope, setScope] = useState<Scope | null>(null);
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [actorKey, setActorKey] = useState("all");
  const actors = useQuery(api.adminActivity.listActors);
  const rows = usePaginatedQuery(api.adminActivity.list, {
    ...(scope?.accountId ? { accountId: scope.accountId } : {}),
    ...(scope?.businessId ? { businessId: scope.businessId } : {}),
    ...(category !== "all" ? { category } : {}),
    ...(actorKey !== "all" ? { actorKey } : {}),
  }, { initialNumItems: 20 });
  return (
    <div className="grid min-w-0 gap-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-[-0.03em]">{dict.activityTitle}</h2>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{dict.activitySubtitle}</p>
      </header>
      <AdminPanel className="relative z-10 grid gap-3 p-3 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] sm:p-4">
        <ScopePicker scope={scope} onScope={setScope} />
        <select value={category} onChange={(event) => setCategory(event.target.value as ActivityCategory | "all")} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold" aria-label={dict.activityAllCategories}>
          <option value="all">{dict.activityAllCategories}</option>
          {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={actorKey} onChange={(event) => setActorKey(event.target.value)} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold" aria-label={dict.activityAllActors}>
          <option value="all">{dict.activityAllActors}</option>
          {(actors ?? []).map((actor) => <option key={actor.actorKey} value={actor.actorKey}>{actor.displayName} · {actorKindLabel(actor.actorKind)}</option>)}
        </select>
      </AdminPanel>
      {rows.status === "LoadingFirstPage" ? (
        <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>
      ) : rows.results.length === 0 ? (
        <AdminPanel><AdminEmptyState title={dict.activityEmptyTitle} body={dict.activityEmptyBody} /></AdminPanel>
      ) : (
        <div className="grid gap-2">
          {rows.results.map((row) => (
            <article key={row.id} className="grid gap-3 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-4 shadow-[var(--admin-shadow-xs)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
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
          ))}
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

const PREVIEW_ACTIVITY = [
  {
    id: "preview-activity-admin",
    objectLabel: "Bistro Primer · SMK-00241",
    category: "client" as const,
    actorDisplayName: "Ana Admin",
    actorKind: "admin",
    reason: "Ažuriran kontakt klijenta",
    occurredAt: Date.UTC(2026, 8, 16, 9, 15),
    href: "/dev/admin-18-preview",
  },
  {
    id: "preview-activity-mailbox",
    objectLabel: "Bistro Primer · podrška",
    category: "communication" as const,
    actorDisplayName: dict.sharedMailboxEvent,
    actorKind: "shared_mailbox",
    reason: null,
    occurredAt: Date.UTC(2026, 8, 16, 8, 40),
    href: "/dev/admin-18-preview",
  },
];

export function AdminSearchPreviewWorkspace({
  initialState = "loaded",
}: {
  initialState?: "loaded" | "loading" | "empty" | "error";
}) {
  const [view, setView] = useState<"search" | "activity">("search");
  const [term, setTerm] = useState("SM");
  const [group, setGroup] = useState<SearchGroup>("clients");
  const [scoped, setScoped] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [fixtureState, setFixtureState] = useState(initialState);
  const [previewCategory, setPreviewCategory] = useState<ActivityCategory | "all">("all");
  const [previewActor, setPreviewActor] = useState<"all" | "admin" | "shared_mailbox">("all");
  const normalized = term.trim().toLocaleLowerCase("sr-Latn-RS");
  const partialProductTerm = group === "products" && /^#?\d+$/.test(term.trim());
  const rows = PREVIEW_RESULTS[group].filter((result) =>
    [result.title, result.code, result.ownerLabel, result.smkCode, result.venueLabel, result.smlCode, result.meta]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase("sr-Latn-RS").includes(normalized))
      && (!partialProductTerm || scoped)
      && (!scoped || result.smkCode === "SMK-00241"),
  );
  const visibleRows = showAll ? rows : rows.slice(0, 1);
  const previewActivityRows = PREVIEW_ACTIVITY.filter((row) =>
    (previewCategory === "all" || row.category === previewCategory)
    && (previewActor === "all" || row.actorKind === previewActor),
  );

  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[clamp(2.2rem,4.5vw,4.4rem)] leading-none font-medium tracking-[-0.055em]">{dict.pageTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)] sm:text-base">{dict.pageSubtitle}</p>
        </div>
        <div className="flex rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1">
          <button type="button" onClick={() => setView("search")} className={cn("min-h-10 rounded-full px-4 text-sm font-semibold", view === "search" && "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]")}>{dict.searchView}</button>
          <button type="button" onClick={() => setView("activity")} className={cn("min-h-10 rounded-full px-4 text-sm font-semibold", view === "activity" && "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]")}>{dict.activityView}</button>
        </div>
      </header>

      {view === "search" ? (
        <div className="grid min-w-0 gap-4">
          <AdminPanel className="relative z-10 grid min-w-0 gap-3 p-3 sm:p-4">
            <label className="relative block min-w-0">
              <span className="sr-only">{dict.searchLabel}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
              <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={dict.searchPlaceholder} className="min-h-12 rounded-xl border-[var(--admin-border)] bg-[var(--admin-surface-strong)] pl-9 text-base" />
            </label>
            <div className="flex min-w-0 flex-wrap gap-2">
              {GROUPS.map((item) => (
                <button key={item.value} type="button" onClick={() => { setGroup(item.value); setShowAll(false); }} aria-pressed={group === item.value} className={cn("min-h-10 rounded-full border px-3 text-xs font-semibold", group === item.value ? "border-[var(--admin-ink)] bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "border-[var(--admin-border)] bg-[var(--admin-surface-strong)]")}>{item.label}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setScoped((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold">
                {scoped ? "Bistro Primer · SMK-00241" : dict.scopePlaceholder}
                {scoped ? <X className="size-4" aria-hidden="true" /> : null}
              </button>
              <p className="text-xs text-[var(--admin-text-muted)]">{dict.scopeSuffixNote}</p>
            </div>
          </AdminPanel>
          {fixtureState === "loading" ? (
            <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>
          ) : fixtureState === "error" ? (
            <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} /><div className="border-t border-[var(--admin-border)] p-3 text-center"><button type="button" onClick={() => setFixtureState("loaded")} className="min-h-11 rounded-full border border-[var(--admin-border)] px-5 text-sm font-semibold">{dict.retry}</button></div></AdminPanel>
          ) : !normalized ? (
            <AdminPanel><AdminEmptyState title={dict.initialTitle} body={dict.initialBody} /></AdminPanel>
          ) : fixtureState !== "empty" && rows.length ? (
            <div className="grid gap-2">
              {visibleRows.map((result) => <ResultCard key={`${result.group}:${result.id}`} result={result} />)}
              {rows.length > visibleRows.length ? <button type="button" onClick={() => setShowAll(true)} className="mx-auto mt-2 min-h-11 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 text-sm font-semibold">{dict.loadMore}</button> : null}
            </div>
          ) : (
            <AdminPanel><AdminEmptyState title={dict.emptyTitle} body={dict.emptyBody} /></AdminPanel>
          )}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4">
          <header>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">{dict.activityTitle}</h2>
            <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{dict.activitySubtitle}</p>
          </header>
          <AdminPanel className="grid gap-3 p-3 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] sm:p-4">
            <button type="button" className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-left text-sm font-semibold">{dict.scopePlaceholder}</button>
            <select value={previewCategory} onChange={(event) => setPreviewCategory(event.target.value as ActivityCategory | "all")} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold" aria-label={dict.activityAllCategories}>
              <option value="all">{dict.activityAllCategories}</option>
              {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={previewActor} onChange={(event) => setPreviewActor(event.target.value as "all" | "admin" | "shared_mailbox")} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold" aria-label={dict.activityAllActors}>
              <option value="all">{dict.activityAllActors}</option>
              <option value="admin">Ana Admin · {dict.actorAdmin}</option>
              <option value="shared_mailbox">{dict.sharedMailboxEvent} · {dict.actorSharedMailbox}</option>
            </select>
          </AdminPanel>
          {previewActivityRows.length ? <div className="grid gap-2">
            {previewActivityRows.map((row) => (
              <article key={row.id} className="grid gap-3 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-4 shadow-[var(--admin-shadow-xs)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--admin-surface-muted)]"><Activity className="size-4" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.objectLabel}</h3><span className="rounded-full border border-[var(--admin-border)] px-2 py-0.5 text-[0.68rem] font-semibold text-[var(--admin-text-muted)]">{CATEGORIES.find((item) => item.value === row.category)?.label}</span></div>
                  <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{row.actorDisplayName} · {actorKindLabel(row.actorKind)}</p>
                  {row.reason ? <p className="mt-2 text-sm"><span className="font-semibold">{dict.activityReason}:</span> {row.reason}</p> : null}
                  <time className="mt-2 block text-xs text-[var(--admin-text-muted)]" dateTime={new Date(row.occurredAt).toISOString()}>{new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" }).format(row.occurredAt)}</time>
                </div>
                <Link href={row.href} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--admin-border)] px-3 text-xs font-semibold">{dict.activityOpenSource}<ArrowRight className="size-4" aria-hidden="true" /></Link>
              </article>
            ))}
          </div> : <AdminPanel><AdminEmptyState title={dict.activityEmptyTitle} body={dict.activityEmptyBody} /></AdminPanel>}
        </div>
      )}
    </div>
  );
}

export function AdminSearchWorkspace() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<"search" | "activity">(searchParams.get("view") === "activity" ? "activity" : "search");
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[clamp(2.2rem,4.5vw,4.4rem)] leading-none font-medium tracking-[-0.055em]">{dict.pageTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)] sm:text-base">{dict.pageSubtitle}</p>
        </div>
        <div className="flex rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1">
          <button type="button" onClick={() => setView("search")} className={cn("min-h-10 rounded-full px-4 text-sm font-semibold", view === "search" && "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]")}>{dict.searchView}</button>
          <button type="button" onClick={() => setView("activity")} className={cn("min-h-10 rounded-full px-4 text-sm font-semibold", view === "activity" && "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]")}>{dict.activityView}</button>
        </div>
      </header>
      {view === "search" ? <SearchView /> : <ActivityView />}
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
