"use client";

// ScanMe Menu V1 (K20) — making new QR cards (master §9.2). Two small dialogs:
// one card for each position that has none (opening a page of your choice) and
// a number of cards for a page with no position (the wine list at the bar).
// Making cards costs nothing extra. One call makes at most MENU_MAX_QR_MINT_BATCH.

import { useId, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import { MENU_MAX_QR_MINT_BATCH } from "@/lib/menu/limits";
import type { LokalPodaci, LokalPozicija, LokalRadnje } from "@/lib/menu/lokal/model";
import { Dugme } from "../../zajednicko/dugme";
import { StudioDijalog } from "../../studio/dijalog";
import { brojTekst, POLJE_KLASA, Polje, PorukaGreske, useRadnja } from "../zajednicko";
import { StranicaSelect } from "./izbori";

const t = menuLokalSr.kartice;

function Podnozje({ radi, tekst, onemoguceno = false }: { radi: boolean; tekst: string; onemoguceno?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 [--border:var(--mp-ivica)]">
      <Dugme type="submit" vrsta="primarno" ucitava={radi} disabled={onemoguceno}>
        {radi ? menuLokalSr.zajednicko.cuvaSe : tekst}
      </Dugme>
    </div>
  );
}

export function NapraviZaMesta({
  otvoreno,
  bezKartice,
  podaci,
  radnje,
  onZatvori,
  onJavi,
}: {
  otvoreno: boolean;
  /** The positions nobody can scan their way into (positionsWithoutCard). */
  bezKartice: readonly LokalPozicija[];
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
}) {
  return (
    <StudioDijalog
      otvoreno={otvoreno}
      onOtvoreno={(o) => (o ? undefined : onZatvori())}
      naslov={t.zaMesta.naslov}
      opis={t.zaMesta.opis}
    >
      <ZaMestaSadrzaj bezKartice={bezKartice} podaci={podaci} radnje={radnje} onZatvori={onZatvori} onJavi={onJavi} />
    </StudioDijalog>
  );
}

function ZaMestaSadrzaj({
  bezKartice,
  podaci,
  radnje,
  onZatvori,
  onJavi,
}: {
  bezKartice: readonly LokalPozicija[];
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
}) {
  const id = useId();
  const { radi, greska, pokreni } = useRadnja();
  const [stranica, setStranica] = useState("");
  const serija = bezKartice.slice(0, MENU_MAX_QR_MINT_BATCH);
  const ostalo = bezKartice.length - serija.length;

  const napravi = async (event: FormEvent) => {
    event.preventDefault();
    if (serija.length === 0) return;
    const uspeh = await pokreni("mint", () =>
      radnje.mintForPositions(
        serija.map((pozicija) => pozicija.id),
        stranica === "" ? null : stranica,
      ),
    );
    if (!uspeh) return;
    onJavi(brojTekst(t.zaMesta.uspeh, serija.length));
    onZatvori();
  };

  return (
    <form onSubmit={napravi} className="grid gap-4">
      <Polje id={`${id}-stranica`} oznaka={t.zaMesta.stranica}>
        {(aria) => <StranicaSelect {...aria} stranice={podaci.pages} vrednost={stranica} onIzbor={setStranica} />}
      </Polje>
      <p className="text-sm font-medium tabular-nums text-[var(--mp-tekst)]">{brojTekst(t.zaMesta.broj, serija.length)}</p>
      {ostalo > 0 ? (
        <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">
          {fmt(t.zaMesta.serija, { max: MENU_MAX_QR_MINT_BATCH, ostalo })}
        </p>
      ) : null}
      {greska ? <PorukaGreske>{greska}</PorukaGreske> : null}
      <Podnozje radi={radi !== null} tekst={t.zaMesta.napravi} onemoguceno={serija.length === 0} />
    </form>
  );
}

export function NovaZaStranicu({
  otvoreno,
  podaci,
  radnje,
  onZatvori,
  onJavi,
}: {
  otvoreno: boolean;
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
}) {
  return (
    <StudioDijalog
      otvoreno={otvoreno}
      onOtvoreno={(o) => (o ? undefined : onZatvori())}
      naslov={t.zaStranicu.naslov}
      opis={t.zaStranicu.opis}
    >
      <ZaStranicuSadrzaj podaci={podaci} radnje={radnje} onZatvori={onZatvori} onJavi={onJavi} />
    </StudioDijalog>
  );
}

function ZaStranicuSadrzaj({
  podaci,
  radnje,
  onZatvori,
  onJavi,
}: {
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  onZatvori: () => void;
  onJavi: (tekst: string) => void;
}) {
  const id = useId();
  const { radi, greska, pokreni } = useRadnja();
  const [stranica, setStranica] = useState("");
  const [broj, setBroj] = useState("1");
  const [greskaBroja, setGreskaBroja] = useState<string | null>(null);

  const napravi = async (event: FormEvent) => {
    event.preventDefault();
    const n = /^\d{1,3}$/.test(broj.trim()) ? Number(broj.trim()) : 0;
    if (n < 1 || n > MENU_MAX_QR_MINT_BATCH) {
      setGreskaBroja(fmt(t.zaStranicu.brojNeispravno, { max: MENU_MAX_QR_MINT_BATCH }));
      return;
    }
    setGreskaBroja(null);
    const uspeh = await pokreni("mint", () => radnje.mintForPage(stranica === "" ? null : stranica, n));
    if (!uspeh) return;
    onJavi(brojTekst(t.zaStranicu.uspeh, n));
    onZatvori();
  };

  return (
    <form onSubmit={napravi} noValidate className="grid gap-4">
      <Polje id={`${id}-stranica`} oznaka={t.zaStranicu.stranica}>
        {(aria) => <StranicaSelect {...aria} stranice={podaci.pages} vrednost={stranica} onIzbor={setStranica} />}
      </Polje>
      <Polje
        id={`${id}-broj`}
        oznaka={t.zaStranicu.broj}
        pomoc={fmt(t.zaStranicu.brojPomoc, { max: MENU_MAX_QR_MINT_BATCH })}
        greska={greskaBroja}
        className="max-w-[12rem]"
      >
        {(aria) => (
          <input
            {...aria}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={broj}
            onChange={(event) => setBroj(event.target.value)}
            className={`${POLJE_KLASA} tabular-nums`}
          />
        )}
      </Polje>
      {greska ? <PorukaGreske>{greska}</PorukaGreske> : null}
      <Podnozje radi={radi !== null} tekst={t.zaStranicu.napravi} />
    </form>
  );
}
