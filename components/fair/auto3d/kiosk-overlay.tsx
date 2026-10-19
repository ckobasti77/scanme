"use client";

// Kiosk na štandu (A10, A03 §5.3), 1920 × 1080, bez UI šuma: natpis gore levo, legenda sistema
// desno (sistem iz ture svetli), titl ture dole levo i QR „Nastavi na telefonu“ dole desno. Dok
// posetilac istražuje (posle dodira), legenda i titl se sklanjaju, a vide se kontrole stranice; natpis
// i QR ostaju.

import { Hand } from "lucide-react";
import { SYSTEMS } from "@/lib/auto3d/catalog";
import { SYSTEM_COLOR } from "@/lib/auto3d/groups";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";
import { KioskQr } from "./kiosk-qr";
import { useAuto3d } from "./store";
import { KioskCaption } from "./tour-caption";
import styles from "./auto3d.module.css";

export function KioskOverlay() {
  const auto = useAuto3d((s) => s.kioskAuto);
  const touring = useAuto3d((s) => s.tour.active);
  const group = useAuto3d((s) => s.group);
  const ready = useAuto3d((s) => s.status === "ready");

  return (
    <>
      <div className={styles.kioskLockup}>
        <span className="fair-event-lockup__mark" aria-hidden="true" />
        <span>
          <strong>{t.lockupTitle}</strong>
          <small>{t.kioskEvent}</small>
        </span>
      </div>
      {auto && ready ? (
        <p className={styles.kioskHint}>
          <Hand aria-hidden="true" />
          {t.kioskTouchHint}
        </p>
      ) : null}
      {auto ? (
        <ul className={styles.kioskLegend} aria-label={t.kioskLegend} data-focus={group ? "" : undefined}>
          {SYSTEMS.map((s) => (
            <li key={s.id} data-active={group === s.id ? "" : undefined}>
              <span className={styles.groupDot} style={{ background: SYSTEM_COLOR[s.id] }} aria-hidden="true" />
              {delovi.systems[s.id].name}
            </li>
          ))}
        </ul>
      ) : null}
      {auto && touring ? <KioskCaption /> : null}
      <aside className={styles.kioskQr}>
        <KioskQr />
        <p>
          <strong>{t.kioskQrTitle}</strong>
          <span>{t.kioskQrText}</span>
        </p>
      </aside>
    </>
  );
}
