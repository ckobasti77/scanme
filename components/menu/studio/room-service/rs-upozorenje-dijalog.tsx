"use client";

// ScanMe Menu V1 — the decision after a base price change under a manual Room
// service price (K16; master §5.3, LOCKED): the dialog shows the old base, the
// new base and the Room service price, and offers `Zadrži ručnu cenu` or
// `Ponovo izračunaj prema markup-u`. It opens at once after the base price is
// saved (inline price, detail or a row's `Odluči`); closing it decides nothing
// — the warning stays in Room service until the owner decides.

import { useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioIshod, StudioRsUpozorenje } from "@/lib/menu/studio/model";
import { Dugme } from "../../zajednicko/dugme";
import { StudioDijalog } from "../dijalog";
import { porukaGreske, tekstCene } from "../red-artikla/red-artikla";

const t = menuStudioSr;
const d = t.posebno.roomService.dijalog;

export function RsUpozorenjeDijalog({
  upozorenje,
  onZatvori,
  onResi,
  najavi,
}: {
  upozorenje: StudioRsUpozorenje | null;
  onZatvori: () => void;
  onResi: (stavkaId: string, akcija: "keepManual" | "recomputeFromMarkup") => Promise<StudioIshod>;
  najavi: (tekst: string) => void;
}) {
  const [radi, setRadi] = useState<"keepManual" | "recomputeFromMarkup" | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  const resi = async (akcija: "keepManual" | "recomputeFromMarkup") => {
    if (!upozorenje) return;
    setRadi(akcija);
    setGreska(null);
    const ishod = await onResi(upozorenje.stavkaId, akcija);
    setRadi(null);
    if (!ishod.ok) {
      const tekst = ishod.vrsta === "greska" ? porukaGreske(ishod.kod) : null;
      setGreska(tekst ? `${t.red.nijeSacuvano} ${tekst}` : t.red.nijeSacuvano);
      return;
    }
    najavi(akcija === "keepManual" ? d.zadrzano : d.izracunato);
    onZatvori();
  };

  const redovi = upozorenje
    ? [
        { oznaka: d.stara, vrednost: tekstCene(upozorenje.staraOsnovna), kljuc: "stara" },
        { oznaka: d.nova, vrednost: tekstCene(upozorenje.novaOsnovna), kljuc: "nova" },
        { oznaka: d.rs, vrednost: tekstCene(upozorenje.rsCena), kljuc: "rs", jako: true },
        { oznaka: d.izracunata, vrednost: tekstCene(upozorenje.izracunata), kljuc: "izracunata" },
      ]
    : [];

  return (
    <StudioDijalog
      otvoreno={upozorenje !== null}
      onOtvoreno={(otvoreno) => {
        if (!otvoreno) {
          setGreska(null);
          onZatvori();
        }
      }}
      naslov={d.naslov}
      opis={upozorenje ? fmt(d.opis, { naziv: upozorenje.naziv }) : undefined}
      sirina="siroka"
      podnozje={
        <>
          <Dugme vrsta="tiho" onClick={onZatvori} disabled={radi !== null} className="max-sm:order-last max-sm:w-full">
            {d.kasnije}
          </Dugme>
          <Dugme
            vrsta="sekundarno"
            ucitava={radi === "recomputeFromMarkup"}
            disabled={radi === "keepManual" || upozorenje?.izracunata === null}
            onClick={() => void resi("recomputeFromMarkup")}
            className="max-sm:w-full"
            data-rs-izracunaj=""
          >
            {d.izracunaj}
          </Dugme>
          <Dugme
            vrsta="primarno"
            ucitava={radi === "keepManual"}
            disabled={radi === "recomputeFromMarkup"}
            onClick={() => void resi("keepManual")}
            className="max-sm:order-first max-sm:w-full"
            data-rs-zadrzi=""
          >
            {d.zadrzi}
          </Dugme>
        </>
      }
    >
      {upozorenje ? (
        <div className="grid gap-3" data-rs-upozorenje={upozorenje.stavkaId}>
          <dl className="grid gap-0 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)]">
            {redovi.map((red) => (
              <div
                key={red.kljuc}
                data-rs-vrednost={red.kljuc}
                className={
                  red.kljuc === "rs"
                    ? "flex items-baseline justify-between gap-4 border-t-2 bg-[var(--mp-povrsina-utisana)] px-4 py-2.5 [--border:var(--mp-ivica)]"
                    : "flex items-baseline justify-between gap-4 border-t px-4 py-2.5 first:border-t-0 [--border:var(--mp-ivica)]"
                }
              >
                <dt className="text-sm text-[var(--mp-tekst-sporedni)]">{red.oznaka}</dt>
                <dd className={red.jako ? "shrink-0 whitespace-nowrap font-semibold tabular-nums" : "shrink-0 whitespace-nowrap tabular-nums"}>{red.vrednost}</dd>
              </div>
            ))}
          </dl>
          <ul className="grid gap-1 text-sm text-[var(--mp-tekst)]" data-rs-posledice="">
            <li>{fmt(d.posledicaZadrzi, { cena: tekstCene(upozorenje.rsCena) })}</li>
            {upozorenje.izracunata !== null ? <li>{fmt(d.posledicaIzracunaj, { cena: tekstCene(upozorenje.izracunata) })}</li> : null}
          </ul>
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{d.kasnijeOpis}</p>
          {greska ? (
            <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
              {greska}
            </p>
          ) : null}
        </div>
      ) : null}
    </StudioDijalog>
  );
}
