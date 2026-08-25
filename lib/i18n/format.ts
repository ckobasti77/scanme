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
