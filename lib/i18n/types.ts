// Typed dictionary system (RFC-001 §2.12). Deliberately NOT a library: with `sr`
// as the sole locale and no locale prefix in URLs, next-intl's value (routing,
// negotiation, ICU) is entirely unused. This is plain data + one pure formatter
// (./format.ts) — no React provider, no context, no runtime dependency. It works
// identically in server components, client components, and route handlers.
//
// One `Dict` shape per surface. The `as const satisfies XDict` pattern in each
// sr/* module makes a MISSING key a type error, so `npm run check` catches an
// incomplete dictionary. Empty-but-typed (Record<string, never>) is the correct
// output for a surface whose UI does not exist yet: no copy is invented; the
// interface grows when the screen is built.

export type Locale = "sr";

// venue — the public venue page (/[slug]/venue). No UI exists yet (TASK-06+).
export type VenueDict = Record<string, never>;

// venue-editor — the venue editor shell + panels (TASK-06+). The one string that
// exists today is the shared editor-access denial raised by
// requireServiceEditorAccess (convex/lib/access.ts); it is editor-access copy, so
// it lives on the editor surface even though the Links/Memories guards raise it
// too. `{product}` is interpolated via fmt().
export interface VenueEditorDict {
  editorAccessDisabled: string;
}

// memories — the guest upload/gallery surfaces (/m/[code]*). No UI exists yet.
export type MemoriesDict = Record<string, never>;

// resolver — the /r/nevazeca "card not active" page. No route exists yet.
export type ResolverDict = Record<string, never>;

// consent — the versioned upload-consent notice (§2.10). No screen exists yet.
export type ConsentDict = Record<string, never>;

export interface DictBySurface {
  venue: VenueDict;
  "venue-editor": VenueEditorDict;
  memories: MemoriesDict;
  resolver: ResolverDict;
  consent: ConsentDict;
}

export type Surface = keyof DictBySurface;
