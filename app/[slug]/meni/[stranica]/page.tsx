// /[slug]/meni/[stranica] — the direct sub-link of one standard page
// (master §7.8; a page can have its own QR, §3.2). The default page's slug is
// `glavni`. A page that is not public (archived, hidden, never published, a
// typo) shows an honest state in the venue's identity with a link to the
// menu (plan K12-14); a venue still on the legacy menu is sent to its menu
// link; an unknown venue is a 404. No position is read or invented (K12-6).

import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { JavniOkvir } from "@/components/menu/javni/okvir";
import { StranicaNedostupna } from "@/components/menu/javni/stanja";
import { JAVNI_ROBOTS, JavniPrikaz, javniMetadata, javniViewport } from "../_lib/prikaz";
import { jedanParametar, ucitajJavno, ulazJavno } from "../_lib/ucitaj";

export const dynamic = "force-dynamic";

async function ucitaj({ params, searchParams }: PageProps<"/[slug]/meni/[stranica]">) {
  const { slug, stranica } = await params;
  const jezik = jedanParametar((await searchParams).jezik);
  return { slug, stranica, jezik, ucitano: await ucitajJavno(slug, stranica, jezik) };
}

export async function generateMetadata(props: PageProps<"/[slug]/meni/[stranica]">): Promise<Metadata> {
  const { ucitano } = await ucitaj(props);
  return ucitano ? javniMetadata(ucitano) : { robots: JAVNI_ROBOTS };
}

export async function generateViewport(props: PageProps<"/[slug]/meni/[stranica]">): Promise<Viewport> {
  const { ucitano } = await ucitaj(props);
  return ucitano ? javniViewport(ucitano) : {};
}

export default async function MenuStranicaPage(props: PageProps<"/[slug]/meni/[stranica]">) {
  const { slug, jezik, ucitano } = await ucitaj(props);
  if (ucitano) return <JavniPrikaz ucitano={ucitano} />;

  const ulaz = await ulazJavno(slug);
  if (ulaz.kind === "legacy") redirect(`/${slug}/meni`);
  if (ulaz.kind === "none") notFound();

  // A published new-model menu without this page: say so in the venue's identity.
  const meni = await ucitajJavno(slug, undefined, jezik);
  if (!meni) notFound();
  return (
    <JavniOkvir izgled={meni.izgled} lokal={meni.view.lokal} naslovStranice={null} jezik={meni.view.jezik}>
      <StranicaNedostupna meniHref={`/${slug}/meni`} />
    </JavniOkvir>
  );
}
