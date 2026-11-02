// ScanMe Menu V1 — the honest state of an izlog screen that a later step
// builds (K07): the screen's name, which step builds it, and links to the
// other screens of the same route. Never a fake screen.

import { Construction } from "lucide-react";
import Link from "next/link";
import { fmt } from "@/lib/i18n/format";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { Dugme } from "../zajednicko/dugme";
import { Kartica } from "../zajednicko/kartica";
import { OkvirSekcije } from "../zajednicko/okvir-sekcije";
import { PraznoStanje } from "../zajednicko/stanja";
import { ZaglavljeSaStatusom } from "../zajednicko/zaglavlje-sa-statusom";

const t = menuZajednickoSr.izlog;

export type IzlogEkranLink = { href: string; oznaka: string; trenutni: boolean };

export function IzlogKorak({
  kontekst,
  naslov,
  korak,
  napomena,
  ekrani,
}: {
  kontekst: string;
  naslov: string;
  korak: string;
  /** One more honest sentence (e.g. the offline state of this screen belongs to another step). */
  napomena?: string;
  ekrani: readonly IzlogEkranLink[];
}) {
  return (
    <>
      <ZaglavljeSaStatusom kontekst={kontekst} naslov={naslov} />
      <Kartica data-izlog-korak={korak}>
        <PraznoStanje
          ikonica={Construction}
          naslov={fmt(t.korakNaslov, { korak })}
          opis={
            <>
              {fmt(t.korakOpis, { korak })}
              {napomena ? (
                <>
                  <br />
                  {napomena}
                </>
              ) : null}
            </>
          }
        />
      </Kartica>
      <OkvirSekcije naslov={t.ostaliEkrani}>
        <ul className="flex flex-wrap gap-2">
          {ekrani.map((ekran) => (
            <li key={ekran.href}>
              <Dugme asChild vrsta={ekran.trenutni ? "primarno" : "sekundarno"} velicina="kompaktna">
                <Link href={ekran.href} aria-current={ekran.trenutni ? "page" : undefined}>
                  {ekran.oznaka}
                </Link>
              </Dugme>
            </li>
          ))}
        </ul>
      </OkvirSekcije>
    </>
  );
}
