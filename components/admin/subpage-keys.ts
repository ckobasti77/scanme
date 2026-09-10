// The per-location admin subpage catalog (Links / Review / Venue / Meni), shared
// by the client view (location-admin.tsx) and the server route
// (app/admin/customers/[businessId]/[service]/page.tsx).
//
// This module is deliberately NOT "use client". A const exported from a
// "use client" module reaches a Server Component as a client-reference proxy, so
// the server route's `SUBPAGE_ORDER.includes(...)` guard would throw
// "includes is not a function". Keeping the plain data/type here lets the server
// route import the real array while the client view imports the same source.
export type SubpageKey = "links" | "review" | "venue" | "menu";

export const SUBPAGE_ORDER: readonly SubpageKey[] = [
  "links",
  "review",
  "venue",
  "menu",
];
