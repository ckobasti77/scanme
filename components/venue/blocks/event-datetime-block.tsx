// eventDateTime — server-only. Belgrade wall-clock display via Intl, and the
// add-to-calendar pair: a Google Calendar link and a generated .ics served as a
// data: href (no JS, no extra route). Both carry UTC instants, which is exact
// across the CET/CEST switch (see lib/venue-calendar.ts).

import { CalendarPlus, CalendarArrowDown } from "lucide-react";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { EventDateTimeProps } from "@/lib/venue-blocks";
import {
  formatBelgradeDate,
  formatBelgradeTime,
  googleCalendarUrl,
  icsContent,
  icsDataUri,
} from "@/lib/venue-calendar";
import type { VenueRenderContext } from "../venue-view";
import styles from "../venue-template.module.css";

export function EventDateTimeBlock({
  props,
  ctx,
}: {
  props: EventDateTimeProps;
  ctx: VenueRenderContext;
}) {
  const startsAt = props.startsAt ?? ctx.eventStartsAt;
  const endsAt = props.endsAt ?? ctx.eventEndsAt ?? undefined;
  const hasWhere = Boolean(props.venueName || props.address);
  if (startsAt === null && !hasWhere) return null;

  const location =
    [props.venueName, props.address].filter(Boolean).join(", ") || undefined;

  const calendar =
    props.showAddToCalendar && startsAt !== null
      ? {
          google: props.googleCalendarLink
            ? googleCalendarUrl({
                title: `${ctx.eventTitle} · ${ctx.displayName}`,
                startsAt,
                endsAt,
                location,
              })
            : null,
          ics: props.icsDownload
            ? icsDataUri(
                icsContent({
                  uid: `${ctx.businessSlug}-${ctx.eventSlug}-${startsAt}@scanme`,
                  title: `${ctx.eventTitle} · ${ctx.displayName}`,
                  startsAt,
                  endsAt,
                  location,
                }),
              )
            : null,
        }
      : null;

  return (
    <div>
      <dl className={styles.dateTimeRows}>
        {startsAt !== null ? (
          <div className={styles.dateTimeRow}>
            <dt className={styles.dateTimeLabel}>{dict.whenLabel}</dt>
            <dd className={styles.dateTimeValue}>
              {formatBelgradeDate(startsAt)} u {formatBelgradeTime(startsAt)}
              {endsAt !== undefined ? ` – ${formatBelgradeTime(endsAt)}` : null}
            </dd>
          </div>
        ) : null}
        {hasWhere ? (
          <div className={styles.dateTimeRow}>
            <dt className={styles.dateTimeLabel}>{dict.whereLabel}</dt>
            {props.venueName ? (
              <dd className={styles.dateTimeValue}>{props.venueName}</dd>
            ) : null}
            {props.address ? (
              <dd className={styles.dateTimeSub}>{props.address}</dd>
            ) : null}
          </div>
        ) : null}
      </dl>
      {calendar && (calendar.google || calendar.ics) ? (
        <div
          className={styles.calendarActions}
          // aria-label is ignored on role=generic; group makes it land.
          role="group"
          aria-label={dict.addToCalendarLabel}
        >
          {calendar.google ? (
            <a
              className={styles.action}
              href={calendar.google}
              target="_blank"
              rel="noopener noreferrer"
            >
              <CalendarPlus className={styles.actionIcon} aria-hidden="true" />
              {dict.googleCalendarLink}
            </a>
          ) : null}
          {calendar.ics ? (
            <a
              className={styles.action}
              href={calendar.ics}
              download={`${ctx.eventSlug}.ics`}
            >
              <CalendarArrowDown
                className={styles.actionIcon}
                aria-hidden="true"
              />
              {dict.icsDownloadLink}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
