"use client";

// ScanMe Menu V1 (K21) — the guest's sheets (bill, cart, confirmation): a
// native <dialog> opened with showModal(), like the article detail — focus
// stays inside, Esc, `Zatvori` and a tap on the backdrop close it, focus
// returns to the button that opened it. From the bottom on phones, centred
// from 768 px. Mounted only while open.

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { naZatvaranje } from "../javni/dijalog-zatvaranje";
import styles from "./gost.module.css";

export function GostList({
  naslov,
  podnaslov,
  zatvoriOznaka,
  onZatvori,
  podnozje,
  children,
  oznaka,
}: {
  naslov: string;
  podnaslov?: string | null;
  zatvoriOznaka: string;
  onZatvori: () => void;
  podnozje?: ReactNode;
  children: ReactNode;
  /** data-gost-list, for tests and snapshots. */
  oznaka: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const naslovId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const povratak = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-list-naslov]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      povratak?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.list}
      aria-labelledby={naslovId}
      onClose={naZatvaranje(onZatvori)}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      data-gost-list={oznaka}
    >
      <div className={styles.listZaglavlje}>
        <div>
          <h2 id={naslovId} className={styles.listNaslov} tabIndex={-1} data-list-naslov="">
            {naslov}
          </h2>
          {podnaslov ? <p className={styles.listPodnaslov}>{podnaslov}</p> : null}
        </div>
        <button type="button" className={styles.zatvori} aria-label={zatvoriOznaka} onClick={() => ref.current?.close()}>
          <X aria-hidden="true" className={styles.ikonica} />
        </button>
      </div>
      <div className={styles.listTelo}>{children}</div>
      {podnozje ? <div className={styles.listPodnozje}>{podnozje}</div> : null}
    </dialog>
  );
}
