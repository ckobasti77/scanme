"use client";

// An unexpected error in the editor route under /[slug]/meni (K33). Without it
// the guest-facing boundary of the public menu (../error.tsx) would answer an
// editor, so the editor gets the panel's own error state.

import { MenuPovrsina } from "@/components/menu/zajednicko/povrsina";
import { GreskaStanje } from "@/components/menu/zajednicko/stanja";
import { menuEditorSr } from "@/lib/i18n/sr/menu-editor";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";

export default function MenuEditorGreska({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <MenuPovrsina as="main" className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="sr-only">{menuEditorSr.metaEditorTitle}</h1>
        <GreskaStanje naslov={menuPanelSr.stanja.greskaNaslov} onPonovo={unstable_retry} />
      </div>
    </MenuPovrsina>
  );
}
