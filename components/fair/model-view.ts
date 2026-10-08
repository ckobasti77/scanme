import type { FairLeadFormView, FairModelCapabilities, FairPublicModel } from "@/lib/fair-contract";
import type { FairPhotoPresentation, FairPublicModelFixture } from "@/lib/fair-client/model-fixtures";

// =============================================================================
// Sajam 2026 N6 (F3) — the props of the public model page, from the server
// projection `fairPublic.getModelBySlug` (or, in `next dev` only, the design
// fixture). Pure: no fetch, no storage, no clock. Capabilities always come
// from the server projection, never from the URL. Missing data never becomes
// invented data: no photo → the tonal identity surface, no flagged highlight →
// the first real specifications, no description → no paragraph.
// (Lives here, not in lib/fair-client, because the night runner's editor
// permissions still lock lib/fair-client — see jovan-status/N6.md.)
// =============================================================================

export type FairModelSpecificationIcon = "power" | "torque" | "acceleration" | "speed" | "range" | "battery" | "charging";

export type FairModelPageSpecification = {
  id: string;
  label: string;
  shortLabel: string;
  value: string;
  isHighlight: boolean;
  icon?: FairModelSpecificationIcon;
};

export type FairModelPageModel = {
  /** `convex` = a real published model; `fixture` = the DEV design demo. */
  source: "convex" | "fixture";
  id: string;
  eventId: string;
  eventSlug: string;
  /** Header lockup: the umbrella title and the event's own name. */
  eventTitle: string;
  eventName: string;
  exhibitorName: string;
  brandName: string;
  modelSlug: string;
  /** Model name with its variant, as shown in the hero. */
  displayName: string;
  priceText: string;
  description?: string;
  photoUrl?: string;
  photoPresentation: FairPhotoPresentation;
  specificationGroups: Array<{ id: string; label: string; items: FairModelPageSpecification[] }>;
  /** At most four specifications for the first screen. */
  highlights: FairModelPageSpecification[];
  capabilities: FairModelCapabilities;
};

export type FairOpenLeadForm = Extract<FairLeadFormView, { state: "open" }>;

/** The lead forms the page may offer: only an `open` form is ever a button. */
export type FairModelLeadForms = { interest: FairOpenLeadForm | null; testDrive: FairOpenLeadForm | null };

/** Which visitor interactions are really connected on this page (anything else is hidden). */
export type FairModelInteractions = { rating: boolean; audience: boolean };

/**
 * N6: on a real model only what is wired to the gateway is shown. The rating
 * sheet and Glas publike still run on the design fixture (half stars,
 * localStorage votes), so they stay hidden on a real car until connected.
 */
export const FAIR_REAL_MODEL_INTERACTIONS: FairModelInteractions = { rating: false, audience: false };

export const FAIR_MODEL_HIGHLIGHTS_MAX = 4;

const fold = (value: string) =>
  value
    .toLocaleLowerCase("sr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

// Icon by what the label says (decoration only, never data). Order matters:
// "brzina punjenja" is charging, not speed.
const ICON_KEYWORDS: Array<[FairModelSpecificationIcon, RegExp]> = [
  ["charging", /punjenj|punjac|charging/],
  ["battery", /baterij|kapacitet|kwh/],
  ["range", /domet|autonomij|range/],
  ["acceleration", /0\s*-\s*100|ubrzanj/],
  ["torque", /moment/],
  ["power", /snag|\bkw\b|\bks\b|power/],
  ["speed", /brzin|speed/],
];

export function fairSpecificationIcon(label: string): FairModelSpecificationIcon | undefined {
  const text = fold(label);
  return ICON_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0];
}

/** Flagged highlights in server order; with none flagged, the first real specifications. */
export function fairModelHighlights(groups: FairModelPageModel["specificationGroups"]): FairModelPageSpecification[] {
  const items = groups.flatMap((group) => group.items);
  const flagged = items.filter((item) => item.isHighlight);
  return (flagged.length > 0 ? flagged : items).slice(0, FAIR_MODEL_HIGHLIGHTS_MAX);
}

/** `null` unless the server says the form is `open` (leads_disabled, unavailable, consent_not_configured → no button). */
export function fairOpenLeadForm(view: FairLeadFormView | null | undefined): FairOpenLeadForm | null {
  return view && view.state === "open" ? view : null;
}

export function fairModelPageFromPublic(model: FairPublicModel, input: { umbrellaTitle: string }): FairModelPageModel {
  const specificationGroups = [...model.specificationGroups]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: [...group.items]
        .sort((left, right) => left.order - right.order)
        .map((item) => {
          const icon = fairSpecificationIcon(item.label);
          return { id: item.id, label: item.label, shortLabel: item.label, value: item.value, isHighlight: item.isHighlight, ...(icon ? { icon } : {}) };
        }),
    }))
    .filter((group) => group.items.length > 0);
  const photoUrl = model.photoUrl?.trim();
  const variant = model.variant?.trim();
  return {
    source: "convex",
    id: model.id,
    eventId: model.eventId,
    eventSlug: model.eventSlug,
    eventTitle: input.umbrellaTitle,
    eventName: model.eventTitle,
    exhibitorName: model.exhibitorName,
    brandName: model.brandName,
    modelSlug: model.slug,
    displayName: variant ? `${model.displayName} ${variant}` : model.displayName,
    priceText: model.priceText,
    ...(photoUrl ? { photoUrl } : {}),
    photoPresentation: "left",
    specificationGroups,
    highlights: fairModelHighlights(specificationGroups),
    capabilities: model.capabilities,
  };
}

/** DEV design demo only (the page never calls this outside `next dev`). */
export function fairModelPageFromFixture(fixture: FairPublicModelFixture): FairModelPageModel {
  return {
    source: "fixture",
    id: fixture.id,
    eventId: fixture.eventId,
    eventSlug: fixture.eventSlug,
    eventTitle: fixture.eventTitle,
    eventName: fixture.eventName,
    exhibitorName: fixture.exhibitorName,
    brandName: fixture.brandName,
    modelSlug: fixture.modelSlug,
    displayName: fixture.displayName,
    priceText: fixture.priceText,
    description: fixture.description,
    ...(fixture.photoUrl ? { photoUrl: fixture.photoUrl } : {}),
    photoPresentation: fixture.photoPresentation,
    specificationGroups: fixture.specificationGroups,
    highlights: fairModelHighlights(fixture.specificationGroups),
    capabilities: fixture.capabilities,
  };
}
