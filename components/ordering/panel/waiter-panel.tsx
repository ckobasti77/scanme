"use client";

// TASK-68 — the waiter panel at /panel/[venueCode] (RFC-004 §2.7, §2.10).
//
// One hand, a loud room, a cheap 10" tablet or a 375px phone. Everything on
// this screen is sized for a thumb (every control is at least 48px tall) and
// written to be read in a glance. No decoration, no motion beyond a pulse on
// the one badge that must be noticed across the bar.
//
// WHAT THIS FILE DOES NOT DO: it adds no server logic. Every tap calls a
// mutation that already exists — openShift/heartbeat/pause/resume/closeShift
// (TASK-65) and accept/enroute/complete (TASK-67) — and every row it renders
// comes from one subscription, orderingPanel.panelView. The queue's order is
// lib/ordering-panel-queue.ts, a pure function: overdue tables first, then the
// table that has waited longest, grouped by cardId.
//
// THE GESTURE. Mobile browsers will not play audio without a user gesture. The
// PIN submit tap is that gesture (§2.10): unlockAlertAudio() runs synchronously
// inside the submit handler, before the network call. A tablet that reloads
// into an open shift never tapped, so it gets a one-button banner instead.
//
// THE HEARTBEAT is the panel's half of §2.6: a beat every HEARTBEAT_MS while
// mounted, plus one the instant the tab becomes visible again (a woken tablet
// un-stales itself immediately rather than at the next tick). When the beat is
// refused — the shift closed, or another device re-entered the PIN and took the
// bearer — the panel drops to the PIN screen with a one-line reason. It never
// keeps showing a queue it can no longer act on.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertTriangle,
  BellRing,
  Check,
  Footprints,
  LockKeyhole,
  Pause,
  Play,
  UtensilsCrossed,
  Volume2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PanelRequestRow, PanelViewResult } from "@/convex/orderingPanel";
import { REQUEST_ERROR } from "@/convex/lib/orderingErrors";
import { fmt } from "@/lib/i18n/format";
import { orderingPanelSr as dict } from "@/lib/i18n/sr/ordering-panel";
import {
  createSeenRequests,
  detectNewRequests,
  groupQueueByTable,
  isLate,
} from "@/lib/ordering-panel-queue";
import {
  isAlertAudioUnlocked,
  playAlert,
  unlockAlertAudio,
  vibrateAlert,
} from "@/lib/ordering-panel-alert";
import { cn } from "@/lib/utils";

// Placeholder awaiting the owner (RFC-004 §5 Q5): four beats per STALE_MS.
const HEARTBEAT_MS = 15_000;

// The TASK-65 machine codes, restated here as literals: convex/orderingShifts.ts
// imports _generated/server and must not enter the browser bundle (the same
// reason convex/lib/orderingErrors.ts is dependency-free).
const SHIFT_CODE = {
  invalidPin: "shift/invalid_pin",
  locked: "shift/locked",
  notFound: "shift/not_found",
  invalidBearer: "shift/invalid_bearer",
  noOpenShift: "shift/no_open_shift",
} as const;

type OpenView = Extract<PanelViewResult, { status: "open" }>;
type SignedOutReason = "closed" | "adopted";

function errorCode(error: unknown): string | null {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : null;
}

/** A refusal that means "this bearer no longer mans an open shift". */
function isShiftGone(code: string | null): SignedOutReason | null {
  if (code === SHIFT_CODE.noOpenShift || code === REQUEST_ERROR.unavailable) {
    return "closed";
  }
  if (code === SHIFT_CODE.invalidBearer) return "adopted";
  return null;
}

export interface WaiterPanelProps {
  code: string;
  businessName: string;
  /** The verified cookie bearer, only when it still mans the open shift. */
  initialBearer: string | null;
  /** The server render of the open panel, for the first paint. */
  initialView: OpenView | null;
}

export function WaiterPanel({
  code,
  businessName,
  initialBearer,
  initialView,
}: WaiterPanelProps) {
  const [bearer, setBearer] = useState<string | null>(initialBearer);
  const [signedOut, setSignedOut] = useState<SignedOutReason | null>(null);

  const onSignedOut = useCallback(async (reason: SignedOutReason) => {
    setBearer(null);
    setSignedOut(reason);
    try {
      await fetch(`/panel/${code}/session`, { method: "DELETE" });
    } catch {
      // The cookie is useless either way; the next PIN login overwrites it.
    }
  }, [code]);

  if (bearer === null) {
    return (
      <PinScreen
        code={code}
        businessName={businessName}
        notice={
          signedOut === "closed"
            ? dict.signedOutClosed
            : signedOut === "adopted"
              ? dict.signedOutAdopted
              : null
        }
        onOpened={(nextBearer) => {
          setSignedOut(null);
          setBearer(nextBearer);
        }}
      />
    );
  }

  return (
    <ShiftPanel
      key={bearer}
      code={code}
      bearer={bearer}
      businessName={businessName}
      initialView={bearer === initialBearer ? initialView : null}
      onSignedOut={onSignedOut}
    />
  );
}

// -----------------------------------------------------------------------------
// PIN screen
// -----------------------------------------------------------------------------

const PIN_ERROR: Record<string, string> = {
  [SHIFT_CODE.invalidPin]: dict.errorInvalidPin,
  [SHIFT_CODE.locked]: dict.errorLocked,
  [SHIFT_CODE.notFound]: dict.errorNotFound,
};

function PinScreen({
  code,
  businessName,
  notice,
  onOpened,
}: {
  code: string;
  businessName: string;
  notice: string | null;
  onOpened: (bearer: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || pin.length === 0) return;
    // THE gesture (§2.10): synchronously, before any await.
    const unlocking = unlockAlertAudio();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/panel/${code}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        bearer?: string;
        code?: string;
      };
      if (!response.ok || !body.ok || typeof body.bearer !== "string") {
        setError(
          (body.code && PIN_ERROR[body.code]) || dict.errorUnknown,
        );
        return;
      }
      await unlocking;
      setPin("");
      onOpened(body.bearer);
    } catch {
      setError(dict.errorUnknown);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{businessName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {dict.pinHeading}
        </h1>
        <p className="text-sm text-muted-foreground">{dict.pinIntro}</p>
      </header>

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{dict.pinLabel}</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={pin}
            maxLength={32}
            onChange={(event) => setPin(event.target.value)}
            className="min-h-14 rounded-xl border border-border bg-background px-4 text-center text-2xl tracking-[0.5em]"
          />
        </label>
        <button
          type="submit"
          disabled={pending || pin.length === 0}
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-lg font-medium text-primary-foreground disabled:opacity-60"
        >
          <LockKeyhole aria-hidden className="size-5" />
          {pending ? dict.pinSubmitting : dict.pinSubmit}
        </button>
      </form>
    </main>
  );
}

// -----------------------------------------------------------------------------
// The open shift: header, alerts, the live queue
// -----------------------------------------------------------------------------

const ACTION_ERROR: Record<string, string> = {
  [REQUEST_ERROR.invalidTransition]: dict.errorInvalidTransition,
  [REQUEST_ERROR.requestNotFound]: dict.errorRequestNotFound,
};

const timeFormat = new Intl.DateTimeFormat("sr-Latn", {
  hour: "2-digit",
  minute: "2-digit",
});

function ShiftPanel({
  code,
  bearer,
  businessName,
  initialView,
  onSignedOut,
}: {
  code: string;
  bearer: string;
  businessName: string;
  initialView: OpenView | null;
  onSignedOut: (reason: SignedOutReason) => void;
}) {
  const live = useQuery(api.orderingPanel.panelView, { code, bearer });
  const view: OpenView | null =
    live === undefined
      ? initialView
      : live.status === "open"
        ? live
        : null;

  const heartbeat = useMutation(api.orderingShifts.heartbeat);
  const pauseOrdering = useMutation(api.orderingShifts.pauseOrdering);
  const resumeOrdering = useMutation(api.orderingShifts.resumeOrdering);
  const closeShift = useMutation(api.orderingShifts.closeShift);
  const acceptRequest = useMutation(api.orderingStatus.acceptRequest);
  const markEnroute = useMutation(api.orderingStatus.markEnroute);
  const completeRequest = useMutation(api.orderingStatus.completeRequest);

  // The subscription itself says the bearer no longer mans an open shift.
  useEffect(() => {
    if (live === undefined || live.status === "open") return;
    onSignedOut(live.status === "no_shift" ? "closed" : "adopted");
  }, [live, onSignedOut]);

  // Heartbeat (§2.6): on mount, every HEARTBEAT_MS, and on becoming visible.
  useEffect(() => {
    let disposed = false;
    const beat = async () => {
      try {
        await heartbeat({ code, bearer });
      } catch (cause) {
        if (disposed) return;
        const gone = isShiftGone(errorCode(cause));
        if (gone) onSignedOut(gone);
      }
    };
    void beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, bearer, heartbeat, onSignedOut]);

  // Screen Wake Lock (§2.10) while the shift is open on this device.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;
    const request = async () => {
      try {
        if (!("wakeLock" in navigator)) return;
        if (document.visibilityState !== "visible") return;
        const next = await navigator.wakeLock.request("screen");
        if (disposed) void next.release();
        else sentinel = next;
      } catch {
        // Not granted (battery saver, unsupported): best-effort by design.
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!sentinel || sentinel.released) void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, []);

  // Sound + vibration on a NEW sent request (§2.10), announced once.
  const seenRef = useRef(createSeenRequests());
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!view) return;
    const fresh = detectNewRequests(seenRef.current, view.requests);
    if (fresh.length === 0) return;
    playAlert();
    vibrateAlert();
    setAnnouncement(
      fmt(dict.newRequestAnnouncement, {
        table: Array.from(new Set(fresh.map((r) => r.tableLabel))).join(", "),
      }),
    );
  }, [view]);

  // Lazy: after a PIN login this component mounts client-side only (the
  // context is already running → true); after a reload it hydrates, and the
  // module is fresh on both server and client → false on both. Either way the
  // first render agrees with the server's.
  const [audioOn, setAudioOn] = useState(() => isAlertAudioUnlocked());

  const [pendingId, setPendingId] = useState<Id<"serviceRequests"> | null>(
    null,
  );
  const [rowError, setRowError] = useState<{
    id: Id<"serviceRequests">;
    message: string;
  } | null>(null);
  const [shiftPending, setShiftPending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);

  async function runAction(
    requestId: Id<"serviceRequests">,
    action: (args: {
      code: string;
      bearer: string;
      requestId: Id<"serviceRequests">;
    }) => Promise<unknown>,
  ) {
    if (pendingId) return;
    setPendingId(requestId);
    setRowError(null);
    try {
      await action({ code, bearer, requestId });
    } catch (cause) {
      const codeOf = errorCode(cause);
      const gone = isShiftGone(codeOf);
      if (gone) {
        onSignedOut(gone);
        return;
      }
      setRowError({
        id: requestId,
        message: (codeOf && ACTION_ERROR[codeOf]) || dict.errorUnknown,
      });
    } finally {
      setPendingId(null);
    }
  }

  async function runShiftAction(action: () => Promise<unknown>) {
    if (shiftPending) return;
    setShiftPending(true);
    setShiftError(null);
    try {
      await action();
    } catch (cause) {
      const gone = isShiftGone(errorCode(cause));
      if (gone) {
        onSignedOut(gone);
        return;
      }
      setShiftError(dict.errorUnknown);
    } finally {
      setShiftPending(false);
    }
  }

  async function onClose() {
    await runShiftAction(async () => {
      await closeShift({ code, bearer });
      onSignedOut("closed");
    });
  }

  const groups = useMemo(
    () => (view ? groupQueueByTable(view.requests) : []),
    [view],
  );

  if (!view) {
    // Only between "the subscription said not open" and the parent swapping
    // this component out — one render at most.
    return null;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {view.businessName || businessName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {fmt(dict.staffLine, { label: view.staffLabel })}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() =>
                runShiftAction(() =>
                  view.paused
                    ? resumeOrdering({ code, bearer })
                    : pauseOrdering({ code, bearer }),
                )
              }
              disabled={shiftPending}
              aria-pressed={view.paused}
              className={cn(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-base font-medium disabled:opacity-60",
                view.paused
                  ? "border-emerald-700/40 bg-emerald-600 text-white"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              {view.paused ? (
                <Play aria-hidden className="size-5" />
              ) : (
                <Pause aria-hidden className="size-5" />
              )}
              {view.paused ? dict.resumeAction : dict.pauseAction}
            </button>
            {confirmClose ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={shiftPending}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-destructive px-4 text-base font-medium text-white disabled:opacity-60"
                >
                  {shiftPending ? dict.closing : dict.closeConfirm}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  disabled={shiftPending}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background px-4 text-base font-medium disabled:opacity-60"
                >
                  {dict.closeCancel}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClose(true)}
                disabled={shiftPending}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background px-4 text-base font-medium hover:bg-muted disabled:opacity-60"
              >
                {dict.closeAction}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 empty:hidden">
          {view.stale ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {dict.staleBadge}
            </p>
          ) : null}
          {view.paused ? (
            <p className="rounded-lg border border-amber-600/40 bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-950 dark:text-amber-200">
              {dict.pausedBadge}
            </p>
          ) : null}
          {shiftError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {shiftError}
            </p>
          ) : null}
          {!audioOn ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span>{dict.soundBannerBody}</span>
              <button
                type="button"
                onClick={async () => {
                  const ok = await unlockAlertAudio();
                  setAudioOn(ok);
                  if (ok) playAlert();
                }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground"
              >
                <Volume2 aria-hidden className="size-5" />
                {dict.soundBannerAction}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* The one assertive region: a waiter not looking at the screen hears
          the ping and the reader says which table. */}
      <p aria-live="assertive" className="sr-only">
        {announcement}
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">{dict.queueHeading}</h2>
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            {dict.queueEmpty}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {groups.map((group) => (
              <li
                key={group.cardId}
                className={cn(
                  "flex min-w-0 flex-col gap-3 rounded-2xl border p-4",
                  group.hasOverdue
                    ? "border-destructive/50 bg-destructive/5"
                    : "border-border bg-background",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="truncate text-2xl font-semibold tracking-tight">
                    {group.tableLabel}
                  </h3>
                  {group.hasOverdue ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-3 py-1 text-sm font-semibold text-white motion-safe:animate-pulse">
                      <AlertTriangle aria-hidden className="size-4" />
                      {dict.overdueBadge}
                    </span>
                  ) : null}
                </div>
                <ul className="flex flex-col gap-3">
                  {group.requests.map((request) => (
                    <RequestCard
                      key={request._id}
                      request={request}
                      pending={pendingId === request._id}
                      disabled={pendingId !== null}
                      error={
                        rowError?.id === request._id ? rowError.message : null
                      }
                      onAccept={() => runAction(request._id, acceptRequest)}
                      onEnroute={() => runAction(request._id, markEnroute)}
                      onComplete={() => runAction(request._id, completeRequest)}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// -----------------------------------------------------------------------------
// One request inside a table group
// -----------------------------------------------------------------------------

const STATUS_LABEL: Record<PanelRequestRow["status"], string> = {
  sent: dict.statusSent,
  accepted: dict.statusAccepted,
  enroute: dict.statusEnroute,
};

const STATUS_PILL: Record<PanelRequestRow["status"], string> = {
  sent: "border-border bg-muted text-foreground",
  accepted:
    "border-amber-600/30 bg-amber-500/15 text-amber-950 dark:text-amber-200",
  enroute:
    "border-emerald-600/30 bg-emerald-500/15 text-emerald-950 dark:text-emerald-200",
};

function RequestCard({
  request,
  pending,
  disabled,
  error,
  onAccept,
  onEnroute,
  onComplete,
}: {
  request: PanelRequestRow;
  pending: boolean;
  disabled: boolean;
  error: string | null;
  onAccept: () => void;
  onEnroute: () => void;
  onComplete: () => void;
}) {
  const late = isLate(request);
  const button =
    "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-base font-medium disabled:opacity-60";
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border px-4 py-3",
        late ? "border-destructive/40 bg-background" : "border-border bg-background",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {request.kind === "order" ? (
            <UtensilsCrossed aria-hidden className="size-5 shrink-0" />
          ) : (
            <BellRing aria-hidden className="size-5 shrink-0" />
          )}
          <p className="text-base font-semibold">
            {request.kind === "order" ? dict.kindOrder : dict.kindCall}
          </p>
          <time
            suppressHydrationWarning
            dateTime={new Date(request.createdAt).toISOString()}
            className="text-sm tabular-nums text-muted-foreground"
          >
            {timeFormat.format(request.createdAt)}
          </time>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-sm font-medium",
            STATUS_PILL[request.status],
          )}
        >
          {STATUS_LABEL[request.status]}
        </span>
      </div>

      {request.items.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-base">
          {request.items.map((line, index) => (
            <li key={`${request._id}-${index}`}>
              {fmt(dict.line, { qty: line.qty, name: line.name })}
            </li>
          ))}
        </ul>
      ) : null}
      {request.reason ? (
        <p className="text-base">
          {fmt(dict.reasonLine, { reason: request.reason })}
        </p>
      ) : null}
      {request.note ? (
        <p className="text-sm text-muted-foreground">
          {fmt(dict.noteLine, { note: request.note })}
        </p>
      ) : null}

      {error ? (
        <p aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {request.status === "sent" ? (
          <button
            type="button"
            onClick={onAccept}
            disabled={disabled}
            className={cn(button, "bg-primary text-primary-foreground")}
          >
            <Check aria-hidden className="size-5" />
            {pending ? dict.working : dict.acceptAction}
          </button>
        ) : null}
        {request.status === "accepted" ? (
          <button
            type="button"
            onClick={onEnroute}
            disabled={disabled}
            className={cn(button, "bg-primary text-primary-foreground")}
          >
            <Footprints aria-hidden className="size-5" />
            {pending ? dict.working : dict.enrouteAction}
          </button>
        ) : null}
        {request.status === "accepted" || request.status === "enroute" ? (
          <button
            type="button"
            onClick={onComplete}
            disabled={disabled}
            className={cn(button, "border border-border bg-background hover:bg-muted")}
          >
            <Check aria-hidden className="size-5" />
            {pending ? dict.working : dict.completeAction}
          </button>
        ) : null}
      </div>
    </li>
  );
}
