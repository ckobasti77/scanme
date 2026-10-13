"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";

// ADMIN v3 V1 — dev previews only (`?kasni=<ms>`): the fixtures of a preview
// are there at once, so the skeleton and its handover to the content are never
// on the screen. This holds the skeleton for `ms`, then shows the content, the
// way a read of the real admin does.

export function PreviewDelay({ ms, children }: { ms: number; children: ReactNode }) {
  const [ready, setReady] = useState(ms <= 0);
  useEffect(() => {
    if (ms <= 0) return;
    const timer = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return ready ? children : <AdminPanel><AdminLoadingState shape="table" /></AdminPanel>;
}
