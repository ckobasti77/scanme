"use client";

import { useCallback, useEffect, useState } from "react";
import type { FairPassportProgress, FairPassportState } from "@/lib/fair-contract";

type PassportStatus = { status: "loading" | "ready" | "error"; progress: FairPassportProgress[] | null };

/** Read the existing visitor passport; choosing a map brand never grants a stamp. */
export function usePassportProgress(eventSlug: string, enabled: boolean) {
  const [state, setState] = useState<PassportStatus>({ status: "loading", progress: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/fair/passport", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventSlug }),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as { ok: boolean; value?: FairPassportState | null };
        if (!response.ok || !body.ok) throw new Error("passport");
        setState({ status: "ready", progress: body.value?.progress ?? [] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error", progress: null });
      });
    return () => controller.abort();
  }, [enabled, eventSlug, attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading", progress: null });
    setAttempt((value) => value + 1);
  }, []);
  return { ...state, retry };
}
