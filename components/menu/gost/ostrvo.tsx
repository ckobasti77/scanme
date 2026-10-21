"use client";

// ScanMe Menu V1 (K21) — the guest's actions wired to the real backend. This
// module (and everything under components/menu/gost) is loaded with
// next/dynamic ONLY when the page knows the guest's position (a scanned
// table or room card); a plain menu link never downloads it (the K14 JS
// budget). Writes go through the page's Server Actions (the HttpOnly guest
// cookies stay on the server); "Moji zahtevi" is a live Convex subscription
// read with the device's venue-scoped key, which can read the list but neither
// send nor cancel anything. K25: on that page only, the same key also reads the
// phone's reservations (convex/menuReservations.ts `mine`).

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { GuestActionResult, GuestCancelResult } from "@/lib/menu/http/guest-actions";
import type { ReservationCancelResult } from "@/lib/menu/http/reservation";
import type { MenuPaymentPreference } from "@/lib/menu/request-status";
import { useMinutniSat } from "../javni/use-minutni-sat";
import { GostPanel } from "./gost-panel";
import type { GostKontekst, GostRadnje } from "./model";
import { MojiZahtevi } from "./moji-zahtevi";
import { useVeza } from "./use-veza";

export { DodajUKorpu } from "./dodaj-u-korpu";

/** The page's Server Actions (app/[slug]/meni/_lib/radnje-gosta.ts), passed down as props. */
export type GostAkcije = {
  pozovi: (slug: string) => Promise<GuestActionResult>;
  racun: (slug: string, nacin: MenuPaymentPreference) => Promise<GuestActionResult>;
  posalji: (slug: string, porudzbina: unknown) => Promise<GuestActionResult>;
  otkazi: (slug: string, requestId: string) => Promise<GuestCancelResult>;
};

/** What the server loader hands to the client for a guest at a position. */
export type GostUcitano = {
  kontekst: GostKontekst;
  /** The read key of "Moji zahtevi" (the device's venue-scoped hash); null without a device cookie. */
  citanje: string | null;
  akcije: GostAkcije;
};

function useRadnje(slug: string, akcije: GostAkcije): GostRadnje {
  return useMemo(
    () => ({
      pozovi: () => akcije.pozovi(slug),
      racun: (nacin) => akcije.racun(slug, nacin),
      posalji: ({ kanal, linije, videnUkupnoRsd, kljuc }) =>
        akcije.posalji(slug, { channel: kanal, lines: linije, seenTotalRsd: videnUkupnoRsd, clientRequestId: kljuc }),
      otkazi: (requestId) => akcije.otkazi(slug, requestId),
    }),
    [slug, akcije],
  );
}

function useMojiZahtevi(slug: string, citanje: string | null) {
  return useQuery(api.menuGuest.myRequests, citanje ? { slug, deviceKey: citanje } : "skip");
}

export function GostOstrvo({ gost, nedostupni }: { gost: GostUcitano; nedostupni: readonly string[] }) {
  const { kontekst } = gost;
  const radnje = useRadnje(kontekst.slug, gost.akcije);
  const zahtevi = useMojiZahtevi(kontekst.slug, gost.citanje);
  return <GostPanel kontekst={kontekst} radnje={radnje} zahtevi={zahtevi ?? undefined} nedostupni={nedostupni} />;
}

export function MojiZahteviOstrvo({
  slug,
  citanje,
  akcije,
  meniHref,
  sadaMs,
  otkaziRezervaciju,
}: {
  slug: string;
  citanje: string | null;
  akcije: GostAkcije;
  meniHref: string;
  sadaMs: number;
  /** K25: cancelling a reservation of this phone (app/[slug]/meni/_lib/radnje-rezervacije.ts). */
  otkaziRezervaciju?: (slug: string, reservationId: string) => Promise<ReservationCancelResult>;
}) {
  const radnje = useRadnje(slug, akcije);
  const zahtevi = useMojiZahtevi(slug, citanje);
  // K25: the reservations of this phone, with the same read key (only on this page).
  const rezervacije = useQuery(api.menuReservations.mine, citanje ? { slug, deviceKey: citanje } : "skip");
  const online = useVeza();
  const sada = useMinutniSat(sadaMs, true);
  return (
    <MojiZahtevi
      zahtevi={citanje === null || zahtevi === null ? null : zahtevi}
      sadaMs={sada}
      online={online}
      meniHref={meniHref}
      onOtkazi={radnje.otkazi}
      rezervacije={rezervacije}
      onOtkaziRezervaciju={otkaziRezervaciju ? (reservationId) => otkaziRezervaciju(slug, reservationId) : undefined}
    />
  );
}
