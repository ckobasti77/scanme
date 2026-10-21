"use client";

// ScanMe Menu V1 (K27) — the read-only detail of one request in Operativa, in a
// drawer from the right (master §13.5). It shows what the Owner or Manager may
// look at — the state, when it came and how long it waits, who took it, the
// zone, the card the guest scanned, the payment wish and the lines of an order
// as they were sent — and does nothing else: taking, finishing, cancelling and
// reassigning stay in the waiter panel. The one thing the drawer may carry is
// the quiet reminder, handed in as `ping` by the screen (the same control and
// states as on the card). The helpers below (kind icon, place, who took it)
// are shared with the cards of operativa.tsx.

import {
  BedDouble,
  Bell,
  CircleCheck,
  CircleDot,
  CircleSlash,
  Clock,
  ConciergeBell,
  Hand,
  ReceiptText,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { SheetClose } from "@/components/ui/sheet";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { clockTime, elapsedSeconds } from "@/lib/menu/elapsed-time";
import type { OperacijeRed, OperacijeZahtev } from "@/lib/menu/operations-view";
import type { MenuRequestKind, MenuRequestStatus } from "@/lib/menu/request-status";
import { cn } from "@/lib/utils";
import { Napomena, useVracanjeFokusa } from "../../lokal/zajednicko";
import { formatRsd } from "../../menu-view";
import { Dugme } from "../../zajednicko/dugme";
import { Fioka } from "../../zajednicko/fioka";
import { StatusOznaka, type StatusTon } from "../../zajednicko/status-oznaka";
import { PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import type { OperativaDetalj } from "./operativa";

const t = menuPanelSr.operativa;
const d = menuDomenSr;

// --- shared pieces of the cards and the drawer ------------------------------

const VRSTA: Record<MenuRequestKind, { ikonica: LucideIcon; boja: string; meko: string }> = {
  call: { ikonica: Bell, boja: "text-[var(--mp-vrsta-poziv)]", meko: "bg-[var(--mp-vrsta-poziv-meko)]" },
  bill: { ikonica: ReceiptText, boja: "text-[var(--mp-vrsta-racun)]", meko: "bg-[var(--mp-vrsta-racun-meko)]" },
  order: {
    ikonica: ConciergeBell,
    boja: "text-[var(--mp-vrsta-porudzbina)]",
    meko: "bg-[var(--mp-vrsta-porudzbina-meko)]",
  },
};

/** The kind's icon in its soft circle (decorative: the kind is always written next to it). */
export function VrstaIkona({ vrsta, className }: { vrsta: MenuRequestKind; className?: string }) {
  const { ikonica: Ikonica, boja, meko } = VRSTA[vrsta];
  return (
    <span
      aria-hidden="true"
      data-vrsta={vrsta}
      className={cn("grid size-10 shrink-0 place-items-center rounded-full", meko, className)}
    >
      <Ikonica strokeWidth={2} className={cn("size-5", boja)} />
    </span>
  );
}

/** "Sto 7 · Terasa" (the zone is written only when the request has one, i.e. the venue uses zones). */
export function mestoTekst(zahtev: Pick<OperacijeZahtev, "positionLabel" | "zoneName">): string {
  return zahtev.zoneName ? `${zahtev.positionLabel} · ${zahtev.zoneName}` : zahtev.positionLabel;
}

/** "Preuzeto · Ana", "Preuzeto nalogom · Vlasnik" or "Još niko nije preuzeo". */
export function koTekst(zahtev: Pick<OperacijeZahtev, "acceptedBy">): string {
  const preuzeo = zahtev.acceptedBy;
  if (preuzeo === null) return t.red.nepreuzet;
  const ime = preuzeo.name.trim() === "" ? t.red.bezImena : preuzeo.name;
  return fmt(preuzeo.kind === "account" ? t.red.preuzetoNalogom : t.red.preuzeto, { ime });
}

/**
 * How long a request has been waiting, in words an owner does not read as a clock
 * time: "manje od minuta", "8 min", "1 h 5 min" (the waiter panel keeps its own `08:12` timer).
 */
export function trajanjeTekst(sekundi: number): string {
  const ukupno = Number.isFinite(sekundi) ? Math.max(0, Math.floor(sekundi)) : 0;
  if (ukupno < 60) return t.red.trajanje.manje;
  const minuta = Math.floor(ukupno / 60);
  if (minuta < 60) return fmt(t.red.trajanje.min, { n: minuta });
  return fmt(t.red.trajanje.sati, { h: Math.floor(minuta / 60), m: minuta % 60 });
}

/** "Poslato u 18:12 · čeka 8 min" */
export function vremeTekst(createdAt: number, nowMs: number): string {
  return fmt(t.red.vreme, { sat: clockTime(createdAt), trajanje: trajanjeTekst(elapsedSeconds(createdAt, nowMs)) });
}

const STATUS_ZAHTEVA: Record<MenuRequestStatus, { ikonica: LucideIcon; ton: StatusTon }> = {
  new: { ikonica: CircleDot, ton: "info" },
  accepted: { ikonica: Hand, ton: "neutralno" },
  done: { ikonica: CircleCheck, ton: "uspeh" },
  cancelled: { ikonica: CircleSlash, ton: "neutralno" },
};

/** Novi: info + CircleDot; Prihvaćen: neutral + Hand (MENU-UX §5.2). */
export function StatusZahteva({ status }: { status: MenuRequestStatus }) {
  const { ikonica, ton } = STATUS_ZAHTEVA[status];
  return (
    <StatusOznaka ton={ton} ikonica={ikonica}>
      {d.requestStatuses[status]}
    </StatusOznaka>
  );
}

/** A calm danger chip: the clock and the word, no animation. */
export function KasniOznaka({ children = t.red.kasni }: { children?: ReactNode }) {
  return (
    <StatusOznaka ton="opasnost" ikonica={Clock} velicina="mala">
      {children}
    </StatusOznaka>
  );
}

/** "1.490 RSD" */
function iznosTekst(rsd: number): string {
  return fmt(menuKonobarSr.detalj.iznos, { iznos: formatRsd(rsd) });
}

// --- the drawer --------------------------------------------------------------

function Cinjenica({ naziv, children }: { naziv: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-[var(--mp-tekst-sporedni)]">{naziv}</dt>
      <dd className="min-w-0 text-base font-medium text-[var(--mp-tekst)] [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function DetaljSadrzaj({
  red,
  detalj,
  nowMs,
  imaZone,
  ping,
  otvoreno = true,
}: {
  /** null = the request is no longer in the list (someone finished it meanwhile). */
  red: OperacijeRed | null;
  /** undefined = loading; null = the server has nothing more to add. */
  detalj: OperativaDetalj | null | undefined;
  nowMs: number;
  /** The venue uses zones: a request without one reads "Bez zone". */
  imaZone: boolean;
  /** The reminder control (states as on the card), or null. */
  ping: ReactNode;
  /** False while the drawer slides out: nothing starts loading then. */
  otvoreno?: boolean;
}) {
  if (red === null) return <PraznoStanje nivo={3} ikonica={SearchX} naslov={t.detalj.nijeAktivan} />;

  const kartica = detalj?.sourceLabel ?? null;
  const stavke = red.kind === "order" && detalj ? detalj : null;
  return (
    <div className="grid gap-5" data-detalj={red.id}>
      <Napomena>{t.detalj.samoPregled}</Napomena>

      <dl className="grid gap-4">
        <Cinjenica naziv={t.detalj.stanje}>
          <span className="flex flex-wrap items-center gap-2">
            <StatusZahteva status={red.status} />
            {red.kasni ? <KasniOznaka /> : null}
            {red.channel === "room_service" ? (
              <StatusOznaka ton="neutralno" ikonica={BedDouble} velicina="mala">
                {t.detalj.roomService}
              </StatusOznaka>
            ) : null}
          </span>
        </Cinjenica>
        <Cinjenica naziv={t.detalj.poslato}>
          <span className="tabular-nums">{vremeTekst(red.createdAt, nowMs)}</span>
        </Cinjenica>
        <Cinjenica naziv={t.detalj.ko}>{koTekst(red)}</Cinjenica>
        {red.acceptedAt !== null && red.status === "accepted" ? (
          <Cinjenica naziv={t.detalj.preuzeto}>
            <span className="tabular-nums">{clockTime(red.acceptedAt)}</span>
          </Cinjenica>
        ) : null}
        {imaZone ? <Cinjenica naziv={t.detalj.zona}>{red.zoneName ?? t.red.bezZone}</Cinjenica> : null}
        {kartica !== null && kartica !== red.positionLabel ? (
          <Cinjenica naziv={t.detalj.kartica}>{kartica}</Cinjenica>
        ) : null}
        {red.paymentPreference !== null ? (
          <Cinjenica naziv={t.detalj.placanje}>{d.paymentPreferences[red.paymentPreference]}</Cinjenica>
        ) : null}
      </dl>

      {ping}

      {detalj === undefined && otvoreno ? (
        <UcitavanjeStanje oblik="lista" redova={2} oznaka={t.detalj.ucitava} />
      ) : null}

      {stavke ? (
        <section aria-label={t.detalj.stavke} className="grid gap-3 border-t pt-4 [--border:var(--mp-ivica)]">
          <h3 className="text-base font-semibold text-[var(--mp-tekst)]">{t.detalj.stavke}</h3>
          <ul className="grid gap-3">
            {stavke.items.map((stavka, indeks) => (
              <li key={indeks} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5">
                <p className="text-base font-medium leading-snug text-[var(--mp-tekst)]">
                  <span className="tabular-nums">{stavka.quantity} ×</span> {stavka.name}
                  {stavka.variantName ? (
                    <span className="font-normal text-[var(--mp-tekst-sporedni)]"> · {stavka.variantName}</span>
                  ) : null}
                </p>
                <p className="whitespace-nowrap text-right text-base font-medium tabular-nums text-[var(--mp-tekst)]">
                  {iznosTekst(stavka.lineTotalRsd)}
                </p>
                {stavka.addons.length > 0 ? (
                  <p className="col-span-2 text-sm text-[var(--mp-tekst-sporedni)]">
                    {stavka.addons.map((dodatak) => `+ ${dodatak}`).join(", ")}
                  </p>
                ) : null}
                {stavka.note ? (
                  <p className="col-span-2 text-sm font-medium text-[var(--mp-tekst)]">
                    {fmt(t.detalj.napomena, { tekst: stavka.note })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <dl className="grid gap-1 border-t pt-3 text-base [--border:var(--mp-ivica)]">
            {stavke.subtotalRsd !== null && stavke.deliveryFeeRsd !== null ? (
              <>
                <div className="flex justify-between gap-4 text-[var(--mp-tekst-sporedni)]">
                  <dt>{t.detalj.medjuzbir}</dt>
                  <dd className="whitespace-nowrap tabular-nums">{iznosTekst(stavke.subtotalRsd)}</dd>
                </div>
                <div className="flex justify-between gap-4 text-[var(--mp-tekst-sporedni)]">
                  <dt>{t.detalj.dostava}</dt>
                  <dd className="whitespace-nowrap tabular-nums">{iznosTekst(stavke.deliveryFeeRsd)}</dd>
                </div>
              </>
            ) : null}
            {red.totalRsd !== null ? (
              <div className="flex justify-between gap-4 font-semibold text-[var(--mp-tekst)]">
                <dt>{t.detalj.ukupno}</dt>
                <dd className="whitespace-nowrap tabular-nums">{iznosTekst(red.totalRsd)}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

/** The content of the open drawer: gives focus back to the "Detalj" button that opened it. */
function DetaljTelo(props: Parameters<typeof DetaljSadrzaj>[0]) {
  useVracanjeFokusa();
  return <DetaljSadrzaj {...props} />;
}

export function DetaljFioka({
  otvoreno,
  onZatvori,
  red,
  detalj,
  nowMs,
  imaZone,
  ping,
}: {
  otvoreno: boolean;
  onZatvori(): void;
  red: OperacijeRed | null;
  detalj: OperativaDetalj | null | undefined;
  nowMs: number;
  imaZone: boolean;
  ping: ReactNode;
}) {
  const naslov = red ? (
    <span className="flex min-w-0 items-center gap-3">
      <VrstaIkona vrsta={red.kind} />
      <span className="grid min-w-0">
        <span>{d.requestKinds[red.kind]}</span>
        <span className="text-sm font-normal text-[var(--mp-tekst-sporedni)]">{mestoTekst(red)}</span>
      </span>
    </span>
  ) : (
    t.red.detalj
  );
  return (
    <Fioka
      otvoreno={otvoreno}
      onOtvoreno={(sledece) => {
        if (!sledece) onZatvori();
      }}
      strana="desno"
      naslov={naslov}
      className="w-[min(26rem,92vw)] sm:max-w-[26rem]"
      podnozje={
        <SheetClose asChild>
          <Dugme vrsta="sekundarno">{t.detalj.zatvori}</Dugme>
        </SheetClose>
      }
    >
      <DetaljTelo red={red} detalj={detalj} nowMs={nowMs} imaZone={imaZone} ping={ping} otvoreno={otvoreno} />
    </Fioka>
  );
}
