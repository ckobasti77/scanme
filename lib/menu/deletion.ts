// ScanMe Menu V1 (K04) — deleting a shared article (master §5.6).
//
// "Obriši artikal" removes the article from ALL pages. Before the client
// confirms, the system must clearly show which pages and which combo articles
// the deletion affects (ArticleDeletionImpact). Confirmation is bound to that
// exact impact by a token: if anything the client saw has changed since (a
// page was added, a combo gained the article, a variant disappeared…), the
// token no longer matches and the client is shown the new impact instead of
// deleting something it has not seen. Pure; the Convex side lives in
// convex/menuArticleDetails.ts.

export type ArticleDeletionImpact = {
  articleKey: string;
  /** The pages that show the article, with how many placements each holds. */
  pages: { pageKey: string; name: string; archived: boolean; placements: number }[];
  /** The combo articles that contain it; each loses the component and gets "check the combo price". */
  combos: { articleKey: string; name: string }[];
  /** When the article is itself a combo: how many component rows go with it. */
  comboComponents: number;
  variants: number;
  addonGroupLinks: number;
  inRoomService: boolean;
  unavailable: boolean;
};

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A deterministic string over everything that decides what a deletion
 * removes: the article key, the page keys with their placement counts, the
 * combo keys, the component / variant / link counts and the Room service and
 * availability flags. Names are not part of it (a rename does not change what
 * is deleted). Keys are lowercase letters, digits and `_`, so the separators
 * below cannot occur inside a part.
 */
export function deletionConfirmToken(impact: ArticleDeletionImpact): string {
  const pages = impact.pages
    .map((page) => `${page.pageKey}=${page.placements}`)
    .sort(byText)
    .join(",");
  const combos = impact.combos
    .map((combo) => combo.articleKey)
    .sort(byText)
    .join(",");
  return [
    "del1",
    impact.articleKey,
    `p:${pages}`,
    `c:${combos}`,
    `cc:${impact.comboComponents}`,
    `v:${impact.variants}`,
    `ag:${impact.addonGroupLinks}`,
    `rs:${impact.inRoomService ? 1 : 0}`,
    `un:${impact.unavailable ? 1 : 0}`,
  ].join("|");
}

/**
 * K11 — "Izaberi više" → Obriši: one token over the impact of every article
 * of the batch (order-independent). It changes when the impact of any one of
 * them changes, so the batch is deleted only as it was shown.
 */
export function bulkDeletionConfirmToken(impacts: readonly ArticleDeletionImpact[]): string {
  return ["bulk1", ...impacts.map(deletionConfirmToken).sort(byText)].join("#");
}
