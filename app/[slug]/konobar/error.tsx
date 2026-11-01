"use client";

// An unexpected error in the waiter panel routes (K33). Requests stay in the
// database; the panel says what failed and offers to try again
// (docs/menu/MENU-UX.md §9). A wrong panel code is a 404, never this screen.

import { MenuPovrsina } from "@/components/menu/zajednicko/povrsina";
import { GreskaStanje } from "@/components/menu/zajednicko/stanja";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";

const t = menuKonobarSr;

export default function KonobarGreska({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <MenuPovrsina as="main" povrsina="konobar" className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="sr-only">{t.meta.naslov}</h1>
        <GreskaStanje naslov={t.greska.panelNaslov} opis={t.greska.panelOpis} onPonovo={unstable_retry} />
      </div>
    </MenuPovrsina>
  );
}
