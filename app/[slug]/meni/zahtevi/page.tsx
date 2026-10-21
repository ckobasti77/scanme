// /[slug]/meni/zahtevi — "Moji zahtevi" (master §8.4; plan K19-10): what this
// phone sent to the venue in the last 12 hours, with the live status, and
// cancelling a request that is still `Novi`. The phone is known only by the
// HttpOnly device cookie the card hop set (smm_d); the page passes on a READ
// key derived from it (the device's venue-scoped hash), never the cookie
// itself. Without a device it says how to start. In the venue's identity.
// K25: the reservations sent from this phone are listed above the requests,
// and can be cancelled the same way.

import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { JavniOkvir } from "@/components/menu/javni/okvir";
import { MojiZahteviOstrvo } from "@/components/menu/gost/ostrvo";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { saJezikom } from "@/lib/menu/i18n-fallback";
import { GOST_AKCIJE, JAVNI_ROBOTS, javniViewport } from "../_lib/prikaz";
import { otkaziRezervacijuSaUredjaja } from "../_lib/radnje-rezervacije";
import { jedanParametar, ucitajCitanje, ucitajJavno, ulazJavno } from "../_lib/ucitaj";
import { javniNaslov } from "@/lib/menu-naslovi";

export const dynamic = "force-dynamic";

async function ucitaj({ params, searchParams }: PageProps<"/[slug]/meni/zahtevi">) {
  const { slug } = await params;
  const jezik = jedanParametar((await searchParams).jezik);
  // The clock is read in the loader, not in a render (plan K12-12).
  return { slug, ucitano: await ucitajJavno(slug, undefined, jezik), sadaMs: Date.now() };
}

export async function generateMetadata(props: PageProps<"/[slug]/meni/zahtevi">): Promise<Metadata> {
  const { ucitano } = await ucitaj(props);
  if (!ucitano) return { robots: JAVNI_ROBOTS };
  return {
    title: javniNaslov(ucitano.view.lokal.naziv, menuGostSr.zahtevi.naslov),
    robots: JAVNI_ROBOTS,
  };
}

export async function generateViewport(props: PageProps<"/[slug]/meni/zahtevi">): Promise<Viewport> {
  const { ucitano } = await ucitaj(props);
  return ucitano ? javniViewport(ucitano) : {};
}

export default async function MojiZahteviPage(props: PageProps<"/[slug]/meni/zahtevi">) {
  const { slug, ucitano, sadaMs } = await ucitaj(props);
  if (!ucitano) {
    const ulaz = await ulazJavno(slug);
    if (ulaz.kind === "legacy") redirect(`/${slug}/meni`);
    notFound();
  }
  const citanje = await ucitajCitanje(ucitano.menuServiceId);
  const { view } = ucitano;
  return (
    <JavniOkvir izgled={ucitano.izgled} lokal={view.lokal} naslovStranice={null} jezik={view.jezik}>
      <MojiZahteviOstrvo
        slug={slug}
        citanje={citanje}
        akcije={GOST_AKCIJE}
        meniHref={saJezikom(`/${slug}/meni`, view.jezik, view.jezici)}
        sadaMs={sadaMs}
        otkaziRezervaciju={otkaziRezervacijuSaUredjaja}
      />
    </JavniOkvir>
  );
}
