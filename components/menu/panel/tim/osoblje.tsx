"use client";

// ScanMe Menu V1 (K28) — the card "Osoblje i konobarski panel" of Tim i pristupi
// (plan docs/meni/planovi/K24.md §4.6): the people who work in the waiter panel
// with a PIN, no account. A row shows the name, the role in the panel and only
// whether a PIN exists ("PIN postavljen" / "Bez PIN-a"): a PIN is never readable.
// "Postavi PIN" / "Novi PIN" lets the system pick a free PIN or takes the owner's
// own three digits, and the PIN that comes back is shown ONCE in the dialog; the
// dialog is mounted only while open, so closing it forgets the PIN. Rename, the
// panel role, "Resetuj PIN" and "Deaktiviraj" live behind the "⋯" of the row (reset
// and deactivate ask first). The zone of a person is a select that exists only when
// the venue has zones. Presentational: the actions come from `radnje`.

import { Ellipsis, KeyRound, Lock, Pencil, RotateCcw, UserPlus, UserX } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { roleCan, type MenuActor } from "@/lib/menu/permissions";
import { cn } from "@/lib/utils";
import { POLJE_KLASA, Napomena, Polje, PorukaGreske, PorukaUspeha, Potvrda, SegmentIzbor } from "../../lokal/zajednicko";
import { StudioDijalog } from "../../studio/dijalog";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { CuvanjeStatus, porukaKoda, useCuvanje, type SacuvajIshod } from "../cuvanje";
import type { TimOsoba, TimPodaci, TimRadnje, TimZona } from "./model";

const tim = menuPanelSr.tim;
const t = tim.osoblje;

type PanelRole = TimOsoba["panelRole"];
const PANEL_ULOGE: readonly PanelRole[] = ["staff", "manager"];
const IME_MAX = 40;
const PIN_OBLIK = /^\d{3}$/;

type Dijalog = { vrsta: "dodaj" } | { vrsta: "ime"; osoba: TimOsoba } | { vrsta: "pin"; osoba: TimOsoba };
type PotvrdaVrsta = { id: string; vrsta: "reset" | "deaktiviraj" };

/** The dialogs "Dodaj osobu" (name and role in the panel) and "Promeni ime" (name only). */
function ImeDijalog({
  osoba,
  onSacuvaj,
  onZatvori,
}: {
  /** The person to rename; undefined = a new person. */
  osoba?: TimOsoba;
  onSacuvaj: (ime: string, panelRole: PanelRole) => Promise<SacuvajIshod>;
  onZatvori: () => void;
}) {
  const id = useId();
  const { faza, kod, pokreni } = useCuvanje();
  const [ime, setIme] = useState(osoba?.displayName ?? "");
  const [panelRole, setPanelRole] = useState<PanelRole>(osoba?.panelRole ?? "staff");
  const [nevazece, setNevazece] = useState(false);
  const formId = `${id}-forma`;
  const imeId = `${id}-ime`;

  const sacuvaj = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cisto = ime.trim();
    if (cisto === "" || cisto.length > IME_MAX) {
      setNevazece(true);
      document.getElementById(imeId)?.focus();
      return;
    }
    setNevazece(false);
    const ishod = await pokreni(() => onSacuvaj(cisto, panelRole));
    if (ishod?.ok) onZatvori();
  };

  return (
    <StudioDijalog
      otvoreno
      onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())}
      naslov={osoba ? t.preimenuj : t.dodaj}
      podnozje={
        <>
          <Dugme vrsta="sekundarno" onClick={onZatvori}>
            {t.odustani}
          </Dugme>
          <Dugme type="submit" form={formId} vrsta="primarno" ucitava={faza === "cuva"}>
            {t.sacuvaj}
          </Dugme>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={sacuvaj} className="grid gap-4">
        <Polje id={imeId} oznaka={t.ime} pomoc={nevazece ? undefined : t.imePomoc} greska={nevazece ? t.imeNeispravno : null}>
          {(aria) => (
            <input
              {...aria}
              type="text"
              autoComplete="off"
              value={ime}
              onChange={(event) => {
                setIme(event.target.value);
                setNevazece(false);
              }}
              className={POLJE_KLASA}
            />
          )}
        </Polje>
        {osoba ? null : (
          <Polje id={`${id}-uloga`} oznaka={t.ulogaUPanelu} pomoc={t.panelUlogeOpis[panelRole]}>
            {(aria) => (
              <select
                {...aria}
                value={panelRole}
                onChange={(event) => setPanelRole(event.target.value as PanelRole)}
                className={cn(POLJE_KLASA, "cursor-pointer")}
              >
                {PANEL_ULOGE.map((uloga) => (
                  <option key={uloga} value={uloga}>
                    {t.panelUloge[uloga]}
                  </option>
                ))}
              </select>
            )}
          </Polje>
        )}
        {faza === "greska" && kod !== null ? <PorukaGreske>{porukaKoda(kod, t.greska)}</PorukaGreske> : null}
      </form>
    </StudioDijalog>
  );
}

/**
 * "Postavi PIN" / "Novi PIN": first the choice (a free PIN from the system or the
 * person's own three digits), then the PIN that came back, shown once. It is
 * state of this component only, which exists only while the dialog is open.
 */
function PinDijalog({
  osoba,
  postavi,
  onZatvori,
}: {
  osoba: TimOsoba;
  postavi: TimRadnje["postaviPin"];
  onZatvori: () => void;
}) {
  const id = useId();
  const [nacin, setNacin] = useState<"sistem" | "svoj">("sistem");
  const [pin, setPin] = useState("");
  const [nevazece, setNevazece] = useState(false);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [rezultat, setRezultat] = useState<{ pin: string; endedSessions: number } | null>(null);
  const formId = `${id}-forma`;
  const pinId = `${id}-pin`;
  const ime = osoba.displayName;

  const posalji = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (radi) return;
    if (nacin === "svoj" && !PIN_OBLIK.test(pin)) {
      setNevazece(true);
      document.getElementById(pinId)?.focus();
      return;
    }
    setNevazece(false);
    setRadi(true);
    setGreska(null);
    try {
      const ishod = await postavi(osoba.id, nacin === "svoj" ? pin : undefined);
      if (ishod.ok) setRezultat({ pin: ishod.pin, endedSessions: ishod.endedSessions });
      else setGreska(porukaKoda(ishod.code, t.greska));
    } catch {
      setGreska(porukaKoda("mreza", t.greska));
    }
    setRadi(false);
  };

  if (rezultat) {
    return (
      <StudioDijalog
        otvoreno
        onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())}
        naslov={t.pinJednomNaslov}
        opis={fmt(t.pinJednomOpis, { ime })}
        podnozje={
          <Dugme vrsta="primarno" onClick={onZatvori}>
            {t.pinZapamtio}
          </Dugme>
        }
      >
        <div className="grid gap-4" data-pin-jednom="">
          <p
            data-pin-rezultat=""
            className="rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] py-5 text-center text-4xl font-semibold tabular-nums tracking-[0.4em] text-[var(--mp-tekst)]"
          >
            {rezultat.pin}
          </p>
          {rezultat.endedSessions > 0 ? <Napomena>{t.pinOdjava}</Napomena> : null}
        </div>
      </StudioDijalog>
    );
  }

  return (
    <StudioDijalog
      otvoreno
      onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())}
      naslov={t.pinNaslov}
      opis={fmt(t.pinOpis, { ime })}
      podnozje={
        <>
          <Dugme vrsta="sekundarno" onClick={onZatvori}>
            {t.odustani}
          </Dugme>
          <Dugme type="submit" form={formId} vrsta="primarno" ikonica={KeyRound} ucitava={radi}>
            {t.pinPotvrdi}
          </Dugme>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={posalji} className="grid gap-4">
        <SegmentIzbor
          oznaka={t.pinIzaberi}
          izabrano={nacin}
          onIzbor={(sledece) => {
            setNacin(sledece);
            setNevazece(false);
          }}
          vrednosti={[
            { vrednost: "sistem", tekst: t.pinSistem },
            { vrednost: "svoj", tekst: t.pinSvoj },
          ]}
        />
        {nacin === "svoj" ? (
          <Polje id={pinId} oznaka={t.pinPolje} pomoc={nevazece ? undefined : t.pinPomoc} greska={nevazece ? t.pinPomoc : null}>
            {(aria) => (
              <input
                {...aria}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 3));
                  setNevazece(false);
                }}
                className={cn(POLJE_KLASA, "w-28 tracking-[0.3em] tabular-nums")}
              />
            )}
          </Polje>
        ) : null}
        {greska !== null ? <PorukaGreske>{greska}</PorukaGreske> : null}
      </form>
    </StudioDijalog>
  );
}

type RadnjeReda = {
  preklopi: () => void;
  pin: () => void;
  ime: () => void;
  uloga: (panelRole: PanelRole) => void;
  zona: (zoneId: string | null) => void;
  potvrda: (potvrda: PotvrdaVrsta | null) => void;
  potvrdi: (potvrda: PotvrdaVrsta) => void;
};

function OsobaRed({
  osoba,
  zone,
  moze,
  mozeZone,
  zauzeto,
  otvoreno,
  potvrda,
  r,
}: {
  osoba: TimOsoba;
  zone: readonly TimZona[];
  moze: boolean;
  mozeZone: boolean;
  zauzeto: boolean;
  otvoreno: boolean;
  potvrda: PotvrdaVrsta | null;
  r: RadnjeReda;
}) {
  const id = useId();
  const radnjeId = `${id}-radnje`;
  // "Odustani" gives focus back to the button that asked the question.
  const resetRef = useRef<HTMLButtonElement>(null);
  const deaktivirajRef = useRef<HTMLButtonElement>(null);
  const aktivnaPotvrda = potvrda !== null && potvrda.id === osoba.id ? potvrda : null;
  const zonaId = zone.some((zona) => zona.id === osoba.activeZoneId) ? (osoba.activeZoneId ?? "") : "";

  return (
    <li data-osoba={osoba.id} className="grid gap-3 border-t py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="font-semibold leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{osoba.displayName}</p>
          <p className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{t.panelUloge[osoba.panelRole]}</p>
        </div>
        <StatusOznaka ton={osoba.hasPin ? "uspeh" : "neutralno"} velicina="mala" ikonica={KeyRound}>
          {osoba.hasPin ? t.pinPostavljen : t.pinNije}
        </StatusOznaka>
      </div>

      {zone.length > 0 ? (
        <Polje id={`${id}-zona`} oznaka={t.zona} className="sm:max-w-xs">
          {(aria) => (
            <select
              {...aria}
              value={zonaId}
              disabled={!mozeZone || zauzeto}
              onChange={(event) => r.zona(event.target.value === "" ? null : event.target.value)}
              className={cn(POLJE_KLASA, "cursor-pointer")}
            >
              <option value="">{t.sveZone}</option>
              {zone.map((zona) => (
                <option key={zona.id} value={zona.id}>
                  {zona.name}
                </option>
              ))}
            </select>
          )}
        </Polje>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={KeyRound} disabled={!moze || zauzeto} onClick={r.pin}>
          {osoba.hasPin ? t.promeniPin : t.postaviPin}
        </Dugme>
        <IkonicaDugme
          ikonica={Ellipsis}
          oznaka={fmt(t.radnje, { ime: osoba.displayName })}
          aria-expanded={otvoreno}
          aria-controls={radnjeId}
          onClick={r.preklopi}
        />
      </div>

      {otvoreno ? (
        <div id={radnjeId} data-osoba-radnje="" className="grid gap-3 rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] p-3">
          <Polje id={`${id}-uloga`} oznaka={t.ulogaUPanelu} pomoc={t.panelUlogeOpis[osoba.panelRole]}>
            {(aria) => (
              <select
                {...aria}
                value={osoba.panelRole}
                disabled={!moze || zauzeto}
                onChange={(event) => r.uloga(event.target.value as PanelRole)}
                className={cn(POLJE_KLASA, "cursor-pointer")}
              >
                {PANEL_ULOGE.map((uloga) => (
                  <option key={uloga} value={uloga}>
                    {t.panelUloge[uloga]}
                  </option>
                ))}
              </select>
            )}
          </Polje>
          <div className="flex flex-wrap items-center gap-2">
            <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Pencil} disabled={!moze || zauzeto} onClick={r.ime}>
              {t.preimenuj}
            </Dugme>
            {osoba.hasPin ? (
              <Dugme
                ref={resetRef}
                vrsta="sekundarno"
                velicina="kompaktna"
                ikonica={RotateCcw}
                disabled={!moze || zauzeto}
                onClick={() => r.potvrda({ id: osoba.id, vrsta: "reset" })}
              >
                {t.resetujPin}
              </Dugme>
            ) : null}
            <Dugme
              ref={deaktivirajRef}
              vrsta="tiho"
              velicina="kompaktna"
              ikonica={UserX}
              disabled={!moze || zauzeto}
              onClick={() => r.potvrda({ id: osoba.id, vrsta: "deaktiviraj" })}
            >
              {t.deaktiviraj}
            </Dugme>
          </div>
        </div>
      ) : null}

      {aktivnaPotvrda ? (
        <Potvrda
          tekst={
            aktivnaPotvrda.vrsta === "reset"
              ? `${t.resetNaslov} ${fmt(t.resetOpis, { ime: osoba.displayName })}`
              : `${t.deaktivirajNaslov} ${fmt(t.deaktivirajOpis, { ime: osoba.displayName })}`
          }
          potvrdi={aktivnaPotvrda.vrsta === "reset" ? t.resetPotvrdi : t.deaktivirajPotvrdi}
          odustani={t.odustani}
          radi={zauzeto}
          onPotvrdi={() => r.potvrdi(aktivnaPotvrda)}
          onOdustani={() => {
            r.potvrda(null);
            (aktivnaPotvrda.vrsta === "reset" ? resetRef : deaktivirajRef).current?.focus();
          }}
        />
      ) : null}
    </li>
  );
}

export function Osoblje({
  actor,
  osoblje,
  zone,
  radnje,
  pocetniPin = false,
}: {
  actor: MenuActor;
  /** undefined while loading. */
  osoblje: TimPodaci["osoblje"];
  /** Active zones; an empty list hides every zone control. */
  zone: readonly TimZona[];
  radnje: Pick<
    TimRadnje,
    | "dodajOsobu"
    | "preimenuj"
    | "ulogaUPanelu"
    | "deaktiviraj"
    | "postaviPin"
    | "resetujPin"
    | "otkljucajPinove"
    | "postaviZonu"
  >;
  /** Open the PIN dialog of the first active person right away (the izlog's `modal=pin`). */
  pocetniPin?: boolean;
}) {
  const { faza, kod, pokreni } = useCuvanje();
  const [dijalog, setDijalog] = useState<Dijalog | null>(() => {
    const prva = pocetniPin ? osoblje?.find((osoba) => osoba.active) : undefined;
    return prva ? { vrsta: "pin", osoba: prva } : null;
  });
  const [potvrda, setPotvrda] = useState<PotvrdaVrsta | null>(null);
  const [otvorena, setOtvorena] = useState<string | null>(null);
  const [otkljucano, setOtkljucano] = useState<number | null>(null);

  const moze = roleCan(actor, "staff.pin");
  const mozeZone = roleCan(actor, "waiter.assignZones");
  const zauzeto = faza === "cuva";

  const potvrdi = async (izabrano: PotvrdaVrsta) => {
    const ishod = await pokreni(() =>
      izabrano.vrsta === "reset" ? radnje.resetujPin(izabrano.id) : radnje.deaktiviraj(izabrano.id),
    );
    if (ishod?.ok) setPotvrda(null);
  };

  const otkljucaj = () =>
    void pokreni(async () => {
      const odgovor = await radnje.otkljucajPinove();
      if (odgovor.ok) setOtkljucano(odgovor.unlocked);
      return odgovor.ok ? { ok: true } : odgovor;
    });

  const aktivni = osoblje?.filter((osoba) => osoba.active) ?? [];
  const neaktivni = osoblje?.filter((osoba) => !osoba.active) ?? [];

  const redovi = (r: (osoba: TimOsoba) => RadnjeReda) =>
    aktivni.map((osoba) => (
      <OsobaRed
        key={osoba.id}
        osoba={osoba}
        zone={zone}
        moze={moze}
        mozeZone={mozeZone}
        zauzeto={zauzeto}
        otvoreno={otvorena === osoba.id}
        potvrda={potvrda}
        r={r(osoba)}
      />
    ));

  return (
    <Kartica data-osoblje="">
      <OkvirSekcije
        naslov={t.naslov}
        opis={t.opis}
        nivo={2}
        radnje={
          <Dugme vrsta="sekundarno" ikonica={UserPlus} disabled={!moze} onClick={() => setDijalog({ vrsta: "dodaj" })}>
            {t.dodaj}
          </Dugme>
        }
      >
        {osoblje === undefined ? (
          <UcitavanjeStanje oblik="lista" redova={3} oznaka={tim.ucitavanje} />
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-2">
              {moze ? null : <Napomena>{t.resetSamoVlasnik}</Napomena>}
              <Napomena>
                <span data-pin-nikad="">{t.pinNikadVidljiv}</span>
              </Napomena>
              <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">
                {zone.length > 0 ? t.zonaPomoc : t.bezZona}
              </p>
            </div>

            {osoblje.length === 0 ? (
              <p data-osoblje-prazno="" className="rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-3 text-sm leading-relaxed text-[var(--mp-tekst)]">
                {t.prazno}
              </p>
            ) : (
              <ul className="grid [--border:var(--mp-ivica)]">
                {redovi((osoba) => ({
                  preklopi: () => setOtvorena((tekuca) => (tekuca === osoba.id ? null : osoba.id)),
                  pin: () => setDijalog({ vrsta: "pin", osoba }),
                  ime: () => setDijalog({ vrsta: "ime", osoba }),
                  uloga: (panelRole) => void pokreni(() => radnje.ulogaUPanelu(osoba.id, panelRole)),
                  zona: (zoneId) => void pokreni(() => radnje.postaviZonu(osoba.id, zoneId)),
                  potvrda: setPotvrda,
                  potvrdi: (izabrano) => void potvrdi(izabrano),
                }))}
              </ul>
            )}

            {neaktivni.length > 0 ? (
              <OkvirSekcije naslov={t.neaktivni} nivo={3}>
                <ul className="grid [--border:var(--mp-ivica)]">
                  {neaktivni.map((osoba) => (
                    <li
                      key={osoba.id}
                      data-osoba-neaktivna={osoba.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-3 first:border-t-0 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0 font-medium text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{osoba.displayName}</span>
                      <StatusOznaka ton="neutralno" velicina="mala" ikonica={Lock}>
                        {t.neaktivan}
                      </StatusOznaka>
                    </li>
                  ))}
                </ul>
              </OkvirSekcije>
            ) : null}

            <div className="grid justify-items-start gap-2 border-t pt-4 [--border:var(--mp-ivica)]">
              <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.otkljucajOpis}</p>
              <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Lock} disabled={!moze || zauzeto} onClick={otkljucaj}>
                {t.otkljucaj}
              </Dugme>
            </div>

            <div className="grid gap-2">
              <PorukaUspeha tekst={otkljucano === null ? null : fmt(t.otkljucano, { broj: otkljucano })} />
              <CuvanjeStatus faza={faza} cuva={tim.clanovi.cuva} sacuvano={tim.clanovi.sacuvano} />
              {faza === "greska" && kod !== null ? <PorukaGreske>{porukaKoda(kod, t.greska)}</PorukaGreske> : null}
            </div>
          </div>
        )}
      </OkvirSekcije>

      {dijalog?.vrsta === "dodaj" ? (
        <ImeDijalog onSacuvaj={radnje.dodajOsobu} onZatvori={() => setDijalog(null)} />
      ) : null}
      {dijalog?.vrsta === "ime" ? (
        <ImeDijalog
          osoba={dijalog.osoba}
          onSacuvaj={(ime) => radnje.preimenuj(dijalog.osoba.id, ime)}
          onZatvori={() => setDijalog(null)}
        />
      ) : null}
      {dijalog?.vrsta === "pin" ? (
        <PinDijalog osoba={dijalog.osoba} postavi={radnje.postaviPin} onZatvori={() => setDijalog(null)} />
      ) : null}
    </Kartica>
  );
}
