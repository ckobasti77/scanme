"use client";

// ScanMe Menu V1 — live preview of the draft (K10; master §13.4, §6.1). Until
// K13 the draft is shown through the PUBLIC renderer itself
// (components/menu/javni, via lib/menu/studio/javni-pregled).
// The preview is for looking only: it is inert and hidden from assistive
// technology, because the same content is editable — and announced — in the
// work area next to it. A note says it shows the draft, not what guests see.

import { Monitor, Smartphone } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { MenuDesign } from "@/lib/design-engine/menu-tokens";
import type { JavniPregled } from "@/lib/menu/studio/javni-pregled";
import { cn } from "@/lib/utils";
import { IkonicaDugme } from "../../zajednicko/dugme";
import { PregledSadrzaj } from "./pregled-sadrzaj";

const t = menuStudioSr;

export type StudioUredjaj = "telefon" | "desktop";

export function PregledNacrta({
  pregled,
  naziv,
  dizajn = null,
  uredjaj,
  onUredjaj,
  naslov = true,
  visina = "kolona",
}: {
  /** null = the page has nothing guests would see yet. */
  pregled: JavniPregled | null;
  /** Name of the page shown (for the accessible description). */
  naziv: string;
  /** The izlog's `design=dark`; the real editor passes nothing (K17 brings the design). */
  dizajn?: MenuDesign | null;
  uredjaj: StudioUredjaj;
  onUredjaj: (uredjaj: StudioUredjaj) => void;
  naslov?: boolean;
  /** kolona = the sticky preview column; preklop = inside an overlay; pano = the phone pane. */
  visina?: "kolona" | "preklop" | "pano";
}) {
  return (
    <section aria-label={naslov ? undefined : t.pregled.naslov} aria-labelledby={naslov ? "studio-pregled-naslov" : undefined} className="grid min-h-0 content-start gap-3" data-pregled={uredjaj}>
      <div className="flex items-center justify-between gap-2">
        {naslov ? (
          <h2 id="studio-pregled-naslov" className="text-base font-semibold tracking-[-0.01em]">
            {t.pregled.naslov}
          </h2>
        ) : (
          <span />
        )}
        <div role="group" aria-label={t.pregled.uredjaj} className="flex gap-1">
          <IkonicaDugme
            ikonica={Smartphone}
            oznaka={t.pregled.telefon}
            pritisnuto={uredjaj === "telefon"}
            onClick={() => onUredjaj("telefon")}
          />
          <IkonicaDugme
            ikonica={Monitor}
            oznaka={t.pregled.desktop}
            pritisnuto={uredjaj === "desktop"}
            onClick={() => onUredjaj("desktop")}
          />
        </div>
      </div>
      <p id="studio-pregled-napomena" className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
        {t.pregled.napomena}
      </p>
      <div
        className={cn(
          "overflow-hidden border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)]",
          uredjaj === "telefon"
            ? "mx-auto w-full max-w-[22.5rem] rounded-[1.75rem] border-[6px] [--border:var(--mp-mastilo)]"
            : "w-full rounded-[var(--mp-radius-kontrola)]",
        )}
      >
        <div
          className={cn(
            "overflow-y-auto overscroll-contain",
            visina === "kolona" && "h-[min(42rem,calc(100dvh-14rem))]",
            visina === "preklop" && "h-[calc(100dvh-13rem)]",
            visina === "pano" && "h-[calc(100dvh-16rem)] min-h-[24rem]",
          )}
        >
          {pregled ? (
            <div
              inert
              aria-hidden="true"
              data-pregled-sadrzaj=""
              className="[&>div]:min-h-full [&_[class*=frame]]:min-h-0"
              style={uredjaj === "desktop" ? { width: "64rem", zoom: 0.34 } : undefined}
            >
              <PregledSadrzaj pregled={pregled} dizajn={dizajn} />
            </div>
          ) : (
            <p className="grid h-full place-items-center p-6 text-center text-sm text-[var(--mp-tekst-sporedni)]">
              {t.pregled.prazno}
            </p>
          )}
        </div>
      </div>
      <p className="sr-only">{fmt(t.pregled.okvir, { naziv })}</p>
    </section>
  );
}
