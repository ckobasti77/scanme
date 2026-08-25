// profileCards — server-only. Grid or list of people (or featured offers):
// a DJ lineup, a salon's stylists, a gym's trainers — image, name, role. A
// card links out only when the item carries a link. Empty list ⇒ renders
// nothing.

import Image from "next/image";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { ProfileCardsProps } from "@/lib/venue-blocks";
import { venueStorageUrl } from "../venue-view";
import styles from "../venue-template.module.css";

const PAGE_MAX_PX = 736;

export function ProfileCardsBlock({ props }: { props: ProfileCardsProps }) {
  if (props.items.length === 0) return null;
  const columns = props.layout === "list" ? 1 : props.columns;
  const sizes = `(max-width: ${PAGE_MAX_PX}px) ${Math.round(100 / Math.min(columns, 2))}vw, ${Math.round(PAGE_MAX_PX / columns)}px`;

  return (
    <div>
      <h2 className={styles.blockHeading}>
        {props.heading || dict.profileCardsHeading}
      </h2>
      <ul
        className={styles.profileGrid}
        data-profile-layout={props.layout}
        style={
          { "--venue-profile-columns": String(columns) } as React.CSSProperties
        }
      >
        {props.items.map((item) => {
          const imageUrl = venueStorageUrl(item.imageStorageId);
          const body = (
            <>
              {imageUrl ? (
                <span className={styles.profilePhoto}>
                  <Image src={imageUrl} alt="" fill sizes={sizes} />
                </span>
              ) : null}
              <span>
                <p className={styles.profileName}>{item.name}</p>
                {item.role ? (
                  <p className={styles.profileRole}>{item.role}</p>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={item.id} style={{ listStyle: "none" }}>
              {item.link ? (
                <a
                  className={styles.profileCard}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {body}
                </a>
              ) : (
                <div className={styles.profileCard}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
