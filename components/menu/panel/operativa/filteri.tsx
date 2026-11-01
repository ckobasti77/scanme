"use client";

// ScanMe Menu V1 (K27) — the filters of Operativa (master §13.5; plan
// docs/meni/planovi/K24.md §4.3): the kind of request, the waiter and the zone
// (only when the venue uses zones). Native selects with visible labels. From
// 1024 px they stand in one row; below that one button ("Filteri · 2") opens
// the same selects in a drawer from the bottom. Both variants are in the markup
// and CSS shows one of them, so the first client render equals the server's.

import { SlidersHorizontal } from "lucide-react";
import { useId } from "react";
import { SheetClose } from "@/components/ui/sheet";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { BEZ_FILTERA, FILTER_NEPREUZETI, type OperacijeFilteri, type OperacijeView } from "@/lib/menu/operations-view";
import { MENU_REQUEST_KINDS } from "@/lib/menu/request-status";
import { POLJE_KLASA, Polje } from "../../lokal/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Fioka } from "../../zajednicko/fioka";

const t = menuPanelSr.operativa.filteri;

type Opcija = { vrednost: string; tekst: string };

function Izbor({
  id,
  oznaka,
  vrednost,
  opcije,
  onPromena,
}: {
  id: string;
  oznaka: string;
  vrednost: string;
  opcije: readonly Opcija[];
  onPromena(vrednost: string): void;
}) {
  return (
    <Polje id={id} oznaka={oznaka} className="min-w-0 lg:w-52">
      {(aria) => (
        <select {...aria} value={vrednost} onChange={(event) => onPromena(event.target.value)} className={POLJE_KLASA}>
          {opcije.map((opcija) => (
            <option key={opcija.vrednost} value={opcija.vrednost}>
              {opcija.tekst}
            </option>
          ))}
        </select>
      )}
    </Polje>
  );
}

function FilteriPolja({
  idPrefiks,
  filteri,
  opcije,
  onFilteri,
}: {
  idPrefiks: string;
  filteri: OperacijeFilteri;
  opcije: OperacijeView["opcije"];
  onFilteri(filteri: OperacijeFilteri): void;
}) {
  return (
    <>
      <Izbor
        id={`${idPrefiks}-vrsta`}
        oznaka={t.vrsta}
        vrednost={filteri.vrsta ?? ""}
        onPromena={(vrednost) =>
          onFilteri({ ...filteri, vrsta: MENU_REQUEST_KINDS.find((vrsta) => vrsta === vrednost) ?? null })
        }
        opcije={[
          { vrednost: "", tekst: t.sve },
          ...MENU_REQUEST_KINDS.map((vrsta) => ({ vrednost: vrsta, tekst: menuDomenSr.requestKinds[vrsta] })),
        ]}
      />
      <Izbor
        id={`${idPrefiks}-konobar`}
        oznaka={t.konobar}
        vrednost={filteri.konobar ?? ""}
        onPromena={(vrednost) => onFilteri({ ...filteri, konobar: vrednost === "" ? null : vrednost })}
        opcije={[
          { vrednost: "", tekst: t.svi },
          { vrednost: FILTER_NEPREUZETI, tekst: t.nepreuzeti },
          ...opcije.konobari.map((konobar) => ({ vrednost: konobar.id, tekst: konobar.ime })),
        ]}
      />
      {opcije.zone.length > 0 ? (
        <Izbor
          id={`${idPrefiks}-zona`}
          oznaka={t.zona}
          vrednost={filteri.zona ?? ""}
          onPromena={(vrednost) => onFilteri({ ...filteri, zona: vrednost === "" ? null : vrednost })}
          opcije={[{ vrednost: "", tekst: t.sveZone }, ...opcije.zone.map((zona) => ({ vrednost: zona.id, tekst: zona.ime }))]}
        />
      ) : null}
    </>
  );
}

export function Filteri({
  filteri,
  opcije,
  aktivnih,
  onFilteri,
  pocetnoOtvoreni = false,
}: {
  /** The filters that are in force (the view drops the ones that point at something gone). */
  filteri: OperacijeFilteri;
  opcije: OperacijeView["opcije"];
  aktivnih: number;
  onFilteri(filteri: OperacijeFilteri): void;
  /** Izlog: the drawer of the telephone starts open. */
  pocetnoOtvoreni?: boolean;
}) {
  const id = useId();
  const ocisti = () => onFilteri(BEZ_FILTERA);
  return (
    <div data-filteri="">
      <div className="hidden lg:flex lg:flex-wrap lg:items-end lg:gap-3">
        <FilteriPolja idPrefiks={`${id}-red`} filteri={filteri} opcije={opcije} onFilteri={onFilteri} />
        {aktivnih > 0 ? (
          <Dugme vrsta="tiho" onClick={ocisti}>
            {t.ocisti}
          </Dugme>
        ) : null}
      </div>
      <div className="lg:hidden">
        <Fioka
          strana="dole"
          naslov={t.naslov}
          podrazumevanoOtvoreno={pocetnoOtvoreni}
          okidac={
            <Dugme vrsta="sekundarno" ikonica={SlidersHorizontal}>
              {aktivnih > 0 ? fmt(t.dugmeBroj, { n: aktivnih }) : t.dugme}
            </Dugme>
          }
          podnozje={
            <>
              {aktivnih > 0 ? (
                <Dugme vrsta="tiho" onClick={ocisti}>
                  {t.ocisti}
                </Dugme>
              ) : null}
              <SheetClose asChild>
                <Dugme vrsta="primarno">{t.prikazi}</Dugme>
              </SheetClose>
            </>
          }
        >
          <div className="grid gap-4">
            <FilteriPolja idPrefiks={`${id}-fioka`} filteri={filteri} opcije={opcije} onFilteri={onFilteri} />
          </div>
        </Fioka>
      </div>
    </div>
  );
}
