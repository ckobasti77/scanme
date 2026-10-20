"use client";

// ScanMe Menu V1 (K20) — managing zones (master §9.3): zones are optional, so
// the drawer says so first. Add a zone, rename it in place, move it up or down,
// archive it after a confirmation (its positions go to "Bez zone"). The drawer
// stays open between steps; each result is said in a polite live region and
// focus stays where the person was working.

import { Archive, ArrowDown, ArrowUp, PencilLine, Plus } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import { MENU_MAX_ZONES, MENU_TEXT } from "@/lib/menu/limits";
import type { LokalPozicija, LokalRadnje, LokalZona } from "@/lib/menu/lokal/model";
import { cleanText } from "@/lib/menu/text";
import { Dugme, IkonicaDugme } from "../zajednicko/dugme";
import { Fioka } from "../zajednicko/fioka";
import {
  brojTekst,
  Napomena,
  POLJE_KLASA,
  Polje,
  PorukaGreske,
  PorukaUspeha,
  Potvrda,
  sortirajZone,
  useRadnja,
  useVracanjeFokusa,
} from "./zajednicko";

const t = menuLokalSr;

type Kontrola = "preimenuj" | "gore" | "dole" | "arhiviraj";
type Fokus = { kljuc: string; n: number };

const kljucKontrole = (zonaId: string, kontrola: Kontrola) => `${zonaId}:${kontrola}`;
const NOVA = "nova";

export function UpravljanjeZonama({
  otvoreno,
  zones,
  positions,
  radnje,
  onZatvori,
  fokusRezerva,
}: {
  otvoreno: boolean;
  zones: readonly LokalZona[];
  positions: readonly LokalPozicija[];
  radnje: LokalRadnje;
  onZatvori: () => void;
  fokusRezerva?: string;
}) {
  return (
    <Fioka
      strana="desno"
      otvoreno={otvoreno}
      onOtvoreno={(o) => (o ? undefined : onZatvori())}
      naslov={t.zone.naslov}
      className="w-[min(26rem,92vw)] sm:max-w-[26rem]"
    >
      <ZoneSadrzaj zones={zones} positions={positions} radnje={radnje} fokusRezerva={fokusRezerva} />
    </Fioka>
  );
}

function ZoneSadrzaj({
  zones,
  positions,
  radnje,
  fokusRezerva,
}: {
  zones: readonly LokalZona[];
  positions: readonly LokalPozicija[];
  radnje: LokalRadnje;
  fokusRezerva?: string;
}) {
  useVracanjeFokusa(fokusRezerva);
  const id = useId();
  const red = useRadnja();
  const dodavanje = useRadnja();
  const [preimenuje, setPreimenuje] = useState<string | null>(null);
  const [arhivira, setArhivira] = useState<string | null>(null);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [fokus, setFokus] = useState<Fokus | null>(null);
  const [novaZona, setNovaZona] = useState("");
  const [greskaNove, setGreskaNove] = useState<string | null>(null);

  const poredak = sortirajZone(zones);
  const limit = zones.length >= MENU_MAX_ZONES;

  // Focus stays where the person was working, also when the control moved or went away.
  useEffect(() => {
    if (!fokus) return;
    const nadji = (kljuc: string) =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-zona-fokus]")).find(
        (element) => element.dataset.zonaFokus === kljuc && !element.hasAttribute("disabled"),
      );
    const [zonaId, kontrola] = fokus.kljuc.split(":");
    const druga = kontrola === "gore" ? "dole" : kontrola === "dole" ? "gore" : null;
    const cilj = nadji(fokus.kljuc) ?? (druga ? nadji(kljucKontrole(zonaId, druga)) : undefined) ?? nadji(NOVA);
    cilj?.focus({ preventScroll: false });
  }, [fokus]);

  const idi = (kljuc: string) => setFokus((pre) => ({ kljuc, n: (pre?.n ?? 0) + 1 }));

  const pomeri = async (zona: LokalZona, smer: "up" | "down") => {
    setPoruka(null);
    const uspeh = await red.pokreni(`${zona.id}:${smer}`, () => radnje.moveZone(zona.id, smer));
    if (!uspeh) return;
    const novoMesto = poredak.findIndex((z) => z.id === zona.id) + (smer === "up" ? -1 : 1) + 1;
    setPoruka(fmt(t.zone.pomerena, { naziv: zona.name, mesto: novoMesto, ukupno: poredak.length }));
    idi(kljucKontrole(zona.id, smer === "up" ? "gore" : "dole"));
  };

  const arhiviraj = async (zona: LokalZona) => {
    setPoruka(null);
    const uspeh = await red.pokreni(`${zona.id}:arhiviraj`, () => radnje.archiveZone(zona.id));
    setArhivira(null);
    if (!uspeh) {
      idi(kljucKontrole(zona.id, "arhiviraj"));
      return;
    }
    setPoruka(fmt(t.zone.arhivirana, { naziv: zona.name }));
    idi(NOVA);
  };

  const dodaj = async (event: FormEvent) => {
    event.preventDefault();
    const naziv = cleanText(novaZona);
    if (naziv === "") return setGreskaNove(t.zone.nazivPrazan);
    if (naziv.length > MENU_TEXT.zoneName) return setGreskaNove(fmt(t.zone.nazivPredug, { n: MENU_TEXT.zoneName }));
    setGreskaNove(null);
    setPoruka(null);
    const uspeh = await dodavanje.pokreni("nova", () => radnje.createZone(naziv));
    if (!uspeh) return;
    setNovaZona("");
    setPoruka(fmt(t.zone.dodata, { naziv }));
  };

  return (
    <div className="grid gap-5" data-zone="">
      <Napomena>{t.zone.opis}</Napomena>

      <PorukaUspeha tekst={poruka} />
      {red.greska ? <PorukaGreske>{red.greska}</PorukaGreske> : null}

      {poredak.length === 0 ? (
        <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.zone.prazno}</p>
      ) : (
        <ul aria-label={t.zone.oznakaListe} className="divide-y rounded-[var(--mp-radius-kontrola)] border px-3 [--border:var(--mp-ivica)]">
          {poredak.map((zona, index) => {
            const mesta = positions.filter((pozicija) => pozicija.zoneId === zona.id).length;
            return (
              <li key={zona.id} data-zona={zona.id} className="grid gap-2 py-2.5">
                {preimenuje === zona.id ? (
                  <PreimenujForma
                    zona={zona}
                    radnje={radnje}
                    onGotovo={(novoIme) => {
                      setPreimenuje(null);
                      if (novoIme !== null) setPoruka(fmt(t.zone.preimenovana, { naziv: novoIme }));
                      idi(kljucKontrole(zona.id, "preimenuj"));
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <p className="min-w-0 flex-1 basis-32 font-semibold leading-snug [overflow-wrap:anywhere]">
                      {zona.name}{" "}
                      <span className="whitespace-nowrap text-sm font-normal tabular-nums text-[var(--mp-tekst-sporedni)]">
                        {brojTekst(t.brojevi.mesta, mesta)}
                      </span>
                    </p>
                    <div className="flex shrink-0 items-center">
                      <IkonicaDugme
                        ikonica={PencilLine}
                        oznaka={fmt(t.zone.preimenuj, { naziv: zona.name })}
                        data-zona-fokus={kljucKontrole(zona.id, "preimenuj")}
                        onClick={() => {
                          setPoruka(null);
                          setPreimenuje(zona.id);
                        }}
                      />
                      <IkonicaDugme
                        ikonica={ArrowUp}
                        oznaka={fmt(t.zone.gore, { naziv: zona.name })}
                        data-zona-fokus={kljucKontrole(zona.id, "gore")}
                        disabled={index === 0 || red.radi !== null}
                        onClick={() => void pomeri(zona, "up")}
                      />
                      <IkonicaDugme
                        ikonica={ArrowDown}
                        oznaka={fmt(t.zone.dole, { naziv: zona.name })}
                        data-zona-fokus={kljucKontrole(zona.id, "dole")}
                        disabled={index === poredak.length - 1 || red.radi !== null}
                        onClick={() => void pomeri(zona, "down")}
                      />
                      <IkonicaDugme
                        ikonica={Archive}
                        oznaka={fmt(t.zone.arhiviraj, { naziv: zona.name })}
                        data-zona-fokus={kljucKontrole(zona.id, "arhiviraj")}
                        aria-expanded={arhivira === zona.id}
                        onClick={() => {
                          setPoruka(null);
                          setArhivira(zona.id);
                        }}
                      />
                    </div>
                  </div>
                )}
                {arhivira === zona.id ? (
                  <Potvrda
                    tekst={t.zone.potvrda}
                    potvrdi={t.zone.potvrdi}
                    odustani={t.zone.odustani}
                    radi={red.radi === `${zona.id}:arhiviraj`}
                    onPotvrdi={() => void arhiviraj(zona)}
                    onOdustani={() => {
                      setArhivira(null);
                      idi(kljucKontrole(zona.id, "arhiviraj"));
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {limit ? (
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{fmt(t.zone.limit, { n: MENU_MAX_ZONES })}</p>
      ) : (
        <form onSubmit={dodaj} noValidate className="grid gap-3 border-t pt-4 [--border:var(--mp-ivica)]">
          <Polje id={`${id}-nova`} oznaka={t.zone.novaOznaka} greska={greskaNove}>
            {(aria) => (
              <input
                {...aria}
                type="text"
                autoComplete="off"
                maxLength={MENU_TEXT.zoneName}
                placeholder={t.zone.novaPrimer}
                data-zona-fokus={NOVA}
                value={novaZona}
                onChange={(event) => setNovaZona(event.target.value)}
                className={POLJE_KLASA}
              />
            )}
          </Polje>
          {dodavanje.greska ? <PorukaGreske>{dodavanje.greska}</PorukaGreske> : null}
          <Dugme type="submit" vrsta="primarno" ikonica={Plus} ucitava={dodavanje.radi !== null} className="justify-self-start">
            {dodavanje.radi !== null ? t.zajednicko.cuvaSe : t.zone.dodaj}
          </Dugme>
        </form>
      )}
    </div>
  );
}

function PreimenujForma({
  zona,
  radnje,
  onGotovo,
}: {
  zona: LokalZona;
  radnje: LokalRadnje;
  /** The new name when it was saved, null when the person gave up. */
  onGotovo: (novoIme: string | null) => void;
}) {
  const id = useId();
  const { radi, greska, pokreni } = useRadnja();
  const [naziv, setNaziv] = useState(zona.name);
  const [greskaPolja, setGreskaPolja] = useState<string | null>(null);

  // The field takes focus when it appears.
  useEffect(() => {
    document.getElementById(`${id}-naziv`)?.focus();
  }, [id]);

  const sacuvaj = async (event: FormEvent) => {
    event.preventDefault();
    const cist = cleanText(naziv);
    if (cist === "") return setGreskaPolja(t.zone.nazivPrazan);
    if (cist.length > MENU_TEXT.zoneName) return setGreskaPolja(fmt(t.zone.nazivPredug, { n: MENU_TEXT.zoneName }));
    setGreskaPolja(null);
    if (cist === zona.name) return onGotovo(null);
    const uspeh = await pokreni("preimenuj", () => radnje.renameZone(zona.id, cist));
    if (uspeh) onGotovo(cist);
  };

  return (
    <form onSubmit={sacuvaj} noValidate className="grid gap-2">
      <Polje id={`${id}-naziv`} oznaka={t.zone.nazivZone} greska={greskaPolja}>
        {(aria) => (
          <input
            {...aria}
            type="text"
            autoComplete="off"
            maxLength={MENU_TEXT.zoneName}
            value={naziv}
            onChange={(event) => setNaziv(event.target.value)}
            className={POLJE_KLASA}
          />
        )}
      </Polje>
      {greska ? <PorukaGreske>{greska}</PorukaGreske> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Dugme type="submit" vrsta="primarno" velicina="kompaktna" ucitava={radi !== null}>
          {radi !== null ? t.zajednicko.cuvaSe : t.zone.sacuvaj}
        </Dugme>
        <Dugme vrsta="tiho" velicina="kompaktna" onClick={() => onGotovo(null)}>
          {t.zajednicko.otkazi}
        </Dugme>
      </div>
    </form>
  );
}
