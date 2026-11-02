"use client";

// ScanMe Menu V1 (K20) — the drawer of one position (master §9.2): rename it,
// change its kind, seats and zone (only changed fields are sent), see the QR
// cards that stand on it, make one more, or archive the position after a
// confirmation. The drawer stays open after a save (the cards below are part
// of the same job); archiving closes it. A refused change keeps the form as
// typed and shows the mapped reason.

import { Archive, QrCode } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import { MENU_MAX_SEATS, MENU_TEXT } from "@/lib/menu/limits";
import type { LokalIzmenaPozicije, LokalPodaci, LokalPozicija, LokalRadnje } from "@/lib/menu/lokal/model";
import { cardsOfPosition, dijagnozaKartice } from "@/lib/menu/qr-diagnostics";
import { cleanText } from "@/lib/menu/text";
import { Dugme } from "../zajednicko/dugme";
import { Fioka } from "../zajednicko/fioka";
import { StanjeKartice } from "./kartice/stanje-kartice";
import {
  POLJE_KLASA,
  Polje,
  PorukaGreske,
  PorukaUspeha,
  Potvrda,
  sortirajZone,
  useRadnja,
  useVracanjeFokusa,
  VrstaIzbor,
} from "./zajednicko";

const t = menuLokalSr;

export function PozicijaFioka({
  pozicija,
  podaci,
  radnje,
  onZatvori,
  onJavi,
  fokusRezerva,
}: {
  /** The position to edit; null = closed. */
  pozicija: LokalPozicija | null;
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
  /** Id of the element that gets focus when the one that opened the drawer is gone (an archived position's row). */
  fokusRezerva?: string;
}) {
  // The last position stays on screen while the drawer slides out.
  const [zadnja, setZadnja] = useState(pozicija);
  if (pozicija !== null && pozicija !== zadnja) setZadnja(pozicija);
  const prikazana = pozicija ?? zadnja;
  return (
    <Fioka
      strana="desno"
      otvoreno={pozicija !== null}
      onOtvoreno={(o) => (o ? undefined : onZatvori())}
      naslov={prikazana?.label ?? ""}
      opis={t.pozicija.opis}
      className="w-[min(26rem,92vw)] sm:max-w-[26rem]"
    >
      {prikazana ? (
        <PozicijaSadrzaj
          key={prikazana.id}
          pozicija={prikazana}
          podaci={podaci}
          radnje={radnje}
          onZatvori={onZatvori}
          onJavi={onJavi}
          fokusRezerva={fokusRezerva}
        />
      ) : null}
    </Fioka>
  );
}

function PozicijaSadrzaj({
  pozicija,
  podaci,
  radnje,
  onZatvori,
  onJavi,
  fokusRezerva,
}: {
  pozicija: LokalPozicija;
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
  fokusRezerva?: string;
}) {
  useVracanjeFokusa(fokusRezerva);
  const id = useId();
  const cuvanje = useRadnja();
  const pravljenje = useRadnja();
  const arhiviranje = useRadnja();
  const arhivirajRef = useRef<HTMLButtonElement>(null);

  const imaZone = podaci.zones.length > 0;
  // A zone that no longer exists counts as "Bez zone" (the select could not show it anyway).
  const zonaSada = pozicija.zoneId !== null && podaci.zones.some((z) => z.id === pozicija.zoneId) ? pozicija.zoneId : null;
  const sedistaSada = pozicija.seats === null ? "" : String(pozicija.seats);

  const [naziv, setNaziv] = useState(pozicija.label);
  const [vrsta, setVrsta] = useState(pozicija.kind);
  const [sedista, setSedista] = useState(sedistaSada);
  const [zona, setZona] = useState(zonaSada ?? "");
  const [greske, setGreske] = useState<{ naziv?: string; sedista?: string }>({});
  const [sacuvano, setSacuvano] = useState(false);
  const [napravljena, setNapravljena] = useState(false);
  const [potvrdaArhiviranja, setPotvrdaArhiviranja] = useState(false);

  const promenjeno =
    cleanText(naziv) !== pozicija.label ||
    vrsta !== pozicija.kind ||
    sedista.trim() !== sedistaSada ||
    (imaZone && zona !== (zonaSada ?? ""));

  const sacuvaj = async (event: FormEvent) => {
    event.preventDefault();
    const nove: typeof greske = {};
    const cistNaziv = cleanText(naziv);
    if (cistNaziv === "") nove.naziv = t.zajednicko.nazivPrazan;
    else if (cistNaziv.length > MENU_TEXT.positionLabel) {
      nove.naziv = fmt(t.zajednicko.nazivPredug, { n: MENU_TEXT.positionLabel });
    }
    let sedistaBroj: number | null = null;
    if (sedista.trim() !== "") {
      sedistaBroj = /^\d{1,3}$/.test(sedista.trim()) ? Number(sedista.trim()) : 0;
      if (sedistaBroj < 1 || sedistaBroj > MENU_MAX_SEATS) {
        nove.sedista = fmt(t.zajednicko.sedistaNeispravno, { n: MENU_MAX_SEATS });
      }
    }
    setGreske(nove);
    if (Object.keys(nove).length > 0) return;

    // Only what changed.
    const izmena: LokalIzmenaPozicije = {};
    if (cistNaziv !== pozicija.label) izmena.label = cistNaziv;
    if (vrsta !== pozicija.kind) izmena.kind = vrsta;
    if (sedistaBroj !== pozicija.seats) izmena.seats = sedistaBroj;
    if (imaZone && zona !== (zonaSada ?? "")) izmena.zoneId = zona === "" ? null : zona;
    if (Object.keys(izmena).length === 0) return;

    setSacuvano(false);
    setSacuvano(await cuvanje.pokreni("sacuvaj", () => radnje.updatePosition(pozicija.id, izmena)));
  };

  const napraviKarticu = async () => {
    setNapravljena(false);
    setNapravljena(await pravljenje.pokreni("mint", () => radnje.mintForPositions([pozicija.id], null)));
  };

  const arhiviraj = async () => {
    const uspeh = await arhiviranje.pokreni("arhiviraj", () => radnje.archivePosition(pozicija.id));
    if (!uspeh) {
      // The reason (e.g. an active card still opens this position) is shown under the button.
      setPotvrdaArhiviranja(false);
      arhivirajRef.current?.focus();
      return;
    }
    onJavi(fmt(t.pozicija.arhiviraj.uspeh, { naziv: pozicija.label }));
    onZatvori();
  };

  const kartice = cardsOfPosition(podaci.cards, pozicija.id);

  return (
    <div className="grid gap-6" data-pozicija-fioka={pozicija.id}>
      <form onSubmit={sacuvaj} noValidate className="grid gap-4">
        <Polje id={`${id}-naziv`} oznaka={t.pozicija.naziv} greska={greske.naziv}>
          {(aria) => (
            <input
              {...aria}
              type="text"
              autoComplete="off"
              maxLength={MENU_TEXT.positionLabel}
              value={naziv}
              onChange={(event) => setNaziv(event.target.value)}
              className={POLJE_KLASA}
            />
          )}
        </Polje>
        <VrstaIzbor izabrano={vrsta} onIzbor={setVrsta} oznaka={t.pozicija.vrsta} />
        <Polje
          id={`${id}-sedista`}
          oznaka={t.zajednicko.sedista}
          nijeObavezno
          pomoc={t.zajednicko.sedistaPomoc}
          greska={greske.sedista}
          className="max-w-[12rem]"
        >
          {(aria) => (
            <input
              {...aria}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={sedista}
              onChange={(event) => setSedista(event.target.value)}
              className={`${POLJE_KLASA} tabular-nums`}
            />
          )}
        </Polje>
        {imaZone ? (
          <Polje id={`${id}-zona`} oznaka={t.zajednicko.zona}>
            {(aria) => (
              <select {...aria} value={zona} onChange={(event) => setZona(event.target.value)} className={POLJE_KLASA}>
                <option value="">{t.zajednicko.bezZone}</option>
                {sortirajZone(podaci.zones).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            )}
          </Polje>
        ) : null}
        {cuvanje.greska ? <PorukaGreske>{cuvanje.greska}</PorukaGreske> : null}
        <PorukaUspeha tekst={sacuvano && !promenjeno ? t.pozicija.sacuvano : null} />
        <div className="flex flex-wrap items-center gap-2">
          <Dugme type="submit" vrsta="primarno" ucitava={cuvanje.radi !== null} disabled={!promenjeno}>
            {cuvanje.radi !== null ? t.zajednicko.cuvaSe : t.pozicija.sacuvaj}
          </Dugme>
        </div>
      </form>

      <section aria-labelledby={`${id}-kartice`} className="grid gap-3 border-t pt-5 [--border:var(--mp-ivica)]">
        <h3 id={`${id}-kartice`} className="text-base font-semibold text-[var(--mp-tekst)]">
          {t.pozicija.kartice.naslov}
        </h3>
        {kartice.length === 0 ? (
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.pozicija.kartice.prazno}</p>
        ) : (
          <ul className="grid gap-2">
            {kartice.map((kartica) => (
              <li
                key={kartica.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-[var(--mp-radius-kontrola)] border px-3 py-2.5 [--border:var(--mp-ivica)]"
              >
                <div className="min-w-0">
                  <p className="font-semibold leading-snug [overflow-wrap:anywhere]">{kartica.label}</p>
                  <p className="font-mono text-sm tracking-wide text-[var(--mp-tekst-sporedni)]">
                    <span className="sr-only">{t.pozicija.kartice.kod}: </span>
                    {kartica.cardCode}
                  </p>
                </div>
                <StanjeKartice
                  stanje={dijagnozaKartice(kartica, { pages: podaci.pages, positions: podaci.positions }).stanje}
                />
              </li>
            ))}
          </ul>
        )}
        {pravljenje.greska ? <PorukaGreske>{pravljenje.greska}</PorukaGreske> : null}
        <PorukaUspeha tekst={napravljena ? t.pozicija.kartice.napravljena : null} />
        <Dugme
          vrsta="sekundarno"
          ikonica={QrCode}
          ucitava={pravljenje.radi !== null}
          className="h-auto max-w-full justify-self-start whitespace-normal py-2.5 text-left leading-snug"
          onClick={() => void napraviKarticu()}
        >
          {t.pozicija.kartice.napravi}
        </Dugme>
      </section>

      <section aria-labelledby={`${id}-arhiva`} className="grid gap-3 border-t pt-5 [--border:var(--mp-ivica)]">
        <h3 id={`${id}-arhiva`} className="text-base font-semibold text-[var(--mp-tekst)]">
          {t.pozicija.arhiviraj.naslov}
        </h3>
        <Dugme
          ref={arhivirajRef}
          vrsta="sekundarno"
          ikonica={Archive}
          aria-expanded={potvrdaArhiviranja}
          className="justify-self-start"
          onClick={() => setPotvrdaArhiviranja(true)}
        >
          {t.pozicija.arhiviraj.dugme}
        </Dugme>
        {potvrdaArhiviranja ? (
          <Potvrda
            tekst={fmt(t.pozicija.arhiviraj.potvrda, { naziv: pozicija.label })}
            potvrdi={t.pozicija.arhiviraj.potvrdi}
            odustani={t.pozicija.arhiviraj.odustani}
            radi={arhiviranje.radi !== null}
            onPotvrdi={() => void arhiviraj()}
            onOdustani={() => {
              setPotvrdaArhiviranja(false);
              arhivirajRef.current?.focus();
            }}
          />
        ) : null}
        {arhiviranje.greska ? <PorukaGreske>{arhiviranje.greska}</PorukaGreske> : null}
      </section>
    </div>
  );
}
