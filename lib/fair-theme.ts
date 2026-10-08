export function fairEventThemeClass(eventSlug: string): string {
  return eventSlug.replace(/^test-/, "").startsWith("elektromobilnost-")
    ? "fair-event--electromobility"
    : "fair-event--auto-moto";
}
