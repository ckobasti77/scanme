// ScanMe Menu V1 (K25) — the picker of a reservation's table (master §11.3
// step 4; plan K24-11): the active positions of the floor, grouped by zone,
// and the staff choose ONE explicitly. The system never picks a table for
// them and never checks overlaps; the guest never chooses a table. The
// current table (if any) is marked. Buttons are at least 48 px.

import { Check } from "lucide-react";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { compareLabels } from "@/lib/menu/floor-layout";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import type { KonobarMesto, KonobarSala } from "../model";
import { sedistaTekst } from "../sala/pogled";

const t = menuKonobarSr.rezervacije.detalj;

type Grupa = { kljuc: string; naziv: string | null; mesta: KonobarMesto[] };

/** The positions by zone (the zones' order, "Bez zone" last), each group in label order (Sto 2 before Sto 10). */
export function grupisiMesta(sala: Pick<KonobarSala, "zones" | "positions">): Grupa[] {
  const poLabeli = (a: KonobarMesto, b: KonobarMesto) => compareLabels(a.label, b.label) || a.order - b.order;
  const imaZona = sala.zones.length > 0;
  const grupe: Grupa[] = [...sala.zones]
    .sort((a, b) => a.order - b.order)
    .map((zona) => ({ kljuc: zona.id, naziv: zona.name, mesta: sala.positions.filter((mesto) => mesto.zoneId === zona.id).sort(poLabeli) }));
  const bezZone = sala.positions.filter((mesto) => mesto.zoneId === null || !sala.zones.some((zona) => zona.id === mesto.zoneId)).sort(poLabeli);
  if (bezZone.length > 0) {
    grupe.push({ kljuc: "bez-zone", naziv: imaZona ? menuKonobarSr.sala.bezZone : null, mesta: bezZone });
  }
  return grupe.filter((grupa) => grupa.mesta.length > 0);
}

export function VezivanjeStola({
  sala,
  trenutnoId,
  iskljuceno,
  radi,
  onIzaberi,
  onOdustani,
}: {
  sala: Pick<KonobarSala, "zones" | "positions">;
  /** The table the reservation has now (marked), or null. */
  trenutnoId: string | null;
  /** Offline: choosing waits for the connection. */
  iskljuceno: boolean;
  radi: boolean;
  onIzaberi(positionId: string): void;
  onOdustani(): void;
}) {
  const grupe = grupisiMesta(sala);
  return (
    <section
      aria-labelledby="rez-izbor-sto"
      data-izbor-stola
      className="grid gap-4 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina-utisana)] p-4 [--border:var(--mp-ivica)]"
    >
      <div className="grid gap-1">
        <h2 id="rez-izbor-sto" className="text-lg font-bold text-[var(--mp-tekst)]">
          {t.izaberiSto}
        </h2>
        <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{t.izaberiStoOpis}</p>
      </div>
      {grupe.length === 0 ? (
        <p className="text-base text-[var(--mp-tekst-sporedni)]">{t.nemaStolova}</p>
      ) : (
        grupe.map((grupa) => (
          <div key={grupa.kljuc} role="group" aria-label={grupa.naziv ?? t.izaberiSto} className="grid gap-2" data-izbor-grupa={grupa.kljuc}>
            {grupa.naziv ? <h3 className="text-base font-bold text-[var(--mp-tekst)]">{grupa.naziv}</h3> : null}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {grupa.mesta.map((mesto) => {
                const trenutno = mesto.id === trenutnoId;
                const sedista = sedistaTekst(mesto.seats);
                return (
                  <li key={mesto.id}>
                    <button
                      type="button"
                      aria-pressed={trenutno}
                      disabled={iskljuceno || radi}
                      data-izbor-sto={mesto.id}
                      onClick={() => onIzaberi(mesto.id)}
                      className={cn(
                        "grid min-h-12 w-full content-center gap-0.5 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
                        trenutno
                          ? "bg-[var(--mp-akcent-meko)] [--border:var(--mp-mastilo)]"
                          : "bg-[var(--mp-povrsina)] [--border:var(--mp-ivica-kontrole)] hover:bg-[var(--mp-povrsina-utisana)]",
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5 break-words text-base font-bold text-[var(--mp-tekst)]">
                        {mesto.label}
                        {trenutno ? <Check aria-hidden="true" strokeWidth={2.5} className="size-4 shrink-0" /> : null}
                      </span>
                      {sedista ? <span className="text-sm text-[var(--mp-tekst-sporedni)]">{sedista}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      <div>
        <Dugme vrsta="sekundarno" onClick={onOdustani} className="min-h-12">
          {menuKonobarSr.rezervacije.predlog.odustani}
        </Dugme>
      </div>
    </section>
  );
}
