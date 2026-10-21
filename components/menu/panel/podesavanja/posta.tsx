"use client";

// ScanMe Menu V1 (K26) — Podešavanja > Pošta lokala (master §11.4; plan
// docs/meni/planovi/K24.md §3): the venue connects its business mailbox (Gmail or
// Microsoft, through the provider's own sign-in page), and the staff then answer
// guests about reservations from the panel, from that address. ScanMe never sees
// or stores the password; it asks only for the permission to send messages.
// Without the provider keys on the server the connection is off and this block
// says so in one calm sentence instead of showing buttons that cannot work.
// Presentational: the route passes the status (an address and a state, never a
// token), what the OAuth callback reported, the action in flight and its error.

import { CircleCheck, Mail, TriangleAlert, Unlink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { belgradeParts } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n/format";
import { menuOdgovorSr } from "@/lib/i18n/sr/menu-odgovor";
import { cn } from "@/lib/utils";
import type { PostaPovratak, PostaProvajder, PostaStanje } from "../../odgovor/model";
import { Napomena, Potvrda, PorukaGreske, PorukaUspeha } from "../../lokal/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { STATUS_TONOVI } from "../../zajednicko/status-oznaka";

const t = menuOdgovorSr.posta;

const NATPISI: Record<PostaProvajder, string> = {
  gmail: t.poveziGmail,
  microsoft: t.poveziMicrosoft,
};

export type PoslovnaPostaProps = {
  /** undefined = loading. */
  stanje: PostaStanje | undefined;
  /** What the OAuth callback reported (`?posta=povezano|greska&kod=…`). */
  povratak?: PostaPovratak;
  radi?: PostaProvajder | "prekid" | null;
  /** Text of the last action's error. */
  greska?: string | null;
  onPovezi(provajder: PostaProvajder): void;
  onPrekini(): void;
  /** Izlog and tests: the disconnect confirmation starts open. */
  pocetnoPotvrda?: boolean;
  nivo?: 2 | 3;
};

/** "21. 10. 2026." in Belgrade time. */
function datumTekst(epoch: number): string {
  const { year, month, day } = belgradeParts(epoch);
  return `${day}. ${month}. ${year}.`;
}

function DugmadPovezivanja({
  provajderi,
  radi,
  onPovezi,
}: {
  provajderi: readonly PostaProvajder[];
  radi: PostaProvajder | "prekid" | null;
  onPovezi(provajder: PostaProvajder): void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-posta-povezivanje="">
      {provajderi.map((provajder, indeks) => (
        <Dugme
          key={provajder}
          vrsta={indeks === 0 ? "primarno" : "sekundarno"}
          ikonica={Mail}
          ucitava={radi === provajder}
          disabled={radi !== null && radi !== provajder}
          onClick={() => onPovezi(provajder)}
        >
          {radi === provajder ? t.povezujem : NATPISI[provajder]}
        </Dugme>
      ))}
    </div>
  );
}

export function PoslovnaPosta({ stanje, povratak = null, radi = null, greska = null, onPovezi, onPrekini, pocetnoPotvrda = false, nivo = 2 }: PoslovnaPostaProps) {
  const [potvrda, setPotvrda] = useState(pocetnoPotvrda);
  // "Prekini vezu" is replaced by the question while it is open: after "Odustani" focus goes back once the button is there again.
  const prekiniRef = useRef<HTMLButtonElement>(null);
  const vratiFokus = useRef(false);
  useEffect(() => {
    if (potvrda || !vratiFokus.current) return;
    vratiFokus.current = false;
    prekiniRef.current?.focus();
  }, [potvrda]);
  const veza = stanje?.connection ?? null;
  // The question belongs to a connection: once it is gone the question is too.
  if (stanje && veza === null && potvrda) setPotvrda(false);

  const upozorenje = STATUS_TONOVI.upozorenje;

  return (
    <Kartica data-posta-lokala="">
      <OkvirSekcije naslov={t.naslov} opis={t.opis} nivo={nivo}>
        <Napomena>{t.bezLozinke}</Napomena>

        {stanje === undefined ? (
          <UcitavanjeStanje oblik="forma" redova={1} oznaka={t.naslov} />
        ) : (
          <div className="grid gap-4">
            {!stanje.available ? <Napomena className="font-medium">{t.nedostupno}</Napomena> : null}

            {veza ? (
              <div className="grid gap-3 rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina-utisana)] p-4 [--border:var(--mp-ivica)]" data-posta-veza={veza.status}>
                <p className="flex items-start gap-2 text-base font-semibold text-[var(--mp-tekst)]">
                  {veza.status === "active" ? (
                    <CircleCheck aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-uspeh)]" />
                  ) : (
                    <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-upozorenje)]" />
                  )}
                  <span className="min-w-0 break-all">{fmt(t.povezana, { adresa: veza.emailAddress })}</span>
                </p>
                <p className="text-sm text-[var(--mp-tekst-sporedni)]">
                  {fmt(t.povezanaOd, { provajder: t.provajder[veza.provider], datum: datumTekst(veza.connectedAt) })}
                </p>

                {veza.status === "error" ? (
                  <p
                    role="status"
                    className={cn("flex items-start gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm font-medium text-[var(--mp-tekst)]", upozorenje.povrsina)}
                  >
                    <TriangleAlert aria-hidden="true" strokeWidth={2} className={cn("mt-0.5 size-4 shrink-0", upozorenje.ikonicaBoja)} />
                    <span className="min-w-0">{t.greska}</span>
                  </p>
                ) : null}

                {veza.status === "error" && stanje.available ? <DugmadPovezivanja provajderi={stanje.providers} radi={radi} onPovezi={onPovezi} /> : null}

                {potvrda ? (
                  <Potvrda
                    tekst={fmt(t.prekiniPotvrda, { adresa: veza.emailAddress })}
                    potvrdi={t.prekiniDa}
                    odustani={t.odustani}
                    radi={radi === "prekid"}
                    onPotvrdi={onPrekini}
                    onOdustani={() => {
                      vratiFokus.current = true;
                      setPotvrda(false);
                    }}
                  />
                ) : (
                  <div>
                    <Dugme ref={prekiniRef} vrsta="sekundarno" ikonica={Unlink} disabled={radi !== null} onClick={() => setPotvrda(true)}>
                      {t.prekini}
                    </Dugme>
                  </div>
                )}
              </div>
            ) : stanje.available && stanje.providers.length > 0 ? (
              <DugmadPovezivanja provajderi={stanje.providers} radi={radi} onPovezi={onPovezi} />
            ) : null}

            <PorukaUspeha tekst={povratak?.ishod === "povezano" ? t.uspeh : null} />
            {povratak?.ishod === "greska" ? (
              <PorukaGreske>
                {fmt(t.neuspeh, { razlog: povratakRazlog(povratak.code) })}
              </PorukaGreske>
            ) : null}
            {greska ? <PorukaGreske>{greska}</PorukaGreske> : null}
          </div>
        )}
      </OkvirSekcije>
    </Kartica>
  );
}

function povratakRazlog(code: string): string {
  const greske: Record<string, string | undefined> = menuOdgovorSr.greske;
  return greske[code] ?? greske["mail/provider_unavailable"] ?? "";
}
