"use client";

import { useEffect } from "react";

// The last rendered event shell's id and name per event slug on this device,
// so a route's loading.tsx can show the same shell (event-shell-loading.tsx).

const knownShells = new Map<string, { eventId: string; eventName: string }>();

export function knownFairShell(eventSlug: string) {
  return knownShells.get(eventSlug);
}

export function RememberFairShell({ eventSlug, eventId, eventName }: { eventSlug: string; eventId: string; eventName: string }) {
  useEffect(() => {
    knownShells.set(eventSlug, { eventId, eventName });
  }, [eventSlug, eventId, eventName]);
  return null;
}
