"use client";

// TASK-43 — the event-analytics card: page views, reservation inquiries, and
// which blocks visitors actually reach, per day. The READ is Premium-gated on
// the server (venueAnalytics.eventMetrics returns "locked" for Basic — the
// panel merely renders the upsell note); everything shown is aggregate, no
// guest identity anywhere (RFC-001 §2.10).

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BarChart3, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { venueEditorSr } from "@/lib/i18n/sr/venue-editor";
import { venuePanelSr as dict } from "@/lib/i18n/sr/venue-panel";
import type { VenueBlockType } from "@/lib/venue-blocks";

type Metrics = Extract<
  FunctionReturnType<typeof api.venueAnalytics.eventMetrics>,
  { status: "available" }
>;

// The editor's block labels, reused so the card and the palette agree — the
// registry itself stays out of the panel bundle (it drags every renderer in).
const BLOCK_LABELS: Record<VenueBlockType, string> = {
  countdown: venueEditorSr.blockLabelCountdown,
  eventDateTime: venueEditorSr.blockLabelEventDateTime,
  programTimeline: venueEditorSr.blockLabelProgramTimeline,
  map: venueEditorSr.blockLabelMap,
  gallery: venueEditorSr.blockLabelGallery,
  profileCards: venueEditorSr.blockLabelProfileCards,
  priceList: venueEditorSr.blockLabelPriceList,
  reservation: venueEditorSr.blockLabelReservation,
  share: venueEditorSr.blockLabelShare,
  pastEvents: venueEditorSr.blockLabelPastEvents,
  richText: venueEditorSr.blockLabelRichText,
  spacer: venueEditorSr.blockLabelSpacer,
};

function blockLabel(blockType: string): string {
  return BLOCK_LABELS[blockType as VenueBlockType] ?? blockType;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function DailyBars({ daily }: { daily: Metrics["daily"] }) {
  const max = Math.max(1, ...daily.map((day) => day.pageViews));
  return (
    <div
      className="mt-4 flex h-16 items-end gap-px"
      role="img"
      aria-label={dict.anaPageViews}
    >
      {daily.map((day) => (
        <div
          key={day.dateKey}
          className="min-w-0 flex-1 bg-primary/60"
          style={{ height: `${Math.max(2, (day.pageViews / max) * 100)}%` }}
          title={`${day.dateKey}: ${day.pageViews}`}
        />
      ))}
    </div>
  );
}

export function VenueAnalyticsCard({
  eventId,
  analyticsEnabled,
}: {
  eventId: Id<"events">;
  analyticsEnabled: boolean;
}) {
  const [range, setRange] = useState<"7d" | "30d">("30d");
  const metrics = useQuery(
    api.venueAnalytics.eventMetrics,
    analyticsEnabled ? { eventId, range } : "skip",
  );

  if (!analyticsEnabled) {
    return (
      <section className="border border-border bg-card p-5 sm:p-7">
        <h3 className="flex items-center gap-2 font-semibold">
          <Lock className="size-4 text-muted-foreground" />
          {dict.anaCardHeading}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {dict.anaLockedNote}
        </p>
      </section>
    );
  }
  if (!metrics) return null;
  if (metrics.status === "locked") {
    return (
      <section className="border border-border bg-card p-5 sm:p-7">
        <h3 className="flex items-center gap-2 font-semibold">
          <Lock className="size-4 text-muted-foreground" />
          {dict.anaCardHeading}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {dict.anaLockedNote}
        </p>
      </section>
    );
  }

  const reservationStatuses: Array<[string, number]> = [
    [dict.resStatusPending, metrics.reservations.pending],
    [dict.resStatusConfirmed, metrics.reservations.confirmed],
    [dict.resStatusDeclined, metrics.reservations.declined],
    [dict.resStatusExpired, metrics.reservations.expired],
  ];

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <BarChart3 className="size-4 text-primary" />
          {dict.anaCardHeading}
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={range === "7d" ? "default" : "outline"}
            onClick={() => setRange("7d")}
          >
            {dict.anaRangeLabel7d}
          </Button>
          <Button
            size="sm"
            variant={range === "30d" ? "default" : "outline"}
            onClick={() => setRange("30d")}
          >
            {dict.anaRangeLabel30d}
          </Button>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <StatTile label={dict.anaPageViews} value={metrics.totals.pageViews} />
        <StatTile
          label={dict.anaReservationSubmits}
          value={metrics.totals.reservationSubmits}
        />
      </dl>

      {metrics.totals.pageViews > 0 ? (
        <DailyBars daily={metrics.daily} />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{dict.anaEmptyNote}</p>
      )}

      <h4 className="mt-6 text-sm font-semibold">{dict.anaBlocksHeading}</h4>
      {metrics.blockViews.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {dict.anaBlocksEmpty}
        </p>
      ) : (
        <ul className="mt-2 grid gap-1 text-sm tabular-nums">
          {metrics.blockViews.map((entry) => (
            <li
              key={entry.blockType}
              className="flex items-center justify-between gap-3"
            >
              <span>{blockLabel(entry.blockType)}</span>
              <span className="text-muted-foreground">{entry.views}</span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="mt-6 text-sm font-semibold">
        {dict.anaReservationsHeading}
      </h4>
      <ul className="mt-2 grid gap-1 text-sm tabular-nums">
        {reservationStatuses.map(([label, count]) => (
          <li key={label} className="flex items-center justify-between gap-3">
            <span>{label}</span>
            <span className="text-muted-foreground">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
