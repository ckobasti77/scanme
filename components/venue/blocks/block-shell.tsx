// The per-block wrapper: applies every shared base property from
// blockBaseValidator (RFC-001 §2.5). Overrides work by RE-DECLARING the same
// --venue-* custom properties locally, so the CSS cascade does the
// inheritance — a block without an override simply sees the page tokens.
// Server component; no state.

import type { CSSProperties, ReactNode } from "react";
import { rgba } from "@/lib/design-engine/color";
import { FONT_STACKS } from "@/lib/design-engine/typography";
import {
  colorToOklch,
  deriveReadableTextVariant,
} from "@/lib/scanme-color-science";
import type { VenueBlock, VenueBlockBase } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";

const SCALE_FACTOR = { small: 0.94, medium: 1, large: 1.07 } as const;

type ShadowShape = NonNullable<VenueBlockBase["shadow"]>;

function boxShadowCss(shadow: ShadowShape): string {
  return shadow.enabled && shadow.opacity > 0
    ? `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${rgba(shadow.color, shadow.opacity)}`
    : "none";
}

export function BlockShell({
  block,
  children,
}: {
  block: VenueBlock;
  children: ReactNode;
}) {
  const { base } = block;
  // Server-side queries already drop base.visible === false, but the shell
  // guards it too so direct renders (fixtures, tests) behave identically.
  if (base.visible === false) return null;
  if (base.responsive && !base.responsive.desktop && !base.responsive.mobile) {
    return null;
  }

  const style: CSSProperties & Record<`--${string}`, string> = {};
  const classes: string[] = [styles.block];

  if (base.surface === "card") {
    classes.push(styles.blockCard);
  } else if (typeof base.surface === "object") {
    classes.push(styles.blockCustomSurface);
    style["--venue-block-surface"] = base.surface.color;
  }

  if (base.size === "wide") classes.push(styles.sizeWide);
  if (base.size === "narrow") classes.push(styles.sizeNarrow);

  if (base.alignment === "left") classes.push(styles.alignLeft);
  if (base.alignment === "center") classes.push(styles.alignCenter);
  if (base.alignment === "right") classes.push(styles.alignRight);

  if (base.responsive) {
    if (!base.responsive.mobile) classes.push(styles.hideMobile);
    if (!base.responsive.desktop) classes.push(styles.hideDesktop);
  }

  if (base.animation === "fade-up") classes.push(styles.animFadeUp);
  if (base.animation === "reveal") classes.push(styles.animReveal);

  if (base.spacing) {
    style.marginTop = `${base.spacing.top}px`;
    style.marginBottom = `${base.spacing.bottom}px`;
  }
  if (base.radius !== undefined) {
    style["--venue-block-radius"] = `${base.radius}px`;
  }
  if (base.border && base.border.width > 0) {
    style["--venue-block-border"] = `${base.border.width}px solid ${base.border.color}`;
  }
  if (base.shadow) {
    style["--venue-block-shadow"] = boxShadowCss(base.shadow);
  }

  const colors = base.colorOverride;
  if (colors?.title) style["--venue-title"] = colors.title;
  if (colors?.body) {
    style["--venue-body"] = colors.body;
    // The derived companion follows the override verbatim (the owner's
    // explicit choice is not re-floored — same contract as title/body).
    style["--venue-body-muted"] = colors.body;
  }
  if (colors?.accent) {
    style["--venue-accent"] = colors.accent;
    style["--venue-accent-text"] = colors.accent;
    // on-accent is never an owner-chosen colour — it is a FUNCTION of the
    // accent (text sitting ON it). Left stale, the root-derived value lands
    // on the overridden background (a light override under a dark palette
    // computed 1.42:1 on the reservation submit), so re-derive it here.
    style["--venue-on-accent"] = deriveReadableTextVariant(
      colors.accent,
      colorToOklch(colors.accent).h,
      4.5,
    );
  }

  const typo = base.typographyOverride;
  if (typo?.fontKey) style["--venue-font-family"] = FONT_STACKS[typo.fontKey];
  if (typo?.headingWeight) {
    style["--venue-heading-weight"] = String(typo.headingWeight);
  }
  if (typo?.bodyWeight) {
    style["--venue-body-weight"] = String(typo.bodyWeight);
    style.fontWeight = typo.bodyWeight;
  }
  if (typo?.scale) {
    style.fontSize = `calc(1rem * ${SCALE_FACTOR[typo.scale]})`;
  }

  return (
    <section
      className={classes.join(" ")}
      style={style}
      data-venue-block={block.type}
    >
      {children}
    </section>
  );
}
