"use client";

// ScanMe Menu V1 (K26) — "Obavesti gosta" (master §11.4; plan docs/meni/planovi/K24.md
// §3): the sheet inside the waiter's reservation detail (under the heading "Javite
// gostu") where the staff answer a guest about a reservation. The message starts
// from the venue's template of the kind that matches the decision just made; the
// staff can change the subject and the text before anything leaves. Three ways out:
//   Pošalji iz pošte lokala  the venue's connected mailbox sends it (only with an
//                            active connection and a guest e-mail address)
//   Otvori u e-pošti         a mailto: link: the staff's own mail program sends it
//   Pozovi                   a tel: link, and an optional note of how the call went
// Presentational: the route passes the context (template, signature, mailbox
// state, earlier replies), the state of the send and the callbacks. No token, no
// secret and no provider ever reaches this component: only the address of the
// connected mailbox.

import {
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Mail,
  NotebookPen,
  OctagonAlert,
  Phone,
  PhoneCall,
  PhoneMissed,
  Send,
  Voicemail,
  type LucideIcon,
} from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuOdgovorSr } from "@/lib/i18n/sr/menu-odgovor";
import { buildMailto } from "@/lib/menu/mailto";
import { telHref } from "@/lib/menu/phone";
import {
  REPLY_BODY_MAX,
  REPLY_KINDS,
  REPLY_SUBJECT_MAX,
  composeReply,
  replyKindForStatus,
  replyTime,
  type ReplyFacts,
  type ReplyKind,
} from "@/lib/menu/reply-templates";
import { cn } from "@/lib/utils";
import { Dugme, dugmeKlase } from "../zajednicko/dugme";
import { STATUS_TONOVI, type StatusTon } from "../zajednicko/status-oznaka";
import { UcitavanjeStanje } from "../zajednicko/stanja";
import type { IshodPoziva, OdgovorKontekst, OdgovorRed, OdgovorRezervacija, SlanjeStanje } from "./model";

const t = menuOdgovorSr.obavesti;

const POLJE =
  "min-h-12 w-full rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] px-3 text-base text-[var(--mp-tekst)] [--border:var(--mp-ivica-kontrole)] disabled:opacity-60";

const ISHODI: readonly IshodPoziva[] = ["reached", "no_answer", "left_message"];
const ISHOD_IKONICE: Record<IshodPoziva, LucideIcon> = {
  reached: PhoneCall,
  no_answer: PhoneMissed,
  left_message: Voicemail,
};
const STATUS_IKONICE: Record<OdgovorRed["status"], LucideIcon> = {
  sending: Clock,
  sent: CircleCheck,
  failed: OctagonAlert,
  logged: NotebookPen,
};

export type ObavestiGostaProps = {
  rezervacija: OdgovorRezervacija;
  /** undefined = loading (skeleton), null = not available (render nothing). */
  kontekst: OdgovorKontekst | null | undefined;
  slanje: SlanjeStanje;
  /** Offline: the buttons are disabled; the reason is shown by the parent. */
  radnjeIskljucene?: boolean;
  onPosalji(vrsta: ReplyKind, predmet: string, tekst: string): void;
  /** Called when the mailto: link is clicked (logging); the link still navigates. */
  onOtvoriEposta?(vrsta: ReplyKind): void;
  onZabeleziPoziv?(ishod: IshodPoziva): void;
  /** True right after a call outcome was logged (shows "Zabeleženo."). */
  pozivZabelezen?: boolean;
  /** Izlog and tests: the kind the sheet starts with (default: the one of the reservation's status). */
  pocetnaVrsta?: ReplyKind;
  /** Izlog and tests: the call-outcome block starts open. */
  pocetnoIshodOtvoren?: boolean;
};

/** A quiet note with an icon and a state word's tone; the icon never carries the meaning alone. */
function Beleska({ ton, ikonica: Ikonica, role, children }: { ton: StatusTon; ikonica?: LucideIcon; role?: "status" | "alert"; children: ReactNode }) {
  const stil = STATUS_TONOVI[ton];
  const Ikona = Ikonica ?? stil.ikonica;
  return (
    <div
      role={role}
      data-beleska={ton}
      className={cn(
        "flex items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-base text-[var(--mp-tekst)]",
        stil.povrsina,
      )}
    >
      <Ikona aria-hidden="true" strokeWidth={2} className={cn("mt-0.5 size-5 shrink-0", stil.ikonicaBoja)} />
      <p className="min-w-0 break-words">{children}</p>
    </div>
  );
}

function RedIstorije({ red }: { red: OdgovorRed }) {
  const Ikonica = STATUS_IKONICE[red.status];
  const linija = fmt(menuOdgovorSr.istorija.red, {
    vreme: replyTime(red.createdAt),
    kanal: menuOdgovorSr.istorija.kanal[red.channel],
    vrsta: red.kind ? menuOdgovorSr.vrste[red.kind] : "",
  }).replace(/\s*·\s*$/, "");
  const ishod = red.phoneOutcome ? menuOdgovorSr.ishod[red.phoneOutcome] : null;
  const stanje = [menuOdgovorSr.istorija.status[red.status], ishod, red.byName].filter((deo): deo is string => Boolean(deo)).join(" · ");
  return (
    <li className="grid gap-1 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] p-3 [--border:var(--mp-ivica)]" data-odgovor-red={red.id}>
      <span className="break-words text-base font-semibold tabular-nums text-[var(--mp-tekst)]">{linija}</span>
      <span className="inline-flex items-start gap-2 text-[0.9375rem] text-[var(--mp-tekst)]">
        <Ikonica
          aria-hidden="true"
          strokeWidth={2}
          className={cn("mt-0.5 size-4 shrink-0", red.status === "failed" ? "text-[var(--mp-opasnost)]" : red.status === "sent" ? "text-[var(--mp-uspeh)]" : "text-[var(--mp-tekst-sporedni)]")}
        />
        <span className="min-w-0 break-words">{stanje}</span>
      </span>
    </li>
  );
}

function Obrazac({
  rezervacija,
  kontekst,
  slanje,
  radnjeIskljucene = false,
  onPosalji,
  onOtvoriEposta,
  onZabeleziPoziv,
  pozivZabelezen = false,
  pocetnaVrsta,
  pocetnoIshodOtvoren = false,
}: Omit<ObavestiGostaProps, "kontekst"> & { kontekst: OdgovorKontekst }) {
  const id = useId();
  const cinjenice: ReplyFacts = {
    guestName: rezervacija.guestName,
    venueName: kontekst.venueName,
    requestedAt: rezervacija.requestedAt,
    partySize: rezervacija.partySize,
    proposedAt: rezervacija.proposedAt,
    proposalNote: rezervacija.proposalNote,
  };
  const sastavi = (vrsta: ReplyKind) => composeReply(vrsta, cinjenice, { templates: kontekst.templates, signature: kontekst.signature });

  const [vrsta, setVrsta] = useState<ReplyKind>(pocetnaVrsta ?? replyKindForStatus(rezervacija.status));
  const [poruka, setPoruka] = useState(() => sastavi(vrsta));

  const promeniVrstu = (nova: ReplyKind) => {
    setVrsta(nova);
    setPoruka(sastavi(nova));
  };

  const email = rezervacija.contactEmail?.trim() || null;
  const telefon = rezervacija.contactPhone?.trim() || null;
  const telefonHref = telefon ? telHref(telefon) : null;
  const veza = kontekst.mailbox.connection;
  const salje = slanje.stanje === "salje";
  const prazno = poruka.subject.trim() === "" || poruka.body.trim() === "";
  const mozePostom = email !== null && kontekst.mailbox.available && veza?.status === "active";
  const mailto = email ? buildMailto({ to: email, subject: poruka.subject, body: poruka.body, truncatedNote: t.napomenaSkraceno }) : null;
  const greske: Record<string, string | undefined> = menuOdgovorSr.greske;

  const napomena: ReactNode =
    email === null ? null : !kontekst.mailbox.available ? (
      <Beleska ton="info">{t.postaNedostupna}</Beleska>
    ) : veza === null ? (
      <Beleska ton="info">{t.postaNijePovezana}</Beleska>
    ) : veza.status === "error" ? (
      <Beleska ton="upozorenje" role="status">
        {t.postaGreska}
      </Beleska>
    ) : null;

  function posalji(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mozePostom || prazno || salje || radnjeIskljucene) return;
    onPosalji(vrsta, poruka.subject, poruka.body);
  }

  return (
    <section aria-labelledby={`${id}-naslov`} data-obavesti-gosta="" className="grid gap-4">
      <h3 id={`${id}-naslov`} className="text-base font-bold text-[var(--mp-tekst)]">
        {t.naslov}
      </h3>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-1 text-base font-semibold text-[var(--mp-tekst)]">{t.vrsta}</legend>
        <div className="grid grid-cols-2 gap-2">
          {REPLY_KINDS.map((k) => {
            const aktivno = k === vrsta;
            return (
              <label
                key={k}
                className={cn(
                  "relative inline-flex min-h-12 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-center text-base font-semibold leading-tight",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)]",
                  aktivno
                    ? "[--border:var(--mp-mastilo)] bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)]"
                    : "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)]",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-vrsta`}
                  value={k}
                  checked={aktivno}
                  onChange={() => promeniVrstu(k)}
                  className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0"
                />
                {aktivno ? <Check aria-hidden="true" strokeWidth={2.5} className="size-4 shrink-0" /> : null}
                <span className="min-w-0 break-words">{menuOdgovorSr.vrste[k]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="break-words text-base text-[var(--mp-tekst)]" data-obavesti-kome="">
        {email ? (
          <>
            <span className="font-semibold">{t.kome}:</span> <span className="break-all">{email}</span>
          </>
        ) : telefon ? (
          t.bezEmaila
        ) : (
          t.bezKontakta
        )}
      </p>

      {email ? (
        <form onSubmit={posalji} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-predmet`} className="text-base font-semibold text-[var(--mp-tekst)]">
              {t.predmet}
            </label>
            <input
              id={`${id}-predmet`}
              type="text"
              value={poruka.subject}
              maxLength={REPLY_SUBJECT_MAX}
              onChange={(event) => setPoruka((stara) => ({ ...stara, subject: event.target.value }))}
              aria-invalid={prazno && poruka.subject.trim() === "" ? true : undefined}
              disabled={salje}
              className={POLJE}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-tekst`} className="text-base font-semibold text-[var(--mp-tekst)]">
              {t.tekst}
            </label>
            <textarea
              id={`${id}-tekst`}
              value={poruka.body}
              rows={10}
              maxLength={REPLY_BODY_MAX}
              onChange={(event) => setPoruka((stara) => ({ ...stara, body: event.target.value }))}
              aria-invalid={prazno && poruka.body.trim() === "" ? true : undefined}
              disabled={salje}
              className={cn(POLJE, "min-h-48 resize-y py-2.5 leading-relaxed")}
            />
          </div>

          {prazno ? (
            <p id={`${id}-prazno`} className="text-[0.9375rem] font-medium text-[var(--mp-tekst)]" data-obavesti-prazno="">
              {t.prazno}
            </p>
          ) : null}

          {napomena}

          {mozePostom && veza ? (
            <div className="grid gap-2">
              <Dugme
                type="submit"
                vrsta="akcent"
                ikonica={Send}
                ucitava={salje}
                disabled={prazno || radnjeIskljucene}
                aria-describedby={prazno ? `${id}-prazno` : undefined}
                className="min-h-14 w-full whitespace-normal px-3 text-[1.0625rem] leading-tight"
              >
                {salje ? t.salje : t.posalji}
              </Dugme>
              <p className="break-all text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{fmt(t.saljeSa, { adresa: veza.emailAddress })}</p>
            </div>
          ) : null}

          <div role="status" aria-live="polite">
            {slanje.stanje === "poslato" ? <Beleska ton="uspeh">{fmt(t.poslato, { adresa: slanje.adresa })}</Beleska> : null}
          </div>
          {slanje.stanje === "greska" ? (
            <Beleska ton="opasnost" role="alert">
              {greske[slanje.code] ?? greske["mail/send_failed"]}
            </Beleska>
          ) : null}
        </form>
      ) : null}

      {mailto || telefonHref ? (
        <div className="grid gap-2" data-obavesti-izlaz="">
          <div className="grid gap-2 sm:grid-cols-2">
            {mailto && email ? (
              <a
                href={mailto.href}
                aria-label={fmt(t.otvoriCitac, { email })}
                onClick={() => onOtvoriEposta?.(vrsta)}
                className={cn(dugmeKlase({ vrsta: "sekundarno" }), "min-h-12 w-full px-4")}
              >
                <Mail aria-hidden="true" strokeWidth={1.75} />
                {t.otvori}
              </a>
            ) : null}
            {telefon && telefonHref ? (
              <a href={telefonHref} aria-label={fmt(t.pozoviCitac, { telefon })} className={cn(dugmeKlase({ vrsta: "sekundarno" }), "min-h-12 w-full px-4")}>
                <Phone aria-hidden="true" strokeWidth={1.75} />
                {t.pozovi}
              </a>
            ) : null}
          </div>
          {mailto?.truncated ? <p className="text-[0.9375rem] text-[var(--mp-tekst)]">{t.skraceno}</p> : null}
        </div>
      ) : null}

      {telefon && telefonHref && onZabeleziPoziv ? (
        <details
          open={pocetnoIshodOtvoren || undefined}
          data-ishod-poziva=""
          className="group rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina-utisana)] [--border:var(--mp-ivica)]"
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-base font-semibold text-[var(--mp-tekst)] [&::-webkit-details-marker]:hidden">
            {menuOdgovorSr.ishod.naslov}
            <ChevronDown aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="grid gap-3 px-4 pb-4">
            <p className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">{menuOdgovorSr.ishod.opis}</p>
            <div className="grid gap-2">
              {ISHODI.map((ishod) => (
                <Dugme
                  key={ishod}
                  vrsta="sekundarno"
                  ikonica={ISHOD_IKONICE[ishod]}
                  disabled={radnjeIskljucene}
                  onClick={() => onZabeleziPoziv(ishod)}
                  className="min-h-12 w-full justify-start"
                >
                  {menuOdgovorSr.ishod[ishod]}
                </Dugme>
              ))}
            </div>
            <div role="status" aria-live="polite" className="min-h-6">
              {pozivZabelezen ? (
                <span className="inline-flex items-center gap-2 text-base font-semibold text-[var(--mp-tekst)]">
                  <CircleCheck aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 text-[var(--mp-uspeh)]" />
                  {menuOdgovorSr.ishod.zabelezeno}
                </span>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}

      {kontekst.replies.length > 0 ? (
        <section aria-labelledby={`${id}-istorija`} className="grid gap-2" data-odgovor-istorija="">
          <h4 id={`${id}-istorija`} className="text-base font-bold text-[var(--mp-tekst)]">
            {menuOdgovorSr.istorija.naslov}
          </h4>
          <ul className="grid gap-2">
            {kontekst.replies.map((red) => (
              <RedIstorije key={red.id} red={red} />
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

export function ObavestiGosta(props: ObavestiGostaProps) {
  const { kontekst } = props;
  if (kontekst === null) return null;
  if (kontekst === undefined) {
    return (
      <section aria-busy="true" data-obavesti-gosta="ucitava" className="grid gap-3">
        <h3 className="sr-only">{t.naslov}</h3>
        <UcitavanjeStanje oblik="forma" redova={3} oznaka={t.naslov} />
      </section>
    );
  }
  return <Obrazac {...props} kontekst={kontekst} />;
}
