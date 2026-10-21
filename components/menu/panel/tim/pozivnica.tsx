"use client";

// ScanMe Menu V1 (K28) — the dialog "Pozovi člana tima" (plan docs/meni/planovi/K24.md
// §4.6): an e-mail and a role, limited to the roles the actor may give
// (`ulogeZaPoziv`: a Menadžer is never offered Vlasnik). On success the dialog
// shows the invitation link ONCE, with "Kopiraj link", the day it expires and the
// note that ScanMe sends no e-mail. Closing the dialog forgets the link: the
// parent mounts it only while it is open. `preset` fills the form for "Pošalji
// novu pozivnicu" of an expired invitation.

import { Mail } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { formatBelgradeDate } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { MenuActor, MenuRole } from "@/lib/menu/permissions";
import { ulogeZaPoziv } from "@/lib/menu/team-view";
import { cn } from "@/lib/utils";
import { POLJE_KLASA, Napomena, Polje, PorukaGreske } from "../../lokal/zajednicko";
import { StudioDijalog } from "../../studio/dijalog";
import { Dugme } from "../../zajednicko/dugme";
import { porukaKoda } from "../cuvanje";
import { KopirajLink } from "./link-panela";
import type { TimRadnje } from "./model";

const t = menuPanelSr.tim.pozivnica;
const uloge = menuPanelSr.tim.uloge;

const EMAIL_OBLIK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PozivnicaPreset = { email: string; uloga: MenuRole };

type Pozvano = { url: string; expiresAt: number };

export function Pozivnica({
  actor,
  pozovi,
  preset,
  onZatvori,
}: {
  actor: MenuActor;
  pozovi: TimRadnje["pozovi"];
  preset?: PozivnicaPreset;
  onZatvori: () => void;
}) {
  const id = useId();
  const dozvoljene = ulogeZaPoziv(actor);
  const [email, setEmail] = useState(preset?.email ?? "");
  const [uloga, setUloga] = useState<MenuRole>(
    preset && dozvoljene.includes(preset.uloga) ? preset.uloga : (dozvoljene[dozvoljene.length - 1] ?? "editor"),
  );
  const [nevazece, setNevazece] = useState(false);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [pozvano, setPozvano] = useState<Pozvano | null>(null);

  const posalji = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (radi) return;
    const cist = email.trim();
    if (!EMAIL_OBLIK.test(cist) || !dozvoljene.includes(uloga)) {
      setNevazece(true);
      document.getElementById(`${id}-email`)?.focus();
      return;
    }
    setNevazece(false);
    setRadi(true);
    setGreska(null);
    try {
      const ishod = await pozovi(cist, uloga);
      if (ishod.ok) setPozvano({ url: ishod.url, expiresAt: ishod.expiresAt });
      else setGreska(porukaKoda(ishod.code, t.greska));
    } catch {
      setGreska(porukaKoda("mreza", t.greska));
    }
    setRadi(false);
  };

  if (pozvano) {
    return (
      <StudioDijalog
        otvoreno
        onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())}
        naslov={t.linkNaslov}
        opis={t.linkOpis}
        podnozje={
          <Dugme vrsta="primarno" onClick={onZatvori}>
            {t.zatvori}
          </Dugme>
        }
      >
        <div className="grid gap-4" data-pozivnica-link="">
          <p className="min-w-0 max-w-full select-all break-all rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-2.5 text-[0.9375rem] leading-relaxed text-[var(--mp-tekst)]">
            {pozvano.url}
          </p>
          <KopirajLink tekst={pozvano.url} oznaka={t.kopiraj} kopirano={t.kopirano} neuspelo={t.kopiranjeNeuspelo} />
          <p className="text-sm font-medium text-[var(--mp-tekst)]">
            {fmt(t.linkIstice, { datum: formatBelgradeDate(pozvano.expiresAt) })}
          </p>
          <Napomena>{t.bezMejla}</Napomena>
        </div>
      </StudioDijalog>
    );
  }

  const formId = `${id}-forma`;
  return (
    <StudioDijalog
      otvoreno
      onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())}
      naslov={t.naslov}
      opis={t.opis}
      podnozje={
        <>
          <Dugme vrsta="sekundarno" onClick={onZatvori}>
            {menuPanelSr.tim.clanovi.odustani}
          </Dugme>
          <Dugme type="submit" form={formId} vrsta="primarno" ikonica={Mail} ucitava={radi}>
            {radi ? t.salje : t.posalji}
          </Dugme>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={posalji} className="grid gap-4">
        <Polje
          id={`${id}-email`}
          oznaka={t.email}
          pomoc={nevazece ? undefined : t.emailPomoc}
          greska={nevazece ? t.emailNeispravan : null}
        >
          {(aria) => (
            <input
              {...aria}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setNevazece(false);
              }}
              className={POLJE_KLASA}
            />
          )}
        </Polje>
        <Polje id={`${id}-uloga`} oznaka={t.uloga}>
          {(aria) => (
            <select
              {...aria}
              value={uloga}
              onChange={(event) => setUloga(event.target.value as MenuRole)}
              className={cn(POLJE_KLASA, "cursor-pointer")}
            >
              {dozvoljene.map((moguca) => (
                <option key={moguca} value={moguca}>
                  {uloge[moguca].naziv}
                </option>
              ))}
            </select>
          )}
        </Polje>
        <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{uloge[uloga].opis}</p>
        {greska !== null ? <PorukaGreske>{greska}</PorukaGreske> : null}
      </form>
    </StudioDijalog>
  );
}
