// shadowCss / logoShadowCss — lifted verbatim from the option-two Links
// template (RFC-001 §2.5 "Lift, do not copy"), which imports them back; the
// golden harness proves the move is a no-op.

import type { ScanMeLinksShadowV2 } from "../scanme-links-design";
import { rgba } from "./color";

export function shadowCss(shadow: ScanMeLinksShadowV2) {
  return shadow.enabled && shadow.opacity > 0
    ? `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${rgba(
        shadow.color,
        shadow.opacity,
      )}`
    : "0 0 0 transparent";
}

export function logoShadowCss(shadow: ScanMeLinksShadowV2) {
  return shadow.enabled && shadow.opacity > 0
    ? `drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur}px ${rgba(
        shadow.color,
        shadow.opacity,
      )})`
    : "none";
}
