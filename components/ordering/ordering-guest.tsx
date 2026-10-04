"use client";

// TASK-66 — the guest ordering surface at /o/[code] (RFC-004 §2.1, §2.6, §4).
//
// Scope is deliberately narrow: the two actions must be reachable, they must
// carry the table, and the guest must SEE that the action left. The live status
// Poslato → Prihvaćeno → Stiže and the 7-minute action card arrived in TASK-67
// and live in ./request-status-list.tsx, on a real subscription — never an
// optimistic guess about the waiter.
//
// The local `notice` below survived that task on purpose. It is not a claim
// about the waiter, only the immediate "it left your phone" acknowledgement of
// the tap; the status list is the state. Dropping it would leave the moment
// between the tap and the first subscription tick with no feedback at all,
// which is the one thing a guest in a loud room cannot tolerate.
//
// THE RULE THIS SCREEN EXISTS TO HONOUR (§2.6): ordering is offered if and only
// if `acceptingRequests` is true, and when it is false there is exactly ONE
// message, identical for a sleeping tablet and a closed/paused shift. This file
// never receives `stale` or `paused` — the query does not send them — so it
// cannot leak the cause even by accident.
//
// The call button is gated by the SAME flag as ordering, not offered beside the
// disabled state. §2.6's own words allow either that button or "a plain flag-a-
// waiter line", and the button cannot be honoured: serviceRequests.shiftId is
// non-optional and §2.7 routes every request to an open shift, so with no shift
// a call cannot be written at all, and with a stale one it rings a dead tablet —
// the exact void §2.6 exists to prevent. The plain line is what renders. Logged
// in docs/tasks/BLOCKED.md, awaiting the owner.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { BellRing, Minus, Plus, Send } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PublicOrderingStateResult } from "@/convex/ordering";
import type { GuestRequestRow } from "@/convex/orderingStatus";
import { REQUEST_ERROR } from "@/convex/lib/orderingErrors";
import { fmt } from "@/lib/i18n/format";
import { orderingSr as dict } from "@/lib/i18n/sr/ordering";
import { cn } from "@/lib/utils";
import { RequestStatusList } from "./request-status-list";

// Machine code → Serbian. Every code convex/orderingRequests.ts can raise has a
// row; `unavailable` maps to the one calm state, exactly like the query flag.
const ERROR_COPY: Record<string, string> = {
  [REQUEST_ERROR.notFound]: dict.errorNotFound,
  [REQUEST_ERROR.invalidGuest]: dict.errorInvalidGuest,
  [REQUEST_ERROR.noTable]: dict.errorNoTable,
  [REQUEST_ERROR.unavailable]: dict.unavailableBody,
  [REQUEST_ERROR.rateLimited]: dict.errorRateLimited,
  [REQUEST_ERROR.invalidItems]: dict.errorInvalidItems,
  [REQUEST_ERROR.invalidReason]: dict.errorInvalidReason,
  [REQUEST_ERROR.noteTooLong]: dict.errorNoteTooLong,
};

function messageFor(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return ERROR_COPY[error.data] ?? dict.errorUnknown;
  }
  return dict.errorUnknown;
}

// Only reached if the venue's config is not in this payload (locked, or the
// entitlement lapsed while a request was in flight) — the copy still needs a
// number. The live value is orderingConfig.overdueMinutes; this is §2.8's
// default, the same one convex/orderingRequests.ts falls back to.
const FALLBACK_OVERDUE_MINUTES = 7;

export interface OrderingGuestProps {
  code: string;
  /** null when the card-aware hop never minted an identity — both actions off. */
  guestKey: string | null;
  /** The server render's answer; the subscription below takes over from it. */
  initialState: PublicOrderingStateResult;
  /** The server render of this guest's own requests (TASK-67, §2.6). */
  initialRequests: GuestRequestRow[];
}

export function OrderingGuest({
  code,
  guestKey,
  initialState,
  initialRequests,
}: OrderingGuestProps) {
  // SSR-then-subscribe: the first paint is the server's row, and from the first
  // tick this is live — which is the whole point of materializing `stale`, so a
  // tablet dying mid-session disables this screen without a reload.
  const live = useQuery(api.ordering.publicOrderingState, { code });
  const state = live ?? initialState;

  const callWaiter = useMutation(api.orderingRequests.callWaiter);
  const submitOrder = useMutation(api.orderingRequests.submitOrder);

  const [pending, setPending] = useState<null | "call" | "order">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});

  const available = state.status === "available";
  const config = available ? state.config : null;
  const items = useMemo(
    () => (available ? state.items.filter((item) => item.available) : []),
    [available, state],
  );
  // The single gate. `guestKey === null` joins it: a request with no table is
  // worthless, so an identity-less visitor is not offered the controls either —
  // but it gets its OWN message (re-scan the card), because unlike §2.6's two
  // causes that one has a remedy the guest can act on.
  const acceptingRequests = available && state.acceptingRequests;
  const canAct = acceptingRequests && guestKey !== null;

  const selected = useMemo(
    () =>
      items
        .map((item) => ({ item, qty: qty[item._id] ?? 0 }))
        .filter((line) => line.qty > 0),
    [items, qty],
  );

  function bump(itemId: Id<"orderingItems">, delta: number) {
    setQty((prev) => {
      const next = Math.max(0, Math.min(99, (prev[itemId] ?? 0) + delta));
      return { ...prev, [itemId]: next };
    });
  }

  async function onCall() {
    if (!canAct || !guestKey || pending) return;
    setPending("call");
    setError(null);
    setNotice(null);
    try {
      await callWaiter({
        code,
        guestKey,
        reason: reason ?? undefined,
      });
      setNotice(dict.callSent);
      setReason(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setPending(null);
    }
  }

  async function onSubmitOrder() {
    if (!canAct || !guestKey || pending) return;
    if (selected.length === 0) {
      setError(dict.orderNothingSelected);
      return;
    }
    setPending("order");
    setError(null);
    setNotice(null);
    try {
      await submitOrder({
        code,
        guestKey,
        lines: selected.map((line) => ({
          itemId: line.item._id,
          qty: line.qty,
        })),
        note: note.trim() || undefined,
      });
      setNotice(dict.orderSent);
      setQty({});
      setNote("");
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setPending(null);
    }
  }

  const venueName = available ? state.businessName : "";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {dict.heading}
        </h1>
        {venueName ? (
          <p className="text-sm text-muted-foreground">{venueName}</p>
        ) : null}
      </header>

      {/* Announcements: one polite live region for both the confirmation the
          guest needs ("it left") and any refusal. */}
      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <p className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {/* The live status list is mounted OUTSIDE the availability branch, on
          purpose (§2.8): a guest whose order is still pending when the tablet
          dies is exactly the person who must still see it — and reach the
          withdraw button. Hiding it with the actions would make a pending
          request look like one that vanished. */}
      {guestKey !== null ? (
        <RequestStatusList
          code={code}
          guestKey={guestKey}
          initialRequests={initialRequests}
          overdueMinutes={config?.overdueMinutes ?? FALLBACK_OVERDUE_MINUTES}
        />
      ) : null}

      {!acceptingRequests ? (
        // THE single disabled state. Two causes, one calm message, no hint of
        // which — the remedy is identical (§2.6). This can flip true→false
        // while the guest is already on the page (a stale heartbeat, a pause),
        // so it is a live region: a guest who is not looking at the screen
        // still has to learn the order has nowhere to go (TASK-70b QA).
        <section
          role="status"
          aria-live="polite"
          className="rounded-xl border border-border bg-muted/40 px-5 py-6"
        >
          <h2 className="text-base font-medium">{dict.unavailableTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {dict.unavailableBody}
          </p>
        </section>
      ) : guestKey === null ? (
        <section className="rounded-xl border border-border bg-muted/40 px-5 py-6">
          <h2 className="text-base font-medium">{dict.unavailableTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {dict.errorNoTable}
          </p>
        </section>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{dict.intro}</p>

          {config?.callWaiterEnabled ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-medium">{dict.callHeading}</h2>
              {config.reasons.length > 0 ? (
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="sr-only">{dict.callReasonLegend}</legend>
                  {config.reasons.map((chip) => {
                    const active = reason === chip;
                    return (
                      <button
                        key={chip}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setReason(active ? null : chip)}
                        className={cn(
                          "min-h-11 rounded-full border px-4 text-sm transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </fieldset>
              ) : null}
              <button
                type="button"
                onClick={onCall}
                disabled={pending !== null}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-medium text-primary-foreground disabled:opacity-60"
              >
                <BellRing aria-hidden className="size-5" />
                {pending === "call" ? dict.callSending : dict.callAction}
              </button>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-medium">{dict.orderHeading}</h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {dict.orderEmptyItems}
              </p>
            ) : (
              <>
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {items.map((item) => {
                    const value = qty[item._id] ?? 0;
                    return (
                      <li
                        key={item._id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {item.name}
                          </p>
                          {item.priceRsd !== undefined ? (
                            <p className="text-xs text-muted-foreground">
                              {fmt(dict.itemPrice, { price: item.priceRsd })}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => bump(item._id, -1)}
                            disabled={value === 0 || pending !== null}
                            aria-label={fmt(dict.qtyDecrease, {
                              name: item.name,
                            })}
                            className="inline-flex size-11 items-center justify-center rounded-lg border border-border disabled:opacity-40"
                          >
                            <Minus aria-hidden className="size-4" />
                          </button>
                          <span className="w-9 text-center text-sm tabular-nums">
                            {fmt(dict.qtyValue, { qty: value })}
                          </span>
                          <button
                            type="button"
                            onClick={() => bump(item._id, 1)}
                            disabled={pending !== null}
                            aria-label={fmt(dict.qtyIncrease, {
                              name: item.name,
                            })}
                            className="inline-flex size-11 items-center justify-center rounded-lg border border-border disabled:opacity-40"
                          >
                            <Plus aria-hidden className="size-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{dict.orderNoteLabel}</span>
                  <input
                    type="text"
                    value={note}
                    maxLength={280}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={dict.orderNotePlaceholder}
                    className="min-h-11 rounded-lg border border-border bg-background px-3"
                  />
                </label>

                <button
                  type="button"
                  onClick={onSubmitOrder}
                  disabled={pending !== null || selected.length === 0}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-medium text-primary-foreground disabled:opacity-60"
                >
                  <Send aria-hidden className="size-5" />
                  {pending === "order" ? dict.orderSending : dict.orderAction}
                </button>
                <p className="text-xs text-muted-foreground">
                  {fmt(dict.selectedSummary, { count: selected.length })}
                </p>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
