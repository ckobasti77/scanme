"use client";

// ScanMe Menu V1 (K26) — Podešavanja > Šabloni odgovora (master §11.4; plan
// docs/meni/planovi/K24.md §3.4): the venue's starting texts for the messages it
// sends to a guest about a reservation — accept, decline, propose a change — and
// one signature for all of them. The staff can still edit a message before it is
// sent. Placeholders in braces ({ime}, {datum}, …) are filled from the reservation
// by lib/menu/reply-templates.ts; the preview here fills them with an invented
// guest, with the same function the sheet "Obavesti gosta" uses. Presentational:
// the route passes the stored data and the state of each save.
//
// The fields start from `podaci` and are not reset when it changes under them
// (a live subscription answers a save with the saved data).

import { Check, Pencil, RotateCcw } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuOdgovorSr } from "@/lib/i18n/sr/menu-odgovor";
import {
  REPLY_BODY_MAX,
  REPLY_PLACEHOLDERS,
  REPLY_SIGNATURE_MAX,
  REPLY_SUBJECT_MAX,
  TEMPLATE_KINDS,
  cleanSubject,
  defaultTemplate,
  fillTemplate,
  replyValues,
  signatureOf,
  templateFor,
  type ReplyTemplate,
  type TemplateKind,
} from "@/lib/menu/reply-templates";
import { cn } from "@/lib/utils";
import type { SablonCilj, SabloniPodaci } from "../../odgovor/model";
import { POLJE_KLASA, Polje, PorukaGreske } from "../../lokal/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { CuvanjeStatus, type CuvanjeFaza } from "../cuvanje";

const t = menuOdgovorSr.sabloni;

/** Saturday 24. 10. 2026. 19:00 in Belgrade (UTC+2 that day) and half an hour later in the proposal. */
const PRIMER_TERMIN = Date.UTC(2026, 9, 24, 17, 0);
const PRIMER_PREDLOG = Date.UTC(2026, 9, 24, 18, 30);
const PRIMER_GOSTIJU = 4;

const TEKST_POLJE_KLASA = cn(POLJE_KLASA, "h-auto min-h-48 resize-y py-2.5 leading-relaxed");

export type SabloniOdgovoraProps = {
  /** undefined = loading. */
  podaci: SabloniPodaci | undefined;
  /** The target being saved right now. */
  cuva?: SablonCilj | null;
  /** The target that was just saved. */
  sacuvano?: SablonCilj | null;
  greska?: { cilj: SablonCilj; tekst: string } | null;
  onSacuvaj(vrsta: TemplateKind, predmet: string, tekst: string): void;
  onVrati(vrsta: TemplateKind): void;
  onPotpis(potpis: string): void;
  /** Izlog and tests: which template is open first (default "accept"). */
  pocetno?: TemplateKind;
  nivo?: 2 | 3;
};

function nacrtiIz(podaci: SabloniPodaci): Record<TemplateKind, ReplyTemplate> {
  return {
    accept: templateFor("accept", podaci.templates).template,
    decline: templateFor("decline", podaci.templates).template,
    propose: templateFor("propose", podaci.templates).template,
  };
}

function Sadrzaj({
  podaci,
  cuva = null,
  sacuvano = null,
  greska = null,
  onSacuvaj,
  onVrati,
  onPotpis,
  pocetno = "accept",
  nivo = 2,
}: Omit<SabloniOdgovoraProps, "podaci"> & { podaci: SabloniPodaci }) {
  const id = useId();
  const [vrsta, setVrsta] = useState<TemplateKind>(pocetno);
  const [nacrti, setNacrti] = useState(() => nacrtiIz(podaci));
  const [potpis, setPotpis] = useState(podaci.signature ?? "");
  // A field that changed after the last save: "Sačuvano." and an old error no longer describe it.
  const [izmenjeno, setIzmenjeno] = useState<Partial<Record<SablonCilj, true>>>({});

  const Pod = nivo === 2 ? "h3" : "h4";
  const nacrt = nacrti[vrsta];
  const { custom } = templateFor(vrsta, podaci.templates);
  const lokal = podaci.venueName.trim() || t.primer.lokal;

  const predmetPredugo = nacrt.subject.length > REPLY_SUBJECT_MAX;
  const tekstPredugo = nacrt.body.length > REPLY_BODY_MAX;
  const prazno = nacrt.subject.trim() === "" || nacrt.body.trim() === "";
  const mozeSacuvati = !predmetPredugo && !tekstPredugo && !prazno;
  const potpisPredug = potpis.length > REPLY_SIGNATURE_MAX;

  const vrednosti = replyValues(
    {
      guestName: t.primer.ime,
      venueName: lokal,
      requestedAt: PRIMER_TERMIN,
      partySize: PRIMER_GOSTIJU,
      proposedAt: PRIMER_PREDLOG,
      proposalNote: t.primer.predlog,
    },
    signatureOf(potpis, lokal),
  );
  const pregledPredmet = cleanSubject(fillTemplate(nacrt.subject, vrednosti));
  const pregledTekst = fillTemplate(nacrt.body, vrednosti);

  const oznaci = (cilj: SablonCilj) => setIzmenjeno((staro) => ({ ...staro, [cilj]: true }));
  const ocistiIzmenu = (cilj: SablonCilj) => {
    setIzmenjeno((staro) => {
      const novo = { ...staro };
      delete novo[cilj];
      return novo;
    });
  };
  const faza = (cilj: SablonCilj): CuvanjeFaza => (cuva === cilj ? "cuva" : sacuvano === cilj && !izmenjeno[cilj] ? "sacuvano" : "mirno");
  const greskaCilja = (cilj: SablonCilj) => (greska?.cilj === cilj && !izmenjeno[cilj] ? greska.tekst : null);

  function sacuvaj(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mozeSacuvati || cuva !== null) return;
    ocistiIzmenu(vrsta);
    onSacuvaj(vrsta, nacrt.subject, nacrt.body);
  }

  function vrati() {
    if (cuva !== null) return;
    setNacrti((staro) => ({ ...staro, [vrsta]: defaultTemplate(vrsta) }));
    ocistiIzmenu(vrsta);
    onVrati(vrsta);
  }

  function sacuvajPotpis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (potpisPredug || cuva !== null) return;
    ocistiIzmenu("potpis");
    onPotpis(potpis);
  }

  return (
    <div className="grid gap-6">
      <fieldset className="grid min-w-0 gap-2">
        <legend className="sr-only">{menuOdgovorSr.obavesti.vrsta}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEMPLATE_KINDS.map((k) => {
            const aktivno = k === vrsta;
            const posebno = templateFor(k, podaci.templates).custom;
            return (
              <label
                key={k}
                className={cn(
                  "relative grid min-h-[var(--mp-meta)] min-w-0 cursor-pointer justify-items-start gap-1.5 rounded-[var(--mp-radius-kontrola)] border px-3 py-2.5 text-sm font-semibold leading-tight text-[var(--mp-tekst)]",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)]",
                  aktivno
                    ? "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent-meko)] shadow-[inset_0_0_0_1px_var(--mp-mastilo)]"
                    : "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] hover:bg-[var(--mp-povrsina-utisana)]",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-vrsta`}
                  value={k}
                  checked={aktivno}
                  onChange={() => setVrsta(k)}
                  className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0"
                />
                <span className="inline-flex items-center gap-1.5">
                  {aktivno ? <Check aria-hidden="true" strokeWidth={2.5} className="size-4 shrink-0" /> : null}
                  {menuOdgovorSr.vrste[k]}
                </span>
                {posebno ? (
                  <StatusOznaka ton="info" ikonica={Pencil} velicina="mala">
                    {t.prilagodjen}
                  </StatusOznaka>
                ) : (
                  <StatusOznaka ton="neutralno" velicina="mala">
                    {t.podrazumevani}
                  </StatusOznaka>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      <form noValidate onSubmit={sacuvaj} className="grid gap-4" data-sablon-forma={vrsta}>
        <Polje id={`${id}-predmet`} oznaka={t.predmet} greska={predmetPredugo ? fmt(t.predugo, { n: REPLY_SUBJECT_MAX }) : null}>
          {(aria) => (
            <input
              {...aria}
              type="text"
              value={nacrt.subject}
              maxLength={REPLY_SUBJECT_MAX}
              onChange={(event) => {
                const subject = event.target.value;
                setNacrti((staro) => ({ ...staro, [vrsta]: { ...staro[vrsta], subject } }));
                oznaci(vrsta);
              }}
              className={POLJE_KLASA}
            />
          )}
        </Polje>
        <Polje id={`${id}-tekst`} oznaka={t.tekst} greska={tekstPredugo ? fmt(t.predugo, { n: REPLY_BODY_MAX }) : null}>
          {(aria) => (
            <textarea
              {...aria}
              value={nacrt.body}
              rows={10}
              maxLength={REPLY_BODY_MAX}
              onChange={(event) => {
                const body = event.target.value;
                setNacrti((staro) => ({ ...staro, [vrsta]: { ...staro[vrsta], body } }));
                oznaci(vrsta);
              }}
              className={TEKST_POLJE_KLASA}
            />
          )}
        </Polje>

        <div className="grid gap-2 rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-3" data-sablon-zamene="">
          <p className="text-sm font-semibold text-[var(--mp-tekst)]">{t.zamene}</p>
          <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {REPLY_PLACEHOLDERS.map((ime) => (
              <div key={ime} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-[var(--mp-tekst)]">
                <dt>
                  <code className="rounded-[0.375rem] border bg-[var(--mp-povrsina)] px-1.5 py-0.5 font-mono text-[0.8125rem] [--border:var(--mp-ivica)]">{`{${ime}}`}</code>
                </dt>
                <dd className="min-w-0">{t.zameneOpis[ime]}</dd>
              </div>
            ))}
          </dl>
        </div>

        {prazno ? <p className="text-sm font-medium text-[var(--mp-tekst)]">{menuOdgovorSr.obavesti.prazno}</p> : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Dugme type="submit" vrsta="primarno" ucitava={cuva === vrsta} disabled={!mozeSacuvati}>
            {t.sacuvaj}
          </Dugme>
          {custom ? (
            <Dugme vrsta="tiho" ikonica={RotateCcw} disabled={cuva !== null} onClick={vrati}>
              {t.vrati}
            </Dugme>
          ) : null}
          <CuvanjeStatus faza={faza(vrsta)} cuva={t.cuva} sacuvano={t.sacuvano} />
        </div>
        {greskaCilja(vrsta) ? <PorukaGreske>{greskaCilja(vrsta)}</PorukaGreske> : null}
      </form>

      <section aria-labelledby={`${id}-pregled`} className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border p-4 [--border:var(--mp-ivica)]" data-sablon-pregled="">
        <Pod id={`${id}-pregled`} className="text-base font-semibold text-[var(--mp-tekst)]">
          {t.pregled}
        </Pod>
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.pregledOpis}</p>
        <div className="grid gap-3 rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] p-4">
          <p className="break-words text-base font-semibold text-[var(--mp-tekst)]" data-sablon-pregled-predmet="">
            {pregledPredmet}
          </p>
          <p className="whitespace-pre-line break-words text-[0.9375rem] leading-relaxed text-[var(--mp-tekst)]" data-sablon-pregled-tekst="">
            {pregledTekst}
          </p>
        </div>
      </section>

      <form noValidate onSubmit={sacuvajPotpis} className="grid gap-4 border-t pt-6 [--border:var(--mp-ivica)]" data-sablon-potpis="">
        <Polje
          id={`${id}-potpis`}
          oznaka={t.potpis}
          pomoc={t.potpisOpis}
          greska={potpisPredug ? fmt(t.predugo, { n: REPLY_SIGNATURE_MAX }) : null}
        >
          {(aria) => (
            <textarea
              {...aria}
              value={potpis}
              rows={3}
              maxLength={REPLY_SIGNATURE_MAX}
              placeholder={signatureOf(null, lokal)}
              onChange={(event) => {
                setPotpis(event.target.value);
                oznaci("potpis");
              }}
              className={cn(TEKST_POLJE_KLASA, "min-h-24")}
            />
          )}
        </Polje>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Dugme type="submit" vrsta="primarno" ucitava={cuva === "potpis"} disabled={potpisPredug}>
            {t.sacuvaj}
          </Dugme>
          <CuvanjeStatus faza={faza("potpis")} cuva={t.cuva} sacuvano={t.sacuvano} />
        </div>
        {greskaCilja("potpis") ? <PorukaGreske>{greskaCilja("potpis")}</PorukaGreske> : null}
      </form>
    </div>
  );
}

export function SabloniOdgovora({ podaci, ...rest }: SabloniOdgovoraProps) {
  return (
    <Kartica data-sabloni-odgovora="">
      <OkvirSekcije naslov={t.naslov} opis={t.opis} nivo={rest.nivo ?? 2}>
        {podaci === undefined ? <UcitavanjeStanje oblik="forma" redova={3} oznaka={t.naslov} /> : <Sadrzaj podaci={podaci} {...rest} />}
      </OkvirSekcije>
    </Kartica>
  );
}
