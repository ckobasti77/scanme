"use client";

import { useConvex, type ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType, type OptionalRestArgs } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";

// Admin UX A4 — one-shot Convex reads refreshed on a timer while the tab is
// visible (A0 nalaz 0.5). Scan counters change with every scan, so a reactive
// useQuery over them would re-run for every scan in every open admin tab; this
// reads once, then every `intervalMs` (default 60 s), again when the tab comes
// back into view, and on `refresh()` (after the screen's own mutation).

export type PolledState<T> = {
  /** undefined = not loaded yet for the current key. */
  data: T | undefined;
  error: unknown;
  refresh: () => void;
};

const DEFAULT_INTERVAL_MS = 60_000;

/** `key` identifies the read (null = skip); a new key drops the data of the old one. */
export function usePolled<T>(key: string | null, fetcher: (convex: ConvexReactClient) => Promise<T>, intervalMs = DEFAULT_INTERVAL_MS): PolledState<T> {
  const convex = useConvex();
  const [state, setState] = useState<{ key: string | null; data?: T; error?: unknown }>({ key: null });
  const [round, setRound] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const run = () => {
      if (document.visibilityState === "hidden") return;
      fetcherRef.current(convex).then(
        (data) => {
          if (!cancelled) setState({ key, data });
        },
        (error: unknown) => {
          if (!cancelled) setState((previous) => ({ key, data: previous.key === key ? previous.data : undefined, error }));
        },
      );
    };
    run();
    const timer = setInterval(run, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [convex, key, intervalMs, round]);
  const refresh = useCallback(() => setRound((value) => value + 1), []);
  const current = state.key === key ? state : null;
  return { data: current?.data, error: current?.error, refresh };
}

/** usePolled for one public Convex query; `"skip"` reads nothing. */
export function usePolledQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query> | "skip",
  intervalMs = DEFAULT_INTERVAL_MS,
): PolledState<FunctionReturnType<Query>> {
  const key = args === "skip" ? null : `${getFunctionName(query)}:${JSON.stringify(args)}`;
  return usePolled(key, (convex) => convex.query(query, ...([args] as OptionalRestArgs<Query>)), intervalMs);
}
