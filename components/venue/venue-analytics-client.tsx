"use client";

// TASK-43 — the analytics beacon mounted by VenueTemplate on PUBLIC renders
// only (the editor preview never mounts it). One page-view ping on mount, then
// an IntersectionObserver over the block wrappers (each carries
// data-venue-block={type}) batches "which blocks the visitor actually reached"
// into a single debounced call per pageload. AGGREGATE ONLY (RFC-001 §2.10):
// nothing identifying leaves the browser — no ids, no cookies, just the slugs
// already in the URL and a list of block-type strings.

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

const FLUSH_DELAY_MS = 2000;

export function VenueAnalyticsClient({
  businessSlug,
  eventSlug,
}: {
  businessSlug: string;
  eventSlug: string;
}) {
  const recordView = useMutation(api.venueAnalytics.recordView);
  const recordBlockViews = useMutation(api.venueAnalytics.recordBlockViews);
  const viewFired = useRef(false);

  useEffect(() => {
    if (!viewFired.current) {
      viewFired.current = true;
      void recordView({ businessSlug, eventSlug }).catch(() => {});
    }

    const seen = new Set<string>();
    const queue = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (queue.size === 0) return;
      const blockTypes = [...queue];
      queue.clear();
      void recordBlockViews({ businessSlug, eventSlug, blockTypes }).catch(
        () => {},
      );
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const type = entry.target.getAttribute("data-venue-block");
          if (!type || seen.has(type)) continue;
          seen.add(type);
          queue.add(type);
          observer.unobserve(entry.target);
        }
        if (queue.size > 0) {
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(flush, FLUSH_DELAY_MS);
        }
      },
      { threshold: 0.4 },
    );
    for (const element of document.querySelectorAll("[data-venue-block]")) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
    };
  }, [businessSlug, eventSlug, recordView, recordBlockViews]);

  return null;
}
