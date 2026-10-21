"use client";

// ScanMe Menu V1 — live preview of the draft (K10; master §13.4, §6.1). Since
// K13 the draft is shown through the PUBLIC renderer itself
// (components/menu/javni, via lib/menu/studio/javni-pregled); since K17 in the
// venue's DRAFT appearance and in a real device frame — phone, tablet or
// desktop — at that device's own width (okvir-uredjaja.tsx).
// The preview is for looking only: it is inert and hidden from assistive
// technology, because the same content is editable — and announced — in the
// work area next to it. A note says it shows the draft, not what guests see.

import { Maximize2, Monitor, Smartphone, Tablet } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { JavniIzgled } from "@/lib/menu/identity/public-tokens";
import type { JavniPregled } from "@/lib/menu/studio/javni-pregled";
import { cn } from "@/lib/utils";
import { IkonicaDugme } from "../../zajednicko/dugme";
import { OkvirUredjaja, SIRINA_UREDJAJA, type StudioUredjaj } from "./okvir-uredjaja";
import { PregledSadrzaj } from "./pregled-sadrzaj";

const t = menuStudioSr;

export type { StudioUredjaj };

const UREDJAJI = [
  { uredjaj: "telefon", ikonica: Smartphone, oznaka: t.pregled.telefon },
  { uredjaj: "tablet", ikonica: Tablet, oznaka: t.pregled.tablet },
  { uredjaj: "desktop", ikonica: Monitor, oznaka: t.pregled.desktop },
] as const;

export function PregledNacrta({
  pregled,
  naziv,
  izgled,
  uredjaj,
  onUredjaj,
  naslov = true,
  visina = "kolona",
  onUvecaj,
}: {
  /** null = the page has nothing guests would see yet. */
  pregled: JavniPregled | null;
  /** Name of the page shown (for the accessible description). */
  naziv: string;
  /** K17: the draft appearance as guests would get it (Izgled). */
  izgled: JavniIzgled;
  uredjaj: StudioUredjaj;
  onUredjaj: (uredjaj: StudioUredjaj) => void;
  naslov?: boolean;
  /** kolona = the sticky preview column; preklop = inside an overlay; pano = the phone pane; izgled = beside Izgled. */
  visina?: "kolona" | "preklop" | "pano" | "izgled";
  /** K17: opens the large preview (offered beside a column, not inside the overlay). */
  onUvecaj?: () => void;
}) {
  const oznakaUredjaja = UREDJAJI.find((stavka) => stavka.uredjaj === uredjaj)?.oznaka ?? "";
  return (
    <section
      aria-label={naslov ? undefined : t.pregled.naslov}
      aria-labelledby={naslov ? "studio-pregled-naslov" : undefined}
      className="grid min-h-0 content-start gap-3"
      data-pregled={uredjaj}
    >
      <div className="flex items-center justify-between gap-2">
        {naslov ? (
          <h2 id="studio-pregled-naslov" className="text-base font-semibold tracking-[-0.01em]">
            {t.pregled.naslov}
          </h2>
        ) : (
          <span />
        )}
        <div role="group" aria-label={t.pregled.uredjaj} className="flex gap-1">
          {UREDJAJI.map((stavka) => (
            <IkonicaDugme
              key={stavka.uredjaj}
              ikonica={stavka.ikonica}
              oznaka={stavka.oznaka}
              pritisnuto={uredjaj === stavka.uredjaj}
              onClick={() => onUredjaj(stavka.uredjaj)}
            />
          ))}
          {onUvecaj ? <IkonicaDugme ikonica={Maximize2} oznaka={t.pregled.uvecaj} onClick={onUvecaj} /> : null}
        </div>
      </div>
      <p data-sirina-uredjaja="" className="-mt-2 text-right text-[0.8125rem] tabular-nums text-[var(--mp-tekst-sporedni)]">
        {fmt(t.pregled.sirina, { uredjaj: oznakaUredjaja, px: SIRINA_UREDJAJA[uredjaj] })}
      </p>
      {/* K34: a data attribute, not an id: two previews can be on screen (column and "Uvećaj pregled"). */}
      <p data-pregled-napomena="" className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
        {t.pregled.napomena}
      </p>
      <div
        data-bezel={uredjaj}
        className={cn(
          // The device body is dark in both app themes (--mp-istaknuto), with a hairline so it reads on a dark panel too.
          "mx-auto w-full overflow-hidden border bg-[var(--mp-povrsina-utisana)] shadow-[0_0_0_1px_var(--mp-ivica-kontrole)] [--border:var(--mp-istaknuto)]",
          uredjaj === "telefon"
            ? "rounded-[1.75rem] border-[6px]"
            : uredjaj === "tablet"
              ? "rounded-[1.25rem] border-[8px]"
              : "rounded-[var(--mp-radius-kontrola)] border-x-2 border-b-2 border-t-[10px]",
        )}
        style={{ maxWidth: uredjaj === "desktop" ? undefined : SIRINA_UREDJAJA[uredjaj] + (uredjaj === "telefon" ? 12 : 16) }}
      >
        <div
          className={cn(
            "overflow-y-auto overscroll-contain",
            visina === "kolona" && "h-[min(42rem,calc(100dvh-14rem))]",
            visina === "preklop" && "h-[calc(100dvh-13rem)]",
            visina === "pano" && "h-[calc(100dvh-16rem)] min-h-[24rem]",
            visina === "izgled" && "h-[min(52rem,calc(100dvh-13rem))] min-h-[26rem]",
          )}
        >
          {pregled ? (
            <div inert aria-hidden="true" data-pregled-sadrzaj="" className="[&>div]:min-h-full [&_[class*=frame]]:min-h-0">
              <OkvirUredjaja uredjaj={uredjaj}>
                <PregledSadrzaj pregled={pregled} izgled={izgled} />
              </OkvirUredjaja>
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
