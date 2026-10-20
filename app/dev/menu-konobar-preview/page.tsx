// Dev-only izlog of the ScanMe Menu waiter panel (K07, K22). The PIN sign-in,
// the work queue and the request detail are the REAL screens over the invented
// "Demo restoran" and an in-memory store (no Convex); the floor (K23) and
// reservations (K25) still show an honest "this screen is built by step K.."
// state. Unavailable in production, never indexed.
//
//   /dev/menu-konobar-preview                   → Radni red (K22)
//   ?ekran=pin|red|detalj|sala-raspored|sala-tabela|sto|rezervacije
//   ?stanje=blokada|pogresan-pin|bez-peppera    → PIN locked, a wrong PIN, PINs switched off
//   ?stanje=prazno|mnogo                        → no request, 300 waiting (truncated)
//   ?stanje=offline | ?veza=offline             → no connection: actions wait
//   ?uloga=osoblje|menadzer                     → a PIN waiter, or the Manager with the account
//   ?zahtev=rq_01 (with ekran=detalj)           → which request is open (default the order at Sto 7)
//   ?potvrda=otkazi (with ekran=detalj)         → the cancel confirmation is open
//   ?tema=svetla|tamna                          → forces the app theme while open

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IzlogKorak } from "@/components/menu/izlog/izlog-korak";
import { IzlogOkvir } from "@/components/menu/izlog/izlog-okvir";
import { KonobarIzlog } from "@/components/menu/izlog/konobar-izlog";
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
  const pravi = KONOBAR_EKRAN_KORAK[params.ekran].korak === "K22";

  return (
    <>
      <IzlogTema tema={params.tema} />
      <IzlogOkvir ruta="konobar" tema={params.tema} povrsina="konobar" ceoEkran={pravi}>
        {pravi ? (
          <KonobarIzlog params={params} />
        ) : (
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
        )}
      </IzlogOkvir>
    </>
  );
}
