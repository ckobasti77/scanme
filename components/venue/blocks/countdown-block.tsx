// countdown — server wrapper. Decides completion WITHOUT flashing: for an
// "eventStart" target the materialized lifecycle answers it (no clock); for a
// custom target the server clock does (legal in a dynamic server component).
// Only a still-running countdown mounts the ticking client leaf.

import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { CountdownProps } from "@/lib/venue-blocks";
import { serverNow } from "@/lib/venue-calendar";
import type { VenueRenderContext } from "../venue-view";
import styles from "../venue-template.module.css";
import { CountdownClient } from "./countdown-client";

export function CountdownBlock({
  props,
  ctx,
}: {
  props: CountdownProps;
  ctx: VenueRenderContext;
}) {
  const target =
    props.target === "eventStart" ? ctx.eventStartsAt : props.target.timestamp;
  if (target === null) return null;

  const completedOnServer =
    props.target === "eventStart"
      ? ctx.lifecycle !== "before"
      : serverNow() >= target;

  if (completedOnServer) {
    if (props.completedBehavior === "hide") return null;
    return (
      <p className={styles.countdownDone}>
        {props.completedMessage || dict.countdownDone}
      </p>
    );
  }

  return (
    <CountdownClient
      target={target}
      units={props.units}
      countdownStyle={props.style}
      completedBehavior={props.completedBehavior}
      completedMessage={props.completedMessage}
      labels={{
        days: dict.countdownDays,
        hours: dict.countdownHours,
        minutes: dict.countdownMinutes,
        seconds: dict.countdownSeconds,
        done: dict.countdownDone,
        aria: dict.countdownAria,
      }}
    />
  );
}
