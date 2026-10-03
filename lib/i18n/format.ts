// Interpolation for dictionary strings (RFC-001 §2.12). Replaces `{name}`
// placeholders with values from `params`. Pure and dependency-free so it runs in
// server components, client components, route handlers, and Convex functions
// alike. An unmatched placeholder is left verbatim so a missing param is visible
// rather than silently blanked.
export function fmt(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key)
      ? String(params[key])
      : whole,
  );
}

// Serbian cardinal plural category (CLDR): 1/21/31… → "one", 2–4/22–24… →
// "few", everything else (0, 5–20, 25–30…) → "many". Dictionaries carry one
// key per category (e.g. quotaRemainingOne/Few/Many); callers pick with this.
export function srPluralCategory(count: number): "one" | "few" | "many" {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
  return "many";
}
