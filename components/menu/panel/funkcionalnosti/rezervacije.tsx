"use client";

// ScanMe Menu V1 (K25) — Funkcionalnosti > Rezervacije (master §11.1, §11.2,
// §11.6, §13.7; plan docs/meni/planovi/K24.md §2.6): how the venue takes
// reservations. Three ways — off, the ScanMe form, the venue's own system.
// The form asks the guest for one contact (e-mail, phone or both) and nothing
// else is set here: no duration, deadline, table or sound. The venue's own
// system is only a link (https); the form's fields are not shown for it.
// The ScanMe form needs the working hours (Podešavanja): without them it is
// locked, with the reason and a way to enter them. Presentational: the route
// (rezervacije-ruta.tsx) and the izlog pass `config` and `onSacuvaj`.
//
// The fields start from `config` and are not reset when it changes under
// them (a live subscription answers a save with the saved values).

import { CalendarClock, CircleOff, Clock, ExternalLink, Lock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { RESERVATION_ERROR } from "@/lib/menu/errors/reservations";
import { normalizeExternalReservationUrl } from "@/lib/menu/external-url";
import type { ReservationConfig, ReservationMode } from "@/lib/menu/reservation-config";
import { RESERVATION_CONTACT_MODES, type ReservationContactMode } from "@/lib/menu/reservation-form";
import { cn } from "@/lib/utils";
import { Napomena, OZNAKA_KLASA, POLJE_KLASA, Polje, PorukaGreske } from "../../lokal/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { CuvanjeStatus, porukaKoda, useCuvanje, type SacuvajIshod } from "../cuvanje";

const t = menuPanelSr.rezervacije;

const REZIMI: readonly ReservationMode[] = ["off", "form", "external"];
const IKONICE_REZIMA: Record<ReservationMode, LucideIcon> = {
  off: CircleOff,
  form: CalendarClock,
  external: ExternalLink,
};

/**
 * Saves the choice. `contact` is what the form asks for (only meaningful for the
 * form); `externalUrl` is the validated, normalized https address for the
 * venue's own system and null for the other two ways.
 */
export type RezervacijeSacuvaj = (
  mode: ReservationMode,
  contact: ReservationContactMode,
  externalUrl: string | null,
) => Promise<SacuvajIshod>;

type IzborStavka<T extends string> = {
  vrednost: T;
  tekst: string;
  ikonica?: LucideIcon;
  /** Cannot be chosen (the reason is written on the screen and named by `opisId`). */
  zakljucano?: boolean;
  opisId?: string;
};

/** A choice of a few values as native radios that look segmented (one tab stop, arrows move; a locked one is skipped). */
function Izbor<T extends string>({
  oznaka,
  stavke,
  izabrano,
  onIzbor,
  disabled,
  opisId,
}: {
  oznaka: string;
  stavke: readonly IzborStavka<T>[];
  izabrano: T;
  onIzbor: (vrednost: T) => void;
  disabled: boolean;
  opisId?: string;
}) {
  const ime = useId();
  return (
    <fieldset disabled={disabled} aria-describedby={opisId} className="grid min-w-0 gap-1.5">
      <legend className={cn(OZNAKA_KLASA, "mb-1.5")}>{oznaka}</legend>
      <div className="flex min-w-0 gap-1 rounded-[var(--mp-radius-dugme)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)] p-[3px]">
        {stavke.map((stavka) => {
          const aktivno = stavka.vrednost === izabrano;
          const Ikonica: LucideIcon | undefined = stavka.zakljucano ? Lock : stavka.ikonica;
          return (
            <label
              key={stavka.vrednost}
              className={cn(
                "relative inline-flex min-h-[var(--mp-meta)] min-w-[5.5rem] flex-1 basis-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--mp-radius-dugme)] px-3 py-1.5 text-center text-sm font-semibold leading-tight",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)]",
                "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                aktivno
                  ? "bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)]"
                  : "text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina)] has-[:disabled]:hover:bg-transparent",
              )}
            >
              <input
                type="radio"
                name={ime}
                value={stavka.vrednost}
                checked={aktivno}
                disabled={stavka.zakljucano}
                aria-describedby={stavka.opisId}
                onChange={() => onIzbor(stavka.vrednost)}
                className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0"
              />
              {Ikonica ? <Ikonica aria-hidden="true" strokeWidth={1.75} className="hidden size-4 shrink-0 sm:block" /> : null}
              <span className="min-w-0">{stavka.tekst}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function RezervacijeIzbor({
  config,
  bezRadnogVremena,
  radnoVremeHref,
  onSacuvaj,
  disabled = false,
  razlog,
  nivo = 2,
}: {
  config: Pick<ReservationConfig, "mode" | "contact" | "externalUrl">;
  /** The working hours are not entered yet: the ScanMe form is locked. */
  bezRadnogVremena: boolean;
  /** Where "Unesi radno vreme" leads (Podešavanja). */
  radnoVremeHref: string;
  onSacuvaj: RezervacijeSacuvaj;
  /** The role cannot edit features: every control is off. */
  disabled?: boolean;
  /** Why it is off; written on the screen when `disabled`. */
  razlog?: string;
  /** Heading level of the block: 2 under the page title. */
  nivo?: 2 | 3;
}) {
  const id = useId();
  const opisId = `${id}-opis`;
  const zakljucanoId = `${id}-zakljucano`;
  const razlogId = `${id}-razlog`;
  const [mode, setMode] = useState<ReservationMode>(config.mode);
  const [contact, setContact] = useState<ReservationContactMode>(config.contact);
  const [url, setUrl] = useState(config.externalUrl ?? "");
  const [urlGreska, setUrlGreska] = useState<string | null>(null);
  // Was the ScanMe form ever on in this session: requests already sent stay in the waiter panel.
  const [bilaForma, setBilaForma] = useState(config.mode === "form");
  const { faza, kod, pokreni, izmenjeno } = useCuvanje();

  const formaBlokirana = mode === "form" && bezRadnogVremena;
  const nemaSnimanja = disabled || formaBlokirana;
  const opisSnimanja = disabled && razlog ? razlogId : formaBlokirana ? zakljucanoId : undefined;
  const globalnaGreska =
    faza === "greska" && kod !== null && !(kod === RESERVATION_ERROR.urlInvalid && mode === "external")
      ? porukaKoda(kod, t.greska)
      : null;

  const izaberiNacin = (sledeci: ReservationMode) => {
    setMode(sledeci);
    setUrlGreska(null);
    izmenjeno();
  };

  const sacuvaj = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (nemaSnimanja) return;
    let adresa: string | null = null;
    if (mode === "external") {
      adresa = normalizeExternalReservationUrl(url);
      if (adresa === null) {
        setUrlGreska(porukaKoda(RESERVATION_ERROR.urlInvalid, t.greska));
        return;
      }
    }
    setUrlGreska(null);
    const ishod = await pokreni(() => onSacuvaj(mode, contact, adresa));
    if (!ishod) return;
    if (ishod.ok) {
      if (mode === "form") setBilaForma(true);
      if (adresa !== null) setUrl(adresa);
    } else if (mode === "external" && ishod.code === RESERVATION_ERROR.urlInvalid) {
      setUrlGreska(porukaKoda(ishod.code, t.greska));
    }
  };

  return (
    <Kartica data-rezervacije-izbor="">
      <OkvirSekcije naslov={t.naslov} opis={t.opis} nivo={nivo}>
        <form noValidate onSubmit={sacuvaj} className="grid gap-5">
          <Izbor<ReservationMode>
            oznaka={t.izbor}
            disabled={disabled}
            opisId={opisId}
            izabrano={mode}
            onIzbor={izaberiNacin}
            stavke={REZIMI.map((rezim) => ({
              vrednost: rezim,
              tekst: t.rezimi[rezim],
              ikonica: IKONICE_REZIMA[rezim],
              zakljucano: rezim === "form" && bezRadnogVremena,
              opisId: rezim === "form" && bezRadnogVremena ? zakljucanoId : undefined,
            }))}
          />
          <p id={opisId} className="max-w-[65ch] text-[0.9375rem] leading-relaxed text-[var(--mp-tekst)]">
            {t.rezimiOpis[mode]}
          </p>

          {bezRadnogVremena ? (
            <div
              id={zakljucanoId}
              data-forma-zakljucana=""
              className="grid justify-items-start gap-3 rounded-[var(--mp-radius-kontrola)] border p-3 [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]"
            >
              <p className="flex items-start gap-2 text-sm font-medium leading-relaxed text-[var(--mp-tekst)]">
                <Lock aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-upozorenje)]" />
                <span className="min-w-0">{t.bezRadnogVremena}</span>
              </p>
              <Dugme asChild vrsta="sekundarno" velicina="kompaktna">
                <Link href={radnoVremeHref}>
                  <Clock aria-hidden="true" strokeWidth={1.75} />
                  {t.unesiRadnoVreme}
                </Link>
              </Dugme>
            </div>
          ) : null}

          {mode === "form" ? (
            <div data-rezim="form" className="grid gap-3">
              <Izbor<ReservationContactMode>
                oznaka={t.kontakt}
                disabled={disabled}
                izabrano={contact}
                onIzbor={(sledeci) => {
                  setContact(sledeci);
                  izmenjeno();
                }}
                stavke={RESERVATION_CONTACT_MODES.map((vrsta) => ({ vrednost: vrsta, tekst: t.kontakti[vrsta] }))}
              />
              <p className="max-w-[65ch] text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">
                {fmt(t.gostPopunjava, { kontakt: t.gostPopunjavaKontakt[contact] })}
              </p>
            </div>
          ) : null}

          {mode === "external" ? (
            <div data-rezim="external" className="grid max-w-[36rem] gap-3">
              <Polje id={`${id}-link`} oznaka={t.link} pomoc={t.linkOpis} greska={urlGreska}>
                {(aria) => (
                  <input
                    {...aria}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t.linkPrimer}
                    value={url}
                    disabled={disabled}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setUrlGreska(null);
                      izmenjeno();
                    }}
                    className={POLJE_KLASA}
                  />
                )}
              </Polje>
            </div>
          ) : null}

          {mode !== "off" ? <Napomena>{t.radnoVremeNapomena}</Napomena> : null}
          {bilaForma && mode !== "form" ? <Napomena>{t.postojece}</Napomena> : null}

          {disabled && razlog ? (
            <p id={razlogId} className="flex items-start gap-2 text-sm leading-relaxed text-[var(--mp-tekst)]">
              <Lock aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-tekst-sporedni)]" />
              <span className="min-w-0">{razlog}</span>
            </p>
          ) : null}

          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Dugme
                type="submit"
                vrsta="primarno"
                ucitava={faza === "cuva"}
                disabled={nemaSnimanja}
                aria-describedby={opisSnimanja}
              >
                {t.sacuvaj}
              </Dugme>
              <CuvanjeStatus faza={faza} cuva={t.cuva} sacuvano={t.sacuvano} />
            </div>
            {globalnaGreska ? <PorukaGreske>{globalnaGreska}</PorukaGreske> : null}
            <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.vaziOdmah}</p>
          </div>
        </form>
      </OkvirSekcije>
    </Kartica>
  );
}
