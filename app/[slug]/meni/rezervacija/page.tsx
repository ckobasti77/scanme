// /[slug]/meni/rezervacija — the guest's reservation request (master §11.1,
// §11.2; plan K24). A venue with the ScanMe form shows the form; a venue with
// its own system shows a link to it (same tab); a venue that takes no
// reservations answers 404. The page is in the venue's identity. The request
// itself goes through a Server Action (the HttpOnly device cookie stays on the
// server); the guest never chooses a table.

import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { saJezikom } from "@/lib/menu/i18n-fallback";
import { JAVNI_ROBOTS, REZERVACIJA_AKCIJE, RezervacijaStrana, analitikaZa, javniViewport } from "../_lib/prikaz";
import { jedanParametar, ucitajJavno, ucitajUlazRezervacije, ulazJavno } from "../_lib/ucitaj";

export const dynamic = "force-dynamic";

async function ucitaj({ params, searchParams }: PageProps<"/[slug]/meni/rezervacija">) {
  const { slug } = await params;
  const jezik = jedanParametar((await searchParams).jezik);
  const [ucitano, ulaz] = await Promise.all([ucitajJavno(slug, undefined, jezik), ucitajUlazRezervacije(slug)]);
  // The clock is read in the loader, not in a render (plan K12-12).
  return { slug, ucitano, ulaz, sadaMs: Date.now() };
}

export async function generateMetadata(props: PageProps<"/[slug]/meni/rezervacija">): Promise<Metadata> {
  const { ucitano } = await ucitaj(props);
  if (!ucitano) return { robots: JAVNI_ROBOTS };
  return {
    title: fmt(menuJavniSr.meta.naslovStranice, { stranica: menuGostSr.rezervacija.naslov, lokal: ucitano.view.lokal.naziv }),
    robots: JAVNI_ROBOTS,
  };
}

export async function generateViewport(props: PageProps<"/[slug]/meni/rezervacija">): Promise<Viewport> {
  const { ucitano } = await ucitaj(props);
  return ucitano ? javniViewport(ucitano) : {};
}

export default async function RezervacijaPage(props: PageProps<"/[slug]/meni/rezervacija">) {
  const { slug, ucitano, ulaz, sadaMs } = await ucitaj(props);
  if (!ucitano) {
    const stanje = await ulazJavno(slug);
    if (stanje.kind === "legacy") redirect(`/${slug}/meni`);
    notFound();
  }
  if (ulaz.mode === "off") notFound();
  const { view } = ucitano;
  return (
    <RezervacijaStrana
      okvir={{ izgled: ucitano.izgled, lokal: view.lokal, jezik: view.jezik }}
      ulaz={ulaz}
      sadaMs={sadaMs}
      akcije={REZERVACIJA_AKCIJE}
      meniHref={saJezikom(`/${slug}/meni`, view.jezik, view.jezici)}
      mojiZahteviHref={saJezikom(`/${slug}/meni/zahtevi`, view.jezik, view.jezici)}
      analitika={analitikaZa(view.lokal.slug, view.jezik, null)}
    />
  );
}
