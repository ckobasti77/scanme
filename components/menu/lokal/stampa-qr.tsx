"use client";

// ScanMe Menu V1 (K20) — the print sheet of QR cards (master §9.2): a full-screen
// dialog (focus stays inside, Escape closes, focus goes back to the button that
// opened it) with a grid of the chosen cards: the code about 4 cm, the label
// big, where it leads small, the card code tiny. "Štampaj" prints ONLY the sheet:
// while it is open, a print-only style hides every other child of <body>, takes
// the sheet out of its fixed frame so it can run over several pages, forces
// black on white whatever the app theme, and keeps each card on one page.

import { Printer, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { LokalKartica, LokalPodaci } from "@/lib/menu/lokal/model";
import { dijagnozaKartice } from "@/lib/menu/qr-diagnostics";
import { cn } from "@/lib/utils";
import { Dugme } from "../zajednicko/dugme";
import { MENU_TOKENI_KLASA } from "../zajednicko/povrsina";
import { odredisteDelovi } from "./kartice/stanje-kartice";
import { QrSlika, qrAdresa } from "./qr-slika";
import { useVracanjeFokusa } from "./zajednicko";

const t = menuLokalSr.stampa;

/**
 * Print rules that Tailwind variants cannot say (they reach outside the sheet).
 * Rendered inside the open sheet, so they exist only while it does.
 */
const STAMPA_STIL = `@page{margin:12mm}
@media print{
html,body{height:auto!important;overflow:visible!important;background:#fff!important}
body>*:not([data-stampa-okvir]):not(:has([data-stampa-okvir])){display:none!important}
[data-stampa-okvir]{position:static!important;display:block!important;transform:none!important;inset:auto!important;width:auto!important;max-width:none!important;height:auto!important;max-height:none!important;overflow:visible!important;margin:0!important;padding:0!important;border:0!important;background:#fff!important;box-shadow:none!important;animation:none!important}
[data-stampa-okvir],[data-stampa-okvir] *{color:#000!important}
[data-stampa-bez-stampe]{display:none!important}
[data-stampa-kartica]{break-inside:avoid;page-break-inside:avoid}
}`;

export function StampaQr({
  otvoreno,
  kartice,
  podaci,
  qrOrigin,
  onZatvori,
  fokusRezerva,
}: {
  otvoreno: boolean;
  /** The cards to print, in this order. */
  kartice: readonly LokalKartica[];
  podaci: LokalPodaci;
  qrOrigin: string;
  onZatvori: () => void;
  fokusRezerva?: string;
}) {
  return (
    <Dialog open={otvoreno} onOpenChange={(o) => (o ? undefined : onZatvori())}>
      <DialogContent
        data-povrsina="panel"
        data-stampa-okvir=""
        showCloseButton={false}
        className={cn(
          MENU_TOKENI_KLASA,
          // Full screen instead of the small centred dialog of the base component.
          "inset-0 h-dvh w-screen max-w-none outline-none translate-x-0 translate-y-0 content-start gap-0 overflow-y-auto rounded-none border-0 p-0",
          "bg-[var(--mp-okvir)] text-[var(--mp-tekst)] sm:w-screen motion-reduce:animate-none",
        )}
      >
        <StampaSadrzaj kartice={kartice} podaci={podaci} qrOrigin={qrOrigin} onZatvori={onZatvori} fokusRezerva={fokusRezerva} />
      </DialogContent>
    </Dialog>
  );
}

function StampaSadrzaj({
  kartice,
  podaci,
  qrOrigin,
  onZatvori,
  fokusRezerva,
}: {
  kartice: readonly LokalKartica[];
  podaci: LokalPodaci;
  qrOrigin: string;
  onZatvori: () => void;
  fokusRezerva?: string;
}) {
  useVracanjeFokusa(fokusRezerva);
  const ctx = { pages: podaci.pages, positions: podaci.positions };
  return (
    <>
      <style>{STAMPA_STIL}</style>
      <div className="mx-auto grid w-full max-w-[76rem] gap-5 p-4 sm:p-6 print:max-w-none print:gap-0 print:p-0">
        <header data-stampa-bez-stampe="" className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 pr-1">
          <div className="grid min-w-0 max-w-[60ch] gap-1">
            <DialogTitle className="text-xl font-semibold leading-snug tracking-[-0.01em]">{t.naslov}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.opis}</DialogDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Dugme vrsta="primarno" ikonica={Printer} disabled={kartice.length === 0} onClick={() => window.print()}>
              {t.stampaj}
            </Dugme>
            <Dugme vrsta="sekundarno" ikonica={X} onClick={onZatvori}>
              {t.zatvori}
            </Dugme>
          </div>
        </header>

        <div data-stampa-bez-stampe="" className="grid gap-1 text-sm text-[var(--mp-tekst-sporedni)]">
          <p className="tabular-nums">{fmt(t.broj, { n: kartice.length })}</p>
          <p>{t.savet}</p>
        </div>

        {kartice.length === 0 ? (
          <p data-stampa-bez-stampe="" className="rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-3 text-sm">
            {t.prazno}
          </p>
        ) : (
          <ul
            aria-label={t.oznakaListe}
            data-stampa-list=""
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-2"
          >
            {kartice.map((kartica) => {
              const odrediste = odredisteDelovi(dijagnozaKartice(kartica, ctx));
              return (
                <li key={kartica.id} data-stampa-kartica={kartica.id} className="break-inside-avoid">
                  <div className="grid justify-items-center gap-2 rounded-[var(--mp-radius-unutra)] border border-dashed bg-white p-3 text-center text-black [--border:#8c8c8c]">
                    <QrSlika
                      url={qrAdresa(qrOrigin, kartica.cardCode)}
                      naslov={fmt(menuLokalSr.qr.oznaka, { naziv: kartica.label })}
                      velicina="4cm"
                    />
                    <p className="text-xl font-bold leading-tight [overflow-wrap:anywhere]">{kartica.label}</p>
                    {odrediste ? <p className="text-xs leading-snug [overflow-wrap:anywhere]">{odrediste}</p> : null}
                    <p className="font-mono text-[0.625rem] tracking-widest">{kartica.cardCode}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
