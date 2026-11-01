// ScanMe Menu V1 (K20) — where the printed-card resolver sends a `menu`
// outcome (app/r/[cardCode]/route.ts, branch `menu`; plan K19 §3.2). Pure, so
// the three cases are tested without a request: no link → /{slug}/meni
// exactly as before K20; a linked page → /{slug}/meni/{page}; a position →
// the hop /r/{cardCode}/meni that opens the guest session.

export type MenuResolverOutcome = {
  kind: "menu";
  businessSlug: string;
  pagePath?: string;
  hop?: true;
  cardCode?: string;
};

export function menuOutcomePath(outcome: MenuResolverOutcome): string {
  if (outcome.hop && outcome.cardCode) return `/r/${outcome.cardCode}/meni`;
  return `/${outcome.businessSlug}/meni${outcome.pagePath ? `/${outcome.pagePath}` : ""}`;
}
