// createTokenCompiler — the prefix-parameterized CSS custom-property compiler
// (RFC-001 §2.5). Emits `--{prefix}-*` declarations from a page-level token
// map, structurally parallel to what the Links template's `designStyle()`
// produces today. No consumer yet, deliberately: ScanMe Links keeps its
// hand-written `designStyle()` byte-frozen; Venue adopts the compiler as
// `createTokenCompiler("venue")` in TASK-07.

/**
 * Flat token map for one page-level design: token name → already-formatted
 * CSS value ("#fff", "12px", "0 0 0 transparent"). Units and stringification
 * are the caller's job, exactly as in `designStyle()`; an `undefined` value
 * means "emit nothing for this token", matching how React drops undefined
 * style entries.
 */
export type TokenValues = Record<string, string | undefined>;

export function createTokenCompiler(prefix: string) {
  return function compileTokens(values: TokenValues): Record<string, string> {
    const style: Record<string, string> = {};
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) continue;
      style[`--${prefix}-${name}`] = value;
    }
    return style;
  };
}
