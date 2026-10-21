// /[slug]/meni — the stable public link of a venue's menu (master §7.8).
// K13 (plan K12 §2): a published new-model menu is served from its published
// version — the only page directly, the splitter when there are several
// pages. Every other venue keeps the legacy menu exactly as before (K06),
// served by _stari/stari-meni.tsx. A plain link carries no table or room:
// nothing here reads or invents a position (K12-6).

import type { Metadata, Viewport } from "next";
import { JavniPrikaz, javniMetadata, javniViewport } from "./_lib/prikaz";
import { jedanParametar, ucitajJavno, ucitajUlazRezervacije } from "./_lib/ucitaj";
import { StariMeni, stariMeniMetadata } from "./_stari/stari-meni";

export const dynamic = "force-dynamic";

async function ucitaj({ params, searchParams }: PageProps<"/[slug]/meni">) {
  const { slug } = await params;
  const jezik = jedanParametar((await searchParams).jezik);
  return { slug, ucitano: await ucitajJavno(slug, undefined, jezik) };
}

export async function generateMetadata(props: PageProps<"/[slug]/meni">): Promise<Metadata> {
  const { slug, ucitano } = await ucitaj(props);
  return ucitano ? javniMetadata(ucitano) : stariMeniMetadata(slug);
}

export async function generateViewport(props: PageProps<"/[slug]/meni">): Promise<Viewport> {
  const { ucitano } = await ucitaj(props);
  return ucitano ? javniViewport(ucitano) : {};
}

export default async function MenuPage(props: PageProps<"/[slug]/meni">) {
  const { slug } = await props.params;
  // K25: how the venue takes reservations is read in parallel with the menu (an optional extra).
  const [{ ucitano }, rezervacija] = await Promise.all([ucitaj(props), ucitajUlazRezervacije(slug)]);
  if (ucitano) return <JavniPrikaz ucitano={ucitano} rezervacija={rezervacija} />;
  return <StariMeni slug={slug} />;
}
