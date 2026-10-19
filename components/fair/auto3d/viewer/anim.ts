// Mali animator skalara u petlji crtanja (hover, izbor, prigušenje, rasklapanje). GSAP ostaje samo
// za letove kamere (rules.md), a ovo su prelazi uniform-a koje petlja na zahtev ionako crta.

export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;
export const easeInOut: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOut: Ease = (t) => 1 - (1 - t) ** 2;

type Item = {
  from: number;
  to: number;
  t0: number;
  dur: number;
  ease: Ease;
  set: (v: number) => void;
  done?: () => void;
};

export class Animator {
  private items = new Map<string, Item>();

  /** Animira od `from` do `to` za `durMs`; trajanje 0 postavlja vrednost odmah. */
  run(key: string, from: number, to: number, durMs: number, set: (v: number) => void, ease: Ease = linear, done?: () => void) {
    if (durMs <= 0 || from === to) {
      this.items.delete(key);
      set(to);
      done?.();
      return;
    }
    this.items.set(key, { from, to, t0: performance.now(), dur: durMs, ease, set, done });
  }

  /** Jedan korak; vraća true dok ima aktivnih animacija. */
  step(now = performance.now()): boolean {
    for (const [key, it] of this.items) {
      const t = Math.min(1, (now - it.t0) / it.dur);
      it.set(it.from + (it.to - it.from) * it.ease(t));
      if (t >= 1) {
        this.items.delete(key);
        it.done?.();
      }
    }
    return this.items.size > 0;
  }

  clear() {
    this.items.clear();
  }
}
