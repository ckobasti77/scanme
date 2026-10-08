import type { FairPassportCatalogEntry, FairPassportProgress, FairPublicMapStand, FairPublicMapUnlocatedExhibitor, FairSponsoredRotationView } from "../fair-contract";
import { FAIR_MAP_ROTATION_INTERVAL_MS } from "../fair-contract";
import { ELEKTROMOBILNOST_2026_EXHIBITORS, fairSiteExhibitorMapZone, fairSiteLogoUrl, fairSiteStandFields } from "../fair-import/izlagaci-2026";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { buildFairMapView, type FairMapView } from "./view";

// N4 — DEV preview data (/dev/sajam-mapa) and test fixture of the map v2: the
// organizer's real exhibitor list (lib/fair-import/izlagaci-2026.ts) on the
// real geometry, plus a few clearly marked TEST brands/models, one rotation
// item and one passport. Nothing here pretends to be a real car or result.

export const FAIR_MAP_PREVIEW_SLUG = "test-elektromobilnost-2026";
export const FAIR_MAP_PREVIEW_EPOCH = Date.parse("2026-10-09T09:00:00+02:00");

/** TEST brands/models (the brand name says TEST) on three exhibitors' stands. */
const TEST_MODELS: Readonly<Record<string, ReadonlyArray<{ slug: string; name: string }>>> = {
  byd: [
    { slug: "test-model-a", name: "TEST model A" },
    { slug: "test-model-b", name: "TEST model B" },
  ],
  toyota: [
    { slug: "test-model-c", name: "TEST model C" },
    { slug: "test-model-d", name: "TEST model D" },
  ],
  "venera-bike": [{ slug: "test-model-e", name: "TEST model E" }],
};

export type FairMapPreview = {
  view: FairMapView;
  rotation: FairSponsoredRotationView;
  passportProgress: FairPassportProgress[];
};

export function buildFairMapPreview(): FairMapPreview {
  const stands: FairPublicMapStand[] = [];
  const withoutLocation: FairPublicMapUnlocatedExhibitor[] = [];
  for (const exhibitor of ELEKTROMOBILNOST_2026_EXHIBITORS) {
    const face = {
      participationId: `fixture-${exhibitor.key}`,
      exhibitorName: exhibitor.name,
      logoUrl: fairSiteLogoUrl(exhibitor),
      ...(exhibitor.websiteUrl ? { websiteUrl: exhibitor.websiteUrl } : {}),
      category: exhibitor.category,
    };
    if (!exhibitor.locations.length) {
      withoutLocation.push({ ...face, zoneId: fairSiteExhibitorMapZone(exhibitor.zone) });
      continue;
    }
    exhibitor.locations.forEach((mapLocationId, index) => {
      const location = ELEKTROMOBILNOST_2026_MAP.zones.flatMap((zone) => zone.locations).find((row) => row.id === mapLocationId)!;
      const fields = fairSiteStandFields(exhibitor.key, location);
      const models = index === 0 ? (TEST_MODELS[exhibitor.key] ?? []) : [];
      stands.push({
        ...face,
        standId: `fixture-${fields.externalKey}`,
        mapLocationId,
        code: fields.code,
        displayName: fields.displayName,
        brands: models.length
          ? [{ brandId: `fixture-brand-${exhibitor.key}`, brandName: `TEST ${exhibitor.name}`, models: models.map((model) => ({ id: `fixture-${model.slug}`, slug: model.slug, displayName: model.name })) }]
          : [],
      });
    });
  }
  const passport: FairPassportCatalogEntry = {
    passportId: "fixture-passport-toyota",
    eventId: "fixture-event",
    brandId: "fixture-brand-toyota",
    brandName: "TEST Toyota",
    standMapLocationIds: ["hala-2"],
    models: TEST_MODELS.toyota.map((model) => ({ eventModelId: `fixture-${model.slug}`, slug: model.slug, displayName: model.name })),
  };
  const rotation: FairSponsoredRotationView = {
    surface: "map",
    eventId: "fixture-event",
    snapshotId: "fixture-snapshot",
    version: 1,
    dayKey: "2026-10-09",
    seed: "fixture",
    epochMs: FAIR_MAP_PREVIEW_EPOCH,
    intervalMs: FAIR_MAP_ROTATION_INTERVAL_MS,
    items: [
      {
        eventModelId: "fixture-test-model-a",
        eventId: "fixture-event",
        eventSlug: FAIR_MAP_PREVIEW_SLUG,
        slug: "test-model-a",
        brandId: "fixture-brand-byd",
        brandName: "TEST BYD",
        displayName: "TEST model A",
        priceText: "TEST cena",
        visual: "event_placeholder",
        standMapLocationId: "hala-2",
        order: 0,
        audienceResult: {
          questionId: "fixture-question",
          prompt: "TEST pitanje za rotaciju?",
          options: [
            { id: "da", label: "TEST da", order: 0 },
            { id: "ne", label: "TEST ne", order: 1 },
          ],
          result: { questionId: "fixture-question", state: "waiting_for_minimum" },
        },
      },
    ],
  };
  return {
    view: buildFairMapView(ELEKTROMOBILNOST_2026_MAP, stands, [passport], withoutLocation),
    rotation,
    passportProgress: [{ passportId: passport.passportId, stampedModelIds: ["fixture-test-model-c"], stampedCount: 1, requiredCount: 2, completed: false }],
  };
}
