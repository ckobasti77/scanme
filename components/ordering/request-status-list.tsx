"use client";

// TASK-67 — the guest's live status list (RFC-004 §2.5, §2.6, §2.8).
//
// Poslato → Prihvaćeno → Stiže, straight off a Convex subscription: the waiter
// taps Prihvati on the tablet and this card changes on the guest's phone with
// no reload and no polling. The server render seeds it (`initialRequests`) so
// the first paint is already the real state.
//
// TWO RULES THIS FILE MUST NOT BREAK:
//
//  1. It renders even when ordering is UNAVAILABLE. A guest whose order is
//     still pending when the tablet dies is exactly the person who needs to see
//     it — and to reach the withdraw button. This component is therefore
//     mounted outside the disabled state in ordering-guest.tsx, not inside the
//     branch that hides the actions.
//
//  2. `overdue` is read, never computed. There is no timer here, no
//     Date.now(), no "minutes ago" ticking: the flag arrives materialized from
//     the server (convex/orderingStatus.ts) and the subscription delivers it
//     the moment it flips. A countdown rendered here would be a second,
//     divergent source of truth about the same deadline.

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { AlertTriangle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { GuestRequestRow } from "@/convex/orderingStatus";
import { REQUEST_ERROR } from "@/convex/lib/orderingErrors";
import { fmt } from "@/lib/i18n/format";
import { orderingSr as dict } from "@/lib/i18n/sr/ordering";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<GuestRequestRow["status"], string> = {
  sent: dict.statusSent,
  accepted: dict.statusAccepted,
  enroute: dict.statusEnroute,
  completed: dict.statusCompleted,
  withdrawn: dict.statusWithdrawn,
};

// The pill's colour tracks how far along the request is: waiting (neutral),
// a human has it (amber), it is moving (emerald), done/ended (muted).
const STATUS_PILL: Record<GuestRequestRow["status"], string> = {
  sent: "border-border bg-muted text-foreground",
  accepted:
    "border-amber-600/30 bg-amber-500/15 text-amber-900 dark:text-amber-200",
  enroute:
    "border-emerald-600/30 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  completed: "border-border bg-muted text-muted-foreground",
  withdrawn: "border-border bg-muted text-muted-foreground",
};

const WITHDRAW_ERROR: Record<string, string> = {
  [REQUEST_ERROR.notFound]: dict.errorNotFound,
  [REQUEST_ERROR.invalidGuest]: dict.errorInvalidGuest,
  [REQUEST_ERROR.requestNotFound]: dict.errorRequestNotFound,
  [REQUEST_ERROR.notWithdrawable]: dict.errorNotWithdrawable,
};

export interface RequestStatusListProps {
  code: string;
  guestKey: string;
  /** The server render's answer; the subscription below takes over from it. */
  initialRequests: GuestRequestRow[];
  /** The venue's configured window, for the deadline copy. */
  overdueMinutes: number;
}

export function RequestStatusList({
  code,
  guestKey,
  initialRequests,
  overdueMinutes,
}: RequestStatusListProps) {
  const live = useQuery(api.orderingStatus.myRequests, { code, guestKey });
  const requests = live ?? initialRequests;

  const [pending, setPending] = useState<Id<"serviceRequests"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const withdrawRequest = useMutation(api.orderingStatus.withdrawRequest);

  async function onWithdraw(requestId: Id<"serviceRequests">) {
    if (pending) return;
    setPending(requestId);
    setError(null);
    setNotice(null);
    try {
      await withdrawRequest({ code, guestKey, requestId });
      setNotice(dict.withdrawnNotice);
    } catch (cause) {
      setError(
        cause instanceof ConvexError && typeof cause.data === "string"
          ? (WITHDRAW_ERROR[cause.data] ?? dict.errorUnknown)
          : dict.errorUnknown,
      );
    } finally {
      setPending(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-medium">{dict.statusHeading}</h2>

      {/* Every status change announces itself: a guest who is not looking at
          the screen is told when the waiter picks their order up. */}
      <ul aria-live="polite" className="flex flex-col gap-3">
        {requests.map((request) => {
          const label =
            request.kind === "order"
              ? dict.statusKindOrder
              : dict.statusKindCall;
          // The action card (§2.8): only while nobody has taken it.
          const showOverdue = request.overdue && request.status === "sent";
          return (
            <li
              key={request._id}
              className={cn(
                "rounded-xl border px-4 py-3",
                showOverdue
                  ? "border-amber-600/40 bg-amber-500/10"
                  : "border-border bg-background",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{label}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                    STATUS_PILL[request.status],
                  )}
                >
                  {STATUS_LABEL[request.status]}
                </span>
              </div>

              {request.items.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-0.5 text-sm text-muted-foreground">
                  {request.items.map((line, index) => (
                    <li key={`${request._id}-${index}`}>
                      {fmt(dict.statusLine, {
                        qty: line.qty,
                        name: line.name,
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
              {request.reason ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {fmt(dict.statusReason, { reason: request.reason })}
                </p>
              ) : null}
              {request.note ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {fmt(dict.statusNote, { note: request.note })}
                </p>
              ) : null}

              {showOverdue ? (
                <div className="mt-3 border-t border-amber-600/25 pt-3">
                  <p className="flex items-start gap-2 text-sm font-medium">
                    <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {dict.overdueTitle}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {fmt(dict.overdueBody, { minutes: overdueMinutes })}
                  </p>
                  <button
                    type="button"
                    onClick={() => onWithdraw(request._id)}
                    disabled={pending !== null}
                    className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium disabled:opacity-60"
                  >
                    {pending === request._id
                      ? dict.withdrawing
                      : dict.withdrawAction}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </section>
  );
}
