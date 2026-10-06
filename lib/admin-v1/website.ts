// Izlagači 2026 — one rule for a client's public website, shared by Convex
// (accounts.websiteUrl writes) and the admin UI (links and the edit field).
// Only http/https, no credentials, at most WEBSITE_URL_MAX characters. A bare
// host ("primer.rs") gets https:// so the admin can paste what they see.

export const WEBSITE_URL_MAX = 500;

/** The stored form of a website, or null when the input is empty or not a public http(s) URL. */
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value || value.length > WEBSITE_URL_MAX || /\s/.test(value)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".") || url.hostname.startsWith(".") || url.hostname.endsWith(".")) return null;
  const normalized = url.toString();
  return normalized.length > WEBSITE_URL_MAX ? null : normalized;
}

const LABEL_MAX = 40;

/**
 * The short label of a link: host without www. and the path without the query
 * ("https://www.instagram.com/rentacar_kostic/" → "instagram.com/rentacar_kostic"),
 * at most LABEL_MAX characters.
 */
export function websiteLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    const label = `${host}${path}`;
    return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
  } catch {
    return url;
  }
}
