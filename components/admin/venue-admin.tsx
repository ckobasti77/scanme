"use client";

// TASK-11 STEP 2 — the admin Venue console. Replaces the app/admin/venue
// AdminPlaceholder with the real screen: list businesses, see which own Venue
// and at which plan tier + current event, grant Venue (choosing the tier),
// deactivate it, and jump straight to the editor or public page. It follows the
// conventions of components/admin/scanme-links-admin.tsx (AdminGuard + AdminShell
// chrome, the sidebar/detail split, the same card/border system) but is its own
// screen — it touches no scanme-links-editor file and no Links admin screen.
// Every string is routed through the typed dictionary (lib/i18n/sr/venue-admin).

import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CalendarClock,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Pencil,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PLAN_LIMITS } from "@/convex/lib/plans";
import { fmt } from "@/lib/i18n";
import { venueAdminSr as dict } from "@/lib/i18n/sr/venue-admin";
import { AdminGuard } from "./admin-guard";
import { AdminShell } from "./admin-shell";

const VENUE_PLAN_KEYS = Object.keys(PLAN_LIMITS.scanme_venue);

type EventStatus = "draft" | "scheduled" | "live" | "ended" | "archived";

const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: dict.statusDraft,
  scheduled: dict.statusScheduled,
  live: dict.statusLive,
  ended: dict.statusEnded,
  archived: dict.statusArchived,
};

function planLabel(planKey: string | null) {
  if (planKey === "basic") return dict.planBasic;
  if (planKey === "premium") return dict.planPremium;
  return planKey ?? "—";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

export function ScanMeVenueAdmin() {
  return (
    <AdminGuard>
      <AdminShell>
        <VenueWorkspace />
      </AdminShell>
    </AdminGuard>
  );
}

function VenueWorkspace() {
  const businesses = useQuery(api.venueAdmin.listVenueBusinesses);
  const [selectedId, setSelectedId] = useState<Id<"businesses"> | null>(null);

  const rows = businesses ?? [];
  const effectiveSelectedId = rows.some((row) => row.id === selectedId)
    ? selectedId
    : rows[0]?.id ?? null;
  const selected =
    rows.find((row) => row.id === effectiveSelectedId) ?? null;

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {dict.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            {dict.title}
          </h1>
        </div>
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside
          aria-label={dict.listLabel}
          className="min-w-0 border border-border bg-card"
        >
          <div className="border-b border-border px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {fmt(dict.listCount, { count: rows.length })}
            </span>
          </div>
          {businesses === undefined ? (
            <div className="h-28 animate-pulse bg-secondary" />
          ) : rows.length ? (
            <div className="max-h-[70dvh] overflow-y-auto">
              {rows.map((row) => {
                const isSelected = row.id === effectiveSelectedId;
                const active = row.venue?.status === "active";
                return (
                  <button
                    key={row.id}
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => setSelectedId(row.id)}
                    className={`block min-h-20 w-full border-b border-border px-4 py-4 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-secondary"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      {active ? (
                        <Sparkles className="size-4" />
                      ) : (
                        <MapPin className="size-4 opacity-60" />
                      )}
                      {row.name}
                    </span>
                    <span
                      className={`mt-1 block text-xs ${
                        isSelected ? "text-current/70" : "text-muted-foreground"
                      }`}
                    >
                      /{row.slug} ·{" "}
                      {row.venue
                        ? active
                          ? dict.venueActive
                          : dict.venueInactive
                        : dict.venueNone}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-sm leading-6 text-muted-foreground">
              {dict.listEmpty}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {selected ? (
            <VenueBusinessDetail key={selected.id} row={selected} />
          ) : (
            <div className="border border-border bg-card p-10 text-sm text-muted-foreground">
              {dict.selectPrompt}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

type VenueRow = FunctionReturnType<
  typeof api.venueAdmin.listVenueBusinesses
>[number];

function VenueBusinessDetail({ row }: { row: VenueRow }) {
  const grantVenue = useMutation(api.venueAdmin.grantVenue);
  const deactivateVenue = useMutation(api.venueAdmin.deactivateVenue);
  const [planKey, setPlanKey] = useState(
    row.venue?.planKey ?? VENUE_PLAN_KEYS[0],
  );
  const [pending, setPending] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const hasVenue = row.venue !== null;
  const isActive = row.venue?.status === "active";
  const editorPath = `/${row.slug}/venue/editor`;
  const publicPath = `/${row.slug}/venue`;

  async function grant() {
    setPending(true);
    try {
      const result = await grantVenue({ businessId: row.id, planKey });
      toast.success(
        result.created ? dict.grantSuccess : dict.grantSuccessExisting,
      );
    } catch (error) {
      toast.error(errorMessage(error, dict.grantError));
    } finally {
      setPending(false);
    }
  }

  async function deactivate() {
    setPending(true);
    try {
      await deactivateVenue({ businessId: row.id });
      setDeactivateOpen(false);
      toast.success(dict.deactivateSuccess);
    } catch (error) {
      toast.error(errorMessage(error, dict.deactivateError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div className="min-w-0 border border-border bg-card p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <MapPin className="size-5 text-primary" />
              <h2 className="text-2xl font-semibold tracking-[-0.04em]">
                {row.name}
              </h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">/{row.slug}</p>
          </div>
          <span
            className={`inline-flex min-h-8 items-center border px-3 text-xs font-semibold ${
              isActive
                ? "border-primary/50 bg-primary/10 text-primary"
                : hasVenue
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-border bg-secondary/40 text-muted-foreground"
            }`}
          >
            {hasVenue
              ? isActive
                ? dict.venueActive
                : dict.venueInactive
              : dict.venueNone}
          </span>
        </div>

        {hasVenue ? (
          <dl className="mt-6 grid gap-4 border border-border sm:grid-cols-2">
            <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
              <dt className="text-xs text-muted-foreground">{dict.planLabel}</dt>
              <dd className="mt-2 text-lg font-semibold">
                {planLabel(row.venue?.planKey ?? null)}
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-xs text-muted-foreground">
                {dict.currentEventLabel}
              </dt>
              <dd className="mt-2 flex flex-wrap items-center gap-2">
                {row.venue?.currentEvent ? (
                  <>
                    <span className="font-semibold">
                      {row.venue.currentEvent.title}
                    </span>
                    <span className="inline-flex items-center gap-1 border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      {EVENT_STATUS_LABEL[row.venue.currentEvent.status]}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {dict.noEventYet}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        ) : null}

        {hasVenue ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild>
              <Link href={editorPath} target="_blank" rel="noopener noreferrer">
                <Pencil className="size-4" />
                {dict.openEditor}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={publicPath} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                {dict.openPublic}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 border border-border bg-card p-5 sm:p-7">
        <h3 className="font-semibold">
          {isActive ? dict.planLabel : dict.grantAction}
        </h3>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor={`venue-plan-${row.id}`}>{dict.planPickerLabel}</Label>
            <Select value={planKey} onValueChange={setPlanKey}>
              <SelectTrigger id={`venue-plan-${row.id}`} className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENUE_PLAN_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {planLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void grant()} disabled={pending}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {hasVenue && !isActive ? dict.grantActionExisting : dict.grantAction}
          </Button>
        </div>

        {isActive ? (
          <div className="mt-6 border-t border-border pt-6">
            <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
              <Button
                variant="destructive"
                onClick={() => setDeactivateOpen(true)}
                disabled={pending}
              >
                {dict.deactivateAction}
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{dict.deactivateDialogTitle}</DialogTitle>
                  <DialogDescription className="leading-6">
                    {dict.deactivateDialogBody}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" disabled={pending}>
                      {dict.deactivateCancel}
                    </Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    onClick={() => void deactivate()}
                    disabled={pending}
                  >
                    {pending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                    {dict.deactivateConfirm}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </div>
    </div>
  );
}
