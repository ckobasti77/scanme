"use client";

import { useCallback, useEffect, useRef } from "react";

const FAIR_HISTORY_LAYER_KEY = "__scanmeFairLayer";

function historyState(): Record<string, unknown> {
  const current: unknown = window.history.state;
  return typeof current === "object" && current !== null && !Array.isArray(current)
    ? current as Record<string, unknown>
    : {};
}

function layerId(kind: string) {
  return `${kind}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

/**
 * Gives a local sheet, disclosure or selection mode its own browser-history
 * entry. The first Back closes the local layer instead of leaving the route.
 */
export function useFairHistoryLayer(
  open: boolean,
  onDismiss: () => void,
  kind: string,
) {
  const dismissRef = useRef(onDismiss);
  const entryRef = useRef<string | null>(null);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open || entryRef.current !== null) return;

    const id = layerId(kind);
    entryRef.current = id;
    window.history.pushState(
      { ...historyState(), [FAIR_HISTORY_LAYER_KEY]: id },
      "",
    );

    const handlePopState = () => {
      const currentId = entryRef.current;
      if (currentId === null || historyState()[FAIR_HISTORY_LAYER_KEY] === currentId) return;
      entryRef.current = null;
      dismissRef.current();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [kind, open]);

  return useCallback((afterClose?: () => void) => {
    const id = entryRef.current;
    if (id !== null && historyState()[FAIR_HISTORY_LAYER_KEY] === id) {
      if (afterClose) {
        window.addEventListener(
          "popstate",
          () => window.queueMicrotask(afterClose),
          { once: true },
        );
      }
      window.history.back();
      return;
    }

    entryRef.current = null;
    dismissRef.current();
    afterClose?.();
  }, []);
}
