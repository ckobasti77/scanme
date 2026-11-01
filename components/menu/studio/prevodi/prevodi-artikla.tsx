"use client";

// ScanMe Menu V1 (K16) — the "Prevodi" group of the article detail (master
// §7.7): the article's name and description, and its variants' names, in each
// enabled language. The same item component as the full translations view
// (PrevodStavka), so both places behave alike. Presentational: the detail
// passes the items, the languages and the actions in.

import { useId, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioJezici, StudioPrevodStavka } from "@/lib/menu/studio/model";
import { kljucStavke, najgoriStatus, nazivJezika } from "@/lib/menu/studio/prevodi-pogled";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import type { PrevodiRadnje } from "./ai-predlog";
import { PrevodStavka } from "./prevod-stavka";
import { JezikTabovi, NapomenaJezika, NemaJezika } from "./prevodi-stranice";

const t = menuStudioSr.posebno.prevodi;

/** The summary of the collapsed group: per language the worst state ("Engleski: Nedostaje · Nemački: Prevedeno"). */
export function sazetakPrevoda(stavke: readonly StudioPrevodStavka[] | undefined, jezici: StudioJezici | undefined): string {
  if (!stavke || !jezici) return "";
  if (jezici.prevodi.length === 0) return t.nemaJezika;
  return jezici.prevodi
    .map((kod) => {
      const naziv = nazivJezika(kod);
      return fmt(t.detaljSazetak, {
        jezik: naziv.charAt(0).toUpperCase() + naziv.slice(1),
        status: t.statusi[najgoriStatus(stavke, kod) ?? "done"],
      });
    })
    .join(" · ");
}

function SadrzajPrevoda({
  stavke,
  jezici,
  radnje,
  red,
  mozeUredjivanje,
  najavi,
}: {
  stavke: readonly StudioPrevodStavka[];
  jezici: StudioJezici;
  radnje: PrevodiRadnje;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  najavi: (poruka: string) => void;
}) {
  const id = useId();
  const [izabran, setIzabran] = useState(jezici.prevodi[0]);
  const jezik = jezici.prevodi.includes(izabran) ? izabran : jezici.prevodi[0];
  const imaTabove = jezici.prevodi.length > 1;
  const panelId = `${id}-panel`;
  return (
    <div className="grid gap-4">
      <NapomenaJezika jezici={jezici} />
      <JezikTabovi jezici={jezici.prevodi} izabran={jezik} onIzbor={setIzabran} idPrefiks={`${id}-jezik`} kontrolise={panelId} />
      <ul
        id={panelId}
        role={imaTabove ? "tabpanel" : undefined}
        aria-labelledby={imaTabove ? `${id}-jezik-${jezik}` : undefined}
        className="m-0 grid list-none gap-3 p-0"
      >
        {stavke.map((stavka) => (
          <li key={`${jezik}:${kljucStavke(stavka)}`} className="min-w-0">
            <PrevodStavka
              stavka={stavka}
              jezik={jezik}
              nazivJezika={nazivJezika(jezik)}
              ai={jezici.ai}
              radnje={radnje}
              red={red}
              mozeUredjivanje={mozeUredjivanje}
              najavi={najavi}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PrevodiArtikla({
  stavke,
  jezici,
  radnje,
  red,
  mozeUredjivanje,
  najavi,
  podesavanjaHref,
}: {
  /** The article and its variants; undefined = loading. */
  stavke: readonly StudioPrevodStavka[] | undefined;
  /** undefined = loading. */
  jezici: StudioJezici | undefined;
  radnje: PrevodiRadnje;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  najavi: (poruka: string) => void;
  podesavanjaHref?: string;
}) {
  if (!stavke || !jezici) return <UcitavanjeStanje oblik="forma" redova={2} />;
  if (jezici.prevodi.length === 0) return <NemaJezika podesavanjaHref={podesavanjaHref} nivo={3} />;
  return <SadrzajPrevoda stavke={stavke} jezici={jezici} radnje={radnje} red={red} mozeUredjivanje={mozeUredjivanje} najavi={najavi} />;
}
