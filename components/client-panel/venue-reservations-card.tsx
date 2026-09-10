"use client";

// TASK-43 — the reservations card: the owner's request INBOX for one event.
// This is deliberately NOT a booking admin: every row is a guest's REQUEST,
// the owner taps Potvrdi or Odbij, and confirmation opens a PREPARED
// WhatsApp/Viber message the owner sends themself (the hard rule in
// convex/venueReservations.ts: the software never promises a table). Zone
// usage renders from the server's counts; all rules live server-side and
// refusals surface verbatim as their Serbian ConvexError sentences.

import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Check,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n";
import { venuePanelSr as dict } from "@/lib/i18n/sr/venue-panel";

type ListResult = FunctionReturnType<typeof api.venueReservations.listForEvent>;
type Row = ListResult["rows"][number];
type RowStatus = Row["status"];

const BELGRADE = "Europe/Belgrade";
const dateTimeFormat = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: BELGRADE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const formatWhen = (epoch: number) => dateTimeFormat.format(new Date(epoch));

const STATUS_LABEL: Record<RowStatus, string> = {
  pending: dict.resStatusPending,
  confirmed: dict.resStatusConfirmed,
  declined: dict.resStatusDeclined,
  expired: dict.resStatusExpired,
};

const STATUS_CLASS: Record<RowStatus, string> = {
  pending:
    "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  confirmed: "border-primary/40 bg-primary/10 text-primary",
  declined: "border-border bg-secondary/50 text-muted-foreground",
  expired: "border-border bg-secondary/50 text-muted-foreground",
};

// Digits for wa.me / viber. A local Serbian 0-prefixed number gets the +381
// country code — this product is sr-only (RFC-001 §2.12), so that default is
// the honest guess; anything already international passes through.
function phoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return digits;
  if (digits.startsWith("0")) return `381${digits.slice(1)}`;
  return digits;
}

function preparedMessage(row: Row, eventTitle: string): string {
  const details =
    [
      row.zoneName,
      row.partySize !== null
        ? fmt(dict.resPartyLabel, { count: row.partySize })
        : null,
      row.desiredAt !== null ? formatWhen(row.desiredAt) : null,
    ]
      .filter(Boolean)
      .join(", ") || dict.resMessageNoZone;
  return fmt(dict.resMessageTemplate, {
    name: row.name,
    event: eventTitle,
    details,
  });
}

function errorText(error: unknown): string {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : dict.resActionError;
}

function ReservationRow({
  row,
  eventTitle,
}: {
  row: Row;
  eventTitle: string;
}) {
  const confirm = useMutation(api.venueReservations.confirm);
  const decline = useMutation(api.venueReservations.decline);
  const [pending, setPending] = useState<"confirm" | "decline" | null>(null);

  async function run(kind: "confirm" | "decline") {
    setPending(kind);
    try {
      if (kind === "confirm") {
        await confirm({ reservationId: row.id });
      } else {
        await decline({ reservationId: row.id });
      }
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setPending(null);
    }
  }

  const message = preparedMessage(row, eventTitle);
  const digits = row.phone ? phoneDigits(row.phone) : null;

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.name}</span>
        <span
          className={`inline-flex min-h-6 items-center gap-1 border px-2 text-xs font-semibold ${STATUS_CLASS[row.status]}`}
        >
          {STATUS_LABEL[row.status]}
        </span>
        {row.partySize !== null ? (
          <span className="text-sm text-muted-foreground">
            {fmt(dict.resPartyLabel, { count: row.partySize })}
          </span>
        ) : null}
        {row.zoneName ? (
          <span className="text-sm text-muted-foreground">{row.zoneName}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {fmt(dict.resReceivedAt, { date: formatWhen(row.createdAt) })}
        {row.desiredAt !== null ? (
          <>
            {" · "}
            <Clock3 className="inline size-3.5 align-[-2px]" aria-hidden="true" />{" "}
            {fmt(dict.resDesiredAt, { date: formatWhen(row.desiredAt) })}
          </>
        ) : null}
        {row.phone ? (
          <>
            {" · "}
            <a className="underline underline-offset-2" href={`tel:${row.phone}`}>
              <Phone className="inline size-3.5 align-[-2px]" aria-hidden="true" />{" "}
              {row.phone}
            </a>
          </>
        ) : null}
      </p>
      {row.note ? (
        <p className="border-l-2 border-border pl-3 text-sm leading-6 text-muted-foreground">
          {row.note}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {row.status !== "confirmed" ? (
          <Button
            size="sm"
            disabled={pending !== null}
            onClick={() => void run("confirm")}
          >
            {pending === "confirm" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {dict.resConfirmAction}
          </Button>
        ) : null}
        {row.status === "confirmed" && digits ? (
          <>
            <Button asChild size="sm" variant="outline">
              <a
                href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="size-4" />
                {dict.resWhatsappAction}
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a
                href={`viber://chat?number=%2B${digits}&text=${encodeURIComponent(message)}`}
              >
                <MessageCircle className="size-4" />
                {dict.resViberAction}
              </a>
            </Button>
          </>
        ) : null}
        {row.status !== "declined" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void run("decline")}
          >
            {pending === "decline" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <X className="size-4" />
            )}
            {dict.resDeclineAction}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function VenueReservationsCard({ eventId }: { eventId: Id<"events"> }) {
  const data = useQuery(api.venueReservations.listForEvent, { eventId });
  if (!data) return null;

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h3 className="font-semibold">{dict.resCardHeading}</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        {dict.resCardNote}
      </p>
      {data.zoneUsage && data.zoneUsage.length > 0 ? (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-muted-foreground">
          {data.zoneUsage.map((zone) => (
            <span key={zone.id}>
              {fmt(dict.resZoneUsage, {
                name: zone.name,
                used: zone.used,
                capacity: zone.capacity,
              })}
            </span>
          ))}
        </p>
      ) : null}
      {data.rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{dict.resCardEmpty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {data.rows.map((row) => (
            <ReservationRow
              key={row.id}
              row={row}
              eventTitle={data.eventTitle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
