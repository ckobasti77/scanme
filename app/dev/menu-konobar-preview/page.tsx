// Dev-only izlog of the ScanMe Menu waiter panel (K07). The waiter screens are
// built by K22, K23 and K25; until then each shows an honest "this screen is
// built by step K.." state in the waiter surface (48 px targets, higher
// contrast). Unavailable in production, never indexed.
//
//   /dev/menu-konobar-preview                   → Radni red (K22)
//   ?ekran=pin|red|detalj|sala-raspored|sala-tabela|sto|rezervacije
//   ?stanje=offline                             → names the step of the offline state (K23)
//   ?tema=svetla|tamna                          → forces the app theme while open

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IzlogKorak } from "@/components/menu/izlog/izlog-korak";
import { IzlogOkvir } from "@/components/menu/izlog/izlog-okvir";
import { IzlogTema } from "@/components/menu/zajednicko/izlog-tema";
import { fmt } from "@/lib/i18n/format";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { KONOBAR_EKRANI, KONOBAR_EKRAN_KORAK, izlogHref, parseKonobarPreview } from "@/lib/menu/izlog-params";

export const dynamic = "force-dynamic";

const t = menuZajednickoSr.izlog;
const PUTANJA = "/dev/menu-konobar-preview";

export const metadata: Metadata = { title: t.naslovi.konobar, robots: { index: false, follow: false } };

export default async function MenuKonobarPreviewPage({ searchParams }: PageProps<"/dev/menu-konobar-preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = parseKonobarPreview(await searchParams);

  return (
    <>
      <IzlogTema tema={params.tema} />
      <IzlogOkvir ruta="konobar" tema={params.tema} povrsina="konobar">
        <IzlogKorak
          kontekst={t.naslovi.konobar}
          naslov={t.konobarEkrani[params.ekran]}
          korak={KONOBAR_EKRAN_KORAK[params.ekran].korak}
          napomena={params.offline ? fmt(t.offlineKorak, { korak: "K23" }) : undefined}
          ekrani={KONOBAR_EKRANI.map((ekran) => ({
            href: izlogHref(PUTANJA, { ekran, tema: params.tema }),
            oznaka: t.konobarEkrani[ekran],
            trenutni: ekran === params.ekran,
          }))}
        />
      </IzlogOkvir>
    </>
  );
}
