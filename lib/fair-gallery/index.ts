import { AUTO_EXPO_2026_GALLERY, type FairGallerySlide, type FairModelGallery } from "./auto-expo-2026";

export type { FairGalleryGroup, FairGallerySlide, FairModelGallery } from "./auto-expo-2026";

const GALLERIES: Readonly<Record<string, Readonly<Record<string, FairModelGallery>>>> = {
  "auto-expo-2026": AUTO_EXPO_2026_GALLERY,
};

/** The photo slider of a model (public event slug, `test-` ignored), or null: the model page keeps its photo. */
export function fairModelGallery(eventSlug: string, modelSlug: string): FairModelGallery | null {
  return GALLERIES[eventSlug.replace(/^test-/, "")]?.[modelSlug] ?? null;
}

export type FairSliderSlide = FairGallerySlide & { groupIndex: number | null; indexInGroup: number; fit: "contain" | "cover" };

/**
 * The slides the slider walks through. "angles": the chosen colour's angles. "colors": one slide
 * per colour, then the extra photos (cover-fitted, they are real photos, not studio shots).
 */
export function fairSliderSlides(gallery: FairModelGallery, groupIndex: number): FairSliderSlide[] {
  if (gallery.mode === "angles") {
    const group = gallery.groups[groupIndex] ?? gallery.groups[0];
    return (group?.slides ?? []).map((slide, index) => ({ ...slide, groupIndex, indexInGroup: index, fit: "contain" }));
  }
  return [
    ...gallery.groups.flatMap((group, gi) => group.slides.map((slide, index) => ({ ...slide, groupIndex: gi, indexInGroup: index, fit: "contain" as const }))),
    ...gallery.extra.map((slide, index) => ({ ...slide, groupIndex: null, indexInGroup: index, fit: "cover" as const })),
  ];
}

/** Autoplay: the first move waits longer, then every 7 s (owner, 27. 11.). */
export const FAIR_SLIDER_FIRST_DELAY_MS = 12_000;
export const FAIR_SLIDER_INTERVAL_MS = 7_000;

export function fairSliderDelay(autoAdvances: number): number {
  return autoAdvances === 0 ? FAIR_SLIDER_FIRST_DELAY_MS : FAIR_SLIDER_INTERVAL_MS;
}
