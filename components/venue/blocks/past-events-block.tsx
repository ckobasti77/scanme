// pastEvents — server-only. Sourced from archived events plus their
// eventArchiveItems (the ctx carries the resolved archivedEvents query result;
// the route fetches it only when this block — or the after state — needs it).

import Image from "next/image";
import Link from "next/link";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { PastEventsProps } from "@/lib/venue-blocks";
import { formatBelgradeDateShort } from "@/lib/venue-calendar";
import type { VenueRenderContext } from "../venue-view";
import styles from "../venue-template.module.css";

export function PastEventsBlock({
  props,
  ctx,
}: {
  props: PastEventsProps;
  ctx: VenueRenderContext;
}) {
  const events = (ctx.pastEvents ?? [])
    .filter((event) => event.slug !== ctx.eventSlug)
    .slice(0, props.limit);
  if (events.length === 0) return null;

  return (
    <div>
      <h2 className={styles.blockHeading}>
        {props.heading || dict.pastEventsHeading}
      </h2>
      <div className={styles.pastGrid} data-past-layout={props.layout}>
        {events.map((event) => {
          const cover = event.items[0]?.thumbUrl ?? null;
          const when = event.startsAt ?? event.endsAt ?? event.archivedAt;
          return (
            <Link
              key={event.slug}
              className={styles.pastCard}
              href={`/${ctx.businessSlug}/venue/${event.slug}`}
            >
              {cover ? (
                <span className={styles.pastCover}>
                  <Image src={cover} alt="" fill sizes="(max-width: 736px) 50vw, 360px" />
                </span>
              ) : null}
              <span className={styles.pastMeta}>
                <p className={styles.pastTitle}>{event.title}</p>
                {when !== null ? (
                  <p className={styles.pastDate}>
                    {formatBelgradeDateShort(when)}
                  </p>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
