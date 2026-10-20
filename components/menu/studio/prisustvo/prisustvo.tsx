"use client";

// ScanMe Menu V1 — who else is in the editor (K18; master §6.1: "sistem
// prikazuje ko trenutno uređuje isti artikal"). Three places, one signal and
// never a lock:
//   - the editor header: initials and "Uređuje i: Marko Ilić";
//   - an article row: "Marko Ilić uređuje";
//   - the article detail: a quiet strip that says nothing is locked and that a
//     conflict of the same field is asked about, not overwritten.
// Always words next to the initials (never colour or a face alone); the
// initials are decoration for sighted people and hidden from screen readers.

import { Users } from "lucide-react";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { inicijali, recenicaOsoba } from "@/lib/menu/studio/presence-view";
import { cn } from "@/lib/utils";
import { StatusOznaka } from "../../zajednicko/status-oznaka";

const t = menuStudioSr.objavljivanje.prisustvo;

const NAJVISE_INICIJALA = 3;

/** The header: who else has this menu's editor open. Nothing when nobody does. */
export function PrisustvoZaglavlje({ osobe, className }: { osobe: readonly { id: string; ime: string }[]; className?: string }) {
  if (osobe.length === 0) return null;
  const imena = osobe.map((osoba) => osoba.ime);
  return (
    <p
      role="group"
      aria-label={t.oznaka}
      data-prisustvo-zaglavlje=""
      className={cn("inline-flex min-w-0 items-center gap-2 text-sm text-[var(--mp-tekst)]", className)}
    >
      <span aria-hidden="true" className="flex shrink-0 -space-x-1.5">
        {osobe.slice(0, NAJVISE_INICIJALA).map((osoba) => (
          <span
            key={osoba.id}
            className="grid size-7 place-items-center rounded-full border-2 bg-[var(--mp-akcent-meko)] text-[0.6875rem] font-semibold [--border:var(--mp-povrsina)] text-[var(--mp-akcent-tekst)]"
          >
            {inicijali(osoba.ime)}
          </span>
        ))}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{recenicaOsoba(t.uredjuje, imena)}</span>
    </p>
  );
}

/** An article row: "Marko Ilić uređuje". */
export function PrisustvoOznaka({ imena }: { imena: readonly string[] }) {
  if (imena.length === 0) return null;
  return (
    <span data-prisustvo-red="" className="contents">
      <StatusOznaka ton="info" ikonica={Users} velicina="mala">
        {recenicaOsoba(t.naArtiklu, imena)}
      </StatusOznaka>
    </span>
  );
}

/** The article detail: someone else has this article open right now. */
export function PrisustvoTraka({ imena }: { imena: readonly string[] }) {
  if (imena.length === 0) return null;
  return (
    <div
      role="status"
      data-prisustvo-detalj=""
      className="flex items-start gap-3 rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-sm [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)]"
    >
      <Users aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-info)]" />
      <p className="grid gap-0.5">
        <span className="font-semibold">{recenicaOsoba(t.detalj, imena)}</span>
        <span>{t.detaljOpis}</span>
      </p>
    </div>
  );
}
