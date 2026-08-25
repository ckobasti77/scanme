// priceList — server-only. Sections of items with the printed-price-list dot
// leader running to a tabular price. Prices format through Intl with the
// block's currency; sections and items without content collapse away.
// (Named "priceList", not "menu" — ScanMe Menu is a planned separate product.)

import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { PriceListProps } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";

function priceFormatter(currency: string): Intl.NumberFormat | null {
  try {
    return new Intl.NumberFormat("sr-Latn-RS", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
  } catch {
    return null;
  }
}

export function PriceListBlock({ props }: { props: PriceListProps }) {
  const sections = props.sections.filter((section) => section.items.length > 0);
  if (sections.length === 0) return null;
  const format = priceFormatter(props.currency);

  return (
    <div>
      <h2 className={styles.blockHeading}>
        {props.heading || dict.priceListHeading}
      </h2>
      {sections.map((section) => (
        <section key={section.id} className={styles.priceListSection}>
          {section.title ? (
            <h3 className={styles.priceListSectionTitle}>{section.title}</h3>
          ) : null}
          <ul className={styles.priceList}>
            {section.items.map((item) => (
              <li key={item.id} className={styles.priceListRow}>
                <span className={styles.priceListLine}>
                  <span className={styles.priceListName}>{item.name}</span>
                  {item.price !== undefined ? (
                    <>
                      <span className={styles.priceListDots} aria-hidden="true" />
                      <span className={styles.priceListPrice}>
                        {format
                          ? format.format(item.price)
                          : `${item.price} ${props.currency}`}
                      </span>
                    </>
                  ) : null}
                </span>
                {item.description ? (
                  <p className={styles.priceListDescription}>
                    {item.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
