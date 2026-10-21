import type { Metadata } from "next";
import { PodesavanjaRuta } from "@/components/menu/panel/podesavanja/podesavanja-ruta";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { readMailReturn } from "@/lib/menu/http/mail-callback";
import { menuNaslov } from "@/lib/menu-naslovi";

// Section "Podešavanja" of the ScanMe Menu client panel (K28; master §13.9):
// working hours, languages, the waiter panel's timing, the reservation hold,
// the business mailbox, reply templates and Brend i nalog. The shell (layout)
// checks sign-in and role. `?posta=…` is the return of the mailbox OAuth (K26).
export const metadata: Metadata = {
  title: menuNaslov(menuPanelSr.sekcije.podesavanja),
};

export default async function MenuPanelPodesavanjaPage({
  searchParams,
}: PageProps<"/[slug]/client-panel/meni/podesavanja">) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const kljuc of ["posta", "kod"]) {
    const vrednost = query[kljuc];
    if (typeof vrednost === "string") params.set(kljuc, vrednost);
  }
  return <PodesavanjaRuta povratak={readMailReturn(params)} />;
}
