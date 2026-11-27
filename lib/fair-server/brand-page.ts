import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { fairBrandPageModels } from "../fair-brand-page";
import { fairMapLocationById } from "../fair-map";
import { fairPassportBrandSlug } from "../fair-passport";
import { fairStandPhotoUrl } from "../fair-salon";
import { loadFairPassportPage } from "./passport-page";
import type { FairLeadFormView, FairPassportCatalogEntry, FairPublicModel } from "../fair-contract";

// Same shape as the model page's `orNull` (lib/fair-server/model-page.ts:37, not exported): one
// failed lead-form read hides that action, the brand page still renders without its forms.
async function orNull<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch {
    return null;
  }
}

/** Price and photo as the row renders them: `priceText` is shown verbatim, `photoUrl` is passed
 * raw so the row applies the model page's own pipeline (`fairPhotoUnoptimized` +
 * `fairVehiclePhotoStyle`) — the projection touches neither. */
export type FairBrandPageModel = {
  id: string;
  slug: string;
  name: string;
  priceText: string;
  photoUrl?: string;
  /** Salon detail panel (Auto Expo): price source line, the maker's page, up to three
   * highlighted specifications in the model's own order. */
  priceSecondaryText?: string;
  externalUrl?: string;
  highlights?: { label: string; value: string }[];
};

export type FairBrandPageData = {
  /** Event's own title: the shell's event name and later "u ponudi na …" copy. */
  eventName: string;
  eventId: string;
  brand: { name: string; logoUrl?: string };
  exhibitor: { name: string };
  /** Stand label of the brand's exhibitor on the event map ("Brend · Štand <label>"); absent
   * when the stand is not a numbered stand box on the map. */
  standLabel?: string;
  models: FairBrandPageModel[];
  /** Public event slug — the model-row links and the header's passport stamp (`/sajam/<slug>/…`). */
  eventSlug: string;
  /** True when this brand is in the event's passport catalog — drives the header stamp + its href. */
  hasPassport: boolean;
  /** URL segment of this brand, same identity as `brandSlug` above — the stamp href. */
  brandSlug: string;
  /** Lead forms per model (`model.id` key): what that model's rows open. Only non-null reads are
   * stored, so a key appears only for models with at least one form. */
  leadForms: Record<string, { interest?: FairLeadFormView; testDrive?: FairLeadFormView }>;
};

/** One brand row plus its packaged models, kept in the brand's own order (`catalog[].models[]`
 * is the order the passport shows, and `loadFairPassportPage` does not re-sort it). Pure so the
 * static demo route projects its fixtures the same way the live route projects Convex data. */
export function projectFairBrandPage(input: {
  eventId: string;
  eventName: string;
  catalog: readonly FairPassportCatalogEntry[];
  models: readonly FairPublicModel[];
  /** Public slug from `page.event.slug` — projected so the components can build `/sajam/…` links
   * without learning the internal-vs-public slug rules. */
  eventSlug: string;
  /** `event.code` — the key of the event's map geometry, for the stand label. */
  eventCode: string;
  /** URL segment made by `fairPassportBrandSlug(brandName)` (lib/fair-passport.ts). */
  brandSlug: string;
}): FairBrandPageData | null {
  const entry = input.catalog.find((passport) => fairPassportBrandSlug(passport.brandName) === input.brandSlug);
  if (!entry) return null;

  const rows = fairBrandPageModels(entry, new Map(input.models.map((model) => [model.id, model])));
  // A brand without a single packaged model renders the same "nije pronađen" view as a brand
  // that does not exist, so both paths return null here.
  if (!rows.length) return null;
  // The exhibitor's stand label from the event map (the same lookup as the model page's stand
  // chip, `fairModelStand`); only a real stand box has a number, a hall or area has none.
  const location = fairMapLocationById(input.eventCode, rows[0].standMapLocationId);

  return {
    eventId: input.eventId,
    eventName: input.eventName,
    brand: { name: entry.brandName, ...(entry.brandLogoUrl ? { logoUrl: entry.brandLogoUrl } : {}) },
    exhibitor: { name: rows[0].exhibitorName },
    ...(location?.location.kind === "stand" ? { standLabel: location.location.label } : {}),
    models: rows.map((model) => ({
      id: model.id,
      slug: model.slug,
      name: model.displayName,
      priceText: model.priceText,
      // Only real photos reach the row — the model page does the same (mockup .mrow img).
      ...(fairStandPhotoUrl(input.eventSlug, model.slug, model.photoUrl) ? { photoUrl: fairStandPhotoUrl(input.eventSlug, model.slug, model.photoUrl) } : {}),
      ...(model.priceSecondaryText ? { priceSecondaryText: model.priceSecondaryText } : {}),
      ...(model.externalUrl ? { externalUrl: model.externalUrl } : {}),
      highlights: (model.specificationGroups ?? [])
        .flatMap((group) => group.items)
        .filter((item) => item.isHighlight)
        .sort((a, b) => a.order - b.order)
        .slice(0, 3)
        .map((item) => ({ label: item.label, value: item.value })),
    })),
    eventSlug: input.eventSlug,
    brandSlug: input.brandSlug,
    // A passport entry that lists only models which aren't packaged here still counts as being in
    // the catalog: that list is the event's own passport copy, not our claim about their stock.
    hasPassport: !!entry,
    // The pure projection cannot read forms; the live route fills this after projecting
    // (`loadFairBrandPage`), the static demo route fills it with its own demo forms.
    leadForms: {},
  };
}

/** Live brand page: loads the event and brand rows the same way `app/sajam/[eventSlug]/pasosi`
 * does (`loadFairPassportPage`), projects the brand out of the passport payload, then reads each
 * packaged model's lead forms the same way the model page does (`loadFairModelInteractions`). */
export async function loadFairBrandPage(publicSlug: string, brandSlug: string): Promise<FairBrandPageData | null> {
  const page = await loadFairPassportPage(publicSlug);
  if (!page) return null;
  const data = projectFairBrandPage({
    eventId: page.event.id,
    eventName: page.event.title,
    eventSlug: publicSlug,
    eventCode: page.event.code,
    catalog: page.catalog,
    models: page.models,
    brandSlug,
  });
  if (!data) return null;
  await Promise.all(
    data.models.map(async (model) => {
      const [interest, testDrive] = await Promise.all([
        orNull(fetchQuery(api.fairPublic.getLeadForm, { eventModelId: model.id, kind: "interest" })),
        orNull(fetchQuery(api.fairPublic.getLeadForm, { eventModelId: model.id, kind: "test_drive" })),
      ]);
      data.leadForms[model.id] = { ...(interest ? { interest } : {}), ...(testDrive ? { testDrive } : {}) };
    }),
  );
  return data;
}

/** Href of a brand's page, or null when that page does not exist (brand missing from the
 * passport catalog, or without a packaged model) — the model page then keeps its plain-text
 * brand name. Same rule as `projectFairBrandPage`; a failed read also means no link. */
export function fairBrandPageHref(input: {
  catalog: readonly FairPassportCatalogEntry[];
  models: readonly FairPublicModel[];
  eventSlug: string;
  brandName: string;
}): string | null {
  const brandSlug = fairPassportBrandSlug(input.brandName);
  const entry = input.catalog.find((passport) => fairPassportBrandSlug(passport.brandName) === brandSlug);
  if (!entry || !fairBrandPageModels(entry, new Map(input.models.map((model) => [model.id, model]))).length) return null;
  return `/sajam/${input.eventSlug}/brend/${brandSlug}`;
}

/** Live variant of `fairBrandPageHref` for the model route: reads the passport catalog and only
 * this brand's model rows (the same queries `loadFairPassportPage` runs). */
export async function loadFairBrandPageHref(dataSlug: string, publicSlug: string, brandName: string): Promise<string | null> {
  const passport = await orNull(fetchQuery(api.fairPublic.getPassportCatalog, { eventSlug: dataSlug }));
  const catalog = passport?.catalog ?? [];
  const entry = catalog.find((row) => fairPassportBrandSlug(row.brandName) === fairPassportBrandSlug(brandName));
  if (!entry?.models.length) return null;
  const models = await orNull(fetchQuery(api.fairPublic.getModelsByIds, { ids: [...new Set(entry.models.map((model) => model.eventModelId))] }));
  return models ? fairBrandPageHref({ catalog: [entry], models, eventSlug: publicSlug, brandName }) : null;
}
