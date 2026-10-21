// /[slug]/meni/rezervacija/[token] — the cancel link of a reservation (master
// §11.7; plan K24-6): the term, the guests and the status in the guest's words,
// a change the venue proposed, and `Otkaži rezervaciju` until the reservation
// is realized. The token in the address is the only proof, so the page shows
// nothing but that one reservation, is never indexed and sends no referrer.
// It works without JavaScript: the cancel is a plain form posting to a Server
// Action (./radnja.ts) and the confirmation is `?potvrda=1`. A wrong link, a
// wrong venue and a token of another venue all look the same.

import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { RESERVATION_ERROR, type ReservationErrorCode } from "@/lib/menu/errors/reservations";
import { reservationLinkPath } from "@/lib/menu/http/reservation";
import { saJezikom } from "@/lib/menu/i18n-fallback";
import { isMenuToken } from "@/lib/menu/tokens";
import { JAVNI_ROBOTS, LinkStrana, javniViewport } from "../../_lib/prikaz";
import { jedanParametar, ucitajJavno, ulazJavno } from "../../_lib/ucitaj";
import { otkaziIzLinka } from "./radnja";

export const dynamic = "force-dynamic";

const NEUSPELO = new Set<string>([...Object.values(RESERVATION_ERROR), "network"]);

/** The refusal named in `?neuspelo=`, only when it is one of ours. */
function neuspeloIzUpita(vrednost: string | undefined): ReservationErrorCode | "network" | null {
  return vrednost !== undefined && NEUSPELO.has(vrednost) ? (vrednost as ReservationErrorCode | "network") : null;
}

async function ucitaj({ params, searchParams }: PageProps<"/[slug]/meni/rezervacija/[token]">) {
  const { slug, token } = await params;
  const upit = await searchParams;
  const jezik = jedanParametar(upit.jezik);
  return {
    slug,
    token,
    ucitano: await ucitajJavno(slug, undefined, jezik),
    potvrda: jedanParametar(upit.potvrda) === "1",
    otkazano: jedanParametar(upit.otkazano) === "1",
    neuspelo: neuspeloIzUpita(jedanParametar(upit.neuspelo)),
    // The clock is read in the loader, not in a render (plan K12-12).
    sadaMs: Date.now(),
  };
}

// The token is a secret of the guest's: the page is never indexed and sends no referrer.
const ZASTITA: Metadata = { robots: JAVNI_ROBOTS, referrer: "no-referrer" };

export async function generateMetadata(props: PageProps<"/[slug]/meni/rezervacija/[token]">): Promise<Metadata> {
  const { ucitano } = await ucitaj(props);
  if (!ucitano) return ZASTITA;
  return {
    title: fmt(menuJavniSr.meta.naslovStranice, { stranica: menuGostSr.rezervacija.link.naslov, lokal: ucitano.view.lokal.naziv }),
    ...ZASTITA,
  };
}

export async function generateViewport(props: PageProps<"/[slug]/meni/rezervacija/[token]">): Promise<Viewport> {
  const { ucitano } = await ucitaj(props);
  return ucitano ? javniViewport(ucitano) : {};
}

export default async function LinkRezervacijePage(props: PageProps<"/[slug]/meni/rezervacija/[token]">) {
  const { slug, token, ucitano, potvrda, otkazano, neuspelo, sadaMs } = await ucitaj(props);
  if (!ucitano) {
    const stanje = await ulazJavno(slug);
    if (stanje.kind === "legacy") redirect(`/${slug}/meni`);
    notFound();
  }
  const { view } = ucitano;
  const pogled = isMenuToken(token) ? await fetchQuery(api.menuReservations.byCancelToken, { slug, token }) : null;

  const linkHref = saJezikom(reservationLinkPath(slug, encodeURIComponent(token)), view.jezik, view.jezici);
  const jezikZaPovratak = view.jezik === (view.jezici[0] ?? "sr") ? null : view.jezik;
  return (
    <LinkStrana
      okvir={{ izgled: ucitano.izgled, lokal: view.lokal, jezik: view.jezik }}
      pogled={pogled}
      sadaMs={sadaMs}
      potvrda={potvrda}
      otkazano={otkazano}
      neuspelo={neuspelo}
      otkazi={otkaziIzLinka.bind(null, slug, token, jezikZaPovratak)}
      potvrdaHref={`${linkHref}${linkHref.includes("?") ? "&" : "?"}potvrda=1`}
      linkHref={linkHref}
      meniHref={saJezikom(`/${slug}/meni`, view.jezik, view.jezici)}
    />
  );
}
