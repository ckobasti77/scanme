"use client";

import { useConvex } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { StandHoursData, StandHoursState } from "@/lib/admin-v2/hall/types";

// ADMIN v3 V3 — the hourly read of one fair day (fairEventAnalytics.getEventStandHours)
// behind the Vremeplov and the layers of the hall. It is never on a timer: it
// reads when the hall asks for a day (the day it opens with, a chosen day,
// „Premotaj dan“ of the open day). A finished day does not change, so it is
// kept for as long as the page is open; the open day is read again on demand
// and its previous numbers stay on the screen until the new ones arrive.

/** A read that has not answered in this long (ms) counts as failed, so „Pokušaj ponovo“ and a replay can ask again. */
const READ_TIMEOUT_MS = 15_000;

/** Finished days, by `eventId:dateKey`. */
const finished = new Map<string, StandHoursData>();

type Read = { key: string | null; dateKey: string | null; data: StandHoursData | undefined; error: boolean };

/** `todayKey`: the Belgrade day of the analytics read; a day before it is finished. */
export function useStandHours(eventId: Id<"fairEvents">, todayKey: string | undefined): StandHoursState {
  const convex = useConvex();
  const [read, setRead] = useState<Read>({ key: null, dateKey: null, data: undefined, error: false });
  /** The same state for `request`, which decides before React has rendered the previous call. */
  const now = useRef(read);
  /** The day a read is on the way for, and its ticket: an older answer that arrives later is dropped. */
  const pending = useRef<{ key: string; ticket: number } | null>(null);
  const tickets = useRef(0);

  const request = useCallback(
    (dateKey: string, fresh = false) => {
      const put = (next: Read) => {
        now.current = next;
        setRead(next);
      };
      const key = `${eventId}:${dateKey}`;
      const kept = finished.get(key);
      if (kept) {
        pending.current = null;
        if (now.current.key !== key || now.current.data !== kept) put({ key, dateKey, data: kept, error: false });
        return;
      }
      const same = now.current.key === key;
      // The same day again asks the server only for „read it anew“, and never while its read is on the way.
      if (same && (pending.current?.key === key || !fresh)) return;
      const ticket = (tickets.current += 1);
      pending.current = { key, ticket };
      put(same ? { ...now.current, error: false } : { key, dateKey, data: undefined, error: false });
      const timer = window.setTimeout(() => {
        if (pending.current?.ticket !== ticket) return;
        pending.current = null;
        put({ ...now.current, error: true });
      }, READ_TIMEOUT_MS);
      convex.query(api.fairEventAnalytics.getEventStandHours, { eventId, dateKey, at: Date.now() }).then(
        (data) => {
          window.clearTimeout(timer);
          if (pending.current?.ticket !== ticket) return;
          pending.current = null;
          if (todayKey !== undefined && dateKey < todayKey) finished.set(key, data);
          put({ key, dateKey, data, error: false });
        },
        () => {
          window.clearTimeout(timer);
          if (pending.current?.ticket !== ticket) return;
          pending.current = null;
          put({ ...now.current, error: true });
        },
      );
    },
    [convex, eventId, todayKey],
  );

  return useMemo(() => ({ dateKey: read.dateKey, data: read.data, error: read.error, request }), [read, request]);
}
