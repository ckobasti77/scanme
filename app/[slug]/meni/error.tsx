"use client";

// An unexpected error while loading a public menu route (K33): Convex out of
// reach or a failed render. The venue palette is not known here, so the screen
// stays neutral (app theme) instead of borrowing a palette; it says what failed
// and offers to try again (docs/menu/MENU-UX.md §9). A missing menu or page is
// never this screen: the routes answer it with their own empty states.

import { OctagonAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";

const t = menuJavniSr.stanja;

export default function JavniMeniGreska({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-10 text-foreground">
      <section role="alert" className="grid max-w-md justify-items-center gap-3 text-center">
        <OctagonAlert aria-hidden="true" strokeWidth={1.75} className="size-8 text-destructive" />
        <h1 className="text-xl font-semibold leading-snug">{t.greskaNaslov}</h1>
        <p className="text-base leading-relaxed text-muted-foreground">{t.greskaOpis}</p>
        <Button type="button" className="mt-2 min-h-11" onClick={() => unstable_retry()}>
          <RotateCcw aria-hidden="true" />
          {t.pokusajPonovo}
        </Button>
      </section>
    </main>
  );
}
