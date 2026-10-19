// Kiosk za ekran na štandu (A10, PLAN §6, A03 §5.3). Čisto: raspored petlje i sat kioska.
//
// Petlja: tura (60 s) → orbita (20 s) → rasklapanje (4 s) → držanje (8 s) → sklapanje (4 s), pa
// ispočetka (≈ 96 s). Auto se sam okreće posle ture; uz reduced motion nema orbite ni okretanja, a
// tura i rasklapanje idu rezovima. Prvi dodir zaustavlja petlju i pokazuje kontrole; posle 45 s bez
// dodira sve se vraća na početak. Kursor miša se krije posle 3 s mirovanja.
//
// Sat je jedna mala vrednost bez nizova: React strana ga pomera jednim intervalom (KIOSK_TICK_MS) i
// šalje komande u store, pa ni posle sat vremena rada nema rasta memorije ni zaostalih tajmera.

import { stepAt, TOUR_SECONDS } from "./tour";

export const KIOSK_IDLE_MS = 45_000;
export const KIOSK_CURSOR_MS = 3_000;
export const KIOSK_TICK_MS = 250;
/** Trajanje rasklapanja i sklapanja u petlji. */
export const KIOSK_EXPLODE_MS = 4_000;

export type KioskPhaseId = "tura" | "orbita" | "rasklapanje" | "drzanje" | "sklapanje";
export type KioskPhase = { id: KioskPhaseId; seconds: number };

const PHASES: readonly KioskPhase[] = [
  { id: "tura", seconds: TOUR_SECONDS },
  { id: "orbita", seconds: 20 },
  { id: "rasklapanje", seconds: KIOSK_EXPLODE_MS / 1000 },
  { id: "drzanje", seconds: 8 },
  { id: "sklapanje", seconds: KIOSK_EXPLODE_MS / 1000 },
];
const PHASES_REDUCED = PHASES.filter((p) => p.id !== "orbita");

export function kioskPhases(reduced: boolean): readonly KioskPhase[] {
  return reduced ? PHASES_REDUCED : PHASES;
}

export function kioskLoopSeconds(reduced: boolean): number {
  return kioskPhases(reduced).reduce((sum, p) => sum + p.seconds, 0);
}

/** Faza petlje u trenutku t (s od početka petlje), u krug. */
export function phaseAt(t: number, reduced: boolean): { index: number; id: KioskPhaseId; local: number; seconds: number } {
  const phases = kioskPhases(reduced);
  const total = kioskLoopSeconds(reduced);
  let local = ((t % total) + total) % total;
  for (let i = 0; i < phases.length; i++) {
    if (local < phases[i].seconds) return { index: i, id: phases[i].id, local, seconds: phases[i].seconds };
    local -= phases[i].seconds;
  }
  const last = phases.length - 1;
  return { index: last, id: phases[last].id, local: phases[last].seconds, seconds: phases[last].seconds };
}

/** Auto se sam okreće u fazama posle ture (ne u turi i ne uz reduced motion). */
export function kioskRotates(phase: KioskPhaseId | null, reduced: boolean): boolean {
  return !reduced && phase !== null && phase !== "tura";
}

export function shouldReset(now: number, lastInput: number, idleMs = KIOSK_IDLE_MS): boolean {
  return now - lastInput >= idleMs;
}

export type KioskClock = {
  /** Petlja radi (niko ne dira ekran). */
  auto: boolean;
  /** Početak petlje (ms, isti sat kao `now`). */
  loopStart: number;
  /** Poslednji dodir, taster ili točkić. */
  lastInput: number;
  /** Poslednje pomeranje pokazivača (kursor). */
  lastMove: number;
  /** Poslednja javljena faza i korak ture (-1 = još ništa). */
  phase: number;
  step: number;
  cursorHidden: boolean;
};

export type KioskCommand =
  | { type: "reset" }
  | { type: "touch" }
  | { type: "phase"; id: KioskPhaseId }
  | { type: "tourStep"; step: number }
  | { type: "cursor"; hidden: boolean };

export type KioskResult = { clock: KioskClock; commands: KioskCommand[] };

/** Sat kioska; `auto: false` kad kiosk počinje sa traženim delom ili grupom (petlja posle 45 s). */
export function kioskStart(now: number, auto = true): KioskClock {
  return { auto, loopStart: now, lastInput: now, lastMove: now, phase: -1, step: -1, cursorHidden: false };
}

/** Jedan otkucaj sata: povratak posle 45 s, faza petlje, korak ture i kursor. */
export function kioskTick(c: KioskClock, now: number, reduced: boolean): KioskResult {
  const commands: KioskCommand[] = [];
  let clock = c;
  if (!clock.auto && shouldReset(now, clock.lastInput)) {
    clock = { ...clock, auto: true, loopStart: now, phase: -1, step: -1 };
    commands.push({ type: "reset" });
  }
  if (clock.auto) {
    const p = phaseAt((now - clock.loopStart) / 1000, reduced);
    if (p.index !== clock.phase) {
      clock = { ...clock, phase: p.index, step: -1 };
      commands.push({ type: "phase", id: p.id });
    }
    if (p.id === "tura") {
      const step = Math.max(0, stepAt(p.local));
      if (step !== clock.step) {
        clock = { ...clock, step };
        commands.push({ type: "tourStep", step });
      }
    }
  }
  if (!clock.cursorHidden && now - clock.lastMove >= KIOSK_CURSOR_MS) {
    clock = { ...clock, cursorHidden: true };
    commands.push({ type: "cursor", hidden: true });
  }
  return { clock, commands };
}

/** Dodir, taster ili točkić: prvi zaustavlja petlju, svaki pomera rok od 45 s. */
export function kioskInput(c: KioskClock, now: number): KioskResult {
  const commands: KioskCommand[] = [];
  let clock: KioskClock = { ...c, lastInput: now, lastMove: now };
  if (c.auto) {
    clock = { ...clock, auto: false, phase: -1, step: -1 };
    commands.push({ type: "touch" });
  }
  if (c.cursorHidden) {
    clock = { ...clock, cursorHidden: false };
    commands.push({ type: "cursor", hidden: false });
  }
  return { clock, commands };
}

/**
 * Pomeranje pokazivača vraća kursor. Dok petlja radi ne budi kiosk (neko je samo dirnuo miša), a
 * dok posetilac istražuje produžava rok od 45 s (hover je takođe rad).
 */
export function kioskMove(c: KioskClock, now: number): KioskResult {
  let clock: KioskClock = { ...c, lastMove: now, lastInput: c.auto ? c.lastInput : now };
  const commands: KioskCommand[] = [];
  if (c.cursorHidden) {
    clock = { ...clock, cursorHidden: false };
    commands.push({ type: "cursor", hidden: false });
  }
  return { clock, commands };
}
