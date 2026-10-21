// ScanMe Menu V1 — empty, error, loading and offline states (K07,
// docs/menu/MENU-UX.md §5). Each state says what happened and what comes next
// (DASHBOARD-STANDARD §7). Loading is a skeleton in the shape of the content,
// never a lone spinner; errors are announced (role="alert"); offline never
// pretends that something was sent.

import { CircleDashed, OctagonAlert, RotateCcw, WifiOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { cn } from "@/lib/utils";
import { Dugme } from "./dugme";
import tokeni from "./tokeni.module.css";

const t = menuZajednickoSr.stanja;

function StanjeOkvir({
  ikonica: Ikonica,
  ikonicaKlase,
  naslov,
  opis,
  akcija,
  nivo,
  className,
  ...rest
}: {
  ikonica: LucideIcon;
  ikonicaKlase: string;
  naslov: ReactNode;
  opis?: ReactNode;
  akcija?: ReactNode;
  nivo: 2 | 3;
  className?: string;
  role?: "alert";
  "data-stanje": string;
}) {
  const Naslov = nivo === 2 ? "h2" : "h3";
  return (
    <div className={cn("grid justify-items-center gap-3 px-5 py-10 text-center", className)} {...rest}>
      <span className={cn("grid size-14 place-items-center rounded-full", ikonicaKlase)}>
        <Ikonica aria-hidden="true" strokeWidth={1.75} className="size-6" />
      </span>
      <Naslov className="text-lg font-semibold leading-snug tracking-[-0.01em] text-[var(--mp-tekst)]">{naslov}</Naslov>
      {opis ? <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-[var(--mp-tekst-sporedni)]">{opis}</p> : null}
      {akcija ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{akcija}</div> : null}
    </div>
  );
}

/** Nothing here yet: what is empty, why or what is next, and the action that fills it. */
export function PraznoStanje({
  ikonica = CircleDashed,
  naslov,
  opis,
  akcija,
  nivo = 2,
  className,
}: {
  ikonica?: LucideIcon;
  naslov: ReactNode;
  opis?: ReactNode;
  akcija?: ReactNode;
  nivo?: 2 | 3;
  className?: string;
}) {
  return (
    <StanjeOkvir
      data-stanje="prazno"
      ikonica={ikonica}
      ikonicaKlase="bg-[var(--mp-akcent-meko)] text-[var(--mp-akcent-tekst)]"
      naslov={naslov}
      opis={opis}
      akcija={akcija}
      nivo={nivo}
      className={className}
    />
  );
}

/**
 * Something failed: what, what to do, and "Pokušaj ponovo". `onPonovo` works
 * where the caller is a client component; a server caller passes `akcija`.
 */
export function GreskaStanje({
  naslov = t.greskaNaslov,
  opis = t.greskaOpis,
  onPonovo,
  akcija,
  nivo = 2,
  className,
}: {
  naslov?: ReactNode;
  opis?: ReactNode;
  onPonovo?: () => void;
  akcija?: ReactNode;
  nivo?: 2 | 3;
  className?: string;
}) {
  return (
    <StanjeOkvir
      data-stanje="greska"
      role="alert"
      ikonica={OctagonAlert}
      ikonicaKlase="bg-[var(--mp-opasnost-meko)] text-[var(--mp-opasnost)]"
      naslov={naslov}
      opis={opis}
      akcija={
        akcija ??
        (onPonovo ? (
          <Dugme ikonica={RotateCcw} onClick={onPonovo}>
            {t.pokusajPonovo}
          </Dugme>
        ) : undefined)
      }
      nivo={nivo}
      className={className}
    />
  );
}

export type UcitavanjeOblik = "lista" | "kartice" | "tabela" | "forma";

/** A skeleton in the shape of what is coming; the label is for screen readers only. */
export function UcitavanjeStanje({
  oblik = "lista",
  redova = 4,
  oznaka = t.ucitavanje,
  className,
}: {
  oblik?: UcitavanjeOblik;
  redova?: number;
  oznaka?: string;
  className?: string;
}) {
  const kost = cn(tokeni.kostur, "rounded-[var(--mp-radius-unutra)]");
  const count = Number.isFinite(redova) ? Math.max(1, Math.floor(redova)) : 1;
  const rows = Array.from({ length: count }, (_, index) => index);
  return (
    <div role="status" aria-live="polite" data-stanje="ucitavanje" data-oblik={oblik} className={cn("grid gap-3", className)}>
      <span className="sr-only">{oznaka}</span>
      {oblik === "kartice" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <div key={row} className="grid gap-3 rounded-[var(--mp-radius-kartica)] border [--border:var(--mp-ivica)] p-4">
              <div className={cn(kost, "h-5 w-2/3")} />
              <div className={cn(kost, "h-4 w-full")} />
              <div className={cn(kost, "h-4 w-1/2")} />
            </div>
          ))}
        </div>
      ) : oblik === "tabela" ? (
        <>
          <div className={cn(kost, "h-4 w-full")} />
          {rows.map((row) => (
            <div key={row} className="grid grid-cols-[2fr_1fr_1fr] gap-3">
              <div className={cn(kost, "h-10")} />
              <div className={cn(kost, "h-10")} />
              <div className={cn(kost, "h-10")} />
            </div>
          ))}
        </>
      ) : oblik === "forma" ? (
        rows.map((row) => (
          <div key={row} className="grid gap-2">
            <div className={cn(kost, "h-4 w-32")} />
            <div className={cn(kost, "h-11 w-full rounded-[var(--mp-radius-kontrola)]")} />
          </div>
        ))
      ) : (
        rows.map((row) => (
          <div key={row} className="flex items-center gap-3">
            <div className={cn(kost, "size-11 shrink-0 rounded-[var(--mp-radius-kontrola)]")} />
            <div className="grid flex-1 gap-2">
              <div className={cn(kost, "h-4 w-1/2")} />
              <div className={cn(kost, "h-3.5 w-1/3")} />
            </div>
            <div className={cn(kost, "h-4 w-16")} />
          </div>
        ))
      )}
    </div>
  );
}

/**
 * No connection: what the screen shows is from `vreme`; actions that need the
 * connection wait. A polite status, not an alert: the screen stays usable.
 */
export function OfflineTraka({ vreme, akcija, className }: { vreme?: string; akcija?: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-stanje="offline"
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)] px-4 py-3",
        className,
      )}
    >
      <WifiOff aria-hidden="true" strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-[var(--mp-upozorenje)]" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="font-semibold text-[var(--mp-tekst)]">{t.offlineNaslov}</p>
        <p className="text-sm leading-relaxed text-[var(--mp-tekst)]">
          {vreme ? fmt(t.offlineOpis, { vreme }) : t.offlineBezVremena}
        </p>
      </div>
      {akcija ? <div className="flex items-center gap-2">{akcija}</div> : null}
    </div>
  );
}
