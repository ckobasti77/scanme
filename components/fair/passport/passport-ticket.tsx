"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { FairBrandVector } from "@/lib/fair-brand-logo";
import type { PassportTicketView } from "@/lib/fair-client/passport-tickets";
import { PassportStub, type PassportStubSeal } from "./passport-stub";
import styles from "./passport-tickets.module.css";

// One brand passport on the Auto Moto Fest overview, as a ticket: dark warm
// leather with the brand pressed in, a perforation, and the paper stub.
// Port of variant "2 · Ulaznica" + "Prigušen brend" (public/prototip/pasosi-kartica-ulaznica.html).

const WATERMARK_SIZE = 120;

function BrandVector({ mark, size, className }: { mark: FairBrandVector; size: number; className: string }) {
  if (mark.kind === "path") {
    return (
      <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
        <path d={mark.path} fill="currentColor" />
      </svg>
    );
  }
  const style = { width: Math.round((size * mark.width) / mark.height), height: size, "--mark": `url(${mark.src})` } as CSSProperties;
  return <span className={`${className} ${styles.markFile}`} style={style} aria-hidden="true" />;
}

export type PassportTicketProps = {
  href: string;
  ariaLabel: string;
  brand: string;
  /** Vector mark (simple-icons or a local single-colour SVG), pressed into the leather. */
  mark: FairBrandVector | null;
  /** Uploaded logo, used only when there is no vector mark. */
  logoUrl?: string;
  accent?: string;
  label: string;
  models: Array<{ name: string; got: boolean }>;
  view: PassportTicketView;
  newLabel: string;
  unitLabel: string;
  seal: PassportStubSeal;
  sealTexts: { top: string; bottom: string; center: string; year: string };
  onSealed?: () => void;
};

export function PassportTicket({ href, ariaLabel, brand, mark, logoUrl, accent, label, models, view, newLabel, unitLabel, seal, sealTexts, onSealed }: PassportTicketProps) {
  const glow = accent || mark ? `color-mix(in srgb, ${accent ?? mark!.hex} 40%, transparent)` : undefined;
  const shown = models.slice(0, 3);
  const more = models.length - shown.length;
  return (
    <Link prefetch={false} href={href} className={styles.ticket} aria-label={ariaLabel}>
      {view.fresh > 0 ? <span className={styles.novo} aria-hidden="true">{newLabel}</span> : null}
      <div className={styles.leather} style={glow ? ({ "--glow": glow } as CSSProperties) : undefined} aria-hidden="true">
        {mark ? <BrandVector mark={mark} size={WATERMARK_SIZE} className={styles.watermark} /> : null}
        {!mark && logoUrl ? <span className={`${styles.watermark} ${styles.markFile}`} style={{ "--mark": `url(${logoUrl})` } as CSSProperties} /> : null}
        <span className={styles.stitch} />
        <span className={styles.label}>{label}</span>
        <div className={`${styles.brand}${brand.length > 20 ? ` ${styles.brandLonger}` : brand.length > 12 ? ` ${styles.brandLong}` : ""}`}>
          <b>{brand}</b>
        </div>
        <div className={styles.models}>
          {shown.map((model, index) => (
            <span key={index}>
              {index > 0 ? " · " : ""}
              <span className={model.got ? styles.modelGot : undefined}>{model.name}</span>
            </span>
          ))}
          {more > 0 ? ` · +${more}` : null}
        </div>
      </div>
      <PassportStub
        key={seal}
        got={view.got}
        total={view.total}
        cells={view.cells}
        fresh={view.fresh}
        complete={view.complete}
        seal={seal}
        sealTexts={sealTexts}
        unitLabel={unitLabel}
        onSealed={onSealed}
      />
    </Link>
  );
}
