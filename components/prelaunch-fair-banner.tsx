"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
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

// Zajednički ciklus tri animacije banera (prelaunch-landing.module.css):
// zelena linija prelazi donjom ivicom (SCAN_SWEEP_MS, linearno); kad njen centar
// dođe ispod levog ruba „2026“, kreće talas preko „2026“; kad talas izađe iz
// poslednje kolone, odsjaj prelazi na ivicu čipa sajma koji je u toku.
const SCAN_SWEEP_MS = 2400;
const SCAN_WIDTH = 0.32; // širina linije kao deo širine banera
const SCAN_TRAVEL = 4.2; // put linije u njenim širinama: od -100% do 320%

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
  const bannerRef = useRef<HTMLElement>(null);
  const statusKey = useSyncExternalStore(subscribeToMinutes, readStatusKey, readServerStatusKey);
  const [kind, index] = statusKey ? statusKey.split(":") : [null, null];
  const eventIndex = index === null || index === undefined ? -1 : Number(index);

  // Trenutak kada linija stigne ispod levog ruba „2026“ zavisi od rasporeda,
  // pa se meri (i ponovo meri na promenu veličine) i daje CSS-u kao --fair-sync.
  useLayoutEffect(() => {
    const banner = bannerRef.current;
    const year = banner?.querySelector<SVGSVGElement>("[data-fair-year]");
    if (!banner || !year) return;
    const measure = () => {
      const width = banner.getBoundingClientRect().width;
      const yearLeft = year.getBoundingClientRect().left - banner.getBoundingClientRect().left;
      if (width <= 0) return;
      const progress = (yearLeft / (SCAN_WIDTH * width) + 0.5) / SCAN_TRAVEL;
      const reach = Math.min(Math.max(progress, 0), 1) * SCAN_SWEEP_MS;
      banner.style.setProperty("--fair-sync", `${Math.round(reach)}ms`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(banner);
    return () => observer.disconnect();
  }, []);

  return (
    <aside
      ref={bannerRef}
      className={styles.fairBanner}
      aria-label={`${dict.fair.bannerTitle} · ${dict.fair.location} · ${dict.fair.year}`}
      data-reveal="off"
      data-status={kind ?? undefined}
    >
      <div className={`${styles.fairBannerInner} section-shell`}>
        <div className={styles.fairBannerTop}>
          <p className={styles.fairPlace}>{dict.fair.location}</p>
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
            <span className={styles.fairYearWrap} data-fair-year="">
              <DotMatrix pattern={YEAR_PATTERN} radius={4.3} className={styles.fairYear} dotClassName={styles.fairYearDot} />
            </span>
            <span className="sr-only">{dict.fair.year}</span>
          </p>
        </div>

        <ul className={styles.fairEvents}>
          {dict.fair.events.map((event, position) => {
            const state = position === eventIndex ? kind : undefined;
            const content = (
              <>
                <strong>{event.shortDate}</strong>
                <span>{event.name}</span>
                {state === "live" ? <small className={styles.fairEventState}>{dict.fair.status.live}</small> : null}
              </>
            );
            return (
              <li key={event.name} className={styles.fairEventItem}>
                {/* Sajam koji je u toku vodi na digitalni sajam, kao i CTA. */}
                {state === "live" ? (
                  <Link
                    href="/sajam"
                    prefetch={false}
                    className={`${styles.fairEvent} focus-signal`}
                    data-state={state}
                    aria-label={fmt(dict.fair.openEventAria, { name: event.name, dates: event.shortDate })}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={styles.fairEvent} data-state={state}>
                    {content}
                  </div>
                )}
              </li>
            );
          })}
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
