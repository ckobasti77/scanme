// ScanMe Menu V1 (K26) — mailto: link (RFC 6068) with a prefilled subject and body.
// Guest text goes only into percent-encoded values, so it cannot add a recipient or a header.

export const MAILTO_MAX_LENGTH = 1800;

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "\r\n");
}

export function buildMailto(args: {
  to: string;
  subject: string;
  body: string;
  truncatedNote?: string;
  maxLength?: number;
}): { href: string; truncated: boolean } {
  const max = args.maxLength ?? MAILTO_MAX_LENGTH;
  const head =
    "mailto:" +
    encodeURIComponent(args.to.trim()).replace(/%40/g, "@") +
    "?subject=" +
    encodeURIComponent(args.subject.replace(/\r\n|[\r\n\u2028\u2029]/g, " ")) +
    "&body=";
  const body = normalizeNewlines(args.body);
  const full = head + encodeURIComponent(body);
  if (full.length <= max) return { href: full, truncated: false };

  const note = args.truncatedNote ? "\r\n\r\n" + args.truncatedNote : "";
  const points = Array.from(body);
  const build = (count: number) =>
    head + encodeURIComponent(points.slice(0, count).join("") + note);

  // Longest prefix (in code points) that still fits; encoded length grows with the prefix
  let low = 0;
  let high = points.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (build(mid).length <= max) low = mid;
    else high = mid - 1;
  }

  // Prefer cutting at whitespace when it is near the cut
  let cut = low;
  for (let i = low - 1; i >= Math.max(0, low - 40); i--) {
    if (/\s/.test(points[i])) {
      cut = i;
      break;
    }
  }
  return { href: build(cut), truncated: true };
}
