"use client";

import { useEffect, useState } from "react";
import type { FairMyModelState, FairResult } from "@/lib/fair-contract";

// Sajam 2026 — browser side of the same-origin POST gateway (app/api/fair/**).
// The visitor cookie travels on its own; nothing visitor-specific ever goes
// into a URL. A network failure or an unreadable body is SERVICE_UNAVAILABLE,
// so callers only ever branch on `ok` and a stable code.

export async function postFair<T>(path: string, body: unknown): Promise<FairResult<T>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json: unknown = await response.json();
    if (typeof json === "object" && json !== null && "ok" in json) {
      const result = json as FairResult<T>;
      if (result.ok && response.ok) return result;
      if (!result.ok) return result;
    }
  } catch {
    // Offline, aborted or not JSON: handled below like any unavailable service.
  }
  return { ok: false, code: "SERVICE_UNAVAILABLE" };
}

/**
 * Client idempotency key (FAIR_SUBMISSION_ID_PATTERN). getRandomValues works on
 * plain-HTTP LAN previews too, where crypto.randomUUID is missing.
 */
export function newFairSubmissionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type FairModelStateLoad =
  | { status: "loading" }
  | { status: "ready"; value: FairMyModelState }
  | { status: "error" };

/** One read of the visitor's own model state; `enabled: false` for fixture models. */
export function useFairModelState(eventModelId: string, enabled: boolean) {
  const [load, setLoad] = useState<FairModelStateLoad>({ status: enabled ? "loading" : "error" });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void postFair<FairMyModelState>("/api/fair/model-state", { eventModelId }).then((result) => {
      if (!active) return;
      setLoad(result.ok ? { status: "ready", value: result.value } : { status: "error" });
    });
    return () => {
      active = false;
    };
  }, [enabled, eventModelId]);

  return [load, setLoad] as const;
}
