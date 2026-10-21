"use client";

// ScanMe Menu V1 — `Dodaj grupu` (K15; master §5.7, §13.4): a NEW group for
// this article, or an EXISTING group of the menu (re-used, so it stays one
// linked group) — chosen here, without a separate library tab. A new group
// gets its rules and its first add-ons in one step.

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_TEXT } from "@/lib/menu/limits";
import { proveriGrupu, type GrupaFormaProvera, type GrupaFormaStanje } from "@/lib/menu/studio/article-form";
import type { StudioIshod, StudioPostojecaGrupa, StudioRadnje } from "@/lib/menu/studio/model";
import { parseCenaUnos } from "@/lib/menu/studio/price-input";
import { cleanText } from "@/lib/menu/text";
import { cn } from "@/lib/utils";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { StudioDijalog } from "../dijalog";
import { porukaGreske } from "../red-artikla/red-artikla";
import { GrupaForma } from "./grupa-forma";
import { IzborSegment, POLJE_KLASA } from "./polja";

const t = menuStudioSr.artikal;
const d = t.dodaci;

const PRAZNA: GrupaFormaStanje = { naziv: "", izbor: "multiple", obavezna: false, min: "", max: "" };

function mnozina(grupa: { one: string; few: string; many: string }, n: number) {
  return fmt(grupa[srPluralCategory(n)], { n });
}

export function DodajGrupuDijalog({
  otvoreno,
  artikal,
  naArtiklu,
  radnje,
  onGotovo,
  onZatvori,
}: {
  otvoreno: boolean;
  artikal: { id: string; naziv: string };
  /** Ids of the groups already on this article. */
  naArtiklu: ReadonlySet<string>;
  radnje: Pick<StudioRadnje, "novaGrupa" | "postojeceGrupe" | "prikaciGrupu">;
  onGotovo: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const id = useId();
  const [nacin, setNacin] = useState<"nova" | "postojeca">("nova");
  const [forma, setForma] = useState<GrupaFormaStanje>(PRAZNA);
  const [provera, setProvera] = useState<GrupaFormaProvera | null>(null);
  const [opcije, setOpcije] = useState([{ naziv: "", doplata: "" }]);
  const [postojece, setPostojece] = useState<StudioPostojecaGrupa[] | "greska" | null>(null);
  const [izabrana, setIzabrana] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);

  useEffect(() => {
    if (!otvoreno || nacin !== "postojeca") return;
    let aktivno = true;
    void radnje.postojeceGrupe().then((ishod) => {
      if (aktivno) setPostojece(ishod.ok ? ishod.vrednost : "greska");
    });
    return () => {
      aktivno = false;
    };
  }, [otvoreno, nacin, radnje]);

  const zatvori = () => {
    setNacin("nova");
    setForma(PRAZNA);
    setProvera(null);
    setOpcije([{ naziv: "", doplata: "" }]);
    setIzabrana(null);
    setPoruka(null);
    onZatvori();
  };

  const kraj = (ishod: StudioIshod<unknown>, uspeh: string) => {
    setRadi(false);
    if (ishod.ok) {
      onGotovo(uspeh);
      zatvori();
      return;
    }
    setPoruka(ishod.vrsta === "greska" && !ishod.ponovljivo ? (porukaGreske(ishod.kod) ?? t.nijeSacuvano) : t.nijeSacuvano);
  };

  const sacuvaj = async () => {
    if (nacin === "postojeca") {
      if (!izabrana) return;
      const naziv = postojece && postojece !== "greska" ? (postojece.find((g) => g.id === izabrana)?.naziv ?? "") : "";
      setRadi(true);
      kraj(await radnje.prikaciGrupu(artikal.id, izabrana), fmt(d.dodajPostojecu, { naziv }));
      return;
    }
    const rezultat = proveriGrupu(forma);
    setProvera(rezultat);
    if (!rezultat.ok) return;
    const unete = opcije.filter((opcija) => cleanText(opcija.naziv) !== "" || opcija.doplata.trim() !== "");
    const spremne: { naziv: string; doplata: number }[] = [];
    for (const opcija of unete) {
      const naziv = cleanText(opcija.naziv);
      const cena = parseCenaUnos(opcija.doplata);
      if (naziv === "" || naziv.length > MENU_TEXT.addonOptionName || !cena.ok) {
        setPoruka(!cena.ok ? menuStudioSr.cena.greske[cena.greska] : menuStudioSr.opste.nazivObavezan);
        return;
      }
      spremne.push({ naziv, doplata: cena.cena ?? 0 });
    }
    setPoruka(null);
    setRadi(true);
    kraj(await radnje.novaGrupa(artikal.id, rezultat.unos, spremne), t.sacuvano);
  };

  return (
    <StudioDijalog
      otvoreno={otvoreno}
      onOtvoreno={(sledece) => (sledece ? undefined : zatvori())}
      naslov={d.dodajGrupuNaslov}
      sirina="siroka"
      podnozje={
        <>
          <Dugme vrsta="tiho" onClick={zatvori}>
            {d.otkazi}
          </Dugme>
          <Dugme
            vrsta="primarno"
            ucitava={radi}
            disabled={nacin === "postojeca" && !izabrana}
            onClick={() => void sacuvaj()}
            data-sacuvaj-grupu=""
          >
            {nacin === "nova" ? d.sacuvaj : d.dodajGrupu}
          </Dugme>
        </>
      }
    >
      <div className="grid gap-5">
        <IzborSegment<"nova" | "postojeca">
          oznaka={d.dodajGrupu}
          skrivenaOznaka
          izabrano={nacin}
          onIzbor={setNacin}
          vrednosti={[
            { vrednost: "nova", tekst: d.nova },
            { vrednost: "postojeca", tekst: d.postojeca },
          ]}
        />
        {nacin === "nova" ? (
          <div className="grid gap-5">
            <p className="text-sm text-[var(--mp-tekst-sporedni)]">{d.novaOpis}</p>
            <GrupaForma forma={forma} onForma={setForma} greska={provera} onemoguceno={radi} />
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">{d.dodatak}</legend>
              {opcije.map((opcija, indeks) => (
                <div key={indeks} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2">
                  <input
                    value={opcija.naziv}
                    autoComplete="off"
                    placeholder={d.dodatakNaziv}
                    aria-label={fmt(d.dodatakOznaka, { n: indeks + 1 })}
                    onChange={(event) => setOpcije(opcije.map((o, i) => (i === indeks ? { ...o, naziv: event.target.value } : o)))}
                    className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
                  />
                  <input
                    value={opcija.doplata}
                    inputMode="numeric"
                    placeholder="0"
                    aria-label={fmt(d.doplataOznaka, { naziv: opcija.naziv || fmt(d.dodatakOznaka, { n: indeks + 1 }) })}
                    onChange={(event) => setOpcije(opcije.map((o, i) => (i === indeks ? { ...o, doplata: event.target.value } : o)))}
                    className={cn(POLJE_KLASA, "h-[var(--mp-meta)] text-right tabular-nums")}
                  />
                  <IkonicaDugme
                    ikonica={Trash2}
                    oznaka={fmt(d.ukloniDodatak, { naziv: opcija.naziv || fmt(d.dodatakOznaka, { n: indeks + 1 }) })}
                    disabled={opcije.length === 1}
                    onClick={() => setOpcije(opcije.filter((_, i) => i !== indeks))}
                  />
                </div>
              ))}
              <span>
                <Dugme vrsta="tiho" velicina="kompaktna" ikonica={Plus} onClick={() => setOpcije([...opcije, { naziv: "", doplata: "" }])}>
                  {d.dodajDodatak}
                </Dugme>
              </span>
            </fieldset>
          </div>
        ) : postojece === null ? (
          <UcitavanjeStanje oblik="lista" redova={3} />
        ) : postojece === "greska" ? (
          <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
            {t.nijeSacuvano}
          </p>
        ) : postojece.length === 0 ? (
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{d.nemaPostojecih}</p>
        ) : (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm text-[var(--mp-tekst-sporedni)]">{d.postojecaOpis}</legend>
            {postojece.map((grupa) => {
              const vec = naArtiklu.has(grupa.id);
              return (
                <label
                  key={grupa.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-3 py-3",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)] has-[:disabled]:cursor-not-allowed has-[:disabled]:text-[var(--mp-tekst-sporedni)]",
                    izabrana === grupa.id ? "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent-meko)]" : "[--border:var(--mp-ivica-kontrole)]",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-postojeca`}
                    checked={izabrana === grupa.id}
                    disabled={vec}
                    onChange={() => setIzabrana(grupa.id)}
                    className="mt-1 size-4 shrink-0 accent-[var(--mp-mastilo)]"
                  />
                  <span className="grid gap-0.5">
                    <span className="font-semibold">{grupa.naziv}</span>
                    <span className="text-sm text-[var(--mp-tekst-sporedni)]">
                      {vec ? d.vecNaArtiklu : mnozina(d.artikalaUGrupi, grupa.brojArtikala)}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        {poruka ? (
          <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
            {poruka}
          </p>
        ) : null}
      </div>
    </StudioDijalog>
  );
}
