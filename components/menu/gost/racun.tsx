"use client";

// ScanMe Menu V1 (K21) — `Zatraži račun` (master §8.1; K19-7): two large
// buttons, `Gotovinom` and `Karticom`; each sends the request at once. The
// choice is a preference for the waiter — the payment itself happens with
// the staff, never in ScanMe Menu.

import { Banknote, CreditCard, WifiOff } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import type { MenuPaymentPreference } from "@/lib/menu/request-status";
import { GostList } from "./list";
import styles from "./gost.module.css";

const t = menuGostSr;

export function RacunList({
  mesto,
  online,
  salje,
  onIzbor,
  onZatvori,
}: {
  mesto: string;
  online: boolean;
  salje: boolean;
  onIzbor: (nacin: MenuPaymentPreference) => void;
  onZatvori: () => void;
}) {
  const onemoguceno = !online || salje;
  return (
    <GostList
      naslov={t.racun.naslov}
      podnaslov={fmt(t.korpa.zaMesto, { mesto })}
      zatvoriOznaka={t.racun.odustani}
      onZatvori={onZatvori}
      oznaka="racun"
      podnozje={
        <>
          {!online ? (
            <p className={styles.bezVeze} role="status">
              <WifiOff aria-hidden="true" className={styles.ikonica} />
              {t.traka.bezVeze}
            </p>
          ) : null}
          <div className={styles.dvaDugmeta}>
            <button
              type="button"
              className={`${styles.dugme} ${styles.dugmeVeliko}`}
              disabled={onemoguceno}
              aria-busy={salje || undefined}
              onClick={() => onIzbor("cash")}
              data-nacin="cash"
            >
              <Banknote aria-hidden="true" className={styles.ikonicaVelika} />
              {t.racun.gotovinom}
            </button>
            <button
              type="button"
              className={`${styles.dugme} ${styles.dugmeVeliko}`}
              disabled={onemoguceno}
              aria-busy={salje || undefined}
              onClick={() => onIzbor("card")}
              data-nacin="card"
            >
              <CreditCard aria-hidden="true" className={styles.ikonicaVelika} />
              {t.racun.karticom}
            </button>
          </div>
        </>
      }
    >
      <p className={styles.linijaNaziv}>{t.racun.pitanje}</p>
      <p className={styles.sitno}>{fmt(t.racun.opis, { mesto })}</p>
    </GostList>
  );
}
