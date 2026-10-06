"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { AdminEventsEntryView } from "@/components/admin/events/event-frame-view";
import { eventBasePath, eventSectionHref, pickCurrentEvent } from "@/lib/admin-v1/event-sections";

// Admin UX A2 — `/admin/dogadjaji` opens Pregled of the current event: the
// one in progress, else the nearest upcoming, else the last one.

export function AdminEventsEntry() {
  const router = useRouter();
  const events = useQuery(api.fairAdmin.listEvents);
  useEffect(() => {
    if (!events) return;
    const current = pickCurrentEvent(events, Date.now());
    if (current) router.replace(eventSectionHref(eventBasePath(current.slug), "pregled"));
  }, [events, router]);

  return <AdminEventsEntryView empty={Boolean(events && !events.length)} />;
}
