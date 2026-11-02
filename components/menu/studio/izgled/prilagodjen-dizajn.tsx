"use client";

// ScanMe Menu V1 — Izgled: "Zatraži prilagođen dizajn" (K17; master §15.2).
// A quiet way out of the curated choice, at the end of Izgled: a link that
// opens the person's own mail program with a prepared message to the ScanMe
// team, and the address itself with a copy button for those who write from a
// web mailbox. Nothing is sent by the app and no price is promised (BLOCKED K17).

import { Copy, Mail } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { mailtoLink, SCANME_KONTAKT_EMAIL } from "@/lib/menu/kontakt";
import { Dugme } from "../../zajednicko/dugme";

const t = menuStudioSr.izgled.prilagodjen;

export function PrilagodjenDizajn({ lokal, slug }: { lokal: string; slug: string }) {
  const [kopirano, setKopirano] = useState(false);
  const href = mailtoLink(SCANME_KONTAKT_EMAIL, fmt(t.tema, { lokal }), fmt(t.telo, { lokal, slug }));
  const kopiraj = async () => {
    try {
      await navigator.clipboard.writeText(SCANME_KONTAKT_EMAIL);
      setKopirano(true);
    } catch {
      setKopirano(false);
    }
  };
  return (
    <section
      aria-labelledby="izgled-prilagodjen-naslov"
      data-prilagodjen-dizajn=""
      className="grid gap-2 rounded-[var(--mp-radius-kontrola)] border border-dashed bg-transparent p-3 [--border:var(--mp-ivica-kontrole)] sm:p-4"
    >
      <h2 id="izgled-prilagodjen-naslov" className="text-sm font-semibold">
        {t.naslov}
      </h2>
      <p className="max-w-[60ch] text-[0.8125rem] leading-snug text-[var(--mp-tekst-sporedni)]">{t.opis}</p>
      <a
        href={href}
        className="inline-flex min-h-[var(--mp-meta)] items-center gap-2 justify-self-start rounded-[var(--mp-radius-dugme)] px-1 text-sm font-semibold text-[var(--mp-tekst)] underline decoration-[var(--mp-ivica-kontrole)] underline-offset-4 hover:decoration-[var(--mp-tekst)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]"
      >
        <Mail aria-hidden="true" strokeWidth={1.75} className="size-4" />
        {t.akcija}
      </a>
      <p className="text-[0.8125rem] text-[var(--mp-tekst-sporedni)]">{t.akcijaOpis}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="select-all font-medium tabular-nums text-[var(--mp-tekst)]">{SCANME_KONTAKT_EMAIL}</span>
        <Dugme vrsta="tiho" velicina="kompaktna" ikonica={Copy} onClick={() => void kopiraj()}>
          {t.kopiraj}
        </Dugme>
        <span role="status" className="text-[0.8125rem] text-[var(--mp-tekst-sporedni)]">
          {kopirano ? t.kopirano : null}
        </span>
      </p>
    </section>
  );
}
