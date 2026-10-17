// ScanMe Menu V1 — page slugs. A page lives at /[slug]/meni/[stranica]; its
// slug is derived once from the name and NEVER changes (renaming a page keeps
// printed links and QR codes working). Words used by Menu routes are reserved.

import { foldSerbian } from "./text";

/** The slug of the automatically created "Kompletan meni" page. */
export const DEFAULT_PAGE_SLUG = "glavni";

/**
 * Sub-routes of /[slug]/meni and words kept for later steps (K01 §7.1).
 * `glavni` is reserved for the default page only.
 */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  DEFAULT_PAGE_SLUG,
  "editor",
  "room-service",
  "zahtevi",
  "rezervacija",
  "api",
  "konobar",
  "pregled",
  "_next",
]);

export const PAGE_SLUG_MAX = 60;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidPageSlug(slug: string): boolean {
  return slug.length <= PAGE_SLUG_MAX && SLUG_PATTERN.test(slug);
}

/** "Vinska karta — crvena" → "vinska-karta-crvena"; empty when nothing is left. */
export function slugifyPageName(name: string): string {
  const base = foldSerbian(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, PAGE_SLUG_MAX).replace(/-+$/g, "");
}

/**
 * A free, non-reserved slug for a new page: the slugified name, or `stranica`
 * when the name has no Latin letters or digits, suffixed -2, -3… on collision.
 */
export function uniquePageSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugifyPageName(name) || "stranica";
  const free = (candidate: string) =>
    !taken.has(candidate) && !RESERVED_PAGE_SLUGS.has(candidate);
  if (free(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, PAGE_SLUG_MAX - tail.length).replace(/-+$/g, "")}${tail}`;
    if (free(candidate)) return candidate;
  }
}
