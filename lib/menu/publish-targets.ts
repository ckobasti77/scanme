// ScanMe Menu V1 (K18) — where the article of a publish issue is, so the
// publish dialog can take the owner to it ("greške blokiraju objavu i vode do
// mesta greške", master §6.1, §13.4).
//
// PURE, over a MenuDraftSnapshot (the draft that was checked). For every
// article an issue names: its name, ONE page that shows it (the default page
// first, then by page order; archived pages never) and whether it is in Room
// service. An article on no page and not in Room service has no page — the
// dialog then opens its detail on the page that is open.

import { sortSnapshot, type MenuDraftSnapshot } from "./snapshot";

export type MenuIssueTarget = {
  name: string;
  /** A page that has the article (visible or hidden page, never archived); null = on no page. */
  pageKey: string | null;
  pageName: string | null;
  inRoomService: boolean;
};

/** Targets of the articles named by `issues` (by article key); unknown keys are skipped. */
export function issueTargets(
  input: MenuDraftSnapshot,
  issues: readonly { articleKey?: string }[],
): Record<string, MenuIssueTarget> {
  const wanted = new Set<string>();
  for (const issue of issues) if (issue.articleKey) wanted.add(issue.articleKey);
  const targets: Record<string, MenuIssueTarget> = {};
  if (wanted.size === 0) return targets;

  const snapshot = sortSnapshot(input);
  const pages = snapshot.pages.filter((page) => page.archivedAt === null);
  // The default page first, then the page order (sortSnapshot ordered them).
  const ordered = [...pages.filter((page) => page.isDefault), ...pages.filter((page) => !page.isDefault)];
  const rank = new Map(ordered.map((page, position) => [page.key, position]));
  const pageOf = new Map<string, string>();
  for (const placement of snapshot.placements) {
    if (!wanted.has(placement.articleKey)) continue;
    const position = rank.get(placement.pageKey);
    if (position === undefined) continue;
    const current = pageOf.get(placement.articleKey);
    if (current === undefined || position < (rank.get(current) ?? Infinity)) pageOf.set(placement.articleKey, placement.pageKey);
  }
  const inRoomService = new Set(snapshot.roomService.items.map((item) => item.articleKey));
  const pageNames = new Map(pages.map((page) => [page.key, page.name]));

  for (const article of snapshot.articles) {
    if (!wanted.has(article.key)) continue;
    const pageKey = pageOf.get(article.key) ?? null;
    targets[article.key] = {
      name: article.name,
      pageKey,
      pageName: pageKey ? (pageNames.get(pageKey) ?? null) : null,
      inRoomService: inRoomService.has(article.key),
    };
  }
  return targets;
}
