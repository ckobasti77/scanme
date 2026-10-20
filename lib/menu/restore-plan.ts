// ScanMe Menu V1 (K05) — restoring a version into the draft (master §6.1:
// "Vraćanje prethodne verzije pravi novi nacrt i ne menja odmah javni meni").
//
// PURE. planRestore computes the draft the restore must leave behind: the
// restored version's internal snapshot, with ONE exception — a page that has
// an active QR link is never deleted or archived by a restore (K02 rule, K01
// §8 K05). Such a page is kept exactly as it is in the draft now, together
// with everything it shows that the version does not have (its sections,
// placements and those articles with their variants, add-on groups and combo
// components), and it is reported. Convex (convex/lib/menuRestore.ts) then
// writes only the difference (diffByIdentity), so restoring a recent version
// touches few rows. Published versions are never touched by a restore.

import { uniquePageSlug } from "./slugs";
import {
  canonicalJson,
  sortSnapshot,
  type MenuDraftSnapshot,
  type SnapshotArticle,
  type SnapshotPage,
} from "./snapshot";

export type RestoreKeptPage = {
  key: string;
  name: string;
  /** The version does not have the page, or has it archived. */
  reason: "qr_missing_in_version" | "qr_archived_in_version";
};

export type RestorePlan = {
  final: MenuDraftSnapshot;
  keptPages: RestoreKeptPage[];
  /** Kept pages whose slug the restored version uses for another page. */
  renamedSlugs: { pageKey: string; from: string; to: string }[];
  /** Articles kept only because a kept page shows them. */
  keptArticleKeys: string[];
};

/** Deep copy of JSON data (snapshots are plain JSON). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function planRestore(
  currentInput: MenuDraftSnapshot,
  targetInput: MenuDraftSnapshot,
  protectedPageKeys: ReadonlySet<string>,
): RestorePlan {
  const current = sortSnapshot(currentInput);
  const final: MenuDraftSnapshot = clone(sortSnapshot(targetInput));
  const keptPages: RestoreKeptPage[] = [];
  const renamedSlugs: RestorePlan["renamedSlugs"] = [];
  const keptArticleKeys: string[] = [];

  const finalPages = new Map(final.pages.map((page) => [page.key, page]));
  const finalSections = new Set(final.sections.map((section) => section.key));
  const finalArticles = new Set(final.articles.map((article) => article.key));
  const finalGroups = new Set(final.addonGroups.map((group) => group.key));
  const currentArticles = new Map(current.articles.map((article) => [article.key, article]));

  const keepArticle = (key: string) => {
    if (finalArticles.has(key)) return;
    const article = currentArticles.get(key) as SnapshotArticle | undefined;
    if (!article) return;
    finalArticles.add(key);
    keptArticleKeys.push(key);
    final.articles.push(clone(article));
    final.variants.push(...current.variants.filter((row) => row.articleKey === key).map((row) => clone(row)));
    for (const link of current.articleAddonGroups.filter((row) => row.articleKey === key)) {
      final.articleAddonGroups.push({ ...link });
      if (!finalGroups.has(link.groupKey)) {
        const group = current.addonGroups.find((row) => row.key === link.groupKey);
        if (group) {
          finalGroups.add(group.key);
          final.addonGroups.push(clone(group));
          final.addonOptions.push(
            ...current.addonOptions.filter((row) => row.groupKey === group.key).map((row) => clone(row)),
          );
        }
      }
    }
    if (article.kind === "combo") {
      for (const component of current.comboComponents.filter((row) => row.comboKey === key)) {
        final.comboComponents.push({ ...component });
        keepArticle(component.componentKey);
      }
    }
  };

  for (const page of current.pages) {
    if (!protectedPageKeys.has(page.key)) continue;
    const inVersion = finalPages.get(page.key);
    if (inVersion) {
      if (inVersion.archivedAt !== null && page.archivedAt === null) {
        inVersion.archivedAt = null;
        keptPages.push({ key: page.key, name: page.name, reason: "qr_archived_in_version" });
      }
      continue;
    }
    keptPages.push({ key: page.key, name: page.name, reason: "qr_missing_in_version" });
    const kept: SnapshotPage = clone(page);
    final.pages.push(kept);
    finalPages.set(kept.key, kept);
    for (const section of current.sections.filter((row) => row.pageKey === page.key)) {
      if (finalSections.has(section.key)) continue;
      finalSections.add(section.key);
      final.sections.push(clone(section));
      for (const placement of current.placements.filter((row) => row.sectionKey === section.key)) {
        keepArticle(placement.articleKey);
        if (finalArticles.has(placement.articleKey)) final.placements.push({ ...placement });
      }
    }
  }

  // Exactly one default page: the version's own default wins over a kept one.
  const keptKeys = new Set(keptPages.filter((row) => row.reason === "qr_missing_in_version").map((row) => row.key));
  if (final.pages.some((page) => page.isDefault && !keptKeys.has(page.key))) {
    for (const page of final.pages) if (keptKeys.has(page.key)) page.isDefault = false;
  }

  // Slugs stay unique: the version keeps its slugs, a kept page gets a free one.
  const versionSlugs = new Set(final.pages.filter((page) => !keptKeys.has(page.key)).map((page) => page.slug));
  const taken = new Set(final.pages.map((page) => page.slug));
  for (const page of final.pages) {
    if (!keptKeys.has(page.key) || !versionSlugs.has(page.slug)) continue;
    const to = uniquePageSlug(page.name, taken);
    taken.add(to);
    renamedSlugs.push({ pageKey: page.key, from: page.slug, to });
    page.slug = to;
  }

  return { final: sortSnapshot(final), keptPages, renamedSlugs, keptArticleKeys };
}

export type IdentityDiff<T> = {
  inserts: T[];
  updates: { before: T; after: T }[];
  deletes: T[];
};

/** What turns `current` into `final`, matched by identity and compared by canonical JSON. */
export function diffByIdentity<T>(
  current: readonly T[],
  final: readonly T[],
  identity: (row: T) => string,
): IdentityDiff<T> {
  const before = new Map(current.map((row) => [identity(row), row]));
  const inserts: T[] = [];
  const updates: { before: T; after: T }[] = [];
  for (const row of final) {
    const id = identity(row);
    const existing = before.get(id);
    if (existing === undefined) inserts.push(row);
    else {
      if (canonicalJson(existing) !== canonicalJson(row)) updates.push({ before: existing, after: row });
      before.delete(id);
    }
  }
  return { inserts, updates, deletes: [...before.values()] };
}

/** Identities of the rows that have no key of their own. */
export const RESTORE_IDENTITY = {
  placement: (row: { sectionKey: string; articleKey: string }) => `${row.sectionKey}|${row.articleKey}`,
  articleAddonGroup: (row: { articleKey: string; groupKey: string }) => `${row.articleKey}|${row.groupKey}`,
  comboComponent: (row: { comboKey: string; componentKey: string }) => `${row.comboKey}|${row.componentKey}`,
  roomServiceItem: (row: { articleKey: string }) => row.articleKey,
} as const;
