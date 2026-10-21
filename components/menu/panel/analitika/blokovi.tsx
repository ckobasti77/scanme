// ScanMe Menu V1 (K30) — the blocks of the Analitika section (master §14.1,
// docs/menu/ANALITIKA-DEFINICIJE.md §5). Presentational: each takes the report
// of the query and the state of the data ("malo" = no percentage at all).
// Every number is a `Broj` tied to its explanation; percentages go through
// `udeoPrikaza` (rule of 20). There is no average time to take a request
// anywhere (master §14.3).

import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import type { Metrika } from "@/lib/menu/analitika/definicije";
import { VRSTE_ZAHTEVA, type IzvestajAnalitike } from "@/lib/menu/analitika/izvestaj";
import {
  opsegTekst,
  poredjenjeDostupno,
  prethodniBezPodataka,
  promena,
  udeoPrikaza,
  type StanjePodataka,
} from "@/lib/menu/analitika/prikaz";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { RangLista } from "./rang-lista";
import { Broj, Objasnjenje, objasnjenjeId, PromenaRed, SablonTekst, StaSeBroji, TekstSaBrojem } from "./zajednicko";

const t = menuAnalitikaSr;

/** "Završeno je {p} …": the percent placeholder as the number slot. */
const saProcentom = (sablon: string) => fmt(sablon, { p: "{n}" });

/**
 * The comparison of one metric with the previous period, or nothing (Standard, no comparison, a
 * previous period without data for this metric: lib/menu/analitika/prikaz.ts `poredjenjeDostupno`).
 */
function Poredjenje({
  izvestaj,
  metrika,
  stanje,
  predmet,
}: {
  izvestaj: IzvestajAnalitike;
  metrika: Metrika;
  stanje: StanjePodataka;
  /** What is compared, when the line stands alone in a block ("Poslati zahtevi:"). */
  predmet?: string;
}) {
  if (!izvestaj.prethodni || !poredjenjeDostupno(izvestaj, metrika)) return null;
  return (
    <PromenaRed
      predmet={predmet}
      kljuc={`${metrika}-poredjenje`}
      promena={promena(izvestaj.prethodni.poredjenje[metrika], stanje)}
      dana={izvestaj.period.dana}
      objasnjenje={objasnjenjeId("poredjenje")}
    />
  );
}

/** The sentence that explains every comparison line (Premium). */
export function PoredjenjeObjasnjenje({ izvestaj }: { izvestaj: IzvestajAnalitike }) {
  if (!izvestaj.prethodni) return null;
  const opseg = opsegTekst(izvestaj.prethodni.period, t.meseci);
  if (prethodniBezPodataka(izvestaj)) {
    return (
      <p data-poredjenje="nema" className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">
        {fmt(t.poredjenje.nemaPrethodnog, { opseg })}
      </p>
    );
  }
  return <Objasnjenje kljuc="poredjenje">{fmt(t.poredjenje.objasnjenje, { opseg })}</Objasnjenje>;
}

// -----------------------------------------------------------------------------
// The headline numbers
// -----------------------------------------------------------------------------

function Pokazatelj({
  kljuc,
  children,
  vrednost,
  poredjenje,
}: {
  kljuc: "otvaranja" | "detalji" | "skenovi" | "sesije";
  children?: ReactNode;
  vrednost: ReactNode;
  poredjenje?: ReactNode;
}) {
  const naslovId = `an-pokazatelj-${kljuc}`;
  return (
    <Kartica as="section" aria-labelledby={naslovId} data-pokazatelj={kljuc} className="grid content-start gap-2">
      <h3 id={naslovId} className="text-sm font-semibold text-[var(--mp-tekst-sporedni)]">
        {t.metrike[kljuc].naziv}
      </h3>
      <p className="text-3xl font-semibold leading-none tracking-[-0.02em] text-[var(--mp-tekst)]">{vrednost}</p>
      {poredjenje}
      <Objasnjenje kljuc={kljuc}>{t.metrike[kljuc].objasnjenje}</Objasnjenje>
      {children}
    </Kartica>
  );
}

export function Pokazatelji({ izvestaj, stanje }: { izvestaj: IzvestajAnalitike; stanje: StanjePodataka }) {
  const sesije = izvestaj.sesije;
  const sesijeRazlog = sesije.pokrivenost === null || sesije.pokrivenost === 0 ? t.sesije.neMere : t.sesije.nepouzdane;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {(["otvaranja", "detalji", "skenovi"] as const).map((kljuc) => (
        <Pokazatelj
          key={kljuc}
          kljuc={kljuc}
          vrednost={<Broj kljuc={kljuc} vrednost={izvestaj.metrike[kljuc].ukupno} objasnjenje={objasnjenjeId(kljuc)} />}
          poredjenje={<Poredjenje izvestaj={izvestaj} metrika={kljuc} stanje={stanje} />}
        />
      ))}
      {sesije.broj !== null ? (
        <Pokazatelj
          kljuc="sesije"
          vrednost={<Broj kljuc="sesije" vrednost={sesije.broj} objasnjenje={objasnjenjeId("sesije")} />}
          poredjenje={<Poredjenje izvestaj={izvestaj} metrika="sesije" stanje={stanje} />}
        />
      ) : (
        <Pokazatelj kljuc="sesije" vrednost={<span className="text-xl text-[var(--mp-tekst-sporedni)]">{t.sesije.nedostupno}</span>}>
          <p data-sesije="nedostupno" className="text-sm leading-relaxed text-[var(--mp-tekst)]">
            {sesijeRazlog}
          </p>
        </Pokazatelj>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Requests
// -----------------------------------------------------------------------------

const KOLONE = ["poslato", "prihvaceno", "zavrseno", "otkazano"] as const;

export function ZahteviBlok({ izvestaj, stanje, className }: { izvestaj: IzvestajAnalitike; stanje: StanjePodataka; className?: string }) {
  const z = izvestaj.zahtevi;
  const zbir = Object.fromEntries(KOLONE.map((kolona) => [kolona, VRSTE_ZAHTEVA.reduce((a, vrsta) => a + z[vrsta][kolona], 0)])) as Record<
    (typeof KOLONE)[number],
    number
  >;
  const prazno = KOLONE.every((kolona) => zbir[kolona] === 0);
  const udeo = udeoPrikaza(zbir.zavrseno, zbir.poslato, stanje);
  const otkazao = izvestaj.zahteviOtkazao;
  const roomService = izvestaj.porudzbinePoKanalu.roomService;
  const obj = (kolona: string) => objasnjenjeId(`zahtevi-${kolona}`);

  return (
    <Kartica data-blok="zahtevi" className={className}>
      <OkvirSekcije id="an-zahtevi" naslov={t.zahtevi.naslov} opis={t.zahtevi.opis}>
        {prazno ? (
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.zahtevi.prazno}</p>
        ) : (
          <div className="grid gap-3">
            <Poredjenje izvestaj={izvestaj} metrika="zahtevi" stanje={stanje} predmet={t.poredjenje.zahtevi} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[19rem] text-sm">
                <caption className="sr-only">{t.zahtevi.naslov}</caption>
                <thead>
                  <tr className="text-[var(--mp-tekst-sporedni)]">
                    <th scope="col" className="py-2 pr-2 text-left text-xs font-semibold sm:text-sm">
                      {t.zahtevi.kolone.vrsta}
                    </th>
                    {KOLONE.map((kolona) => (
                      <th key={kolona} scope="col" className="px-1 py-2 text-right text-xs font-semibold sm:px-2 sm:text-sm">
                        {t.zahtevi.kolone[kolona]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {VRSTE_ZAHTEVA.map((vrsta) => (
                    <tr key={vrsta} data-vrsta={vrsta} className="border-t [--border:var(--mp-ivica)]">
                      <th scope="row" className="py-2 pr-2 text-left font-medium text-[var(--mp-tekst)]">
                        {t.zahtevi.vrste[vrsta]}
                      </th>
                      {KOLONE.map((kolona) => (
                        <td key={kolona} className="px-1 py-2 text-right sm:px-2">
                          <Broj kljuc={`zahtevi-${vrsta}-${kolona}`} vrednost={z[vrsta][kolona]} objasnjenje={obj(kolona)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 [--border:var(--mp-ivica-kontrole)] font-semibold">
                    <th scope="row" className="py-2 pr-2 text-left">
                      {t.zahtevi.ukupno}
                    </th>
                    {KOLONE.map((kolona) => (
                      <td key={kolona} className="px-1 py-2 text-right sm:px-2">
                        <Broj kljuc={`zahtevi-ukupno-${kolona}`} vrednost={zbir[kolona]} objasnjenje={obj(kolona)} />
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="grid gap-1 text-sm text-[var(--mp-tekst)]">
              {udeo !== null ? (
                <p>
                  <TekstSaBrojem sablon={saProcentom(t.zahtevi.udeo)}>
                    <Broj kljuc="zahtevi-udeo" vrednost={udeo} objasnjenje={obj("udeo")} procenat className="font-semibold" />
                  </TekstSaBrojem>
                </p>
              ) : null}
              {zbir.otkazano > 0 ? (
                <p>
                  <SablonTekst
                    sablon={t.zahtevi.otkazali}
                    delovi={{
                      gost: <Broj kljuc="zahtevi-otkazao-gost" vrednost={otkazao.gost} objasnjenje={obj("otkazali")} />,
                      osoblje: <Broj kljuc="zahtevi-otkazao-osoblje" vrednost={otkazao.osoblje} objasnjenje={obj("otkazali")} />,
                    }}
                  />
                </p>
              ) : null}
              {roomService > 0 ? (
                <p>
                  <TekstSaBrojem sablon={t.zahtevi.roomService}>
                    <Broj kljuc="zahtevi-room-service" vrednost={roomService} objasnjenje={obj("room-service")} />
                  </TekstSaBrojem>
                </p>
              ) : null}
            </div>
            <StaSeBroji
              stavke={[
                ...KOLONE.map((kolona) => ({ kljuc: `zahtevi-${kolona}`, tekst: t.zahtevi.objasnjenja[kolona] })),
                { kljuc: "zahtevi-udeo", tekst: t.zahtevi.udeoObjasnjenje },
                { kljuc: "zahtevi-otkazali", tekst: t.zahtevi.otkazaliObjasnjenje },
                { kljuc: "zahtevi-room-service", tekst: t.zahtevi.roomServiceObjasnjenje },
              ]}
            />
          </div>
        )}
      </OkvirSekcije>
    </Kartica>
  );
}

// -----------------------------------------------------------------------------
// Reservations
// -----------------------------------------------------------------------------

const REZERVACIJE = ["poslato", "prihvaceno", "predlozeno", "odbijeno", "realizovano", "otkazano"] as const;

export function RezervacijeBlok({ izvestaj, stanje, className }: { izvestaj: IzvestajAnalitike; stanje: StanjePodataka; className?: string }) {
  const r = izvestaj.rezervacije;
  const prazno = REZERVACIJE.every((kljuc) => r[kljuc] === 0);
  const udeo = udeoPrikaza(r.prihvaceno, r.poslato, stanje);
  const obj = (kljuc: string) => objasnjenjeId(`rezervacije-${kljuc}`);
  return (
    <Kartica data-blok="rezervacije" className={className}>
      <OkvirSekcije id="an-rezervacije" naslov={t.rezervacije.naslov} opis={t.rezervacije.opis}>
        {prazno ? (
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.rezervacije.prazno}</p>
        ) : (
          <div className="grid gap-3">
            <Poredjenje izvestaj={izvestaj} metrika="rezervacije" stanje={stanje} predmet={t.poredjenje.rezervacije} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {REZERVACIJE.map((kljuc) => (
                <div key={kljuc} data-rezervacije={kljuc} className="grid content-start gap-0.5 border-t pt-2 [--border:var(--mp-ivica)]">
                  <dt className="text-sm text-[var(--mp-tekst-sporedni)]">{t.rezervacije.stavke[kljuc].naziv}</dt>
                  <dd className="text-xl font-semibold text-[var(--mp-tekst)]">
                    <Broj kljuc={`rezervacije-${kljuc}`} vrednost={r[kljuc]} objasnjenje={obj(kljuc)} />
                  </dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-1 text-sm text-[var(--mp-tekst)]">
              {udeo !== null ? (
                <p>
                  <TekstSaBrojem sablon={saProcentom(t.rezervacije.udeo)}>
                    <Broj kljuc="rezervacije-udeo" vrednost={udeo} objasnjenje={obj("udeo")} procenat className="font-semibold" />
                  </TekstSaBrojem>
                </p>
              ) : null}
              {r.otkazano > 0 ? (
                <p>
                  <SablonTekst
                    sablon={t.rezervacije.otkazali}
                    delovi={{
                      gost: <Broj kljuc="rezervacije-otkazao-gost" vrednost={r.otkazao.gost} objasnjenje={obj("otkazali")} />,
                      osoblje: <Broj kljuc="rezervacije-otkazao-osoblje" vrednost={r.otkazao.osoblje} objasnjenje={obj("otkazali")} />,
                    }}
                  />
                </p>
              ) : null}
            </div>
            <StaSeBroji
              stavke={[
                ...REZERVACIJE.map((kljuc) => ({ kljuc: `rezervacije-${kljuc}`, tekst: t.rezervacije.stavke[kljuc].objasnjenje })),
                { kljuc: "rezervacije-udeo", tekst: t.rezervacije.udeoObjasnjenje },
                { kljuc: "rezervacije-otkazali", tekst: t.rezervacije.otkazaliObjasnjenje },
              ]}
            />
          </div>
        )}
      </OkvirSekcije>
    </Kartica>
  );
}

// -----------------------------------------------------------------------------
// Most opened articles, scans per card
// -----------------------------------------------------------------------------

export function NajotvaranijiBlok({ izvestaj, className }: { izvestaj: IzvestajAnalitike; className?: string }) {
  return (
    <Kartica data-blok="najotvaraniji" className={className}>
      <OkvirSekcije id="an-najotvaraniji" naslov={t.najotvaraniji.naslov}>
        <Objasnjenje kljuc="najotvaraniji">{t.najotvaraniji.opis}</Objasnjenje>
        {izvestaj.najotvaraniji.length === 0 ? (
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.najotvaraniji.prazno}</p>
        ) : (
          <RangLista
            kljuc="najotvaraniji"
            stavke={izvestaj.najotvaraniji.map((a) => ({ kljuc: a.artikal, naziv: a.naziv, broj: a.broj }))}
            jedinica={t.najotvaraniji.broj}
            objasnjenje={objasnjenjeId("najotvaraniji")}
          />
        )}
      </OkvirSekcije>
    </Kartica>
  );
}

/** Cards shown by name; the rest of the scans are one "Ostale kartice" row (the list stays as long as the articles). */
const PRIKAZANIH_KARTICA = 10;

export function KarticeBlok({ izvestaj, className }: { izvestaj: IzvestajAnalitike; className?: string }) {
  const prikazane = izvestaj.skenovi.slice(0, PRIKAZANIH_KARTICA);
  // Everything not listed by name: ranks past 10, cards past the 20 the query names and cards no longer in this menu.
  const ostale = Math.max(0, izvestaj.metrike.skenovi.ukupno - prikazane.reduce((a, k) => a + k.broj, 0));
  return (
    <Kartica data-blok="kartice" className={className}>
      <OkvirSekcije id="an-kartice" naslov={t.kartice.naslov}>
        <Objasnjenje kljuc="kartice">{t.kartice.opis}</Objasnjenje>
        {izvestaj.skenovi.length === 0 ? (
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.kartice.prazno}</p>
        ) : (
          <RangLista
            kljuc="kartice"
            stavke={[
              ...prikazane.map((k) => ({ kljuc: k.kartica, naziv: k.naziv, broj: k.broj })),
              ...(ostale > 0 ? [{ kljuc: "ostale", naziv: t.kartice.ostale, broj: ostale, ostalo: true }] : []),
            ]}
            jedinica={t.kartice.broj}
            objasnjenje={objasnjenjeId("kartice")}
          />
        )}
      </OkvirSekcije>
    </Kartica>
  );
}

// -----------------------------------------------------------------------------
// Premium: the guest flow; Standard: what Premium adds
// -----------------------------------------------------------------------------

const KORACI = ["detalj", "zahtev", "porudzbina", "rezervacija"] as const;
const KORAK_BROJ = { detalj: "saDetaljem", zahtev: "saZahtevom", porudzbina: "saPorudzbinom", rezervacija: "saRezervacijom" } as const;

export function TokBlok({ izvestaj, stanje, className }: { izvestaj: IzvestajAnalitike; stanje: StanjePodataka; className?: string }) {
  const k = izvestaj.konverzije;
  return (
    <Kartica data-blok="tok" className={className}>
      <OkvirSekcije id="an-tok" naslov={t.tok.naslov} opis={t.tok.opis}>
        {k === null ? (
          <p data-tok="nedostupno" className="text-sm text-[var(--mp-tekst)]">
            {t.tok.nedostupno}
          </p>
        ) : (
          <div className="grid gap-3">
            <RangLista
              kljuc="tok"
              numerisano={false}
              jedinica={t.tok.broj}
              objasnjenje={objasnjenjeId("tok-sesije")}
              udeoSablon={t.tok.udeo}
              stavke={[
                { kljuc: "sesije", naziv: t.tok.koraci.sesije.naziv, broj: k.sesije, objasnjenje: objasnjenjeId("tok-sesije") },
                ...KORACI.map((korak) => ({
                  kljuc: korak,
                  naziv: t.tok.koraci[korak].naziv,
                  broj: k[KORAK_BROJ[korak]],
                  udeo: stanje === "dovoljno" ? k.udeo[korak] : null,
                  objasnjenje: objasnjenjeId(`tok-${korak}`),
                })),
              ]}
            />
            <StaSeBroji
              stavke={(["sesije", ...KORACI] as const).map((korak) => ({ kljuc: `tok-${korak}`, tekst: t.tok.koraci[korak].objasnjenje }))}
            />
          </div>
        )}
      </OkvirSekcije>
    </Kartica>
  );
}

export function PremiumKartica({ paketHref, className }: { paketHref: string | null; className?: string }) {
  return (
    <Kartica ton="utisana" data-blok="premium" className={cn("grid gap-3", className)}>
      <OkvirSekcije
        id="an-premium"
        naslov={t.premium.naslov}
        radnje={
          <StatusOznaka ton="neutralno" velicina="mala" ikonica={Lock}>
            {t.premium.oznaka}
          </StatusOznaka>
        }
      >
        <p className="text-sm leading-relaxed text-[var(--mp-tekst)]">{t.premium.opis}</p>
        <ul className="grid gap-1.5 text-sm text-[var(--mp-tekst)] sm:grid-cols-2">
          {t.premium.stavke.map((stavka) => (
            <li key={stavka} className="flex items-start gap-2">
              <Lock aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-[var(--mp-tekst-sporedni)]" />
              {stavka}
            </li>
          ))}
        </ul>
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.premium.razlog}</p>
        {paketHref ? (
          <div>
            <Dugme asChild vrsta="sekundarno" velicina="kompaktna">
              <Link href={paketHref}>{t.premium.paket}</Link>
            </Dugme>
          </div>
        ) : null}
      </OkvirSekcije>
    </Kartica>
  );
}

export function KakoBrojimo({ className }: { className?: string }) {
  return (
    <Kartica ton="utisana" data-blok="kako-brojimo" className={className}>
      <OkvirSekcije id="an-kako-brojimo" naslov={t.kakoBrojimo.naslov}>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm leading-relaxed text-[var(--mp-tekst)] lg:grid-cols-2 lg:gap-x-10">
          {t.kakoBrojimo.stavke.map((stavka) => (
            <li key={stavka}>{stavka}</li>
          ))}
        </ul>
      </OkvirSekcije>
    </Kartica>
  );
}
