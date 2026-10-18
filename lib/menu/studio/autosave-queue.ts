// ScanMe Menu V1 — the editor's save queue (K10; master §6.1 "svaka izmena se
// automatski čuva kao nacrt", K09 §1.4). Pure: no React, the clock and timers
// are injected, so the rules are tested without a browser.
//
// Every saved field has a key (`cena:<articleId>`) and is
// sent with the value the person last saw (`ocekivano`, compare-and-set on the
// server). Rules:
//   - a new value for a key that has not been sent yet replaces the old one
//     and keeps the first `ocekivano`;
//   - a new value while the key is in flight waits, and goes out with
//     `ocekivano` = the value in flight once that one is saved;
//   - a conflict (someone saved meanwhile) stops the key: nothing is
//     overwritten, the queued value is dropped and the field shows both values;
//   - a failure keeps the value on screen; `pokusajPonovo` sends every failed
//     key again with the same `ocekivano`;
//   - a value equal to `ocekivano` with nothing in flight is no change at all.
// Structural actions (add, delete) are not queued but tracked (`prati`), so
// the save state says "Čuva se…" while they run.

import type { CasValue } from "../cas";
import type { StudioIshod } from "./model";

export type RedSat = {
  sad(): number;
  zakazi(fn: () => void, ms: number): unknown;
  otkazi(handle: unknown): void;
};

const PRAVI_SAT: RedSat = {
  sad: () => Date.now(),
  zakazi: (fn, ms) => setTimeout(fn, ms),
  otkazi: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type RedPosiljalac = (ocekivano: CasValue, vrednost: CasValue) => Promise<StudioIshod<unknown>>;

export type StanjePolja =
  | { faza: "ceka" | "salje"; vrednost: CasValue }
  | { faza: "greska"; vrednost: CasValue; kod: string; ponovljivo: boolean }
  | { faza: "konflikt"; vrednost: CasValue; sacuvano: CasValue; pokusano: CasValue };

export type AutosaveZbir = {
  stanje: "sacuvano" | "cuva-se" | "greska";
  /** Keys that failed or are in conflict. */
  neuspelo: number;
  /** When the last save succeeded (ms), null = nothing saved in this session yet. */
  poslednjeU: number | null;
};

type Unos = {
  ocekivano: CasValue;
  vrednost: CasValue;
  posalji: RedPosiljalac;
  faza: "ceka" | "salje" | "greska" | "konflikt";
  /** A newer value typed while this one was in flight. */
  sledece?: CasValue;
  tajmer?: unknown;
  greska?: { kod: string; ponovljivo: boolean };
  konflikt?: { sacuvano: CasValue; pokusano: CasValue };
};

export class AutosaveRed {
  private readonly unosi = new Map<string, Unos>();
  private readonly sacuvanoU = new Map<string, number>();
  private uToku = 0;
  private poslednjeU: number | null = null;
  private readonly slusaoci = new Set<() => void>();
  private readonly sat: RedSat;
  private verzija = 0;
  private kes: { verzija: number; mapa: ReadonlyMap<string, CasValue> } | null = null;

  constructor(sat: RedSat = PRAVI_SAT) {
    this.sat = sat;
  }

  /** For useSyncExternalStore: a number that changes on every state change. */
  snimak(): number {
    return this.verzija;
  }

  pretplati(slusalac: () => void): () => void {
    this.slusaoci.add(slusalac);
    return () => this.slusaoci.delete(slusalac);
  }

  private javi(): void {
    this.verzija += 1;
    for (const slusalac of this.slusaoci) slusalac();
  }

  /**
   * Saves `vrednost` for `kljuc` after `odlozi` ms (0 = now). `ocekivano` is
   * the value the person saw when they started editing.
   */
  zakazi(
    kljuc: string,
    izmena: { ocekivano: CasValue; vrednost: CasValue; posalji: RedPosiljalac; odlozi?: number },
  ): void {
    const odlozi = izmena.odlozi ?? 0;
    const postojeci = this.unosi.get(kljuc);
    if (postojeci?.faza === "salje") {
      postojeci.sledece = izmena.vrednost;
      postojeci.posalji = izmena.posalji;
      this.javi();
      return;
    }
    let ocekivano = izmena.ocekivano;
    if (postojeci?.faza === "ceka" || postojeci?.faza === "greska") ocekivano = postojeci.ocekivano;
    // After a conflict the person saw the saved value; a new edit builds on it.
    if (postojeci?.faza === "konflikt" && postojeci.konflikt) ocekivano = postojeci.konflikt.sacuvano;
    if (postojeci?.tajmer !== undefined) this.sat.otkazi(postojeci.tajmer);

    if (izmena.vrednost === ocekivano) {
      if (postojeci) {
        this.unosi.delete(kljuc);
        this.javi();
      }
      return;
    }
    const unos: Unos = { ocekivano, vrednost: izmena.vrednost, posalji: izmena.posalji, faza: "ceka" };
    this.unosi.set(kljuc, unos);
    if (odlozi > 0) {
      unos.tajmer = this.sat.zakazi(() => this.posalji(kljuc), odlozi);
      this.javi();
    } else {
      this.posalji(kljuc);
    }
  }

  /** Sends a waiting key now (blur, Enter). */
  isprazni(kljuc: string): void {
    const unos = this.unosi.get(kljuc);
    if (!unos || unos.faza !== "ceka") return;
    if (unos.tajmer !== undefined) this.sat.otkazi(unos.tajmer);
    this.posalji(kljuc);
  }

  private posalji(kljuc: string): void {
    const unos = this.unosi.get(kljuc);
    if (!unos) return;
    unos.tajmer = undefined;
    unos.faza = "salje";
    unos.greska = undefined;
    unos.konflikt = undefined;
    this.javi();
    const { ocekivano, vrednost } = unos;
    let ishod: Promise<StudioIshod<unknown>>;
    try {
      ishod = unos.posalji(ocekivano, vrednost);
    } catch {
      ishod = Promise.resolve({ ok: false, vrsta: "greska", kod: "mreza", ponovljivo: true });
    }
    ishod
      .catch((): StudioIshod<unknown> => ({ ok: false, vrsta: "greska", kod: "mreza", ponovljivo: true }))
      .then((rezultat) => this.zavrsi(kljuc, unos, rezultat));
  }

  private zavrsi(kljuc: string, unos: Unos, rezultat: StudioIshod<unknown>): void {
    if (this.unosi.get(kljuc) !== unos) return; // dropped meanwhile
    if (rezultat.ok) {
      const sada = this.sat.sad();
      this.poslednjeU = sada;
      if (unos.sledece !== undefined && unos.sledece !== unos.vrednost) {
        unos.ocekivano = unos.vrednost;
        unos.vrednost = unos.sledece;
        unos.sledece = undefined;
        this.posalji(kljuc);
        return;
      }
      this.unosi.delete(kljuc);
      this.sacuvanoU.set(kljuc, sada);
      this.javi();
      return;
    }
    if (rezultat.vrsta === "konflikt") {
      unos.faza = "konflikt";
      unos.sledece = undefined;
      unos.konflikt = { sacuvano: rezultat.sacuvano, pokusano: rezultat.pokusano };
      this.javi();
      return;
    }
    if (unos.sledece !== undefined) {
      unos.vrednost = unos.sledece;
      unos.sledece = undefined;
    }
    // Typed back to what is saved while the failed send was in flight: nothing to save.
    if (unos.vrednost === unos.ocekivano) {
      this.unosi.delete(kljuc);
      this.javi();
      return;
    }
    unos.faza = "greska";
    unos.greska = { kod: rezultat.kod, ponovljivo: rezultat.ponovljivo };
    this.javi();
  }

  /** "Pokušaj ponovo": every failed key again, with the same `ocekivano`. */
  pokusajPonovo(kljuc?: string): void {
    for (const [k, unos] of this.unosi) {
      if ((kljuc === undefined || k === kljuc) && unos.faza === "greska") this.posalji(k);
    }
  }

  /** "Zadrži moju": send this person's value over the value saved meanwhile. */
  zadrziMoju(kljuc: string): void {
    const unos = this.unosi.get(kljuc);
    if (!unos || unos.faza !== "konflikt" || !unos.konflikt) return;
    unos.ocekivano = unos.konflikt.sacuvano;
    this.posalji(kljuc);
  }

  /** Forgets a key (e.g. "Uzmi sačuvanu" after a conflict, or Escape). */
  odbaci(kljuc: string): void {
    const unos = this.unosi.get(kljuc);
    if (!unos) return;
    if (unos.tajmer !== undefined) this.sat.otkazi(unos.tajmer);
    this.unosi.delete(kljuc);
    this.javi();
  }

  /** Tracks a structural action so the save state reads "Čuva se…" while it runs. */
  async prati<T>(rad: () => Promise<StudioIshod<T>>): Promise<StudioIshod<T>> {
    this.uToku += 1;
    this.javi();
    try {
      const rezultat = await rad();
      if (rezultat.ok) this.poslednjeU = this.sat.sad();
      return rezultat;
    } catch {
      return { ok: false, vrsta: "greska", kod: "mreza", ponovljivo: true };
    } finally {
      this.uToku -= 1;
      this.javi();
    }
  }

  stanje(kljuc: string): StanjePolja | undefined {
    const unos = this.unosi.get(kljuc);
    if (!unos) return undefined;
    const vrednost = unos.sledece !== undefined ? unos.sledece : unos.vrednost;
    if (unos.faza === "greska" && unos.greska) {
      return { faza: "greska", vrednost, kod: unos.greska.kod, ponovljivo: unos.greska.ponovljivo };
    }
    if (unos.faza === "konflikt" && unos.konflikt) {
      return { faza: "konflikt", vrednost, sacuvano: unos.konflikt.sacuvano, pokusano: unos.konflikt.pokusano };
    }
    return { faza: unos.faza === "salje" ? "salje" : "ceka", vrednost };
  }

  /** When the key was last saved successfully (ms), for a short "Sačuvano" mark. */
  sacuvano(kljuc: string): number | undefined {
    return this.sacuvanoU.get(kljuc);
  }

  /**
   * The values not yet confirmed by the server, by key — what the list and the
   * preview show instead of the server value (a conflict shows the person's
   * own value until they choose). The same map object until the queue changes,
   * so it can be a memo dependency.
   */
  naCekanju(): ReadonlyMap<string, CasValue> {
    if (this.kes?.verzija === this.verzija) return this.kes.mapa;
    const out = new Map<string, CasValue>();
    for (const [kljuc, unos] of this.unosi) {
      out.set(kljuc, unos.sledece !== undefined ? unos.sledece : unos.vrednost);
    }
    this.kes = { verzija: this.verzija, mapa: out };
    return out;
  }

  zbir(): AutosaveZbir {
    let cuvaSe = this.uToku > 0;
    let neuspelo = 0;
    for (const unos of this.unosi.values()) {
      if (unos.faza === "ceka" || unos.faza === "salje") cuvaSe = true;
      else neuspelo += 1;
    }
    return {
      stanje: cuvaSe ? "cuva-se" : neuspelo > 0 ? "greska" : "sacuvano",
      neuspelo,
      poslednjeU: this.poslednjeU,
    };
  }

  /** Something would be lost by leaving the page now. */
  imaNesacuvano(): boolean {
    return this.uToku > 0 || this.unosi.size > 0;
  }
}

/** Key of the shared base price of an article. */
export const kljucCene = (artikalId: string) => `cena:${artikalId}`;
