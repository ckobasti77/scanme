// ScanMe Menu V1 (K22) — the place of the floor view until K23 builds it
// (master §10.3). An honest state, never a fake floor: every request is in
// the work queue meanwhile.

import { LayoutGrid } from "lucide-react";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { Dugme } from "../zajednicko/dugme";
import { PraznoStanje } from "../zajednicko/stanja";

const t = menuKonobarSr.sala;

export function SalaUskoro({ onRadniRed }: { onRadniRed?: () => void }) {
  return (
    <section aria-labelledby="sala-naslov" className="grid content-start gap-4" data-sala="uskoro">
      <h2 id="sala-naslov" className="text-xl font-bold text-[var(--mp-tekst)]">
        {t.naslov}
      </h2>
      <PraznoStanje
        ikonica={LayoutGrid}
        nivo={3}
        naslov={t.uskoroNaslov}
        opis={t.uskoroOpis}
        akcija={
          onRadniRed ? (
            <Dugme vrsta="sekundarno" onClick={onRadniRed} className="lg:hidden">
              {t.naRed}
            </Dugme>
          ) : undefined
        }
        className="rounded-[var(--mp-radius-kartica)] border border-dashed bg-[var(--mp-povrsina)] [--border:var(--mp-ivica-kontrole)]"
      />
    </section>
  );
}
