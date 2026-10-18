// ScanMe Menu V1 (K13) — the basic splitter (master §3.4): shown when a menu
// has more than one visible page. Logo and name of the venue, its identity,
// one link per page in the published order (hidden and archived pages are
// not in the version at all). The default page has no public title, so it is
// "Meni" here; "Kompletan meni" exists only in the editor (§3.2).
// A server component: no state, no client JavaScript.

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { saJezikom } from "@/lib/menu/i18n-fallback";
import type { JavniIzgled } from "@/lib/menu/identity/public-tokens";
import type { JavniRazdelnikView, PublicImage } from "@/lib/menu/public-view";
import { JavniGlif } from "./glif";
import { JezikIzbor } from "./jezik-valuta";
import { naslovStraniceJavno } from "./navigacija-stranica";
import { JavniOkvir } from "./okvir";
import { PrazanMeni } from "./stanja";
import styles from "./javni.module.css";

const t = menuJavniSr;

export function JavniRazdelnik({
  view,
  izgled,
  naslovne = {},
  ugradjen = false,
  jezikLinkovi,
}: {
  view: JavniRazdelnikView;
  izgled: JavniIzgled;
  /** Optional cover image per page key (K15 fills it from the version; the izlog shows it). */
  naslovne?: Readonly<Record<string, PublicImage | null>>;
  ugradjen?: boolean;
  /** K14: the splitter in each language (default: the menu link with `?jezik=`). */
  jezikLinkovi?: Readonly<Record<string, string>>;
}) {
  const meni = `/${view.lokal.slug}/meni`;
  const linkovi =
    jezikLinkovi ?? Object.fromEntries(view.jezici.map((kod) => [kod, saJezikom(meni, kod, view.jezici)]));
  return (
    <JavniOkvir
      izgled={izgled}
      lokal={view.lokal}
      naslovStranice={null}
      jezik={view.jezik}
      ugradjen={ugradjen}
      className={styles.razdelnik}
      alati={ugradjen || view.jezici.length <= 1 ? null : <JezikIzbor jezik={view.jezik} jezici={view.jezici} linkovi={linkovi} />}
    >
      {view.stranice.length === 0 ? (
        <PrazanMeni />
      ) : (
        <nav aria-label={t.razdelnik.stranice} data-razdelnik="">
          <p className={styles.razdelnikUvod}>{t.razdelnik.uvod}</p>
          <ul className={styles.stranice}>
            {view.stranice.map((stranica) => {
              const naslovna = naslovne[stranica.key] ?? null;
              // A prestige venue (Kompaktno) gets a typographic list: a cover photo, never a glyph tile.
              const bezMedija = !naslovna && izgled.layout === "compact";
              return (
                <li key={stranica.key}>
                  <Link
                    className={styles.stranicaLink}
                    href={saJezikom(`${meni}/${stranica.slug}`, view.jezik, view.jezici)}
                    data-stranica={stranica.slug}
                    data-bez-medija={bezMedija ? "" : undefined}
                  >
                    {bezMedija ? null : (
                      <span className={styles.medij} aria-hidden="true">
                        {naslovna ? (
                          <Image src={naslovna.thumbUrl} alt="" width={112} height={112} unoptimized />
                        ) : (
                          <JavniGlif iconKey={stranica.iconKey} className={styles.glif} />
                        )}
                      </span>
                    )}
                    <span className={`${styles.naslov} ${styles.stranicaNaziv}`}>{naslovStraniceJavno(stranica)}</span>
                    <ChevronRight aria-hidden="true" className={styles.strelica} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </JavniOkvir>
  );
}
