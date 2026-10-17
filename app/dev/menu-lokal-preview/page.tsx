// Dev-only izlog of ScanMe Menu "Lokal i QR" (K07). The screens are built by
// K20; until then each view shows an honest "this screen is built by step
// K20" state. Unavailable in production, never indexed.
//
//   /dev/menu-lokal-preview                     → Lista pozicija (K20)
//   ?pogled=lista|raspored|kartice
//   ?tema=svetla|tamna                          → forces the app theme while open

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IzlogKorak } from "@/components/menu/izlog/izlog-korak";
import { IzlogOkvir } from "@/components/menu/izlog/izlog-okvir";
import { IzlogTema } from "@/components/menu/zajednicko/izlog-tema";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { LOKAL_POGLEDI, LOKAL_POGLED_KORAK, izlogHref, parseLokalPreview } from "@/lib/menu/izlog-params";

export const dynamic = "force-dynamic";

const t = menuZajednickoSr.izlog;
const PUTANJA = "/dev/menu-lokal-preview";

export const metadata: Metadata = { title: t.naslovi.lokal, robots: { index: false, follow: false } };

export default async function MenuLokalPreviewPage({ searchParams }: PageProps<"/dev/menu-lokal-preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = parseLokalPreview(await searchParams);

  return (
    <>
      <IzlogTema tema={params.tema} />
      <IzlogOkvir ruta="lokal" tema={params.tema}>
        <IzlogKorak
          kontekst={t.naslovi.lokal}
          naslov={t.lokalPogledi[params.pogled]}
          korak={LOKAL_POGLED_KORAK[params.pogled].korak}
          ekrani={LOKAL_POGLEDI.map((pogled) => ({
            href: izlogHref(PUTANJA, { pogled, tema: params.tema }),
            oznaka: t.lokalPogledi[pogled],
            trenutni: pogled === params.pogled,
          }))}
        />
      </IzlogOkvir>
    </>
  );
}
