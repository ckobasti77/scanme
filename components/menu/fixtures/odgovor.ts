// ScanMe Menu V1 (K26) — izlog fixtures of the reply to a guest: the venue
// mailbox in its four states, the venue's templates and a few replies so
// far. Fictional only (the repo is public): "Demo restoran",
// rezervacije@demo.example. Times hang off IZLOG_SADA.

import type { IzlogPosta } from "@/lib/menu/izlog-params";
import { IZLOG_SADA } from "./lokal";
import type { OdgovorKontekst, OdgovorRed, PostaStanje, SabloniPodaci } from "../odgovor/model";

export const IZLOG_POSTA_ADRESA = "rezervacije@demo.example";
export const IZLOG_LOKAL_ODGOVORA = "Demo restoran";

const MINUT = 60_000;

/** The venue mailbox as replyContext describes it, per `posta=…`. */
export function fixturePosta(posta: IzlogPosta): OdgovorKontekst["mailbox"] {
  if (posta === "nedostupna") return { available: false, connection: null };
  if (posta === "nije") return { available: true, connection: null };
  return {
    available: true,
    connection: { provider: "gmail", emailAddress: IZLOG_POSTA_ADRESA, status: posta === "greska" ? "error" : "active" },
  };
}

/** Replies so far: a call nobody answered, then the message opened in the own e-mail. */
export function fixtureOdgovori(): OdgovorRed[] {
  return [
    {
      id: "rp_02",
      channel: "mailto",
      kind: "accept",
      status: "logged",
      phoneOutcome: null,
      errorCode: null,
      createdAt: IZLOG_SADA - 6 * MINUT,
      byName: "Ana",
    },
    {
      id: "rp_01",
      channel: "phone",
      kind: null,
      status: "logged",
      phoneOutcome: "no_answer",
      errorCode: null,
      createdAt: IZLOG_SADA - 14 * MINUT,
      byName: "Ana",
    },
  ];
}

export function fixtureOdgovorKontekst(posta: IzlogPosta, odgovori: OdgovorRed[] = fixtureOdgovori()): OdgovorKontekst {
  return { venueName: IZLOG_LOKAL_ODGOVORA, signature: null, templates: {}, mailbox: fixturePosta(posta), replies: odgovori };
}

/** Podešavanja › Pošta lokala, per `posta=…`. */
export function fixturePostaStanje(posta: IzlogPosta): PostaStanje {
  if (posta === "nedostupna") return { available: false, providers: [], reason: "not_configured", connection: null };
  const providers: PostaStanje["providers"] = ["gmail", "microsoft"];
  if (posta === "nije") return { available: true, providers, reason: null, connection: null };
  return {
    available: true,
    providers,
    reason: null,
    connection: {
      provider: "gmail",
      emailAddress: IZLOG_POSTA_ADRESA,
      status: posta === "greska" ? "error" : "active",
      connectedAt: IZLOG_SADA - 9 * 24 * 60 * MINUT,
      lastErrorCode: posta === "greska" ? "mail/reconnect_required" : null,
    },
  };
}

/** Podešavanja › Šabloni odgovora; `prilagodjeni` = the venue changed the acceptance and signed. */
export function fixtureSabloni(prilagodjeni: boolean): SabloniPodaci {
  if (!prilagodjeni) return { venueName: IZLOG_LOKAL_ODGOVORA, signature: null, templates: {} };
  return {
    venueName: IZLOG_LOKAL_ODGOVORA,
    signature: "Vaš Demo restoran\nTelefon: +381 60 000 0000",
    templates: {
      accept: {
        subject: "Vidimo se {datum} — {lokal}",
        body: "Dobar dan, {ime},\n\nsto za {brojGostiju} čeka Vas {datum} u {vreme}. Ako kasnite, javite nam se.\n\n{potpis}",
      },
    },
  };
}
