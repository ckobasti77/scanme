// reservation — server wrapper. Renders nothing once the event is over (the
// backend would reject anyway); shows the deadline when the block sets one and
// it has not passed on the server clock. The form itself is the client leaf.

import { fmt } from "@/lib/i18n";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { ReservationProps } from "@/lib/venue-blocks";
import { formatBelgradeDateTime, serverNow } from "@/lib/venue-calendar";
import type { VenueRenderContext } from "../venue-view";
import styles from "../venue-template.module.css";
import { ReservationFormClient } from "./reservation-form-client";

export function ReservationBlock({
  props,
  ctx,
}: {
  props: ReservationProps;
  ctx: VenueRenderContext;
}) {
  if (ctx.lifecycle === "after") return null;
  const fields = props.fields;
  const anyField =
    fields.name || fields.phone || fields.email || fields.partySize || fields.note;
  if (!anyField) return null;

  const deadlinePassed =
    props.deadline !== undefined && serverNow() > props.deadline;

  return (
    <div>
      <h2 className={styles.blockHeading}>
        {props.heading || dict.reservationHeading}
      </h2>
      {props.deadline !== undefined && !deadlinePassed ? (
        <p className={styles.deadlineNote}>
          {fmt(dict.reservationDeadlineNote, {
            date: formatBelgradeDateTime(props.deadline),
          })}
        </p>
      ) : null}
      {deadlinePassed ? (
        <p className={styles.emptyNote}>{dict.reservationDeadlinePassed}</p>
      ) : (
        <ReservationFormClient
          businessSlug={ctx.businessSlug}
          eventSlug={ctx.eventSlug}
          fields={fields}
          zones={(props.zones ?? []).filter((zone) => zone.capacity > 0)}
          defaultDesiredAt={ctx.eventStartsAt}
          confirmationMessage={
            props.confirmationMessage || dict.reservationSuccessDefault
          }
          labels={{
            name: dict.fieldName,
            phone: dict.fieldPhone,
            email: dict.fieldEmail,
            partySize: dict.fieldPartySize,
            note: dict.fieldNote,
            zone: dict.fieldZone,
            time: dict.fieldDesiredAt,
            optional: dict.optionalSuffix,
            zoneFullSuffix: dict.reservationZoneFullSuffix,
            allFull: dict.reservationAllFull,
            disclaimer: dict.reservationDisclaimer,
            submit: dict.reservationSubmit,
            submitting: dict.reservationSubmitting,
            errorGeneric: dict.reservationErrorGeneric,
            nameRequired: dict.reservationNameRequired,
          }}
        />
      )}
    </div>
  );
}
