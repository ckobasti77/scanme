// Dev-only izlog of the ScanMe Menu waiter panel (K07, K22, K23, K25). The PIN
// sign-in, the work queue, the request detail, the floor, the table detail and
// the reservations (the Rezervacije filter, the detail of a reservation, the
// reservation on a table) are the REAL screens over the invented "Demo restoran"
// and an in-memory store (no Convex). Unavailable in production, never indexed.
//
//   /dev/menu-konobar-preview                   → Radni red (K22)
//   ?ekran=pin|red|detalj|sala-raspored|sala-tabela|sto|rezervacije
//   ?stanje=blokada|pogresan-pin|bez-peppera    → PIN locked, a wrong PIN, PINs switched off
//   ?stanje=prazno|mnogo                        → no request, 300 waiting (truncated)
//   ?stanje=offline | ?veza=offline             → no connection: actions wait
//   ?uloga=osoblje|menadzer                     → a PIN waiter, or the Manager with the account
//   ?zahtev=rq_01 (with ekran=detalj)           → which request is open (default the order at Sto 7)
//   ?potvrda=otkazi (with ekran=detalj)         → the cancel confirmation is open
//   ?ekran=sala-raspored|sala-tabela            → the floor as a plan or as a table (K23)
//   ?ekran=sto&sto=Sto 12                       → the table detail (default Sto 3: three parallel states)
//   ?zauzetost=1                                → the venue uses the optional occupancy module
//   ?zona=Terasa                                → the waiter's own zone (a filter; "Bez zone" stays visible)
//   ?kasni=1                                    → a 5-minute threshold: several waits are late
//   ?zvuk=iskljucen                             → the device sound starts off
//   ?ekran=rezervacije                          → the queue on its Rezervacije filter (K25)
//   ?ekran=rezervacije&rezervacija=rv_07        → the detail of that reservation (rv_01 new, rv_02 accepted, rv_03 proposal, rv_07 late, rv_08 tomorrow)
//   ?ekran=sto&rezervacija=1                    → Sto 7, the table with the bound, late reservation rv_07
//   ?otkazana=1                                 → a guest has just cancelled rv_06 (the strip in the queue)
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
  const korak = KONOBAR_EKRAN_KORAK[params.ekran].korak;
  const pravi = korak === "K22" || korak === "K23" || korak === "K25";

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
