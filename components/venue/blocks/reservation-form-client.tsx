"use client";

// The reservation form leaf. Renders only the fields the block enables, posts
// through api.venue.submitReservation, and mirrors the backend's ConvexError
// copy inline (the backend is authoritative for every rule: field config,
// capacity, deadline, rate limit). Success replaces the form so a double tap
// cannot double-book.

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { ReservationProps } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";

type Labels = {
  name: string;
  phone: string;
  email: string;
  partySize: string;
  note: string;
  optional: string;
  submit: string;
  submitting: string;
  errorGeneric: string;
  nameRequired: string;
};

export function ReservationFormClient({
  businessSlug,
  eventSlug,
  fields,
  confirmationMessage,
  labels,
}: {
  businessSlug: string;
  eventSlug: string;
  fields: ReservationProps["fields"];
  confirmationMessage: string;
  labels: Labels;
}) {
  const submitReservation = useMutation(api.venue.submitReservation);
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

    setStatus("submitting");
    setError(null);
    try {
      await submitReservation({
        businessSlug,
        eventSlug,
        name,
        phone: read("phone"),
        email: read("email"),
        partySize,
        note: read("note"),
      });
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      setError(
        err instanceof ConvexError && typeof err.data === "string"
          ? err.data
          : labels.errorGeneric,
      );
    }
  }

  return (
    <form className={styles.reservationForm} onSubmit={handleSubmit} noValidate>
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
    </form>
  );
}
