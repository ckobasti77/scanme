// Sajam 2026 — model photos are stored as absolute public URLs
// ("https://scanme.rs/fair/<event>/<file>.webp"). The same files ship in this
// app's public/fair/, so a photo on our own site is rendered from the local
// path: it works before the live domain serves them and next/image needs no
// remote fetch. Any other URL (Convex storage, other hosts) stays unchanged.

const FAIR_PHOTO_ORIGINS = ["https://scanme.rs", "https://www.scanme.rs"];

export function fairLocalPhotoUrl(url: string, siteOrigin?: string): string;
export function fairLocalPhotoUrl(url: string | undefined, siteOrigin?: string): string | undefined;
export function fairLocalPhotoUrl(url: string | undefined, siteOrigin?: string): string | undefined {
  if (!url) return url;
  const origins = siteOrigin ? [...FAIR_PHOTO_ORIGINS, siteOrigin.replace(/\/+$/, "")] : FAIR_PHOTO_ORIGINS;
  for (const origin of origins) {
    if (url.startsWith(`${origin}/fair/`)) return url.slice(origin.length);
  }
  return url;
}

/**
 * D1 (RN N1): true when next/image must not optimize `src` — every absolute
 * URL left after fairLocalPhotoUrl (an exhibitor's own host is not in
 * next.config `images.remotePatterns`: /_next/image answers 400 in production
 * and `next dev` throws). The browser then loads the original directly; a
 * local /fair/... path stays optimized.
 */
export function fairPhotoUnoptimized(src: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(src);
}
