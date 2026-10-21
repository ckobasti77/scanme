"use client";

// ScanMe Menu V1 (K21) — the guest's actions on a menu opened from a QR card
// that stands on a table or in a room (master §8.1–§8.4, §9.1; plan K19 §5.1):
// a bar fixed to the bottom with the place ("Sto 12"), `Pozovi konobara`,
// `Račun` (cash or card), `Korpa` (orders go to the waiter for review) or, for
// a room on a standard page, the way to Room service; "Moji zahtevi" with the
// number of open requests. Each action shows only when the venue turned it on
// and the place allows it (lib/menu/guest-actions.ts); with none, no bar.
//
// What the guest learns is always the server's answer: "poslato" only after
// the server confirmed it, then the live status (Novi → Prihvaćen → Završen,
// or Otkazan); a refusal says what to do. Offline, nothing is sent. The data
// and the actions come from the caller (Server Actions + Convex on the real
// route, memory in the izlog).

import Link from "next/link";
import { Bell, ConciergeBell, ListChecks, MapPin, ReceiptText, ShoppingBag, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { cartCount, orderFingerprint, orderLinesOf, orderTotals, type CartLine } from "@/lib/menu/cart";
import { trackJavni } from "@/lib/menu/analitika/track";
import { REQUEST_ERROR } from "@/lib/menu/errors/requests";
import { isOpenStatus, type MenuPaymentPreference, type MenuRequestStatus } from "@/lib/menu/request-status";
import { KorpaList, type KorpaGreska, type KorpaPotvrda } from "./korpa/korpa";
import type { GostIshod, GostKontekst, GostRadnje, GostZahtev } from "./model";
import { RacunList } from "./racun";
import { porukaGreske, satBeograd, StatusZahteva } from "./stanje-zahteva";
import { kljucSlanja, pratiDodavanje, useKorpa, zavrsiSlanje } from "./use-korpa";
import { useVeza } from "./use-veza";
import styles from "./gost.module.css";

const t = menuGostSr;

/** What the bar says after a call or a bill (the server's answer). */
export type TrakaPotvrda = {
  vrsta: "call" | "bill";
  requestId: string | null;
  createdAt: number;
  status: MenuRequestStatus;
  deduped: boolean;
  /** The open request was sent from another phone: its status is not followed here. */
  tudji: boolean;
  nacin: MenuPaymentPreference | null;
};

/** The izlog's starting state (`korpa=1`, `zahtev=…`, `greska=…`); the real route starts empty. */
export type GostPocetno = {
  linije?: readonly CartLine[];
  list?: "korpa" | "racun" | null;
  traka?: TrakaPotvrda | null;
  korpaPotvrda?: KorpaPotvrda | null;
  korpaGreska?: KorpaGreska | null;
};

/** After this long without an answer the buttons come back (the guest checks Moji zahtevi or retries). */
const ROK_MS = 15_000;

async function bezbedno(posao: () => Promise<GostIshod>): Promise<GostIshod> {
  let tajmer: ReturnType<typeof setTimeout> | undefined;
  const rok = new Promise<GostIshod>((resolve) => {
    tajmer = setTimeout(() => resolve({ ok: false, code: "network" }), ROK_MS);
  });
  try {
    return await Promise.race([posao(), rok]);
  } catch {
    return { ok: false, code: "network" };
  } finally {
    clearTimeout(tajmer);
  }
}

export function GostPanel({
  kontekst,
  radnje,
  zahtevi,
  nedostupni,
  cuvaj = true,
  offline = false,
  pocetno = {},
}: {
  kontekst: GostKontekst;
  radnje: GostRadnje;
  /** This phone's requests (live); undefined while loading. */
  zahtevi: readonly GostZahtev[] | undefined;
  /** Articles "Privremeno nedostupno" right now. */
  nedostupni: readonly string[];
  cuvaj?: boolean;
  /** Force the offline state (the izlog's `veza=offline`). */
  offline?: boolean;
  pocetno?: GostPocetno;
}) {
  const { slug, pozicija, kanal } = kontekst;
  const korpa = useKorpa(slug, kanal, { cuvaj, pocetne: pocetno.linije });
  const online = useVeza(offline);
  const [list, setList] = useState<"korpa" | "racun" | null>(pocetno.list ?? null);
  const [salje, setSalje] = useState<"call" | "bill" | "order" | null>(null);
  const [traka, setTraka] = useState<TrakaPotvrda | null>(pocetno.traka ?? null);
  const [trakaGreska, setTrakaGreska] = useState<string | null>(null);
  const [korpaPotvrda, setKorpaPotvrda] = useState<KorpaPotvrda | null>(pocetno.korpaPotvrda ?? null);
  const [korpaGreska, setKorpaGreska] = useState<KorpaGreska | null>(pocetno.korpaGreska ?? null);
  const [dodato, setDodato] = useState<string | null>(null);
  // Room service: the fee the server answered with replaces the one of the page load.
  const [dostava, setDostava] = useState<number | null>(kontekst.dostavaRsd);

  useEffect(() => pratiDodavanje((naziv) => setDodato(naziv)), []);
  useEffect(() => {
    if (!dodato) return;
    const tajmer = setTimeout(() => setDodato(null), 5000);
    return () => clearTimeout(tajmer);
  }, [dodato]);

  const nedostupniSet = new Set(nedostupni);
  const zbir = orderTotals(korpa.linije, kanal, dostava);
  const uKorpi = cartCount(korpa.linije);
  const otvoreni = (zahtevi ?? []).filter((zahtev) => isOpenStatus(zahtev.status)).length;
  const zivo = (requestId: string | null, status: MenuRequestStatus) =>
    (requestId ? zahtevi?.find((zahtev) => zahtev.id === requestId)?.status : undefined) ?? status;

  const korpaVidljiva = kanal === "room_service" ? kontekst.radnje.roomService : kontekst.radnje.order;
  const rsLink = kanal === "standard" && kontekst.radnje.roomService ? kontekst.linkovi.roomService : null;
  const imaRadnji = kontekst.radnje.call || kontekst.radnje.bill || korpaVidljiva || rsLink !== null;
  if (!imaRadnji) return null;

  const stoZahtev = async (vrsta: "call" | "bill", nacin: MenuPaymentPreference | null) => {
    if (!online || salje) return;
    setSalje(vrsta);
    setTrakaGreska(null);
    setDodato(null);
    const ishod = await bezbedno(() => (vrsta === "call" ? radnje.pozovi() : radnje.racun(nacin ?? "cash")));
    setSalje(null);
    setList(null);
    if (ishod.ok) {
      // K29: a step of the conversion flow (counted only inside a session; a no-op without context).
      if (!ishod.deduped) trackJavni({ vrsta: "korak", korak: "zahtev" });
      setTraka({
        vrsta,
        requestId: ishod.requestId,
        createdAt: ishod.createdAt,
        status: ishod.status,
        deduped: ishod.deduped,
        tudji: ishod.deduped && ishod.requestId === null,
        nacin: ishod.paymentPreference ?? nacin,
      });
    } else {
      setTraka(null);
      setTrakaGreska(porukaGreske(ishod.code));
    }
  };

  const posalji = async () => {
    if (!online || salje || korpa.linije.length === 0) return;
    setSalje("order");
    setKorpaGreska(null);
    const linije = orderLinesOf(korpa.linije);
    const kljuc = kljucSlanja(slug, kanal, orderFingerprint(linije), cuvaj);
    const ishod = await bezbedno(() => radnje.posalji({ kanal, linije, videnUkupnoRsd: zbir.totalRsd, kljuc }));
    setSalje(null);
    if (ishod.ok) {
      if (!ishod.deduped) trackJavni({ vrsta: "korak", korak: "porudzbina" });
      zavrsiSlanje(slug, kanal, cuvaj);
      korpa.isprazni();
      setKorpaPotvrda({ requestId: ishod.requestId, createdAt: ishod.createdAt, status: ishod.status, totals: ishod.totals });
      return;
    }
    if (ishod.code === REQUEST_ERROR.cartPriceChanged) {
      if (ishod.prices) korpa.primeniCene(ishod.prices);
      if (kanal === "room_service" && ishod.totals) setDostava(ishod.totals.deliveryFeeRsd > 0 ? ishod.totals.deliveryFeeRsd : null);
    }
    setKorpaGreska(ishod);
  };

  const zatvoriKorpu = () => {
    setList(null);
    // The confirmation is shown once; the next open is the (empty) cart.
    if (korpaPotvrda) setKorpaPotvrda(null);
  };

  const mesto = pozicija.naziv;
  const poruka = trakaGreska ? (
    <p className={styles.poruka} data-vrsta="greska" role="alert">
      {trakaGreska}
    </p>
  ) : traka ? (
    <p className={styles.poruka} data-potvrda={traka.vrsta}>
      {traka.vrsta === "call" ? (
        <Bell aria-hidden="true" className={styles.ikonica} />
      ) : (
        <ReceiptText aria-hidden="true" className={styles.ikonica} />
      )}
      <span>
        {traka.tudji
          ? fmt(traka.vrsta === "call" ? t.potvrda.vecPoslatPozivDrugi : t.potvrda.vecPoslatRacunDrugi, { mesto })
          : traka.deduped
          ? fmt(traka.vrsta === "call" ? t.potvrda.vecPoslatPoziv : t.potvrda.vecPoslatRacun, { mesto })
          : traka.vrsta === "call"
            ? t.potvrda.poziv
            : t.potvrda.racun}
        {" · "}
        {satBeograd(traka.createdAt)}
        {traka.vrsta === "bill" && traka.nacin ? ` · ${menuDomenSr.paymentPreferences[traka.nacin]}` : null}
      </span>
      {/* Another phone's request is not followed live here, so its status is not claimed. */}
      {traka.tudji ? null : <StatusZahteva status={zivo(traka.requestId, traka.status)} />}
    </p>
  ) : dodato ? (
    <p className={styles.poruka}>{fmt(t.traka.dodato, { naziv: dodato })}</p>
  ) : null;

  return (
    <>
      <div className={styles.razmak} aria-hidden="true" />
      <section className={styles.traka} aria-label={t.traka.oblast} data-traka-gosta="">
        <div className={styles.trakaVrh}>
          <span className={styles.mesto}>
            <MapPin aria-hidden="true" className={styles.ikonica} />
            <span>
              <span className={styles.vizuelnoSkriveno}>{fmt(t.traka.mesto, { mesto: "" })}</span>
              {mesto}
            </span>
          </span>
          <Link href={kontekst.linkovi.mojiZahtevi} className={styles.mojiLink} data-moji-link="">
            <ListChecks aria-hidden="true" className={styles.ikonica} />
            {t.traka.mojiZahtevi}
            {otvoreni > 0 ? (
              <>
                <span className={styles.broj} aria-hidden="true">
                  {otvoreni}
                </span>
                <span className={styles.vizuelnoSkriveno}>
                  {fmt(t.traka.otvoreni[srPluralCategory(otvoreni)], { n: otvoreni })}
                </span>
              </>
            ) : null}
          </Link>
        </div>
        {!online ? (
          <p className={styles.bezVeze} role="status">
            <WifiOff aria-hidden="true" className={styles.ikonica} />
            {t.traka.bezVeze}
          </p>
        ) : null}
        <div className={styles.zivo} aria-live="polite" aria-atomic="true">
          {poruka}
        </div>
        <div className={styles.radnje} role="group" aria-label={t.traka.oblast}>
          {kontekst.radnje.call ? (
            <button
              type="button"
              className={styles.radnja}
              disabled={!online || salje !== null}
              aria-busy={salje === "call" || undefined}
              onClick={() => stoZahtev("call", null)}
              data-radnja="poziv"
            >
              <Bell aria-hidden="true" className={styles.ikonicaVelika} />
              {salje === "call" ? t.traka.saljeSe : t.traka.pozovi}
            </button>
          ) : null}
          {kontekst.radnje.bill ? (
            <button
              type="button"
              className={styles.radnja}
              disabled={salje !== null}
              aria-haspopup="dialog"
              onClick={() => {
                setTrakaGreska(null);
                setList("racun");
              }}
              data-radnja="racun"
            >
              <ReceiptText aria-hidden="true" className={styles.ikonicaVelika} />
              {salje === "bill" ? t.traka.saljeSe : t.traka.racun}
            </button>
          ) : null}
          {rsLink ? (
            <Link href={rsLink} className={styles.radnja} data-glavna="" data-radnja="room-service">
              <ConciergeBell aria-hidden="true" className={styles.ikonicaVelika} />
              {t.traka.roomService}
            </Link>
          ) : null}
          {korpaVidljiva ? (
            <button
              type="button"
              className={styles.radnja}
              data-glavna={uKorpi > 0 ? "" : undefined}
              aria-haspopup="dialog"
              aria-label={fmt(t.traka.korpaCitac[srPluralCategory(uKorpi)], { n: uKorpi })}
              onClick={() => setList("korpa")}
              data-radnja="korpa"
            >
              <ShoppingBag aria-hidden="true" className={styles.ikonicaVelika} />
              <span>
                {t.traka.korpa}
                {uKorpi > 0 ? ` · ${uKorpi}` : null}
              </span>
            </button>
          ) : null}
        </div>
      </section>
      {list === "racun" ? (
        <RacunList
          mesto={mesto}
          online={online}
          salje={salje === "bill"}
          onIzbor={(nacin) => stoZahtev("bill", nacin)}
          onZatvori={() => setList(null)}
        />
      ) : null}
      {list === "korpa" ? (
        <KorpaList
          kanal={kanal}
          mesto={mesto}
          linije={korpa.linije}
          zbir={zbir}
          nedostupni={nedostupniSet}
          greska={korpaGreska}
          salje={salje === "order"}
          online={online}
          potvrda={korpaPotvrda ? { ...korpaPotvrda, status: zivo(korpaPotvrda.requestId, korpaPotvrda.status) } : null}
          mojiZahteviHref={kontekst.linkovi.mojiZahtevi}
          onKolicina={(id, kolicina) => {
            setKorpaGreska(null);
            korpa.postaviKolicinu(id, kolicina);
          }}
          onUkloni={(id) => {
            setKorpaGreska(null);
            korpa.ukloni(id);
          }}
          onPosalji={posalji}
          onZatvori={zatvoriKorpu}
        />
      ) : null}
    </>
  );
}
