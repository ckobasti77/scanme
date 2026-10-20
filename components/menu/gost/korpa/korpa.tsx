"use client";

// ScanMe Menu V1 (K21) — the cart sheet (master §8.2; plan K19 §5.1): the
// lines with ± quantity, the guest's notes, the sum in RSD (on Room service
// the delivery fee once, as its own line), a plain sentence that the order
// goes to the waiter for review and that payment is with the staff, and
// `Pošalji konobaru`. After sending it turns into the confirmation with the
// live status. A refusal keeps the cart and says what to do (new prices,
// unavailable or vanished articles, too many requests). Offline, nothing is
// sent and nothing says "poslato".

import Link from "next/link";
import { Check, Minus, Plus, WifiOff } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import type { CartLine, OrderTotals } from "@/lib/menu/cart";
import { REQUEST_ERROR } from "@/lib/menu/errors/requests";
import { MENU_MAX_CART_QUANTITY } from "@/lib/menu/limits";
import type { MenuRequestChannel, MenuRequestStatus } from "@/lib/menu/request-status";
import { formatRsd } from "../../menu-view";
import { GostList } from "../list";
import type { GostIshod } from "../model";
import { porukaGreske, satBeograd, StatusZahteva } from "../stanje-zahteva";
import styles from "../gost.module.css";

const t = menuGostSr;

export type KorpaGreska = Extract<GostIshod, { ok: false }>;

export type KorpaPotvrda = { requestId: string | null; createdAt: number; status: MenuRequestStatus; totals: OrderTotals | null };

export function Iznos({ rsd }: { rsd: number }) {
  return (
    <span className={styles.iznos}>
      {formatRsd(rsd)}
      <span className={styles.valuta}>RSD</span>
    </span>
  );
}

export function KorpaList({
  kanal,
  mesto,
  linije,
  zbir,
  nedostupni,
  greska,
  salje,
  online,
  potvrda,
  mojiZahteviHref,
  onKolicina,
  onUkloni,
  onPosalji,
  onZatvori,
}: {
  kanal: MenuRequestChannel;
  mesto: string;
  linije: readonly CartLine[];
  zbir: OrderTotals;
  /** Articles "Privremeno nedostupno" right now (live). */
  nedostupni: ReadonlySet<string>;
  greska: KorpaGreska | null;
  salje: boolean;
  online: boolean;
  potvrda: KorpaPotvrda | null;
  mojiZahteviHref: string;
  onKolicina: (id: string, kolicina: number) => void;
  onUkloni: (id: string) => void;
  onPosalji: () => void;
  onZatvori: () => void;
}) {
  const rs = kanal === "room_service";
  const naslov = rs ? t.korpa.naslovRs : t.korpa.naslov;
  const podnaslov = fmt(t.korpa.zaMesto, { mesto });

  if (potvrda) {
    return (
      <GostList
        key="potvrda"
        naslov={rs ? t.potvrda.porudzbinaRs : t.potvrda.porudzbina}
        podnaslov={podnaslov}
        zatvoriOznaka={t.potvrda.zatvori}
        onZatvori={onZatvori}
        oznaka="potvrda"
        podnozje={
          <div className={styles.dvaDugmeta}>
            <Link href={mojiZahteviHref} className={styles.dugmeSporedno}>
              {t.traka.mojiZahtevi}
            </Link>
            <button type="button" className={styles.dugme} onClick={onZatvori}>
              {t.potvrda.nazadNaMeni}
            </button>
          </div>
        }
      >
        <div className={styles.potvrda} role="status">
          <span className={styles.potvrdaZnak} aria-hidden="true">
            <Check className={styles.ikonicaVelika} />
          </span>
          <p className={styles.poruka}>
            {fmt(t.potvrda.vreme, { vreme: satBeograd(potvrda.createdAt) })}
            <StatusZahteva status={potvrda.status} />
          </p>
          {potvrda.totals ? (
            <p>
              {t.korpa.ukupno}: <Iznos rsd={potvrda.totals.totalRsd} />
            </p>
          ) : null}
          <p className={styles.sitno}>{rs ? t.potvrda.porudzbinaRsOpis : t.potvrda.porudzbinaOpis}</p>
        </div>
      </GostList>
    );
  }

  const staleIndeksi = new Set(greska?.code === REQUEST_ERROR.cartStale ? greska.staleLines ?? [] : []);
  const odbijeniNedostupni = new Set(greska?.code === REQUEST_ERROR.cartUnavailable ? greska.unavailableKeys ?? [] : []);
  const problemi = linije.map((linija, index) =>
    nedostupni.has(linija.articleKey) || odbijeniNedostupni.has(linija.articleKey)
      ? ("nedostupno" as const)
      : staleIndeksi.has(index)
        ? ("staro" as const)
        : null,
  );
  const blokirano = problemi.some((problem) => problem !== null);
  const novaCena = greska?.code === REQUEST_ERROR.cartPriceChanged;
  const mozeSlanje = online && !salje && linije.length > 0 && !blokirano;

  return (
    <GostList
      key="korpa"
      naslov={naslov}
      podnaslov={podnaslov}
      zatvoriOznaka={t.korpa.zatvori}
      onZatvori={onZatvori}
      oznaka="korpa"
      podnozje={
        linije.length > 0 ? (
          <>
            <dl className={styles.zbir}>
              {rs && zbir.deliveryFeeRsd > 0 ? (
                <>
                  <div className={styles.zbirRed}>
                    <dt>{t.korpa.artikli}</dt>
                    <dd>
                      <Iznos rsd={zbir.subtotalRsd} />
                    </dd>
                  </div>
                  <div className={styles.zbirRed} data-dostava="">
                    <dt>
                      {t.korpa.dostava} <span className={styles.sitno}>({t.korpa.dostavaJednom})</span>
                    </dt>
                    <dd>
                      <Iznos rsd={zbir.deliveryFeeRsd} />
                    </dd>
                  </div>
                </>
              ) : null}
              <div className={`${styles.zbirRed} ${styles.zbirUkupno}`} data-ukupno={zbir.totalRsd}>
                <dt>{t.korpa.ukupno}</dt>
                <dd>
                  <Iznos rsd={zbir.totalRsd} />
                </dd>
              </div>
            </dl>
            <p className={styles.sitno}>{rs ? t.korpa.proveraOpisRs : t.korpa.proveraOpis}</p>
            {!online ? (
              <p className={styles.bezVeze} role="status">
                <WifiOff aria-hidden="true" className={styles.ikonica} />
                {t.traka.bezVeze}
              </p>
            ) : null}
            <button
              type="button"
              className={styles.dugme}
              disabled={!mozeSlanje}
              aria-busy={salje || undefined}
              onClick={onPosalji}
              data-posalji=""
            >
              {salje ? t.traka.saljeSe : novaCena ? t.korpa.posaljiNovo : rs ? t.korpa.posaljiRs : t.korpa.posalji}
            </button>
          </>
        ) : null
      }
    >
      {greska ? (
        <p className={styles.upozorenje} role="alert" data-greska={greska.code}>
          {novaCena
            ? fmt(t.korpa.ceneNove, { iznos: formatRsd(greska.totals?.totalRsd ?? zbir.totalRsd) })
            : porukaGreske(greska.code)}
        </p>
      ) : null}
      {linije.length === 0 ? (
        <div className={styles.prazno}>
          <p className={styles.linijaNaziv}>{t.korpa.prazno}</p>
          <p className={styles.sitno}>{t.korpa.praznoOpis}</p>
        </div>
      ) : (
        <ul className={styles.linije}>
          {linije.map((linija, index) => {
            const problem = problemi[index];
            const detalji = [linija.variantName, ...linija.addonNames.map((naziv) => `+ ${naziv}`)].filter(Boolean).join(", ");
            return (
              <li key={linija.id} className={styles.linija} data-problem={problem ?? undefined} data-linija={linija.articleKey}>
                <div>
                  <p className={styles.linijaNaziv}>{linija.name}</p>
                  {detalji ? <p className={styles.linijaDetalji}>{detalji}</p> : null}
                  {linija.note ? <p className={styles.linijaDetalji}>{fmt(t.korpa.napomena, { tekst: linija.note })}</p> : null}
                </div>
                <Iznos rsd={linija.pieceRsd * linija.quantity} />
                {problem ? (
                  <p className={styles.linijaProblem}>{problem === "nedostupno" ? t.korpa.nedostupno : t.korpa.nemaViseUMeniju}</p>
                ) : null}
                <div className={styles.linijaDno}>
                  <div className={styles.koraci} role="group" aria-label={fmt(t.korpa.kolicina, { naziv: linija.name })}>
                    <button
                      type="button"
                      className={styles.korak}
                      aria-label={fmt(t.korpa.smanji, { naziv: linija.name })}
                      // One piece stays: removing a line is "Ukloni", never a slip of "−".
                      disabled={linija.quantity <= 1}
                      onClick={() => onKolicina(linija.id, linija.quantity - 1)}
                    >
                      <Minus aria-hidden="true" className={styles.ikonica} />
                    </button>
                    <span className={styles.kolicina}>{linija.quantity}</span>
                    <button
                      type="button"
                      className={styles.korak}
                      aria-label={fmt(t.korpa.povecaj, { naziv: linija.name })}
                      disabled={linija.quantity >= MENU_MAX_CART_QUANTITY}
                      onClick={() => onKolicina(linija.id, linija.quantity + 1)}
                    >
                      <Plus aria-hidden="true" className={styles.ikonica} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.ukloni}
                    aria-label={fmt(t.korpa.ukloniCitac, { naziv: linija.name })}
                    onClick={() => onUkloni(linija.id)}
                  >
                    {t.korpa.ukloni}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GostList>
  );
}
