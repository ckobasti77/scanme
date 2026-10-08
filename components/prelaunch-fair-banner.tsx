"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { DotMatrix } from "@/components/dot-matrix";
import { fmt } from "@/lib/i18n/format";
import { prelaunchSr as dict } from "@/lib/i18n/sr/prelaunch";
import { getFairBannerStatus } from "@/lib/prelaunch-fair-banner";
import styles from "./prelaunch-landing.module.css";

// "2026" u 3×5 dot-matrix pismu, isti jezik tačaka kao ikonice usluga.
const YEAR_PATTERN = [
  "###.###.###.###",
  "..#.#.#...#.#..",
  "###.#.#.###.###",
  "#...#.#.#...#.#",
  "###.###.###.###",
] as const;

// Stanje sajma zavisi od sata posetioca, pa se računa tek na klijentu:
// server i hidratacija renderuju prazno (rezervisano) mesto, bez razlike u HTML-u.
// Proverava se svakog minuta, pa strana ostavljena otvorena preko ponoći prelazi
// u novo stanje.
const subscribeToMinutes = (onChange: () => void) => {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
};
const readStatusKey = () => {
  const status = getFairBannerStatus(new Date());
  return status.kind === "ended" ? "ended" : `${status.kind}:${status.eventIndex}`;
};
const readServerStatusKey = () => null;

export function PrelaunchFairBanner() {
  const statusKey = useSyncExternalStore(subscribeToMinutes, readStatusKey, readServerStatusKey);
  const [kind, index] = statusKey ? statusKey.split(":") : [null, null];
  const eventIndex = index === null || index === undefined ? -1 : Number(index);
  const statusLabel =
    kind === "live"
      ? dict.fair.status.live
      : kind === "next"
        ? fmt(dict.fair.status.next, { date: dict.fair.events[eventIndex].startLabel })
        : kind === "ended"
          ? dict.fair.status.ended
          : "";

  return (
    <aside
      className={styles.fairBanner}
      aria-label={`${dict.fair.bannerTitle} · ${dict.fair.location} · ${dict.fair.year}`}
      data-reveal="off"
    >
      <div className={`${styles.fairBannerInner} section-shell`}>
        <div className={styles.fairBannerTop}>
          <p className={styles.fairStatus} data-kind={kind ?? "pending"}>
            <span className={styles.fairStatusDot} aria-hidden="true" />
            <span>{statusLabel}</span>
          </p>
          <p className={styles.fairPartner}>
            <span>{dict.hero.partner}</span>
            <i aria-hidden="true">—</i>
            <BrandLogo className={styles.fairPartnerLogo} width="clamp(4.75rem, 18vw, 6.5rem)" />
            <span className="sr-only">{dict.fair.partnerBrand}</span>
          </p>
        </div>

        <div className={styles.fairHeadline}>
          <p className={styles.fairTitle}>
            <span>{dict.fair.bannerTitle}</span>
            <DotMatrix pattern={YEAR_PATTERN} radius={4.3} className={styles.fairYear} dotClassName={styles.fairYearDot} />
            <span className="sr-only">{dict.fair.year}</span>
          </p>
          <p className={styles.fairPlace}>{dict.fair.location}</p>
        </div>

        <ul className={styles.fairEvents}>
          {dict.fair.events.map((event, position) => (
            <li
              key={event.name}
              className={styles.fairEvent}
              data-state={position === eventIndex ? kind : undefined}
            >
              <strong>{event.shortDate}</strong>
              <span>{event.name}</span>
            </li>
          ))}
        </ul>

        {/* /sajam vraća 307 na sajam koji je u toku (app/sajam/route.ts). */}
        <Link href="/sajam" prefetch={false} className={`${styles.fairCta} button-primary focus-signal`}>
          {dict.fair.cta}
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Link>
      </div>
    </aside>
  );
}
