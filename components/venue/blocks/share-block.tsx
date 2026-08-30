// share — server wrapper; the actions are the client leaf (they need the
// page's real URL and the clipboard, both browser-only at click time).

import { fmt } from "@/lib/i18n";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { ShareProps } from "@/lib/venue-blocks";
import type { VenueRenderContext } from "../venue-view";
import styles from "../venue-template.module.css";
import { ShareActionsClient } from "./share-actions-client";

export function ShareBlock({
  props,
  ctx,
}: {
  props: ShareProps;
  ctx: VenueRenderContext;
}) {
  if (props.channels.length === 0) return null;
  const message =
    props.message || fmt(dict.shareDefaultMessage, { title: ctx.eventTitle });

  return (
    <div>
      <h2 className={styles.blockHeading}>
        {props.heading || dict.shareHeading}
      </h2>
      <ShareActionsClient
        channels={props.channels}
        message={message}
        labels={{
          whatsapp: dict.shareWhatsapp,
          viber: dict.shareViber,
          facebook: dict.shareFacebook,
          x: dict.shareX,
          copy: dict.shareCopy,
          copied: dict.shareCopied,
        }}
      />
    </div>
  );
}
