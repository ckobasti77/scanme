"use client";

// An unexpected error inside a ScanMe Menu panel section (K08). The shell
// around it stays; the section says what failed and offers to try again
// (docs/menu/MENU-UX.md §9). Access refusals never land here: the shell
// query answers them with its own screens.

import { GreskaStanje } from "@/components/menu/zajednicko/stanja";
import { Kartica } from "@/components/menu/zajednicko/kartica";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";

export default function MenuPanelSekcijaGreska({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <Kartica>
      {/* K33: the section's own h1 is gone with it; the screen keeps exactly one. */}
      <h1 className="sr-only">{menuPanelSr.stanja.greskaNaslov}</h1>
      <GreskaStanje naslov={menuPanelSr.stanja.greskaNaslov} onPonovo={unstable_retry} />
    </Kartica>
  );
}
