// ScanMe Menu V1 (K05) — the checks of a whole publication (master §5.5,
// §6.1: errors block publishing, warnings need a conscious confirmation).
//
// PURE, over a MenuDraftSnapshot. Article rules are K04's
// (lib/menu/publish-validation.ts, applied to exactly the articles guests
// would see); this module adds what only the whole publication knows:
//
//   translation_missing    per published translation language: how many shown
//                          texts lack a CONFIRMED translation (guests read the
//                          source text there; AI suggestions never count).
//   room_service_premium   Room service is on but the account lost Premium:
//                          it is left out of the version (K01 OTV 5).
//   language_premium       a language above the plan's limit: left out.
//
// The warnings of one draft get a fingerprint; publish proceeds only when the
// caller confirms exactly that fingerprint (a new or changed warning asks
// again).

import type { MenuPublishIssueCode } from "./errors/publish";
import {
  validateDraftForPublish,
  type PublishValidationArticle,
} from "./publish-validation";
import {
  confirmedTranslation,
  hashString,
  indexSnapshot,
  isPagePublic,
  publishedLanguages,
  shownPlacements,
  sortSnapshot,
  type MenuDraftSnapshot,
  type PublishedLanguages,
  type SnapshotTranslations,
} from "./snapshot";

/** One issue of a publication; article issues carry `articleKey`, the others `lang` / `count`. */
export type MenuPublishIssue = {
  code: MenuPublishIssueCode;
  articleKey?: string;
  /** The variant or add-on group an article issue is about. */
  entityKey?: string;
  lang?: string;
  /** translation_missing: how many shown entities lack the translation. */
  count?: number;
  /** translation_missing: the first keys (sorted, at most MENU_ISSUE_SAMPLE). */
  entityKeys?: string[];
};

export const MENU_ISSUE_SAMPLE = 20;

export type PublishCheckContext = {
  /** menuServices.features.roomService (live switch). */
  roomServiceSwitch: boolean;
  capabilities: { roomService: boolean; scheduledPromos: boolean; maxLanguages: number };
};

export type PublicationCheck = {
  ok: boolean;
  errors: MenuPublishIssue[];
  warnings: MenuPublishIssue[];
  /** issuesFingerprint(warnings). */
  fingerprint: string;
  languages: PublishedLanguages;
  /** The Room service part goes into the version. */
  roomServicePublished: boolean;
};

/** The K04 validation input of every article, from the snapshot (same semantics as menuArticleDetails). */
export function validationArticles(
  input: MenuDraftSnapshot,
  options: { roomServicePublished: boolean },
): PublishValidationArticle[] {
  const snapshot = sortSnapshot(input);
  const index = indexSnapshot(snapshot);
  const sectionCount = new Map<string, number>();
  const visibleCount = new Map<string, number>();
  for (const placement of snapshot.placements) {
    const page = index.pages.get(placement.pageKey);
    const section = index.sections.get(placement.sectionKey);
    if (!page || !section || page.archivedAt !== null) continue;
    sectionCount.set(placement.articleKey, (sectionCount.get(placement.articleKey) ?? 0) + 1);
    if (
      placement.visibility === "visible" &&
      section.visibility === "visible" &&
      page.visibility === "visible"
    ) {
      visibleCount.set(placement.articleKey, (visibleCount.get(placement.articleKey) ?? 0) + 1);
    }
  }
  const inRoomService = new Set(
    options.roomServicePublished ? snapshot.roomService.items.map((item) => item.articleKey) : [],
  );
  const componentOf = new Map<string, number>();
  for (const component of snapshot.comboComponents) {
    componentOf.set(component.componentKey, (componentOf.get(component.componentKey) ?? 0) + 1);
  }

  return snapshot.articles.map((article) => {
    const variants = article.variantsEnabled ? (index.variantsByArticle.get(article.key) ?? []) : [];
    const addonGroups = article.addonsEnabled
      ? (index.groupsByArticle.get(article.key) ?? []).flatMap((link) => {
          const group = index.groups.get(link.groupKey);
          if (!group) return [];
          return [
            {
              key: group.key,
              selection: group.selection,
              required: group.required,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              optionCount: (index.optionsByGroup.get(group.key) ?? []).length,
            },
          ];
        })
      : [];
    return {
      key: article.key,
      kind: article.kind,
      name: article.name,
      basePriceRsd: article.basePriceRsd,
      variantsEnabled: article.variantsEnabled,
      variants: variants.map((variant) => ({ key: variant.key, priceRsd: variant.priceRsd })),
      addonsEnabled: article.addonsEnabled,
      addonGroups,
      promo: article.promo,
      comboComponentCount: (index.componentsByCombo.get(article.key) ?? []).length,
      priceCheckPending: article.kind === "combo" && article.priceCheck !== null,
      sectionCount: sectionCount.get(article.key) ?? 0,
      visibleCount: visibleCount.get(article.key) ?? 0,
      inRoomService: inRoomService.has(article.key),
      componentOfCombos: componentOf.get(article.key) ?? 0,
    };
  });
}

/** Per published translation language: shown entities with a text that has no confirmed translation. */
export function translationWarnings(
  input: MenuDraftSnapshot,
  languages: PublishedLanguages,
  options: { roomServicePublished: boolean },
): MenuPublishIssue[] {
  const snapshot = sortSnapshot(input);
  const index = indexSnapshot(snapshot);

  // Every shown entity and the source texts it shows.
  type Shown = { key: string; translations: SnapshotTranslations; fields: ("name" | "description" | "publicTitle")[] };
  const shown = new Map<string, Shown>();
  const add = (
    key: string,
    translations: SnapshotTranslations,
    texts: Partial<Record<"name" | "description" | "publicTitle", string | null>>,
  ) => {
    if (shown.has(key)) return;
    const fields = (Object.keys(texts) as ("name" | "description" | "publicTitle")[]).filter(
      (field) => (texts[field] ?? "").trim() !== "",
    );
    if (fields.length > 0) shown.set(key, { key, translations, fields });
  };
  const addArticle = (articleKey: string) => {
    const article = index.articles.get(articleKey);
    if (!article) return;
    add(article.key, article.translations, { name: article.name, description: article.description });
    if (article.variantsEnabled) {
      for (const variant of index.variantsByArticle.get(article.key) ?? []) {
        // A variant with no price at all is not published (compileArticle).
        if ((variant.priceRsd ?? article.basePriceRsd) === null) continue;
        add(variant.key, variant.translations, { name: variant.name });
      }
    }
    if (article.addonsEnabled) {
      for (const link of index.groupsByArticle.get(article.key) ?? []) {
        const group = index.groups.get(link.groupKey);
        if (!group) continue;
        const options = index.optionsByGroup.get(group.key) ?? [];
        if (options.length === 0) continue;
        add(group.key, group.translations, { name: group.name });
        for (const option of options) add(option.key, option.translations, { name: option.name });
      }
    }
    if (article.kind === "combo") {
      for (const component of index.componentsByCombo.get(article.key) ?? []) {
        const part = index.articles.get(component.componentKey);
        if (part) add(part.key, part.translations, { name: part.name });
      }
    }
  };

  for (const page of snapshot.pages.filter(isPagePublic)) {
    add(page.key, page.translations, { publicTitle: page.publicTitle });
    for (const { section, placements } of shownPlacements(index, page)) {
      if (placements.length === 0) continue;
      add(section.key, section.translations, { name: section.name, description: section.description });
      for (const placement of placements) addArticle(placement.articleKey);
    }
  }
  if (options.roomServicePublished) {
    const categoriesWithItems = new Set(
      snapshot.roomService.items
        .filter((item) => index.articles.has(item.articleKey))
        .map((item) => item.categoryKey),
    );
    for (const category of snapshot.roomService.categories) {
      if (categoriesWithItems.has(category.key)) {
        add(category.key, category.translations, { name: category.name });
      }
    }
    for (const item of snapshot.roomService.items) addArticle(item.articleKey);
  }

  const issues: MenuPublishIssue[] = [];
  for (const lang of languages.languages) {
    if (lang === languages.source) continue;
    const missing: string[] = [];
    for (const entity of shown.values()) {
      if (entity.fields.some((field) => confirmedTranslation(entity.translations, lang, field) === null)) {
        missing.push(entity.key);
      }
    }
    if (missing.length === 0) continue;
    missing.sort();
    issues.push({
      code: "translation_missing",
      lang,
      count: missing.length,
      entityKeys: missing.slice(0, MENU_ISSUE_SAMPLE),
    });
  }
  return issues;
}

function issueId(issue: MenuPublishIssue): string {
  return [issue.code, issue.articleKey ?? "", issue.entityKey ?? "", issue.lang ?? "", issue.count ?? ""].join("|");
}

/** Order-independent fingerprint of a list of warnings. */
export function issuesFingerprint(warnings: readonly MenuPublishIssue[]): string {
  return hashString(warnings.map(issueId).sort().join("\n"));
}

/** Errors, warnings and their fingerprint for publishing this draft now. */
export function checkPublication(
  snapshot: MenuDraftSnapshot,
  context: PublishCheckContext,
): PublicationCheck {
  const roomServicePublished = context.roomServiceSwitch && context.capabilities.roomService;
  const languages = publishedLanguages(snapshot.settings, context.capabilities.maxLanguages);
  const articles = validationArticles(snapshot, { roomServicePublished });
  const result = validateDraftForPublish(articles, {
    scheduledPromos: context.capabilities.scheduledPromos,
  });

  const warnings: MenuPublishIssue[] = [...result.warnings];
  if (context.roomServiceSwitch && !context.capabilities.roomService) {
    warnings.push({ code: "room_service_premium" });
  }
  for (const lang of languages.dropped) warnings.push({ code: "language_premium", lang });
  warnings.push(...translationWarnings(snapshot, languages, { roomServicePublished }));

  return {
    ok: result.errors.length === 0,
    errors: [...result.errors],
    warnings,
    fingerprint: issuesFingerprint(warnings),
    languages,
    roomServicePublished,
  };
}
