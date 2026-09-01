"use client";

// TASK-41 (RFC-002 §2.6, §4 task 13) — the per-location admin view that sits
// BELOW the customers table (TASK-40). Three things live here:
//
//  1. PER-LOCATION SUBPAGES (Links / Review / Venue / Meni) render ONLY for the
//     services actually active on this location. An inactive service has NO
//     subpage — not greyed, not locked, absent. The gate is SERVER-AUTHORITATIVE:
//     `api.admin.location` is `requireAdmin`-d and returns `null` for a location
//     that does not exist, and its `services[].active` flags are the only source
//     of truth for which subpages exist. Typing an inactive subpage's URL calls
//     `notFound()` on that server verdict — same behaviour as a route that isn't
//     there. (Why the `notFound()` runs client-side and not in SSR: authenticated
//     SSR Convex crashes Node v24.8.0; see docs/tasks/BLOCKED.md TASK-41 §1.)
//
//  2. LOCATION SIDEBAR appears ONLY inside a multi-location (Enterprise) account
//     (`data.isEnterprise`). Every solo/legacy location is full width, no sidebar.
//
//  3. PAGE → MENU is a rename HOOK behind `MENU_EXISTS` (lib/flags.ts): while the
//     flag is off the "ScanMe Page" label stays, and the Meni subpage never
//     appears (there is no `scanme_menu` service yet). One switch flips it later.
//
// Visual language is the shared glass of app/offer-surface.css (never a new glass
// layer), exactly like customers-admin.tsx. Every string routes through the typed
// dictionary (lib/i18n/sr/admin-location).

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Building2,
  ChevronLeft,
  ExternalLink,
  LayoutGrid,
  MapPin,
  Pencil,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MENU_EXISTS } from "@/lib/flags";
import { fmt } from "@/lib/i18n";
import { adminLocationSr as dict } from "@/lib/i18n/sr/admin-location";
import { cn } from "@/lib/utils";
import { AdminGuard } from "./admin-guard";
import { AdminShell } from "./admin-shell";

// The four per-location subpage kinds (goal: Links / Review / Venue / Meni).
// Memories is deliberately NOT a location subpage — it is a per-celebration
// service with its own /admin/memories console (docs/tasks/BLOCKED.md TASK-41 §2).
export type SubpageKey = "links" | "review" | "venue" | "menu";
export const SUBPAGE_ORDER: readonly SubpageKey[] = [
  "links",
  "review",
  "venue",
  "menu",
];

type LocationView = NonNullable<FunctionReturnType<typeof api.admin.location>>;
type ServiceRow = LocationView["services"][number];

// kind → serviceProfiles.type. "menu" has no service type until Menu ships.
const SUBPAGE_SERVICE: Record<Exclude<SubpageKey, "menu">, ServiceRow["type"]> =
  {
    links: "scanme_links",
    review: "google_review",
    venue: "scanme_venue",
  };

function subpageLabel(kind: SubpageKey): string {
  switch (kind) {
    case "links":
      return dict.subpageLinks;
    case "review":
      return dict.subpageReview;
    case "venue":
      return dict.subpageVenue;
    case "menu":
      // The Page → Menu rename hook: one flag flips the label everywhere.
      return MENU_EXISTS ? dict.subpageMenuLive : dict.subpageMenuComing;
  }
}

// A subpage EXISTS only when its service is active on this location. Menu can
// never be active yet (no scanme_menu service), so its subpage 404s until Menu
// ships AND MENU_EXISTS flips.
function subpageActive(kind: SubpageKey, services: ServiceRow[]): boolean {
  if (kind === "menu") return false;
  const type = SUBPAGE_SERVICE[kind];
  return services.some((service) => service.type === type && service.active);
}

export function LocationAdmin({
  businessId,
  service,
}: {
  businessId: string;
  service?: SubpageKey;
}) {
  return (
    <AdminGuard>
      <AdminShell>
        <LocationWorkspace businessId={businessId} service={service} />
      </AdminShell>
    </AdminGuard>
  );
}

function LocationWorkspace({
  businessId,
  service,
}: {
  businessId: string;
  service?: SubpageKey;
}) {
  const data = useQuery(api.admin.location, {
    businessId: businessId as Id<"businesses">,
  });

  if (data === undefined) {
    return (
      <div className="offer-surface">
        <div className="h-9 w-56 animate-pulse rounded bg-secondary" />
        <div className="mt-6 h-64 animate-pulse rounded-[var(--os-radius)] bg-secondary" />
      </div>
    );
  }
  // Server verdict: the location does not exist (missing / archived).
  if (data === null) notFound();

  // Server verdict: this service is not active here, so its subpage is absent.
  if (service && !subpageActive(service, data.services)) notFound();

  const activeTabs = SUBPAGE_ORDER.filter((kind) =>
    subpageActive(kind, data.services),
  );

  return (
    <div className="offer-surface">
      <LocationHeader data={data} />

      <div
        className={cn(
          "mt-6 grid min-w-0 gap-6",
          data.isEnterprise ? "lg:grid-cols-[264px_minmax(0,1fr)]" : null,
        )}
      >
        {data.isEnterprise ? (
          <LocationSidebar data={data} businessId={businessId} />
        ) : null}

        <section className="min-w-0">
          <SubpageNav
            businessId={businessId}
            activeTabs={activeTabs}
            current={service}
          />
          <div className="mt-6">
            {service ? (
              <SubpageBody kind={service} data={data} />
            ) : (
              <SubpageOverview businessId={businessId} activeTabs={activeTabs} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function planLabel(plan: "basic" | "premium" | "enterprise" | null): string {
  if (plan === "basic") return dict.planBasic;
  if (plan === "premium") return dict.planPremium;
  if (plan === "enterprise") return dict.planEnterprise;
  return dict.planNone;
}

function periodLabel(period: "monthly" | "annual" | null | undefined): string {
  if (period === "monthly") return dict.periodMonthly;
  if (period === "annual") return dict.periodAnnual;
  return dict.periodNone;
}

function LocationHeader({ data }: { data: LocationView }) {
  const { location, account } = data;
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6">
      <Link
        href="/admin/customers"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
        aria-label={dict.backToCustomersAria}
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        {dict.backToCustomers}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        {data.isEnterprise ? (
          <Building2 className="size-6 text-primary" aria-hidden="true" />
        ) : (
          <MapPin className="size-6 text-primary" aria-hidden="true" />
        )}
        <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
          {location.name}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>/{location.slug}</span>
        <span aria-hidden="true">·</span>
        <span>{planLabel(account?.plan ?? null)}</span>
        <span aria-hidden="true">·</span>
        <span>{periodLabel(account?.planPeriod)}</span>
      </div>
    </div>
  );
}

function LocationSidebar({
  data,
  businessId,
}: {
  data: LocationView;
  businessId: string;
}) {
  return (
    <aside
      aria-label={dict.sidebarHeading}
      className="offer-frame h-fit min-w-0 overflow-hidden lg:sticky lg:top-24"
    >
      <div className="offer-glass offer-glass--panel">
        <div className="border-b border-border/70 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {dict.sidebarHeading}
          </span>
        </div>
        <nav className="max-h-[70dvh] overflow-y-auto">
          {data.siblings.map((sibling) => {
            const isCurrent = sibling.id === businessId;
            return (
              <Link
                key={sibling.id}
                href={`/admin/customers/${sibling.id}`}
                aria-current={isCurrent ? "page" : undefined}
                aria-label={
                  isCurrent
                    ? fmt(dict.sidebarCurrentAria, { name: sibling.name })
                    : undefined
                }
                className={cn(
                  "block min-h-14 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isCurrent
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-secondary/60",
                )}
              >
                <span
                  className={cn(
                    "flex items-center gap-2 font-medium",
                    isCurrent ? "text-primary" : null,
                  )}
                >
                  <MapPin className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                  <span className="truncate">{sibling.name}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {fmt(dict.sidebarServiceCount, {
                    count: sibling.activeServiceCount,
                  })}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function SubpageNav({
  businessId,
  activeTabs,
  current,
}: {
  businessId: string;
  activeTabs: readonly SubpageKey[];
  current?: SubpageKey;
}) {
  if (activeTabs.length === 0) return null;
  return (
    <nav
      aria-label={dict.subpagesHeading}
      className="overflow-x-auto border-b border-border"
    >
      <div className="flex min-w-max gap-1">
        <Link
          href={`/admin/customers/${businessId}`}
          aria-current={current === undefined ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-xs font-semibold transition-colors",
            current === undefined
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <LayoutGrid className="size-3.5" aria-hidden="true" />
          {dict.overviewHeading}
        </Link>
        {activeTabs.map((kind) => {
          const active = kind === current;
          return (
            <Link
              key={kind}
              href={`/admin/customers/${businessId}/${kind}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center border-b-2 px-3 text-xs font-semibold transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {subpageLabel(kind)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SubpageOverview({
  businessId,
  activeTabs,
}: {
  businessId: string;
  activeTabs: readonly SubpageKey[];
}) {
  if (activeTabs.length === 0) {
    return (
      <div className="offer-frame overflow-hidden">
        <div className="offer-glass offer-glass--panel p-6 sm:p-10">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">
            {dict.noActiveSubpages}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {dict.noActiveSubpagesBody}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid min-w-0 gap-4">
      <p className="text-sm leading-6 text-muted-foreground">
        {dict.overviewIntro}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {activeTabs.map((kind) => (
          <Link
            key={kind}
            href={`/admin/customers/${businessId}/${kind}`}
            className="offer-frame group overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="offer-glass offer-glass--panel flex min-h-24 items-center justify-between gap-3 p-5">
              <div className="min-w-0">
                <span className="font-semibold">{subpageLabel(kind)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {dict.statusActive}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                {dict.openSubpage}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Per-service body: a focused hub that links out to the real working surfaces
// (public page, editor, client panel). It deliberately does NOT duplicate the
// activate/deactivate controls — those live on the customers table (TASK-40) —
// nor does it touch the frozen ScanMe Links product (it only links to it).
function SubpageBody({ kind, data }: { kind: SubpageKey; data: LocationView }) {
  const { slug } = data.location;

  const intro =
    kind === "links"
      ? dict.bodyLinksIntro
      : kind === "review"
        ? dict.bodyReviewIntro
        : kind === "venue"
          ? dict.bodyVenueIntro
          : "";

  const links: Array<{ href: string; label: string; icon: "public" | "editor" | "panel" }> =
    [];
  if (kind === "links") {
    links.push({ href: `/${slug}`, label: dict.openPublic, icon: "public" });
    links.push({ href: `/${slug}/editor`, label: dict.openEditor, icon: "editor" });
  } else if (kind === "venue") {
    links.push({ href: `/${slug}/venue`, label: dict.openPublic, icon: "public" });
    links.push({
      href: `/${slug}/venue/editor`,
      label: dict.openEditor,
      icon: "editor",
    });
  }
  links.push({
    href: `/${slug}/client-panel`,
    label: dict.openClientPanel,
    icon: "panel",
  });

  return (
    <div className="offer-frame overflow-hidden">
      <div className="offer-glass offer-glass--panel p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.03em]">
            {subpageLabel(kind)}
          </h2>
          <span className="inline-flex min-h-8 items-center gap-1.5 border border-primary/50 bg-primary/10 px-3 text-xs font-semibold text-primary">
            {dict.serviceStatusLabel}: {dict.statusActive}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {intro}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-semibold transition-colors",
                link.icon === "public"
                  ? "border-transparent bg-primary text-primary-foreground hover:opacity-90"
                  : "border-border hover:bg-secondary/60",
              )}
            >
              {link.icon === "public" ? (
                <ExternalLink className="size-4" aria-hidden="true" />
              ) : link.icon === "editor" ? (
                <Pencil className="size-4" aria-hidden="true" />
              ) : (
                <UserCog className="size-4" aria-hidden="true" />
              )}
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
