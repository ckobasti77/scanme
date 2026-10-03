// Generic capability/clamp pattern (RFC-001 §2.5), generalizing the
// SCANME_LINKS_PRESET_CAPABILITIES + normalizeDesignForPreset pattern in
// lib/scanme-links-design.ts (read, not changed — Links keeps its own catalog
// and clamp untouched). No consumer yet, deliberately: Venue builds
// VENUE_PRESET_CAPABILITIES on these types in TASK-07.

/**
 * What one preset allows a design to contain.
 *
 * - `allowed` lists the permitted values per design field; a field with no
 *   entry is unconstrained. A value outside its allow-list falls back to
 *   `defaults`, the way a disallowed button variant or font key falls back in
 *   `normalizeDesignForPreset`.
 * - `ranges` gives inclusive numeric bounds per design field, mirroring the
 *   `clamp(...)` calls there.
 * - `defaults` is the preset's known-good design: the fallback for missing
 *   fields and for any value that fails its allow-list.
 */
export type Capabilities<TDesign extends object> = {
  allowed?: { readonly [K in keyof TDesign]?: readonly TDesign[K][] };
  ranges?: { readonly [K in keyof TDesign]?: { min: number; max: number } };
  defaults: TDesign;
};

export function clampDesign<TDesign extends object>(
  design: TDesign | null | undefined,
  capabilities: Capabilities<TDesign>,
): TDesign {
  const { allowed = {}, ranges = {}, defaults } = capabilities;
  if (!design) {
    return { ...defaults };
  }

  const result = { ...defaults, ...design } as Record<string, unknown>;
  const fallbacks = defaults as Record<string, unknown>;

  for (const [key, values] of Object.entries(
    allowed as Record<string, readonly unknown[] | undefined>,
  )) {
    if (values && !values.includes(result[key])) {
      result[key] = fallbacks[key];
    }
  }

  for (const [key, range] of Object.entries(
    ranges as Record<string, { min: number; max: number } | undefined>,
  )) {
    const value = result[key];
    if (range && typeof value === "number") {
      result[key] = Math.min(range.max, Math.max(range.min, value));
    }
  }

  return result as TDesign;
}
