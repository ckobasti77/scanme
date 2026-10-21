"use client";

// ScanMe Menu V1 (K26) — izlog blocks of the reply to a guest: the sheet
// "Obavesti gosta" in the waiter's reservation detail and the two blocks of
// Podešavanja (Pošta lokala, Šabloni odgovora). The REAL presentational
// components over in-memory state: a send "succeeds" after a short pause and
// adds a row; nothing leaves the page (no Convex, no provider, no e-mail).

import { useEffect, useState } from "react";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import {
  IZLOG_POSTA_ADRESA,
  fixtureOdgovorKontekst,
  fixtureOdgovori,
  fixturePostaStanje,
  fixtureSabloni,
} from "@/components/menu/fixtures/odgovor";
import { ObavestiGosta } from "@/components/menu/odgovor/obavesti-gosta";
import type { OdgovorRed, OdgovorRezervacija, PostaStanje, SabloniPodaci, SablonCilj, SlanjeStanje } from "@/components/menu/odgovor/model";
import { PoslovnaPosta } from "@/components/menu/panel/podesavanja/posta";
import { SabloniOdgovora } from "@/components/menu/panel/podesavanja/sabloni";
import type { IzlogOdgovor, IzlogPosta, IzlogSlanje } from "@/lib/menu/izlog-params";
import type { ReplyKind, TemplateKind } from "@/lib/menu/reply-templates";

const VRSTA: Record<IzlogOdgovor, ReplyKind> = { prihvatanje: "accept", odbijanje: "decline", predlog: "propose", druga: "other" };

function pocetnoSlanje(slanje: IzlogSlanje | null): SlanjeStanje {
  if (slanje === "salje") return { stanje: "salje" };
  if (slanje === "poslato") return { stanje: "poslato", adresa: IZLOG_POSTA_ADRESA };
  if (slanje === "greska") return { stanje: "greska", code: "mail/reconnect_required" };
  return { stanje: "miruje" };
}

export function OdgovorIzlog({
  rezervacija,
  posta,
  odgovor,
  slanje,
  ishodPoziva,
  offline,
}: {
  rezervacija: OdgovorRezervacija;
  posta: IzlogPosta;
  odgovor: IzlogOdgovor | null;
  slanje: IzlogSlanje | null;
  ishodPoziva: boolean;
  offline: boolean;
}) {
  const [redovi, setRedovi] = useState<OdgovorRed[]>(fixtureOdgovori);
  const [stanje, setStanje] = useState<SlanjeStanje>(() => pocetnoSlanje(slanje));
  const [zabelezen, setZabelezen] = useState(false);
  const [naCekanju, setNaCekanju] = useState<ReplyKind | null>(null);

  useEffect(() => {
    if (naCekanju === null) return;
    const kraj = window.setTimeout(() => {
      setStanje({ stanje: "poslato", adresa: IZLOG_POSTA_ADRESA });
      setRedovi((stari) => [
        { id: `rp_${stari.length + 1}`, channel: "mailbox", kind: naCekanju, status: "sent", phoneOutcome: null, errorCode: null, createdAt: Date.now(), byName: "Ana" },
        ...stari,
      ]);
      setNaCekanju(null);
    }, 600);
    return () => window.clearTimeout(kraj);
  }, [naCekanju]);

  const dodaj = (red: Omit<OdgovorRed, "id" | "createdAt" | "byName">) =>
    setRedovi((stari) => [{ ...red, id: `rp_${stari.length + 1}`, createdAt: Math.max(Date.now(), IZLOG_SADA), byName: "Ana" }, ...stari]);

  return (
    <ObavestiGosta
      rezervacija={rezervacija}
      kontekst={fixtureOdgovorKontekst(posta, redovi)}
      slanje={stanje}
      radnjeIskljucene={offline}
      pocetnaVrsta={odgovor ? VRSTA[odgovor] : undefined}
      pocetnoIshodOtvoren={ishodPoziva}
      pozivZabelezen={zabelezen}
      onPosalji={(kind) => {
        setStanje({ stanje: "salje" });
        setNaCekanju(kind);
      }}
      onOtvoriEposta={(kind) => dodaj({ channel: "mailto", kind, status: "logged", phoneOutcome: null, errorCode: null })}
      onZabeleziPoziv={(ishod) => {
        dodaj({ channel: "phone", kind: null, status: "logged", phoneOutcome: ishod, errorCode: null });
        setZabelezen(true);
      }}
    />
  );
}

/** Podešavanja › Pošta lokala over a local connection (Poveži connects at once, without a provider). */
export function PostaIzlog({ posta, povratak }: { posta: IzlogPosta; povratak: "povezano" | "greska" | null }) {
  const [stanje, setStanje] = useState<PostaStanje>(() => fixturePostaStanje(posta));
  return (
    <PoslovnaPosta
      stanje={stanje}
      povratak={povratak === "povezano" ? { ishod: "povezano" } : povratak === "greska" ? { ishod: "greska", code: "mail/scope_missing" } : null}
      onPovezi={(provider) =>
        setStanje((staro) => ({
          ...staro,
          connection: { provider, emailAddress: IZLOG_POSTA_ADRESA, status: "active", connectedAt: Date.now(), lastErrorCode: null },
        }))
      }
      onPrekini={() => setStanje((staro) => ({ ...staro, connection: null }))}
    />
  );
}

const SABLON: Record<Exclude<IzlogOdgovor, "druga">, TemplateKind> = { prihvatanje: "accept", odbijanje: "decline", predlog: "propose" };

/** Podešavanja › Šabloni odgovora over a local store. */
export function SabloniIzlog({ prilagodjeni, sablon }: { prilagodjeni: boolean; sablon: Exclude<IzlogOdgovor, "druga"> | null }) {
  const [podaci, setPodaci] = useState<SabloniPodaci>(() => fixtureSabloni(prilagodjeni));
  const [sacuvano, setSacuvano] = useState<SablonCilj | null>(null);
  return (
    <SabloniOdgovora
      podaci={podaci}
      sacuvano={sacuvano}
      pocetno={sablon ? SABLON[sablon] : undefined}
      onSacuvaj={(kind, subject, body) => {
        setPodaci((stari) => ({ ...stari, templates: { ...stari.templates, [kind]: { subject, body } } }));
        setSacuvano(kind);
      }}
      onVrati={(kind) => {
        setPodaci((stari) => {
          const templates = { ...stari.templates };
          delete templates[kind];
          return { ...stari, templates };
        });
        setSacuvano(kind);
      }}
      onPotpis={(potpis) => {
        setPodaci((stari) => ({ ...stari, signature: potpis.trim() || null }));
        setSacuvano("potpis");
      }}
    />
  );
}
