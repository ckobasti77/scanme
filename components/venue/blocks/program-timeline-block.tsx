// programTimeline — server-only. The night's running order in authored order,
// with Belgrade times on a left rail. Empty item list ⇒ renders nothing.

import Image from "next/image";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { ProgramTimelineProps } from "@/lib/venue-blocks";
import { formatBelgradeTime } from "@/lib/venue-calendar";
import { venueStorageUrl } from "../venue-view";
import styles from "../venue-template.module.css";

export function ProgramTimelineBlock({
  props,
}: {
  props: ProgramTimelineProps;
}) {
  if (props.items.length === 0) return null;
  const showTimes = props.showTimes;

  return (
    <div>
      <h2 className={styles.blockHeading}>
        {props.heading || dict.programHeading}
      </h2>
      <ol className={styles.programList} data-program-layout={props.layout}>
        {props.items.map((item) => {
          const imageUrl = venueStorageUrl(item.imageStorageId);
          return (
            <li key={item.id} className={styles.programRow}>
              {showTimes && item.startsAt !== undefined ? (
                <span className={styles.programTime}>
                  {formatBelgradeTime(item.startsAt)}
                </span>
              ) : props.layout !== "grid" ? (
                <span className={styles.programTime} aria-hidden="true" />
              ) : null}
              <div>
                <p className={styles.programTitle}>
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt=""
                      width={28}
                      height={28}
                      style={{
                        borderRadius: "50%",
                        objectFit: "cover",
                        display: "inline-block",
                        verticalAlign: "-0.35em",
                        marginRight: "0.5rem",
                      }}
                    />
                  ) : null}
                  {item.title}
                </p>
                {item.subtitle ? (
                  <p className={styles.programSubtitle}>{item.subtitle}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
