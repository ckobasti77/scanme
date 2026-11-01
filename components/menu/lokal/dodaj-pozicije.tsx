"use client";

// ScanMe Menu V1 (K20) — "Dodaj mesta" (master §9.1, §9.2): one position by its
// name, or many at once ("Sto 1 – Sto 10") with a live preview of the names;
// kind, optional seats and, only when the venue has zones, the zone. A failure
// is shown in the drawer and the form stays as typed; a success closes the
// drawer and is announced politely by the screen.

import { useId, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { FloorPositionKind } from "@/lib/menu/floor-layout";
import { MENU_MAX_POSITION_BATCH, MENU_MAX_SEATS, MENU_TEXT } from "@/lib/menu/limits";
import type { LokalPodaci, LokalRadnje } from "@/lib/menu/lokal/model";
import { cleanText } from "@/lib/menu/text";
import { Dugme } from "../zajednicko/dugme";
import { Fioka } from "../zajednicko/fioka";
import {
  brojTekst,
  POLJE_KLASA,
  Polje,
  PorukaGreske,
  SegmentIzbor,
  sortirajZone,
  useRadnja,
  useVracanjeFokusa,
  VrstaIzbor,
} from "./zajednicko";

const t = menuLokalSr;

/** Longest start of a name when many are added: "Soba" + " 9999" stays within a label. */
const MAKS_PREFIKS = MENU_TEXT.positionLabel - 10;
const MAKS_BROJ = 9999;

type Nacin = "jedno" | "vise";

/** A whole number written with digits only; null for anything else (including empty). */
function ceoBroj(tekst: string): number | null {
  const cist = tekst.trim();
  return /^\d{1,5}$/.test(cist) ? Number(cist) : null;
}

export function DodajPozicije({
  otvoreno,
  podaci,
  radnje,
  onZatvori,
  onJavi,
  fokusRezerva,
}: {
  otvoreno: boolean;
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
  /** Id of the element that gets focus when the one that opened the drawer is gone. */
  fokusRezerva?: string;
}) {
  return (
    <Fioka
      strana="desno"
      otvoreno={otvoreno}
      onOtvoreno={(o) => (o ? undefined : onZatvori())}
      naslov={t.dodaj.naslov}
      opis={t.dodaj.opis}
      className="w-[min(26rem,92vw)] sm:max-w-[26rem]"
    >
      <DodajSadrzaj podaci={podaci} radnje={radnje} onZatvori={onZatvori} onJavi={onJavi} fokusRezerva={fokusRezerva} />
    </Fioka>
  );
}

function DodajSadrzaj({
  podaci,
  radnje,
  onZatvori,
  onJavi,
  fokusRezerva,
}: {
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
  fokusRezerva?: string;
}) {
  useVracanjeFokusa(fokusRezerva);
  const id = useId();
  const { radi, greska, pokreni, ocisti } = useRadnja();
  const imaZone = podaci.zones.length > 0;

  const [vrsta, setVrsta] = useState<FloorPositionKind>("table");
  // The first positions of a venue are usually many tables at once.
  const [nacin, setNacin] = useState<Nacin>(podaci.positions.length === 0 ? "vise" : "jedno");
  const [naziv, setNaziv] = useState("");
  // null = the start of the name follows the kind ("Sto", "Soba", "Mesto") until it is typed over.
  const [prefiksRucno, setPrefiksRucno] = useState<string | null>(null);
  const [od, setOd] = useState("1");
  const [koliko, setKoliko] = useState("10");
  const [sedista, setSedista] = useState("");
  const [zona, setZona] = useState("");
  const [greske, setGreske] = useState<Partial<Record<"naziv" | "prefiks" | "od" | "koliko" | "sedista", string>>>({});

  const prefiks = prefiksRucno ?? t.vrste.prefiks[vrsta];
  // The typed numbers that are usable; null while empty or out of range.
  const odBroj = ceoBroj(od);
  const kolikoBroj = ceoBroj(koliko);
  const odOk = odBroj !== null && odBroj >= 1 && odBroj <= MAKS_BROJ ? odBroj : null;
  const kolikoOk = kolikoBroj !== null && kolikoBroj >= 1 && kolikoBroj <= MENU_MAX_POSITION_BATCH ? kolikoBroj : null;
  const cistPrefiks = cleanText(prefiks);

  let pregled: string | null = null;
  if (nacin === "vise" && cistPrefiks !== "" && odOk !== null && kolikoOk !== null) {
    const prvo = `${cistPrefiks} ${odOk}`;
    pregled = kolikoOk === 1 ? prvo : fmt(t.dodaj.pregledOpseg, { od: prvo, do: `${cistPrefiks} ${odOk + kolikoOk - 1}` });
  } else if (nacin === "jedno" && cleanText(naziv) !== "") {
    pregled = cleanText(naziv);
  }

  const posalji = async (event: FormEvent) => {
    event.preventDefault();
    const nove: typeof greske = {};
    const cistNaziv = cleanText(naziv);
    if (nacin === "jedno") {
      if (cistNaziv === "") nove.naziv = t.zajednicko.nazivPrazan;
      else if (cistNaziv.length > MENU_TEXT.positionLabel) nove.naziv = fmt(t.zajednicko.nazivPredug, { n: MENU_TEXT.positionLabel });
    } else {
      if (cistPrefiks === "") nove.prefiks = t.dodaj.prefiksPrazan;
      else if (cistPrefiks.length > MAKS_PREFIKS) nove.prefiks = fmt(t.zajednicko.nazivPredug, { n: MAKS_PREFIKS });
      if (odOk === null) nove.od = fmt(t.dodaj.odNeispravno, { min: 1, max: MAKS_BROJ });
      if (kolikoOk === null) nove.koliko = fmt(t.dodaj.kolikoNeispravno, { max: MENU_MAX_POSITION_BATCH });
    }
    const sedistaBroj = sedista.trim() === "" ? null : ceoBroj(sedista);
    if (sedista.trim() !== "" && (sedistaBroj === null || sedistaBroj < 1 || sedistaBroj > MENU_MAX_SEATS)) {
      nove.sedista = fmt(t.zajednicko.sedistaNeispravno, { n: MENU_MAX_SEATS });
    }
    setGreske(nove);
    if (Object.keys(nove).length > 0) return;

    const zoneId = zona === "" ? null : zona;
    const broj = nacin === "jedno" ? 1 : (kolikoOk ?? 1);
    const uspeh = await pokreni("dodaj", () =>
      nacin === "jedno"
        ? radnje.createPosition({ kind: vrsta, label: cistNaziv, seats: sedistaBroj, zoneId })
        : radnje.createPositions({
            kind: vrsta,
            prefix: cistPrefiks,
            from: odOk ?? 1,
            count: broj,
            seats: sedistaBroj,
            zoneId,
          }),
    );
    if (!uspeh) return;
    onJavi(brojTekst(t.dodaj.uspeh, broj));
    onZatvori();
  };

  return (
    <form onSubmit={posalji} noValidate className="grid gap-5" data-dodaj-pozicije="">
      <VrstaIzbor izabrano={vrsta} onIzbor={setVrsta} oznaka={t.dodaj.vrsta} />
      <SegmentIzbor
        oznaka={t.dodaj.nacin}
        izabrano={nacin}
        onIzbor={(naredni) => {
          setNacin(naredni);
          setGreske({});
          ocisti();
        }}
        vrednosti={[
          { vrednost: "jedno", tekst: t.dodaj.jedno },
          { vrednost: "vise", tekst: t.dodaj.vise },
        ]}
      />

      {nacin === "jedno" ? (
        <Polje id={`${id}-naziv`} oznaka={t.dodaj.naziv} greska={greske.naziv}>
          {(aria) => (
            <input
              {...aria}
              type="text"
              autoComplete="off"
              maxLength={MENU_TEXT.positionLabel}
              placeholder={t.vrste.primer[vrsta]}
              value={naziv}
              onChange={(event) => setNaziv(event.target.value)}
              className={POLJE_KLASA}
            />
          )}
        </Polje>
      ) : (
        <>
          <Polje id={`${id}-prefiks`} oznaka={t.dodaj.prefiks} greska={greske.prefiks}>
            {(aria) => (
              <input
                {...aria}
                type="text"
                autoComplete="off"
                maxLength={MAKS_PREFIKS}
                value={prefiks}
                onChange={(event) => setPrefiksRucno(event.target.value)}
                className={POLJE_KLASA}
              />
            )}
          </Polje>
          <div className="grid grid-cols-2 gap-3">
            <Polje id={`${id}-od`} oznaka={t.dodaj.od} greska={greske.od}>
              {(aria) => (
                <input
                  {...aria}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={od}
                  onChange={(event) => setOd(event.target.value)}
                  className={`${POLJE_KLASA} tabular-nums`}
                />
              )}
            </Polje>
            <Polje id={`${id}-koliko`} oznaka={t.dodaj.koliko} greska={greske.koliko}>
              {(aria) => (
                <input
                  {...aria}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={koliko}
                  onChange={(event) => setKoliko(event.target.value)}
                  className={`${POLJE_KLASA} tabular-nums`}
                />
              )}
            </Polje>
          </div>
          <p className="-mt-3 text-sm text-[var(--mp-tekst-sporedni)]">{fmt(t.dodaj.kolikoPomoc, { n: MENU_MAX_POSITION_BATCH })}</p>
        </>
      )}

      {pregled ? (
        <p data-pregled="" className="rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-2.5 text-sm text-[var(--mp-tekst)]">
          <span className="text-[var(--mp-tekst-sporedni)]">{t.dodaj.pregled} </span>
          <strong className="font-semibold tabular-nums [overflow-wrap:anywhere]">{pregled}</strong>
        </p>
      ) : null}

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

      {greska ? <PorukaGreske>{greska}</PorukaGreske> : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4 [--border:var(--mp-ivica)]">
        <Dugme vrsta="tiho" onClick={onZatvori}>
          {t.zajednicko.otkazi}
        </Dugme>
        <Dugme type="submit" vrsta="primarno" ucitava={radi !== null}>
          {radi !== null
            ? t.zajednicko.cuvaSe
            : nacin === "jedno"
              ? t.dodaj.dugmeJedno
              : kolikoOk !== null
                ? brojTekst(t.dodaj.dugmeVise, kolikoOk)
                : t.lista.dodajMesta}
        </Dugme>
      </div>
    </form>
  );
}
