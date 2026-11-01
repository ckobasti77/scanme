"use client";

import { useQuery } from "convex/react";
import { Component, useEffect, useRef, type ReactNode } from "react";
import { useMinuteNow } from "@/components/admin/admin-ui/use-minute-now";
import { api } from "@/convex/_generated/api";
import { pulseFromReads, pulseStore, type PulseRead } from "@/lib/admin-v2/pulse";
import { useAdminSidebarSnapshot } from "./admin-sidebar-store";

// ADMIN v3 V1 — what feeds the Pulse (plan §3.1). Only numbers the admin
// already reads: the HUD of the running fair (scans and leads of the day; an
// event page sends its own, otherwise the frame's read) and the counts of
// „Za reakciju“. Outside a fair and outside the Dashboard the frame reads
// nothing about the work, so the signed-in frame keeps one live subscription
// to the existing `adminDashboard.reactions` with `limit: 1` (no new query).
// The first read is the state, not news; the scans of a read show the minute
// before it (the HUD is read every 60 s).

const FIVE_MINUTES = 5 * 60_000;

type Counts = { total: number; urgent: number };

/** `counts`: undefined while the read is on its way (the last numbers are kept), null when there are none. */
function usePulseFeed(counts: Counts | null | undefined): void {
  const live = useAdminSidebarSnapshot();
  const hud = live.hud ?? live.frameHud;
  const state = hud && hud.state.kind === "live" && !hud.stale ? hud.state : null;
  const source = state ? hud?.href ?? null : null;
  const scansToday = state?.scansToday ?? null;
  const scansCapped = state?.scansCapped ?? false;
  const leadsToday = state?.leadsToday ?? null;
  const total = counts === undefined ? undefined : counts?.total ?? null;
  const urgent = counts === undefined ? undefined : counts?.urgent ?? null;
  const previous = useRef<{ read: PulseRead; source: string | null } | null>(null);

  useEffect(() => {
    const before = previous.current;
    const read: PulseRead = {
      scansToday,
      scansCapped,
      leadsToday,
      total: total === undefined ? before?.read.total ?? null : total,
      urgent: urgent === undefined ? before?.read.urgent ?? null : urgent,
    };
    const now = Date.now();
    // Another event's HUD is another count: its numbers are a state, not a difference.
    const from = before && before.source !== source ? { ...before.read, scansToday: null, leadsToday: null } : before?.read ?? null;
    pulseStore.push(pulseFromReads(from, read, now), now);
    previous.current = { read, source };
  }, [scansToday, scansCapped, leadsToday, total, urgent, source]);
}

function LiveFeed() {
  const now = useMinuteNow();
  const data = useQuery(api.adminDashboard.reactions, { scope: "all", now: Math.floor(now / FIVE_MINUTES) * FIVE_MINUTES, limit: 1 });
  usePulseFeed(data === undefined ? undefined : data.counts);
  return null;
}

function PreviewFeed() {
  usePulseFeed(null);
  return null;
}

class FeedBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The feed of a signed-in admin. A failed read leaves the line flat, never an error. */
export function AdminPulseFeedLive() {
  return <FeedBoundary><LiveFeed /></FeedBoundary>;
}

/** Dev preview: no read; the line beats only from the TEST HUD (`?uzivo=<korak>` on Događaji). */
export function AdminPulseFeedPreview() {
  return <PreviewFeed />;
}
