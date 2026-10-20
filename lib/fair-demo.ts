import type { FairPublicEvent, FairPublicModel, FairPassportCatalogEntry, FairPassportProgress, FairSponsoredRotationView } from "./fair-contract";
import { fairDemoSr as dict } from "./i18n/sr/fair-demo";
import { fmt } from "./i18n/format";

// Public demonstration only: synthetic IDs, no database or private records.
export const FAIR_DEMO_SLUG = "demo-auto-moto-fest-2026";
export const FAIR_DEMO_EVENT: FairPublicEvent = {
  id: "demo-amf-2026", code: "auto-moto-fest-2026", slug: FAIR_DEMO_SLUG,
  title: dict.eventName, venueName: dict.venueName, timezone: "Europe/Belgrade",
  startsAt: Date.parse("2026-10-30T10:00:00+01:00"), endsAt: Date.parse("2026-11-01T20:00:00+01:00"),
  status: "live", garagePriority: 0, days: [],
};

export const FAIR_DEMO_MODELS: FairPublicModel[] = Array.from({ length: 3 }, (_, brand) => dict.models.map((name, index): FairPublicModel => ({
  id: `demo-model-${brand + 1}-${index + 1}`, eventId: FAIR_DEMO_EVENT.id, eventSlug: FAIR_DEMO_SLUG,
  eventTitle: dict.title, participationId: `demo-exhibitor-${brand + 1}`, exhibitorName: dict.exhibitor,
  brandId: `demo-brand-${brand + 1}`, brandName: fmt(dict.brand, { number: String(brand + 1).padStart(2, "0") }),
  standId: `demo-stand-${brand + 1}`, standMapLocationId: ["hala-10", "hala-9", "hala-8", "hala-2", "hala-1", "hala-3"][brand],
  slug: `demo-${brand + 1}-${index + 1}`, displayName: name, priceText: dict.price,
  photoUrl: ["/fair/demo/vehicle-showroom.webp", "/fair/demo/vehicle-showroom-blue.png", "/fair/demo/vehicle-showroom-copper.png"][index],
  specificationGroups: [{ id: "demo-specs", label: dict.specsTitle, order: 0, items: [
    { id: "demo-power", label: dict.power, value: `${150 + index * 20} kW`, order: 0, isHighlight: true },
    { id: "demo-range", label: dict.range, value: `${210 + index * 15} km/h`, order: 1, isHighlight: true },
    { id: "demo-transmission", label: dict.transmission, value: dict.automatic, order: 2, isHighlight: true },
  ] }],
  capabilities: { ratingMode: "dimensions", canSubmitInterest: true, canRequestTestDrive: true, hasAudienceQuestions: true, hasSurvey: true, isSponsored: true },
}))).flat();

export const FAIR_DEMO_PASSPORTS: FairPassportCatalogEntry[] = Array.from({ length: 3 }, (_, index) => {
  const models = FAIR_DEMO_MODELS.filter((model) => model.brandId === `demo-brand-${index + 1}`);
  return {
    passportId: `demo-passport-${index + 1}`, eventId: FAIR_DEMO_EVENT.id, brandId: models[0].brandId,
    brandName: models[0].brandName, standMapLocationIds: [models[0].standMapLocationId],
    models: models.map((model) => ({ eventModelId: model.id, slug: model.slug, displayName: model.displayName })),
  };
});

export const FAIR_DEMO_PROGRESS: FairPassportProgress[] = FAIR_DEMO_PASSPORTS.map(passport => {
  return { passportId: passport.passportId, stampedModelIds: passport.models.map((model) => model.eventModelId), stampedCount: 3, requiredCount: 3, completed: true };
});

// All models were scanned; only the first 0 / 2 / 3 stamps were stuck.
export const FAIR_DEMO_STUCK = Object.fromEntries(FAIR_DEMO_PASSPORTS.map((passport, index) => [passport.passportId, passport.models.slice(0, [0, 2, 3][index]).map(model => model.eventModelId)]));

export const FAIR_DEMO_ROTATION: FairSponsoredRotationView = {
  surface: "map", eventId: FAIR_DEMO_EVENT.id, snapshotId: "demo-rotation", version: 1,
  dayKey: "2026-10-30", seed: "demo", epochMs: 0, intervalMs: 12000,
  items: FAIR_DEMO_MODELS.slice(0, 3).map((model, index) => ({ eventModelId: model.id, eventId: model.eventId,
    eventSlug: model.eventSlug, slug: model.slug, brandId: model.brandId, brandName: model.brandName,
    displayName: model.displayName, priceText: model.priceText, photoUrl: model.photoUrl,
    visual: "photo", standMapLocationId: model.standMapLocationId, order: index })),
};

export function isFairDemoId(value: unknown): value is string {
  return typeof value === "string" && (value === FAIR_DEMO_SLUG || value === FAIR_DEMO_EVENT.id || value === "demo-survey" || FAIR_DEMO_MODELS.some((model) => model.id === value));
}
