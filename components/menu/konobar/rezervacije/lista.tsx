// ScanMe Menu V1 (K25) — the reservations of the work queue (master §10.2;
// plan K24-14, K24-15, §2.5): the `Rezervacije` filter lists them in groups,
// the next thing to do on top — Čekaju odgovor, Kasne, Uskoro, Kasnije danas,
// Sutra i prekosutra, Stigli danas, Otkazane (lib/menu/reservation-queue.ts).
// Empty groups are not drawn. The same cards fill the `Novi` group and the
// `Uskoro` section of `Sve`.

import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { RESERVATION_GROUP_KEYS, type ReservationGroups, type ReservationRow } from "@/lib/menu/reservation-queue";
import { KarticaRezervacije } from "./kartica-rezervacije";

const t = menuKonobarSr.rezervacije;

export type KarticeRezervacijaProps = {
  sadaMs: number;
  holdMin: number;
  /** The reservation whose action is in flight. */
  radiId: string | null;
  onOtvori(id: string): void;
  onStigli(red: ReservationRow): void;
  radnjeIskljucene: boolean;
};

/** A plain list of reservation cards (one <li> each). */
export function KarticeRezervacija({ redovi, ...ostalo }: KarticeRezervacijaProps & { redovi: readonly ReservationRow[] }) {
  return (
    <ul className="grid gap-3">
      {redovi.map((red) => (
        <li key={red.id}>
          <KarticaRezervacije
            red={red}
            sadaMs={ostalo.sadaMs}
            holdMin={ostalo.holdMin}
            radi={ostalo.radiId === red.id}
            onOtvori={ostalo.onOtvori}
            onStigli={ostalo.onStigli}
            radnjeIskljucene={ostalo.radnjeIskljucene}
          />
        </li>
      ))}
    </ul>
  );
}

/** The groups of the `Rezervacije` filter, each with its heading and count. */
export function GrupeRezervacija({ grupe, ...ostalo }: KarticeRezervacijaProps & { grupe: ReservationGroups }) {
  return (
    <div className="grid gap-5" data-rezervacije-grupe>
      {RESERVATION_GROUP_KEYS.map((kljuc) =>
        grupe[kljuc].length === 0 ? null : (
          <section key={kljuc} aria-labelledby={`rez-grupa-${kljuc}`} className="grid gap-3" data-rez-grupa={kljuc}>
            <h2 id={`rez-grupa-${kljuc}`} className="flex items-baseline gap-2 text-lg font-bold text-[var(--mp-tekst)]">
              {t.grupe[kljuc]}
              <span className="text-base font-semibold tabular-nums text-[var(--mp-tekst-sporedni)]">{grupe[kljuc].length}</span>
            </h2>
            <KarticeRezervacija redovi={grupe[kljuc]} {...ostalo} />
          </section>
        ),
      )}
    </div>
  );
}

/** Is any group drawn? (An empty list shows the honest empty state instead.) */
export function imaRezervacija(grupe: ReservationGroups): boolean {
  return RESERVATION_GROUP_KEYS.some((kljuc) => grupe[kljuc].length > 0);
}
