"use client";

// ScanMe Menu V1 (K20) — "Raspored", the schematic floor layout of "Lokal i QR"
// (master §9.2: "rasporedi stolove na način koji odgovara lokalu"; mockups
// README: schematic and adjustable, never photorealistic). One surface per
// zone, then "Bez zone"; every position is a button that can be selected,
// moved, resized and reshaped with the keyboard or dragged with the pointer.
//
// This component owns the selection, the optimistic layouts and the saving:
// a change shows at once, is stored through `radnje.setLayout` (or `setLayouts`
// when several positions are stored together), and goes back with a message
// when the store refuses it. Nothing here throws into the screen.

import { BedDouble, Check, LayoutGrid, Store } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Kartica } from "@/components/menu/zajednicko/kartica";
import { PraznoStanje } from "@/components/menu/zajednicko/stanja";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuLokalRasporedSr } from "@/lib/i18n/sr/menu-lokal-raspored";
import { autoArrange, type FloorLayout } from "@/lib/menu/floor-layout";
import type { LokalIshod, LokalPozicija, LokalRadnje, LokalZona } from "@/lib/menu/lokal/model";
import { cn } from "@/lib/utils";
import { KLASE_IZABRANO, KLASE_VRSTE } from "./mesto-na-rasporedu";
import { PovrsRasporeda } from "./povrs-rasporeda";
import {
  efektivniRasporedi,
  najavaPromene,
  ocistiPreklapanja,
  planCuvanja,
  potvrdiPreklapanja,
  povrsiRasporeda,
  primeniPreklapanja,
  redoviPovrsi,
  tekstGreske,
  vratiPreklapanja,
  type Izmena,
  type Preklapanja,
  type Prethodno,
  type StaPromene,
} from "./raspored-logika";

const t = menuLokalRasporedSr;

export type RasporedProps = {
  zones: LokalZona[];
  positions: LokalPozicija[];
  radnje: Pick<LokalRadnje, "setLayout" | "setLayouts">;
  /** Opens the position in the drawer ("Uredi mesto", key U). */
  onOtvoriPoziciju(positionId: string): void;
};

/** A small sample of how a position looks, for the legend (decorative: the text next to it says it). */
function Uzorak({ klase, okrugao = false, children }: { klase: string; okrugao?: boolean; children?: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center border-2",
        okrugao ? "size-5 rounded-full" : "h-5 w-7 rounded-[0.25rem]",
        klase,
      )}
    >
      {children}
    </span>
  );
}

function PomocRasporeda({ id }: { id: string }) {
  return (
    <Kartica ton="utisana" data-raspored-pomoc="" className="grid gap-3">
      <div id={id} className="grid gap-1.5 text-sm leading-relaxed text-[var(--mp-tekst)]">
        <p>{t.pomoc.tastatura}</p>
        <p>{t.pomoc.pokazivac}</p>
      </div>
      <ul aria-label={t.legenda.naslov} className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--mp-tekst)]">
        <li className="flex items-center gap-2">
          <Uzorak klase={KLASE_VRSTE.table} />
          {t.legenda.sto}
        </li>
        <li className="flex items-center gap-2">
          <Uzorak klase={KLASE_VRSTE.room}>
            <BedDouble strokeWidth={2} className="size-3" />
          </Uzorak>
          {t.legenda.soba}
        </li>
        <li className="flex items-center gap-2">
          <Uzorak klase={cn(KLASE_VRSTE.other, "border-dashed")}>
            <Store strokeWidth={2} className="size-3" />
          </Uzorak>
          {t.legenda.ostalo}
        </li>
        <li className="flex items-center gap-2">
          <Uzorak klase={KLASE_VRSTE.table} />
          <Uzorak klase={KLASE_VRSTE.table} okrugao />
          {t.legenda.oblik}
        </li>
        <li className="flex items-center gap-2">
          <Uzorak klase={KLASE_IZABRANO}>
            <Check strokeWidth={3} className="size-3" />
          </Uzorak>
          {t.legenda.izabrano}
        </li>
      </ul>
    </Kartica>
  );
}

export function Raspored({ zones, positions, radnje, onOtvoriPoziciju }: RasporedProps) {
  const pomocId = useId();
  const [izabrano, setIzabrano] = useState<string | null>(null);
  const [preklapanja, setPreklapanja] = useState<Preklapanja>(() => new Map());
  const [cuva, setCuva] = useState<string[]>([]);
  const [najava, setNajava] = useState<{ povrs: string; tekst: string; n: number } | null>(null);
  const [greska, setGreska] = useState<{ povrs: string; tekst: string } | null>(null);
  const brojac = useRef(0);
  const pozicijeRef = useRef(positions);
  useLayoutEffect(() => {
    pozicijeRef.current = positions;
  });

  const povrsi = useMemo(() => povrsiRasporeda(zones, positions), [zones, positions]);
  // Overrides the server state has caught up with are dropped here, by derivation.
  const vazeca = useMemo(() => ocistiPreklapanja(preklapanja, positions), [preklapanja, positions]);
  const prikaz = useMemo(
    () =>
      povrsi.map((povrs) => {
        const layouts = efektivniRasporedi(povrs.pozicije, vazeca);
        return { povrs, layouts, redova: redoviPovrsi(layouts) };
      }),
    [povrsi, vazeca],
  );

  if (prikaz.length === 0) {
    return <PraznoStanje ikonica={LayoutGrid} nivo={3} naslov={t.prazno.naslov} opis={t.prazno.opis} />;
  }

  const nadji = (id: string) => prikaz.find((stavka) => stavka.layouts.has(id));
  const nazivPozicije = (id: string) =>
    nadji(id)?.povrs.pozicije.find((pozicija) => pozicija.id === id)?.label ?? "";

  const objavi = (povrs: string, tekst: string) => {
    brojac.current += 1;
    setNajava({ povrs, tekst, n: brojac.current });
  };

  const izaberi = (id: string | null, opcije?: { tiho?: boolean }) => {
    const staro = izabrano;
    setIzabrano(id);
    setGreska(null);
    if (opcije?.tiho) return;
    if (id !== null) {
      const stavka = nadji(id);
      if (stavka) objavi(stavka.povrs.kljuc, fmt(t.najava.izabrano, { naziv: nazivPozicije(id) }));
    } else if (staro !== null) {
      const stavka = nadji(staro);
      if (stavka) objavi(stavka.povrs.kljuc, t.najava.ponisteno);
    }
  };

  /** Shows the new layouts at once, stores them, and puts them back with a message when the store refuses. */
  const sacuvaj = async (
    kljuc: string,
    naziv: string,
    izmene: Izmena[],
    tekstNajave: string,
    grupno = false,
  ): Promise<void> => {
    const prethodno: Prethodno[] = izmene.map((izmena) => ({ ...izmena, prethodno: vazeca.get(izmena.positionId) }));
    setPreklapanja((prev) => primeniPreklapanja(prev, izmene));
    setGreska(null);
    objavi(kljuc, tekstNajave);
    setCuva((lista) => [...lista, kljuc]);
    let ishod: LokalIshod;
    try {
      ishod =
        grupno || izmene.length > 1
          ? await radnje.setLayouts(izmene)
          : await radnje.setLayout(izmene[0].positionId, izmene[0].layout);
    } catch {
      ishod = { ok: false, code: "" };
    }
    setCuva((lista) => {
      const mesto = lista.indexOf(kljuc);
      return mesto < 0 ? lista : lista.filter((_, indeks) => indeks !== mesto);
    });
    if (ishod.ok) {
      setPreklapanja((prev) => potvrdiPreklapanja(prev, izmene, pozicijeRef.current));
      return;
    }
    setPreklapanja((prev) => vratiPreklapanja(prev, prethodno));
    setNajava(null);
    setGreska({
      povrs: kljuc,
      tekst: fmt(t.nijeSacuvano, {
        naziv,
        razlog: tekstGreske(ishod.code, menuDomenSr.errors, t.greskaOpste),
      }),
    });
  };

  const promeni = (id: string, layout: FloorLayout, sta: StaPromene) => {
    const stavka = nadji(id);
    const pozicija = stavka?.povrs.pozicije.find((kandidat) => kandidat.id === id);
    if (!stavka || !pozicija) return;
    const izmene = planCuvanja({
      pozicije: stavka.povrs.pozicije,
      preklapanja: vazeca,
      layouts: stavka.layouts,
      id,
      layout,
    });
    void sacuvaj(stavka.povrs.kljuc, pozicija.label, izmene, najavaPromene(sta, pozicija.label, layout));
  };

  const granica = (id: string, sta: "pomeranje" | "velicina") => {
    const stavka = nadji(id);
    if (stavka) objavi(stavka.povrs.kljuc, sta === "pomeranje" ? t.najava.nemozeDalje : t.najava.nemozeVelicina);
  };

  const zauzeto = (id: string) => {
    const stavka = nadji(id);
    if (!stavka) return;
    setNajava(null);
    setGreska({ povrs: stavka.povrs.kljuc, tekst: t.zauzeto });
  };

  const automatski = (kljuc: string) => {
    const stavka = prikaz.find((kandidat) => kandidat.povrs.kljuc === kljuc);
    if (!stavka) return;
    const poredak = autoArrange(
      stavka.povrs.pozicije.map((pozicija) => ({
        id: pozicija.id,
        kind: pozicija.kind,
        order: pozicija.order,
        layout: null,
      })),
    );
    const izmene = stavka.povrs.pozicije.flatMap((pozicija) => {
      const layout = poredak.get(pozicija.id);
      return layout ? [{ positionId: pozicija.id, layout }] : [];
    });
    if (izmene.length === 0) return;
    const naziv = stavka.povrs.bezNaslova ? t.oblast : (stavka.povrs.zona?.name ?? t.bezZone);
    void sacuvaj(kljuc, naziv, izmene, t.automatski.gotovo, true);
  };

  return (
    <div data-raspored="" className="grid gap-5 [&>*]:min-w-0">
      <PomocRasporeda id={pomocId} />
      {prikaz.map(({ povrs, layouts, redova }) => (
        <PovrsRasporeda
          key={povrs.kljuc}
          povrs={povrs}
          layouts={layouts}
          redova={redova}
          izabrano={izabrano}
          cuvaSe={cuva.includes(povrs.kljuc)}
          najava={najava && najava.povrs === povrs.kljuc ? najava : null}
          greska={greska && greska.povrs === povrs.kljuc ? greska.tekst : null}
          pomocId={pomocId}
          onIzaberi={izaberi}
          onPromena={promeni}
          onGranica={granica}
          onZauzeto={zauzeto}
          onAutomatski={() => automatski(povrs.kljuc)}
          onOtvori={onOtvoriPoziciju}
          onZatvoriGresku={() => setGreska(null)}
        />
      ))}
    </div>
  );
}
