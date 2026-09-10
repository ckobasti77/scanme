"use client";

// The reservation-request form leaf (TASK-43). Renders only the fields the
// block enables, shows the zone picker with live "popunjeno" state (the
// availability query is reactive — a filled zone greys out without a reload),
// and posts through POST /api/venue/reservations so the per-IP rate limit can
// run (the backend is authoritative for every rule: field config, zones,
// capacity, deadline, throttles). Success replaces the form so a double tap
// cannot double-request — and the copy says REQUEST: the owner confirms,
// software promises nothing.

import { useState } from "react";
import { useQuery } from "convex/react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { belgradeLocalToEpoch, epochToBelgradeLocal } from "@/lib/belgrade-time";
import type { ReservationProps, ReservationZone } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";

type Labels = {
  name: string;
  phone: string;
  email: string;
  partySize: string;
  note: string;
  zone: string;
  time: string;
  optional: string;
  zoneFullSuffix: string;
  allFull: string;
  disclaimer: string;
  submit: string;
  submitting: string;
  errorGeneric: string;
  nameRequired: string;
};

export function ReservationFormClient({
  businessSlug,
  eventSlug,
  fields,
  zones,
  defaultDesiredAt,
  confirmationMessage,
  labels,
}: {
  businessSlug: string;
  eventSlug: string;
  fields: ReservationProps["fields"];
  zones: ReservationZone[];
  defaultDesiredAt: number | null;
  confirmationMessage: string;
  labels: Labels;
}) {
  const availability = useQuery(api.venueReservations.availability, {
    businessSlug,
    eventSlug,
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (status === "done") {
    return (
      <div className={styles.reservationSuccess} role="status">
        <CircleCheck aria-hidden="true" />
        <span>{confirmationMessage}</span>
      </div>
    );
  }

  // The live zone view: the query's counts win; the published props are the
  // fallback while it loads (everything open — the server re-checks anyway).
  const zoneViews =
    availability?.kind === "zones"
      ? availability.zones
      : zones.map((zone) => ({ ...zone, used: 0, full: false }));
  const hasZones = zoneViews.length > 0;
  const everythingFull =
    (availability?.kind === "zones" && availability.allFull) ||
    (availability?.kind === "capacity" && availability.full);

  if (everythingFull) {
    return <p className={styles.emptyNote}>{labels.allFull}</p>;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const read = (key: string) => {
      const value = data.get(key);
      return typeof value === "string" && value.trim() ? value.trim() : undefined;
    };

    const name = read("name");
    if (fields.name && !name) {
      setError(labels.nameRequired);
      return;
    }
    const partySizeRaw = read("partySize");
    const partySize = partySizeRaw ? Number(partySizeRaw) : undefined;
    const desiredRaw = read("desiredAt");
    const desiredAt = desiredRaw
      ? belgradeLocalToEpoch(desiredRaw) ?? undefined
      : undefined;

    setStatus("submitting");
    setError(null);
    try {
      const response = await fetch("/api/venue/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug,
          eventSlug,
          zoneId: read("zoneId"),
          name,
          phone: read("phone"),
          email: read("email"),
          partySize,
          desiredAt,
          note: read("note"),
        }),
      });
      if (response.ok) {
        setStatus("done");
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      setStatus("idle");
      setError(
        typeof payload?.error === "string" ? payload.error : labels.errorGeneric,
      );
    } catch {
      setStatus("idle");
      setError(labels.errorGeneric);
    }
  }

  return (
    <form className={styles.reservationForm} onSubmit={handleSubmit} noValidate>
      {hasZones ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="venue-res-zone">
            {labels.zone}
          </label>
          <select id="venue-res-zone" name="zoneId" className={styles.input} required>
            {zoneViews.map((zone) => (
              <option key={zone.id} value={zone.id} disabled={zone.full}>
                {zone.full ? `${zone.name} ${labels.zoneFullSuffix}` : zone.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {fields.name ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="venue-res-name">
            {labels.name}
          </label>
          <input
            id="venue-res-name"
            name="name"
            className={styles.input}
            autoComplete="name"
            maxLength={120}
            required
          />
        </div>
      ) : null}
      {fields.phone ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="venue-res-phone">
            {labels.phone}
          </label>
          <input
            id="venue-res-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            className={styles.input}
            autoComplete="tel"
            maxLength={40}
          />
        </div>
      ) : null}
      {fields.email ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="venue-res-email">
            {labels.email} <span className={styles.fieldOptional}>{labels.optional}</span>
          </label>
          <input
            id="venue-res-email"
            name="email"
            type="email"
            inputMode="email"
            className={styles.input}
            autoComplete="email"
            maxLength={254}
          />
        </div>
      ) : null}
      {fields.partySize ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="venue-res-party">
            {labels.partySize}
          </label>
          <input
            id="venue-res-party"
            name="partySize"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            step={1}
            defaultValue={2}
            className={styles.input}
          />
        </div>
      ) : null}
      {hasZones ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="venue-res-time">
            {labels.time}
          </label>
          <input
            id="venue-res-time"
            name="desiredAt"
            type="datetime-local"
            className={styles.input}
            defaultValue={
              defaultDesiredAt !== null
                ? epochToBelgradeLocal(defaultDesiredAt)
                : undefined
            }
          />
        </div>
      ) : null}
      {fields.note ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="venue-res-note">
            {labels.note} <span className={styles.fieldOptional}>{labels.optional}</span>
          </label>
          <textarea
            id="venue-res-note"
            name="note"
            className={styles.input}
            maxLength={500}
            rows={3}
          />
        </div>
      ) : null}
      {error ? (
        <p className={styles.formNote} role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      <button
        type="submit"
        className={`${styles.action} ${styles.actionPrimary}`}
        disabled={status === "submitting"}
      >
        {status === "submitting" ? labels.submitting : labels.submit}
      </button>
      <p className={styles.deadlineNote}>{labels.disclaimer}</p>
    </form>
  );
}
