"use client";

// ScanMe Menu V1 (K20) — "Poveži": which page and which position a card opens
// (master §9.2). Two selects, "Sačuvaj" → linkCard. A card of ScanMe or one
// that no longer opens the Menu never gets here (the list does not offer it).
// The dialog keeps the form on a failure and shows the mapped error.

import { useId, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { LokalKartica, LokalPodaci, LokalRadnje } from "@/lib/menu/lokal/model";
import { Dugme } from "../../zajednicko/dugme";
import { StudioDijalog } from "../../studio/dijalog";
import { Polje, PorukaGreske, useRadnja } from "../zajednicko";
import { PozicijaSelect, StranicaSelect } from "./izbori";

const t = menuLokalSr.kartice;

export function PoveziDijalog({
  kartica,
  podaci,
  radnje,
  onZatvori,
  onJavi,
}: {
  /** The card to connect; null = closed. */
  kartica: LokalKartica | null;
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
}) {
  return (
    <StudioDijalog
      otvoreno={kartica !== null}
      onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())}
      naslov={kartica ? fmt(t.povezi.naslov, { naziv: kartica.label }) : ""}
      opis={t.povezi.opis}
    >
      {kartica ? (
        <PoveziSadrzaj key={kartica.id} kartica={kartica} podaci={podaci} radnje={radnje} onZatvori={onZatvori} onJavi={onJavi} />
      ) : null}
    </StudioDijalog>
  );
}

function PoveziSadrzaj({
  kartica,
  podaci,
  radnje,
  onZatvori,
  onJavi,
}: {
  kartica: LokalKartica;
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
}) {
  const id = useId();
  const { radi, greska, pokreni } = useRadnja();
  // The current link, as long as what it points at still exists; otherwise the neutral choice.
  const [stranica, setStranica] = useState(() => {
    const kljuc = kartica.link?.pageKey ?? null;
    return kljuc !== null && podaci.pages.some((s) => s.key === kljuc) ? kljuc : "";
  });
  const [mesto, setMesto] = useState(() => {
    const pozicijaId = kartica.link?.positionId ?? null;
    return pozicijaId !== null && podaci.positions.some((p) => p.id === pozicijaId) ? pozicijaId : "";
  });

  const sacuvaj = async (event: FormEvent) => {
    event.preventDefault();
    const uspeh = await pokreni("povezi", () =>
      radnje.linkCard(kartica.id, { pageKey: stranica === "" ? null : stranica, positionId: mesto === "" ? null : mesto }),
    );
    if (!uspeh) return;
    onJavi(fmt(t.povezana, { naziv: kartica.label }));
    onZatvori();
  };

  return (
    <form onSubmit={sacuvaj} className="grid gap-4">
      <Polje id={`${id}-stranica`} oznaka={t.povezi.stranica}>
        {(aria) => <StranicaSelect {...aria} stranice={podaci.pages} vrednost={stranica} onIzbor={setStranica} />}
      </Polje>
      <Polje id={`${id}-mesto`} oznaka={t.povezi.mesto}>
        {(aria) => (
          <PozicijaSelect {...aria} zones={podaci.zones} positions={podaci.positions} vrednost={mesto} onIzbor={setMesto} />
        )}
      </Polje>
      {greska ? <PorukaGreske>{greska}</PorukaGreske> : null}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 [--border:var(--mp-ivica)]">
        <Dugme vrsta="tiho" onClick={onZatvori}>
          {menuLokalSr.zajednicko.otkazi}
        </Dugme>
        <Dugme type="submit" vrsta="primarno" ucitava={radi !== null}>
          {radi !== null ? menuLokalSr.zajednicko.cuvaSe : t.povezi.sacuvaj}
        </Dugme>
      </div>
    </form>
  );
}
