// Vođena tura (A10, PLAN §6, A03 §5.3): uvod, deset sistema redom iz kataloga i rasklopljen kraj,
// ukupno 60 s. Čisto: koraci, trajanja i korak u trenutku t. Titl sistema je opis sistema iz
// fair-auto3d-delovi.ts, a uvod i kraj imaju svoje ključeve u fair-auto3d.ts.
//
// Svaki korak ima kadar (grupa → kadar sistema, bez grupe → početni ili rasklopljeni kadar),
// izolovanu grupu (ostali delovi su prigušeni) i rasklapanje.

import { SYSTEMS, type SystemId } from "./catalog";

export type TourStepId = "uvod" | SystemId | "kraj";

export type TourStep = {
  id: TourStepId;
  /** Izolovana grupa; null = ceo auto. */
  group: SystemId | null;
  /** Rasklapanje 0–1. */
  explode: number;
  seconds: number;
};

const INTRO_SECONDS = 4;
const SYSTEM_SECONDS = 5;
const OUTRO_SECONDS = 6;

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "uvod", group: null, explode: 0, seconds: INTRO_SECONDS },
  ...SYSTEMS.map((s): TourStep => ({ id: s.id, group: s.id, explode: 0, seconds: SYSTEM_SECONDS })),
  { id: "kraj", group: null, explode: 1, seconds: OUTRO_SECONDS },
];

export const TOUR_SECONDS = TOUR_STEPS.reduce((sum, s) => sum + s.seconds, 0);

const STARTS = TOUR_STEPS.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + TOUR_STEPS[i - 1].seconds], []);

/** Početak koraka u sekundama od početka ture. */
export function stepStart(index: number): number {
  return STARTS[Math.max(0, Math.min(TOUR_STEPS.length - 1, index))];
}

/** Indeks koraka u trenutku t (s); posle kraja ture -1. */
export function stepAt(t: number): number {
  if (t < 0) return 0;
  if (t >= TOUR_SECONDS) return -1;
  for (let i = TOUR_STEPS.length - 1; i >= 0; i--) if (t >= STARTS[i]) return i;
  return 0;
}

export function isLastStep(index: number): boolean {
  return index >= TOUR_STEPS.length - 1;
}
