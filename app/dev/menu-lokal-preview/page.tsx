// Dev-only izlog of ScanMe Menu "Lokal i QR" (K20; master §9, §13.6): the
// real screen over invented venues and an in-memory store (no Convex).
// Unavailable in production, never indexed.
//
//   /dev/menu-lokal-preview                     → Lista mesta (Demo restoran)
//   ?pogled=lista|raspored|kartice
//   ?stanje=prazno|bez-zona|hotel               → venue without positions, café without zones, hotel
//   ?fokus=pozicija                             → the drawer of "Sto 12" is open
//   ?modal=stampa                               → the QR print sheet is open
//   ?tema=svetla|tamna                          → forces the app theme while open

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IzlogOkvir } from "@/components/menu/izlog/izlog-okvir";
import { LokalIzlog } from "@/components/menu/izlog/lokal-izlog";
import { IzlogTema } from "@/components/menu/zajednicko/izlog-tema";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { parseLokalPreview } from "@/lib/menu/izlog-params";

export const dynamic = "force-dynamic";

const t = menuZajednickoSr.izlog;

export const metadata: Metadata = { title: t.naslovi.lokal, robots: { index: false, follow: false } };

export default async function MenuLokalPreviewPage({ searchParams }: PageProps<"/dev/menu-lokal-preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = parseLokalPreview(await searchParams);

  return (
    <>
      <IzlogTema tema={params.tema} />
      <IzlogOkvir ruta="lokal" tema={params.tema}>
        <LokalIzlog params={params} />
      </IzlogOkvir>
    </>
  );
}
