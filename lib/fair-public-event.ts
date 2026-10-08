// Public fair routes always use the public event slug. DEV TEST events keep a
// `test-` data slug (lib/fair-map fairMapEventSlugCandidates) that must never
// leak into a link a visitor opens or shares.
export function fairPublicEventSlug(dataSlug: string): string {
  return dataSlug.startsWith("test-") ? dataSlug.slice("test-".length) : dataSlug;
}

type FairNavigationCandidate = {
  publicSlug: string;
  event: { startsAt: number; endsAt: number } | null;
};

/** The event a visitor should land on: live, else next upcoming, else latest ended. */
export function fairNavigationEvent<T extends FairNavigationCandidate>(events: T[], now: number): T | undefined {
  const withDates = events.filter(
    (event): event is T & { event: NonNullable<T["event"]> } => event.event !== null,
  );
  const live = withDates.find((event) => event.event.startsAt <= now && now < event.event.endsAt);
  if (live) return live;
  const upcoming = withDates
    .filter((event) => event.event.startsAt > now)
    .sort((left, right) => left.event.startsAt - right.event.startsAt)[0];
  if (upcoming) return upcoming;
  const latest = [...withDates].sort((left, right) => right.event.endsAt - left.event.endsAt)[0];
  return latest ?? events.find((event) => event.publicSlug === "elektromobilnost-2026") ?? events[0];
}
