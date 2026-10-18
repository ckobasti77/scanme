// ScanMe Menu V1 — "šav objave" (the publish seam), the signature detail of
// the panel and the editor (docs/menu/MENU-UX.md §1.1). One line joins what
// guests see (the published version) and what is being edited (the draft),
// with a stitched seam between them: the distance between draft and live is
// the one thing a menu owner must always know (master §6.1, §13.2, §13.4).
// The save state is a polite live region; it never steals focus.

import { CircleCheck, CircleDashed, LoaderCircle, PencilLine, Radio, RotateCcw, TriangleAlert } from "lucide-react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Dugme } from "./dugme";

export type SavObjaveCuvanje = "sacuvano" | "cuva-se" | "greska";

const t = menuZajednickoSr;

export function izmeneTekst(n: number): string {
  if (n <= 0) return t.objava.bezIzmena;
  const category = srPluralCategory(n);
  const template =
    category === "one" ? t.objava.izmeneOne : category === "few" ? t.objava.izmeneFew : t.objava.izmeneMany;
  return fmt(template, { n });
}

export function SavObjave({
  objavljeno,
  neobjavljeneIzmene,
  cuvanje,
  onPonovo,
  akcija,
  className,
}: {
  /** The live version and when, already phrased ("danas u 14:32", "12. 10. u 9:05"); null = never published. */
  objavljeno: { broj: number; kada: string } | null;
  /** How many unpublished changes; "ima" when only their existence is known (the editor, K10). */
  neobjavljeneIzmene: number | "ima";
  /** Autosave state of the draft; omitted where nothing is edited. */
  cuvanje?: SavObjaveCuvanje;
  /** Shown as "Pokušaj ponovo" while saving failed (client callers); the edit stays on screen. */
  onPonovo?: () => void;
  /** The same slot for a server caller (a Dugme it renders itself); wins over onPonovo. */
  akcija?: ReactNode;
  className?: string;
}) {
  const imaIzmena = neobjavljeneIzmene === "ima" || neobjavljeneIzmene > 0;
  return (
    <div
      role="group"
      aria-label={t.objava.oznaka}
      data-sav-objave={imaIzmena ? "izmene" : "cisto"}
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] px-3 py-2 text-sm",
        className,
      )}
    >
      <span className="inline-flex min-w-0 items-start gap-1.5">
        {objavljeno ? (
          <Radio aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-akcent-tekst)]" />
        ) : (
          <CircleDashed aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-tekst-sporedni)]" />
        )}
        {/* One run of text, so the quiet half wraps under the strong half on a phone. */}
        <span className="min-w-0">
          <span className="font-semibold">
            {objavljeno ? fmt(t.objava.objavljeno, { broj: objavljeno.broj }) : t.objava.nikadObjavljeno}
          </span>{" "}
          <span className="text-[var(--mp-tekst-sporedni)]">
            {objavljeno ? fmt(t.objava.objavljenoKada, { kada: objavljeno.kada }) : t.objava.gostiNeVide}
          </span>
        </span>
      </span>

      {/* The seam: stitched while the draft differs from what guests see, a plain line when it does not.
          On a phone it is a full-width rule between the two lines; from 640 px an elastic stitch. */}
      <span
        aria-hidden="true"
        data-sav=""
        className={cn(
          "h-0 basis-full border-t-2 sm:min-w-8 sm:max-w-20 sm:flex-1 sm:basis-auto",
          imaIzmena ? "border-dashed [--border:var(--mp-upozorenje)]" : "border-solid [--border:var(--mp-ivica-kontrole)]",
        )}
      />

      <span className="inline-flex min-w-0 items-center gap-1.5">
        {imaIzmena ? (
          <PencilLine aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-[var(--mp-upozorenje)]" />
        ) : (
          <CircleCheck aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-[var(--mp-uspeh)]" />
        )}
        <span>{neobjavljeneIzmene === "ima" ? t.objava.imaIzmena : izmeneTekst(neobjavljeneIzmene)}</span>
      </span>

      {cuvanje ? (
        <span
          role="status"
          aria-live="polite"
          data-cuvanje={cuvanje}
          className="inline-flex items-center gap-1.5 text-[var(--mp-tekst-sporedni)]"
        >
          {cuvanje === "cuva-se" ? (
            <LoaderCircle aria-hidden="true" strokeWidth={2} className="size-4 animate-spin motion-reduce:animate-none" />
          ) : cuvanje === "greska" ? (
            <TriangleAlert aria-hidden="true" strokeWidth={2} className="size-4 text-[var(--mp-opasnost)]" />
          ) : (
            <CircleCheck aria-hidden="true" strokeWidth={2} className="size-4" />
          )}
          <span className={cn(cuvanje === "greska" && "font-semibold text-[var(--mp-tekst)]")}>
            {cuvanje === "cuva-se" ? t.cuvanje.cuvaSe : cuvanje === "greska" ? t.cuvanje.nijeSacuvano : t.cuvanje.sacuvano}
          </span>
        </span>
      ) : null}
      {cuvanje === "greska"
        ? (akcija ??
          (onPonovo ? (
            <Dugme vrsta="tiho" velicina="kompaktna" ikonica={RotateCcw} onClick={onPonovo} className="-my-1.5">
              {t.stanja.pokusajPonovo}
            </Dugme>
          ) : null))
        : null}
    </div>
  );
}
