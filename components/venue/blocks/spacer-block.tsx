// spacer — server-only. Breathing room, with an optional hairline divider in
// the token border colour.

import type { SpacerProps } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";

export function SpacerBlock({ props }: { props: SpacerProps }) {
  return (
    <div
      className={styles.spacer}
      style={{ "--venue-spacer-height": `${props.height}px` } as React.CSSProperties}
      aria-hidden="true"
    >
      {props.divider ? <hr className={styles.spacerDivider} /> : null}
    </div>
  );
}
