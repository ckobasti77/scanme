import type { Metadata } from "next";
import manifestJson from "@/public/3d/auto3d/limuzina.manifest.json";
import { RendgenPage } from "@/components/fair/auto3d/rendgen-page";
import { parseManifest } from "@/lib/auto3d/manifest";
import { parseUrlState } from "@/lib/auto3d/url-state";
import { fmt } from "@/lib/i18n/format";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";

// /sajam/3d: javna preview stranica paketa „3D Rendgen“ (PLAN P1). `noindex` dolazi iz
// app/sajam/layout.tsx. Stranica čita searchParams (odluka E10), pa se renderuje po zahtevu.
// OG slika je `og.jpg` iz A09. Viber, WhatsApp i mejl traže apsolutnu adresu slike, a root layout nema
// `metadataBase`, pa ga ova ruta postavlja sama (odluka A11): domen je scanme.rs (next.config.ts,
// components/offer-footer.tsx).

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const og = parseManifest(manifestJson).files.og;

const SITE_ORIGIN = "https://scanme.rs";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const url = parseUrlState(await searchParams);
  const name = url.deo ? delovi.parts[url.deo].name : url.grupa ? delovi.systems[url.grupa].name : null;
  const title = name ? fmt(t.metaTitlePart, { name }) : t.metaTitle;
  const description = url.deo ? delovi.parts[url.deo].description : url.grupa ? delovi.systems[url.grupa].description : t.metaDescription;
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "sr_RS",
      siteName: t.metaSiteName,
      ...(og ? { images: [{ url: og.url, width: og.width, height: og.height, alt: t.posterAlt }] } : {}),
    },
  };
}

export default async function Page({ searchParams }: Props) {
  return <RendgenPage url={parseUrlState(await searchParams)} />;
}
