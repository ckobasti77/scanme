// ScanMe Menu V1 (K13) — how a page leads to the other pages of the menu
// (master §3.3: a guest on the wine list does not see the food unless the
// venue allows it; K01 OTV 22). `standalone` shows nothing, `back` a link to
// the splitter, `shared` a row of all pages. A one-page menu never shows it.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { saJezikom } from "@/lib/menu/i18n-fallback";
import type { PublicPageMeta } from "@/lib/menu/snapshot";
import styles from "./javni.module.css";

const t = menuJavniSr;

export function naslovStraniceJavno(stranica: Pick<PublicPageMeta, "title">): string {
  return stranica.title ?? t.razdelnik.meni;
}

export function NavigacijaStranica({
  slug,
  stranica,
  stranice,
  ugradjen = false,
  jezik = "sr",
  jezici = [],
}: {
  slug: string;
  stranica: PublicPageMeta;
  stranice: readonly PublicPageMeta[];
  ugradjen?: boolean;
  /** K14: links keep the guest's language. */
  jezik?: string;
  jezici?: readonly string[];
}) {
  const href = (put: string) => saJezikom(put, jezik, jezici);
  if (stranice.length <= 1 || stranica.navigation === "standalone") return null;
  if (stranica.navigation === "back") {
    return (
      <div className={styles.nazadOkvir}>
        <Link href={href(`/${slug}/meni`)} className={styles.nazadLink} tabIndex={ugradjen ? -1 : undefined}>
          <ChevronLeft aria-hidden="true" className={styles.ikonicaLinka} />
          {t.navigacija.sveStranice}
        </Link>
      </div>
    );
  }
  return (
    <nav aria-label={t.navigacija.stranice} className={styles.straniceTraka}>
      {stranice.map((druga) => (
        <Link
          key={druga.key}
          href={href(`/${slug}/meni/${druga.slug}`)}
          className={styles.stranicaLinkMali}
          aria-current={druga.key === stranica.key ? "page" : undefined}
          tabIndex={ugradjen ? -1 : undefined}
        >
          {naslovStraniceJavno(druga)}
        </Link>
      ))}
    </nav>
  );
}
