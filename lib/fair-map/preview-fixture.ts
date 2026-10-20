import type { FairPassportCatalogEntry, FairPassportProgress, FairPublicMapStand, FairPublicMapUnlocatedExhibitor, FairSponsoredRotationView } from "../fair-contract";
import { FAIR_MAP_ROTATION_INTERVAL_MS } from "../fair-contract";
import { ELEKTROMOBILNOST_2026_EXHIBITORS, fairSiteExhibitorMapZone, fairSiteLogoUrl, fairSiteStandFields } from "../fair-import/izlagaci-2026";
import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { buildFairMapView, type FairMapView } from "./view";

// N4 — DEV preview data (/dev/sajam-mapa) and test fixture of the map v2: the
// organizer's real exhibitor list (lib/fair-import/izlagaci-2026.ts) on the
// real geometry, plus a few clearly marked TEST brands/models, one rotation
// item and one passport. Nothing here pretends to be a real car or result.

export const FAIR_MAP_PREVIEW_SLUG = "test-elektromobilnost-2026";
export const AUTO_MOTO_FEST_MAP_PREVIEW_SLUG = "test-auto-moto-fest-2026";
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

type AmfFixtureStand = FairPublicMapStand & { brands: [{ brandId: string; brandName: string; models: Array<{ id: string; slug: string; displayName: string }> }] };

function amfFixtureStand(
  key: string,
  exhibitorName: string,
  mapLocationId: string,
  logoUrl: string,
  modelNames: readonly string[],
): AmfFixtureStand {
  const brandId = `TEST-amf-brand-${key}`;
  return {
    participationId: `TEST-amf-participation-${key}`,
    exhibitorName: `TEST ${exhibitorName}`,
    logoUrl,
    category: "automobili",
    standId: `TEST-amf-stand-${key}`,
    mapLocationId,
    code: `TEST-AMF-${key.toUpperCase()}`,
    displayName: `TEST lokacija ${exhibitorName}`,
    brands: [
      {
        brandId,
        brandName: `TEST ${exhibitorName}`,
        models: modelNames.map((displayName, index) => ({ id: `TEST-amf-${key}-model-${index + 1}`, slug: `test-${key}-model-${index + 1}`, displayName })),
      },
    ],
  };
}

function amfPassport(stand: AmfFixtureStand): FairPassportCatalogEntry {
  const brand = stand.brands[0];
  return {
    passportId: `TEST-amf-passport-${brand.brandId}`,
    eventId: "TEST-amf-event",
    brandId: brand.brandId,
    brandName: brand.brandName,
    brandLogoUrl: stand.logoUrl,
    standMapLocationIds: [stand.mapLocationId],
    models: brand.models.map((model) => ({ eventModelId: model.id, slug: model.slug, displayName: model.displayName })),
  };
}

/** AMF-only local preview: organizer geometry plus visibly fabricated visitor data, never Convex. */
export function buildAutoMotoFestMapPreview(): FairMapPreview {
  const stands = [
    amfFixtureStand("toyota", "Toyota", "hala-1", "/sajam/izlagaci/2026/providni/toyota.webp", ["TEST Urban Cruiser", "TEST C-HR"]),
    amfFixtureStand("citroen", "Citroën", "hala-2", "/sajam/izlagaci/2026/providni/citroen.webp", ["TEST C3", "TEST C4"]),
    amfFixtureStand("byd", "BYD", "hala-3", "/sajam/izlagaci/2026/providni/byd.webp", ["TEST Dolphin", "TEST Sealion 7"]),
    amfFixtureStand("geely", "Geely", "hala-5", "/sajam/izlagaci/2026/providni/geely.webp", ["TEST Starray", "TEST EX5"]),
    amfFixtureStand("ford", "Ford", "hala-6-7", "/sajam/izlagaci/2026/providni/ford.webp", ["TEST Puma", "TEST Explorer"]),
  ];
  const passports = stands.slice(0, 3).map(amfPassport);
  const [toyota, citroen, byd] = passports;
  const rotationModel = stands[3].brands[0].models[0];
  const rotation: FairSponsoredRotationView = {
    surface: "map",
    eventId: "TEST-amf-event",
    snapshotId: "TEST-amf-snapshot",
    version: 1,
    dayKey: "2026-10-30",
    seed: "TEST-amf",
    epochMs: FAIR_MAP_PREVIEW_EPOCH,
    intervalMs: FAIR_MAP_ROTATION_INTERVAL_MS,
    items: [
      {
        eventModelId: rotationModel.id,
        eventId: "TEST-amf-event",
        eventSlug: AUTO_MOTO_FEST_MAP_PREVIEW_SLUG,
        slug: rotationModel.slug,
        brandId: stands[3].brands[0].brandId,
        brandName: stands[3].brands[0].brandName,
        displayName: rotationModel.displayName,
        priceText: "TEST cena",
        visual: "event_placeholder",
        standMapLocationId: stands[3].mapLocationId,
        order: 0,
        audienceResult: {
          questionId: "TEST-amf-question",
          prompt: "TEST pitanje za rotaciju?",
          options: [
            { id: "da", label: "TEST da", order: 0 },
            { id: "ne", label: "TEST ne", order: 1 },
          ],
          result: { questionId: "TEST-amf-question", state: "waiting_for_minimum" },
        },
      },
    ],
  };
  const passportProgress: FairPassportProgress[] = [
    {
      passportId: toyota.passportId,
      stampedModelIds: toyota.models.map((model) => model.eventModelId),
      stampedCount: toyota.models.length,
      requiredCount: toyota.models.length,
      completed: true,
    },
    {
      passportId: citroen.passportId,
      stampedModelIds: [citroen.models[0].eventModelId],
      stampedCount: 1,
      requiredCount: citroen.models.length,
      completed: false,
    },
    {
      passportId: byd.passportId,
      stampedModelIds: [],
      stampedCount: 0,
      requiredCount: byd.models.length,
      completed: false,
    },
  ];
  return {
    view: buildFairMapView(AUTO_MOTO_FEST_2026_MAP, stands, passports),
    rotation,
    passportProgress,
  };
}
