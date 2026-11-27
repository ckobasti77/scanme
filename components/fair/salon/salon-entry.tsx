import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TbSteeringWheel } from "react-icons/tb";
import type { CSSProperties } from "react";
import { FairBrandIcon } from "../brand-icons";
import { fairSalonLayout, fairSalonPodium, type FairSalonEvent } from "@/lib/fair-salon";
import type { FairSalonDict } from "@/lib/i18n/types";
import styles from "./salon-entry.module.css";

const TILE_ASPECT = 16 / 10;

/** /sajam/<event> for an event with salons (Auto Expo): one tile per brand salon, each a small
 * view of the same room and podium, plus a direct way to the test-drive form. */
export function FairSalonEntry({ eventSlug, salon, dict }: { eventSlug: string; salon: FairSalonEvent; dict: FairSalonDict }) {
  const podium = fairSalonPodium(TILE_ASPECT);
  return (
    <main className={styles.entry}>
      <header className={styles.head}>
        <h1>{dict.entryTitle}</h1>
      </header>
      <ul className={styles.tiles}>
        {salon.brands.map((brand, index) => {
          const placements = fairSalonLayout(brand.spots, TILE_ASPECT);
          const href = `/sajam/${eventSlug}/brend/${brand.brandSlug}`;
          return (
            <li key={brand.brandSlug} className={styles.tile}>
              <Link href={href} className={styles.tileLink}>
                <span className={styles.room} aria-hidden="true">
                  <Image
                    className={styles.roomPhoto}
                    src={salon.background.wide.src}
                    fill
                    sizes="(max-width: 767px) 100vw, 560px"
                    alt=""
                    priority={index === 0}
                  />
                  <span className={styles.podium} style={{ top: `${podium.topPct}%`, width: `${podium.widthPct}%`, height: `${podium.bottomPct - podium.topPct}%` }} />
                  {brand.spots.map((spot, spotIndex) => {
                    const place = placements[spotIndex];
                    const style = { left: `${place.xPct}%`, top: `${place.yPct}%`, width: `${place.widthPct}%`, zIndex: place.zIndex } as CSSProperties;
                    return (
                      <Image
                        key={spot.modelSlug}
                        className={styles.car}
                        style={style}
                        src={spot.cutout.src}
                        width={spot.cutout.width}
                        height={spot.cutout.height}
                        sizes="(max-width: 767px) 34vw, 180px"
                        alt=""
                      />
                    );
                  })}
                </span>
                <span className={styles.body}>
                  <span className={styles.icon} aria-hidden="true"><FairBrandIcon brandSlug={brand.brandSlug} /></span>
                  <span className={styles.text}>
                    <strong>{brand.name}</strong>
                    <span>{dict.tileCount(brand.spots.length)}</span>
                  </span>
                  <span className={styles.enter}>
                    {dict.tileEnter}
                    <ArrowRight aria-hidden="true" />
                  </span>
                </span>
              </Link>
              <Link href={`${href}?voznja=1`} className={styles.drive}>
                <TbSteeringWheel aria-hidden="true" />
                {dict.tileDrive}
                <span className={styles.srOnly}>: {brand.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
