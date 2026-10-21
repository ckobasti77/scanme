"use client";

// ScanMe Menu V1 (K27) — the card "Podaci o lokalu za Menu" of the section
// "Lokal i QR" (master §13.6; plan docs/meni/planovi/K24.md §4.4): the venue's
// name as guests see it and the public link of its menu, with a copy button.
// It stands above the K20 screen as its `podaciLokala` slot and does not repeat
// the screen's own summary of positions and cards. The route variant reads the
// venue from the panel context and builds the link from the address of the page.

import { CircleCheck, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { usePanelKontekst } from "../ruta";

const t = menuPanelSr.lokalPodaci;

type Kopiranje = "mirno" | "kopirano" | "neuspelo";

/** How long "Link je kopiran." stays on the screen. */
const TRAJANJE_PORUKE_MS = 6000;

const OZNAKA_KLASA = "text-sm font-semibold text-[var(--mp-tekst-sporedni)]";

export function PodaciLokala({ naziv, javniLink }: { naziv: string; javniLink: string }) {
  const [kopiranje, setKopiranje] = useState<Kopiranje>("mirno");

  useEffect(() => {
    if (kopiranje === "mirno") return;
    const rukovanje = window.setTimeout(() => setKopiranje("mirno"), TRAJANJE_PORUKE_MS);
    return () => window.clearTimeout(rukovanje);
  }, [kopiranje]);

  const kopiraj = async () => {
    try {
      await navigator.clipboard.writeText(javniLink);
      setKopiranje("kopirano");
    } catch {
      setKopiranje("neuspelo");
    }
  };

  return (
    <Kartica data-podaci-lokala="">
      <OkvirSekcije naslov={t.naslov} nivo={2}>
        <dl className="grid gap-4">
          <div className="grid gap-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-6">
            <dt className={OZNAKA_KLASA}>{t.naziv}</dt>
            <dd className="min-w-0 font-medium leading-snug text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{naziv}</dd>
          </div>
          <div className="grid gap-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-6">
            <dt className={OZNAKA_KLASA}>{t.link}</dt>
            <dd className="grid min-w-0 justify-items-start gap-2">
              <span className="min-w-0 max-w-full select-all break-all text-[0.9375rem] leading-relaxed text-[var(--mp-tekst)]">
                {javniLink}
              </span>
              <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Copy} onClick={kopiraj}>
                {t.kopiraj}
              </Dugme>
              <div role="status" aria-live="polite" className={kopiranje === "mirno" ? "-mt-2 text-sm" : "min-h-6 text-sm"}>
                {kopiranje === "kopirano" ? (
                  <span className="inline-flex items-start gap-1.5 font-medium text-[var(--mp-tekst)]">
                    <CircleCheck aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-uspeh)]" />
                    <span className="min-w-0">{t.kopirano}</span>
                  </span>
                ) : null}
                {kopiranje === "neuspelo" ? (
                  <span className="inline-flex items-start gap-1.5 font-medium text-[var(--mp-tekst)]">
                    <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-upozorenje)]" />
                    <span className="min-w-0">{t.kopiranjeNeuspelo}</span>
                  </span>
                ) : null}
              </div>
            </dd>
          </div>
        </dl>
      </OkvirSekcije>
    </Kartica>
  );
}

const praznaPretplata = () => () => {};

/** The origin of the page; empty while rendering on the server, so the link is relative until the browser takes over. */
function useOrigin(): string {
  return useSyncExternalStore(
    praznaPretplata,
    () => window.location.origin,
    () => "",
  );
}

/** The card for the open panel: the venue's name from the panel context, the link from the address of the page. */
export function PodaciLokalaRuta({ slug }: { slug: string }) {
  const { lokal } = usePanelKontekst();
  const origin = useOrigin();
  return <PodaciLokala naziv={lokal} javniLink={`${origin}/${slug}/meni`} />;
}
