// ScanMe Menu V1 (K13) — the frame every public-menu screen shares: the
// venue's tokens on the root, the header (logo or monogram, the venue name as
// the one h1, the page title), the page navigation and the footer. Inside the
// editor (`ugradjen`) the frame has no landmarks and no h1: the editor has its
// own main region and its one h1 (K10).
//
// The app's global theme toggle is hidden here: the public menu wears the
// venue palette, not the app theme (P13), so the toggle would do nothing.

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { JavniIzgled } from "@/lib/menu/identity/public-tokens";
import type { JavniLokal } from "@/lib/menu/public-view";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import styles from "./javni.module.css";

const t = menuJavniSr;

const SAKRIJ_GLOBALNU_TEMU = `[data-theme-toggle="global"]{display:none!important}`;
const HEX = /^#[0-9a-fA-F]{3,8}$/;

/** The venue page colour behind everything (wide screens, overscroll), never the app's own background. */
function stilStrane(page: string): string {
  return HEX.test(page) ? `${SAKRIJ_GLOBALNU_TEMU}html{background:${page}}` : SAKRIJ_GLOBALNU_TEMU;
}

export function JavniOkvir({
  izgled,
  lokal,
  naslovStranice,
  jezik,
  ugradjen = false,
  navigacija,
  alati,
  children,
  className,
}: {
  izgled: JavniIzgled;
  lokal: JavniLokal;
  /** The public page title under the venue name; null = none (the default page). */
  naslovStranice: string | null;
  jezik: string;
  ugradjen?: boolean;
  navigacija?: ReactNode;
  /** K14: the language and currency switches at the top. */
  alati?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const Glavni = ugradjen ? "div" : "main";
  const Naslov = ugradjen ? "p" : "h1";
  const Zaglavlje = ugradjen ? "div" : "header";
  const Podnozje = ugradjen ? "div" : "footer";
  return (
    <div
      className={className ? `${styles.koren} ${className}` : styles.koren}
      style={izgled.tokeni as CSSProperties}
      lang={jezik}
      data-javni-meni=""
      data-paleta={izgled.paletaId}
      data-ton={izgled.ton}
      data-layout={izgled.layout}
      data-gustina={izgled.gustina}
      data-naglasak={izgled.naglasak}
      data-varijanta={izgled.varijanta ?? undefined}
      data-mediji={izgled.mediji === "image" ? undefined : izgled.mediji}
      data-ugradjen={ugradjen ? "" : undefined}
    >
      {ugradjen ? null : <style>{stilStrane(izgled.boje.page)}</style>}
      <Zaglavlje className={styles.zaglavlje}>
        {lokal.logoUrl ? (
          <Image className={styles.logo} src={lokal.logoUrl} alt="" width={128} height={128} unoptimized />
        ) : (
          <span className={styles.monogram} aria-hidden="true">
            {monogram(lokal.naziv)}
          </span>
        )}
        <div>
          <Naslov className={`${styles.naslov} ${styles.lokal}`}>{lokal.naziv}</Naslov>
          {naslovStranice ? <p className={styles.stranicaNaslov}>{naslovStranice}</p> : null}
        </div>
        {alati ? <div className={styles.zaglavljeAlati}>{alati}</div> : null}
      </Zaglavlje>
      {navigacija}
      <Glavni>{children}</Glavni>
      <Podnozje className={styles.podnozje}>
        {izgled.brending === "reduced" ? t.podnozje.kratko : t.podnozje.pokrece}
      </Podnozje>
    </div>
  );
}

/** The first character of the venue name, as a monogram where there is no logo. */
export function monogram(naziv: string): string {
  const slovo = Array.from(naziv.trim())[0] ?? "M";
  return slovo.toLocaleUpperCase("sr-Latn");
}
