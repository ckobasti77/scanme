// ADMIN v2 — an older link carried the search text of a list in its own
// parameter (`?code=` of QR kodovi, `?smf=` of Proizvodi). The lists now keep
// their search in `q` (the sidebar reads and writes it), so the page
// redirects such a link once: the old parameter becomes `q`, everything else
// in the query string stays.

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** The address to redirect to, or null when the link has no `from` parameter. */
export function legacySearchHref(path: string, params: SearchParams, from: string, to = "q"): string | null {
  const legacy = params[from];
  const value = (Array.isArray(legacy) ? legacy[0] : legacy)?.trim();
  if (legacy === undefined) return null;
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === from || raw === undefined) continue;
    for (const item of Array.isArray(raw) ? raw : [raw]) next.append(key, item);
  }
  // A search the link already has wins over the old parameter.
  if (value && !next.has(to)) next.set(to, value);
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}
