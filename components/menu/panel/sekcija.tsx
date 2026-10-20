// ScanMe Menu V1 — the honest state of a panel section whose screen is not
// built yet (K08; filled by K27–K30). The header says "U pripremi"; one card
// says what the person will do here and lists what is coming — from the
// master spec, never a number (master §20). A line a role will not see (the
// Operativa summary for an Urednik) is left out; Premium lines say so, with a
// lock on the Standard plan. Every section points to the one thing that works
// today: the Editor. Presentational: the route and the izlog pass plan and role.

import {
  Activity,
  ChartColumn,
  CircleCheck,
  CircleDashed,
  House,
  Lock,
  QrCode,
  Settings,
  SlidersHorizontal,
  SquarePen,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { MenuPanelDict, MenuPanelSekcijaUPripremi } from "@/lib/i18n/types";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { roleCan, type MenuActor } from "@/lib/menu/permissions";
import type { MenuTier } from "@/lib/menu/capabilities";
import { Dugme } from "../zajednicko/dugme";
import { Kartica } from "../zajednicko/kartica";
import { StatusOznaka } from "../zajednicko/status-oznaka";
import { ZaglavljeSaStatusom } from "../zajednicko/zaglavlje-sa-statusom";

// Widened to the interface: the lists differ per section (some lines are Premium).
const t: MenuPanelDict = menuPanelSr;

const IKONICA: Readonly<Record<MenuPanelSekcijaUPripremi, LucideIcon>> = {
  pocetna: House,
  operativa: Activity,
  lokal: QrCode,
  funkcionalnosti: SlidersHorizontal,
  tim: UsersRound,
  analitika: ChartColumn,
  podesavanja: Settings,
};

export function SekcijaUPripremi({
  sekcija,
  plan,
  actor,
  editorHref,
}: {
  sekcija: MenuPanelSekcijaUPripremi;
  plan: MenuTier;
  actor: MenuActor;
  /** Where "Otvori Editor" leads; omit it for a role without the Editor. */
  editorHref?: string;
}) {
  const Ikonica = IKONICA[sekcija];
  const stavke = t.sekcija.stavke[sekcija].filter((stavka) => !stavka.dozvola || roleCan(actor, stavka.dozvola));
  const imaPremium = stavke.some((stavka) => stavka.premium);
  const napomena = actor === "manager" ? t.sekcija.napomenaMenadzer[sekcija] : undefined;
  const naslovKartice = `menu-panel-${sekcija}-naslov`;
  const naslovListe = `menu-panel-${sekcija}-dolazi`;

  return (
    <>
      <ZaglavljeSaStatusom
        naslov={t.sekcije[sekcija]}
        status={
          <StatusOznaka ton="neutralno" ikonica={CircleDashed}>
            {t.sekcija.uPripremi}
          </StatusOznaka>
        }
        opis={t.sekcija.opisi[sekcija]}
      />
      <Kartica
        as="section"
        aria-labelledby={naslovKartice}
        data-sekcija-u-pripremi={sekcija}
        className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10"
      >
        <div className="grid content-start justify-items-start gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-[var(--mp-akcent-meko)] text-[var(--mp-akcent-tekst)]">
            <Ikonica aria-hidden="true" strokeWidth={1.75} className="size-6" />
          </span>
          <h2 id={naslovKartice} className="text-lg font-semibold leading-snug tracking-[-0.01em] text-[var(--mp-tekst)]">
            {t.sekcija.praznoNaslov}
          </h2>
          <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-[var(--mp-tekst-sporedni)]">
            {t.sekcija.praznoOpis[sekcija]}
          </p>
          {editorHref ? (
            <div className="mt-3 grid justify-items-start gap-3 border-t pt-4 [--border:var(--mp-ivica)]">
              <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-[var(--mp-tekst)]">{t.sekcija.zaSadaEditor}</p>
              <Dugme asChild vrsta={sekcija === "pocetna" ? "primarno" : "sekundarno"}>
                <Link href={editorHref}>
                  <SquarePen aria-hidden="true" strokeWidth={1.75} />
                  {t.sekcija.otvoriEditor}
                </Link>
              </Dugme>
            </div>
          ) : null}
        </div>
        <div className="grid content-start gap-3 rounded-[var(--mp-radius-unutra)] bg-[var(--mp-povrsina-utisana)] p-4 sm:p-5">
          <h3 id={naslovListe} className="text-base font-semibold leading-snug text-[var(--mp-tekst)]">
            {t.sekcija.staDolazi}
          </h3>
          <ul aria-labelledby={naslovListe} className="grid gap-2.5">
            {stavke.map((stavka) => (
              <li key={stavka.tekst} className="flex items-start gap-3 text-[0.9375rem] leading-relaxed">
                <span aria-hidden="true" className="mt-[0.6rem] size-1.5 shrink-0 rounded-full bg-[var(--mp-tekst-sporedni)]" />
                <span className="min-w-0 flex-1 text-[var(--mp-tekst)]">
                  {stavka.tekst}
                  {stavka.premium ? (
                    <>
                      {" "}
                      <StatusOznaka
                        ton="neutralno"
                        velicina="mala"
                        ikonica={plan === "premium" ? CircleCheck : Lock}
                        className="ml-1 align-middle"
                      >
                        {t.sekcija.premiumOznaka}
                        <span className="sr-only">
                          {", "}
                          {plan === "premium" ? t.sekcija.premiumUkljucen : t.sekcija.premiumZakljucan}
                        </span>
                      </StatusOznaka>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {imaPremium && plan !== "premium" ? (
            <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.sekcija.premiumNapomena}</p>
          ) : null}
          {napomena ? (
            <p className="border-t pt-3 text-sm leading-relaxed text-[var(--mp-tekst-sporedni)] [--border:var(--mp-ivica)]">
              {napomena}
            </p>
          ) : null}
        </div>
      </Kartica>
    </>
  );
}
