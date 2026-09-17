"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Building2, LogOut, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { adminSearchSr as dict } from "@/lib/i18n/sr/admin-search";
import { AdminEmptyState, AdminLoadingState, AdminPanel } from "./admin-primitives";

type ActiveDebugContext = {
  accountId: string;
  accountName: string;
  smkCode: string;
  smlCode?: string | null;
  venueName?: string | null;
  adminName: string;
};

type DebugOverview = {
  ownerDisplayName: string;
  defaultContactEmail?: string | null;
  defaultContactPhone?: string | null;
  venueCount: number;
  venues: Array<{
    businessId: string;
    venueName: string;
    smlCode: string;
    city?: string | null;
    productCount: number;
    channelCount: number;
  }>;
};

function ActiveDebugView({
  context,
  overview,
  exiting,
  onExit,
}: {
  context: ActiveDebugContext;
  overview: DebugOverview | undefined;
  exiting: boolean;
  onExit: () => void | Promise<void>;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <aside
        role="status"
        aria-label={dict.debugBannerLabel}
        className="sticky top-[4.5rem] z-20 grid gap-3 rounded-2xl border-2 border-[var(--admin-danger)] bg-[var(--admin-surface-strong)] p-3 shadow-[var(--admin-shadow-md)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-4 motion-reduce:transition-none"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]">
          <ShieldAlert className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm tracking-[0.08em] uppercase">{dict.debugMode}</strong>
            <span className="font-mono text-xs text-[var(--admin-text-muted)]">{context.smkCode}</span>
            {context.smlCode ? <span className="font-mono text-xs text-[var(--admin-text-muted)]">{context.smlCode}</span> : null}
          </div>
          <p className="mt-1 truncate text-sm font-semibold">{context.accountName}{context.venueName ? ` · ${context.venueName}` : ""}</p>
          <p className="mt-1 text-xs text-[var(--admin-text-muted)]">{context.adminName} · {dict.debugReadOnly}</p>
        </div>
        <button
          type="button"
          disabled={exiting}
          onClick={onExit}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--admin-ink)] px-4 text-sm font-semibold text-[var(--admin-on-ink)] disabled:opacity-60"
        >
          <LogOut className="size-4" aria-hidden="true" />
          {exiting ? dict.debugExiting : dict.debugExit}
        </button>
      </aside>

      <header>
        <h1 className="text-[clamp(2rem,4vw,3.6rem)] leading-none font-medium tracking-[-0.05em]">{dict.debugOverviewTitle}</h1>
        <p className="mt-2 text-sm text-[var(--admin-text-muted)]">{context.accountName} · {context.smkCode}</p>
      </header>

      {overview === undefined ? <AdminLoadingState label={dict.loading} /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <AdminPanel className="p-4 sm:p-5">
            <dl className="grid gap-4">
              <div><dt className="text-xs font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">{dict.debugOwner}</dt><dd className="mt-1 font-semibold">{overview.ownerDisplayName}</dd></div>
              <div><dt className="text-xs font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">{dict.debugContact}</dt><dd className="mt-1 grid gap-1 text-sm"><span>{overview.defaultContactEmail ?? "—"}</span><span>{overview.defaultContactPhone ?? "—"}</span></dd></div>
              <div><dt className="text-xs font-bold tracking-[0.06em] text-[var(--admin-text-muted)] uppercase">{dict.debugVenues}</dt><dd className="mt-1 font-semibold">{overview.venueCount}</dd></div>
            </dl>
          </AdminPanel>
          <AdminPanel className="overflow-hidden">
            <div className="border-b border-[var(--admin-border)] px-4 py-3"><h2 className="font-semibold">{dict.debugVenues}</h2></div>
            <div className="grid gap-2 p-3 sm:p-4">
              {overview.venues.map((venue) => (
                <article key={venue.businessId} className="grid gap-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <Building2 className="size-4 text-[var(--admin-text-muted)]" aria-hidden="true" />
                  <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{venue.venueName}</h3><p className="mt-1 font-mono text-xs text-[var(--admin-text-muted)]">{venue.smlCode}{venue.city ? ` · ${venue.city}` : ""}</p></div>
                  <div className="flex gap-3 text-xs text-[var(--admin-text-muted)]"><span>{dict.debugProducts}: {venue.productCount}</span><span>{dict.debugChannels}: {venue.channelCount}</span></div>
                </article>
              ))}
            </div>
          </AdminPanel>
        </div>
      )}
    </div>
  );
}

export function AdminDebugSupport({ contextId }: { contextId: Id<"adminDebugContexts"> }) {
  const router = useRouter();
  const context = useQuery(api.adminSupport.getContext, { contextId });
  const overview = useQuery(api.adminSupport.readOverview, context?.state === "active" ? { contextId } : "skip");
  const exit = useMutation(api.adminSupport.exit);
  const [exiting, setExiting] = useState(false);

  if (context === undefined) return <AdminLoadingState label={dict.loading} />;
  if (context.state === "ended") {
    return (
      <AdminPanel>
        <AdminEmptyState title={dict.debugEndedTitle} body={dict.debugEndedBody} />
        <div className="border-t border-[var(--admin-border)] p-4 text-center">
          <Link href={`/admin/klijenti/${context.accountId}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--admin-border)] px-4 text-sm font-semibold">
            <ArrowLeft className="size-4" aria-hidden="true" />{context.accountName}
          </Link>
        </div>
      </AdminPanel>
    );
  }

  return (
    <ActiveDebugView
      context={context}
      overview={overview}
      exiting={exiting}
      onExit={async () => {
        setExiting(true);
        try {
          await exit({ contextId });
          router.push(`/admin/klijenti/${context.accountId}`);
        } finally {
          setExiting(false);
        }
      }}
    />
  );
}

export function AdminDebugSupportPreview() {
  const [ended, setEnded] = useState(false);
  if (ended) {
    return (
      <AdminPanel>
        <AdminEmptyState title={dict.debugEndedTitle} body={dict.debugEndedBody} />
        <div className="border-t border-[var(--admin-border)] p-4 text-center">
          <button type="button" onClick={() => setEnded(false)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--admin-border)] px-4 text-sm font-semibold">
            <ArrowLeft className="size-4" aria-hidden="true" />{dict.debugOpen}
          </button>
        </div>
      </AdminPanel>
    );
  }
  return (
    <ActiveDebugView
      context={{
        accountId: "preview-account",
        accountName: "Bistro Primer",
        smkCode: "SMK-00241",
        smlCode: "SML-00618",
        venueName: "Bistro Primer · Centar",
        adminName: "Ana Admin",
      }}
      overview={{
        ownerDisplayName: "Mila Petrović",
        defaultContactEmail: "kontakt@bistro-primer.rs",
        defaultContactPhone: "+381 60 123 4567",
        venueCount: 2,
        venues: [
          { businessId: "preview-business-1", venueName: "Bistro Primer · Centar", smlCode: "SML-00618", city: "Beograd", productCount: 4, channelCount: 6 },
          { businessId: "preview-business-2", venueName: "Bistro Primer · Vračar", smlCode: "SML-00619", city: "Beograd", productCount: 2, channelCount: 3 },
        ],
      }}
      exiting={false}
      onExit={() => setEnded(true)}
    />
  );
}
