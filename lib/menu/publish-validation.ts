// ScanMe Menu V1 (K04) — publish validation of articles (master §5.5, §6.1).
//
// PURE: the input is a flat description of one article (what the draft holds
// about it) and the output is a list of issues. Convex builds the input from
// the draft rows (convex/menuArticleDetails.ts articleIssues; K05's publish
// reuses validateDraftForPublish), the editor renders the same codes. The
// codes themselves live in ./errors/publish.ts, their Serbian text in the
// `menu-domen` dictionary (`publishIssues[code]`).
//
// The rules and why they look like this:
//
// 1. An ERROR blocks publishing, a WARNING asks for a conscious confirmation
//    (master §6.1). The three errors are exactly master §5.5: a published
//    article needs a name, a section and a price (a base price, or — only
//    while variants are on — at least one variant with a price; a combo needs
//    its manual price). A category of Room service counts as the article's
//    section there.
//
// 2. The draft may hold incomplete articles; a validation error blocks only
//    publishing (master §5.5). So the strict check applies only to articles
//    that are PART OF THE PUBLICATION — see articlePublishScope:
//      "public"    shown to guests: a visible placement on a visible section of
//                  a visible, non-archived page, or in Room service while Room
//                  service is on. Strict check (errors and warnings).
//      "hidden"    on a page, but nothing shows it ("Sakrij", hidden section or
//                  page). The client has put it aside on purpose: no issue at
//                  all. A hidden incomplete article must never block publishing
//                  the rest of the menu — this is how the draft keeps it.
//      "component" only inside combos, on no page: not published as an article
//                  of its own. No issue.
//      "unplaced"  nowhere at all. Not an error (K01 plan): only the warning
//                  `article_unplaced` ("guests will not see it").
//
// 3. Warnings are about things that publish but look wrong: variants on and
//    empty, a variant without a price while there is no base price, an add-on
//    group that is empty or that a guest could never satisfy, a promotion that
//    cannot apply (the regular price shows) or is scheduled without Premium, a
//    combo whose price needs a check or which has no components.
//
// Dependency-free except for the sibling rule modules (addons, promo, text).

import { isAddonGroupSatisfiable, normalizeAddonRules } from "./addons";
import type { MenuPublishIssueCode } from "./errors/publish";
import { checkPromo, isPromoScheduled, type MenuPromo } from "./promo";
import { cleanText } from "./text";

export type PublishIssue = {
  code: MenuPublishIssueCode;
  articleKey: string;
  /** The variant or add-on group the issue is about (their keys). */
  entityKey?: string;
};

export type PublishValidationArticle = {
  key: string;
  kind: "item" | "combo";
  name: string;
  basePriceRsd: number | null;
  variantsEnabled: boolean;
  variants: { key: string; priceRsd: number | null }[];
  addonsEnabled: boolean;
  addonGroups: {
    key: string;
    selection: "single" | "multiple";
    required: boolean;
    minSelect: number | null;
    maxSelect: number | null;
    optionCount: number;
  }[];
  promo: MenuPromo | null;
  comboComponentCount: number;
  priceCheckPending: boolean;
  /** Placements on non-archived pages, any visibility. */
  sectionCount: number;
  /** Placements that are visible, in a visible section, on a visible non-archived page. */
  visibleCount: number;
  /** In Room service while Room service is switched on. */
  inRoomService: boolean;
  /** Number of combos that contain it. */
  componentOfCombos: number;
};

export type PublishValidationContext = {
  /** Premium: scheduled promotions are scheduled (lib/menu/capabilities.ts). */
  scheduledPromos: boolean;
};

export type PublishValidationResult = {
  errors: PublishIssue[];
  warnings: PublishIssue[];
};

export type ArticlePublishScope = "public" | "hidden" | "component" | "unplaced";

/** Where an article stands in the publication (see the header). */
export function articlePublishScope(article: PublishValidationArticle): ArticlePublishScope {
  if (article.visibleCount > 0 || article.inRoomService) return "public";
  if (article.sectionCount > 0) return "hidden";
  if (article.componentOfCombos > 0) return "component";
  return "unplaced";
}

function hasPrice(article: PublishValidationArticle): boolean {
  if (article.basePriceRsd !== null) return true;
  if (article.kind === "combo") return false;
  return article.variantsEnabled && article.variants.some((variant) => variant.priceRsd !== null);
}

/**
 * The STRICT check of one article that is part of the publication: errors
 * block publishing, warnings need a confirmation. It does not look at the
 * scope — validateDraftForPublish decides which articles get it.
 */
export function validateArticleForPublish(
  article: PublishValidationArticle,
  context: PublishValidationContext,
): PublishValidationResult {
  const errors: PublishIssue[] = [];
  const warnings: PublishIssue[] = [];
  const issue = (code: MenuPublishIssueCode, entityKey?: string): PublishIssue => ({
    code,
    articleKey: article.key,
    ...(entityKey !== undefined ? { entityKey } : {}),
  });

  if (cleanText(article.name) === "") errors.push(issue("name_missing"));
  if (article.sectionCount === 0 && !article.inRoomService) errors.push(issue("section_missing"));
  if (!hasPrice(article)) errors.push(issue("price_missing"));

  if (article.variantsEnabled) {
    if (article.variants.length === 0) warnings.push(issue("variants_empty"));
    if (article.basePriceRsd === null) {
      for (const variant of article.variants) {
        if (variant.priceRsd === null) warnings.push(issue("variant_price_missing", variant.key));
      }
    }
  }

  if (article.addonsEnabled) {
    for (const group of article.addonGroups) {
      if (group.optionCount === 0) {
        warnings.push(issue("addon_group_empty", group.key));
        continue;
      }
      const rules = normalizeAddonRules(group);
      if (rules !== null && !isAddonGroupSatisfiable(rules, group.optionCount)) {
        warnings.push(issue("addon_group_unsatisfiable", group.key));
      }
    }
  }

  const promo = article.promo;
  if (promo !== null && promo.active) {
    const valid = checkPromo(promo, {
      basePriceRsd: article.basePriceRsd,
      variantsEnabled: article.variantsEnabled,
      variants: article.variants,
    });
    if (valid === null) warnings.push(issue("promo_invalid"));
    if (isPromoScheduled(promo) && !context.scheduledPromos) {
      warnings.push(issue("promo_schedule_premium"));
    }
  }

  if (article.kind === "combo") {
    if (article.priceCheckPending) warnings.push(issue("combo_price_check"));
    if (article.comboComponentCount === 0) warnings.push(issue("combo_empty"));
  }

  return { errors, warnings };
}

/**
 * The verdict for a whole draft: only articles that are part of the
 * publication ("public") get the strict check, an "unplaced" article gets the
 * warning `article_unplaced`, "hidden" and "component" articles produce
 * nothing. `ok` is true when there is no error.
 */
export function validateDraftForPublish(
  articles: readonly PublishValidationArticle[],
  context: PublishValidationContext,
): PublishValidationResult & { ok: boolean } {
  const errors: PublishIssue[] = [];
  const warnings: PublishIssue[] = [];
  for (const article of articles) {
    const scope = articlePublishScope(article);
    if (scope === "public") {
      const result = validateArticleForPublish(article, context);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    } else if (scope === "unplaced") {
      warnings.push({ code: "article_unplaced", articleKey: article.key });
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
