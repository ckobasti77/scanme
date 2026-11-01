// ScanMe Menu V1 — the editor's drag sensors (K11, K09 §4.3). The whole free
// area of a card drags: with a mouse after 6 px of movement, with a finger
// after a long press (350 ms, 8 px tolerance — moving earlier scrolls the
// page). A press on a control (price field, buttons, the row menu, a
// checkbox) never starts a drag (lib/menu/studio/drag-guard.ts). There is no
// keyboard sensor on the card: the keyboard way to move is `Premesti`.

import { MouseSensor, TouchSensor } from "@dnd-kit/core";
import type { MouseEvent, TouchEvent } from "react";
import { jeInteraktivnaMeta } from "@/lib/menu/studio/drag-guard";

export const MIS_POMERAJ_PX = 6;
export const DODIR_ZADRZI_MS = 350;
export const DODIR_TOLERANCIJA_PX = 8;

export class StudioMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: ({ nativeEvent: event }: MouseEvent) =>
        event.button === 0 && !jeInteraktivnaMeta(event.target as Element | null),
    },
  ];
}

export class StudioTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: ({ nativeEvent: event }: TouchEvent) =>
        event.touches.length <= 1 && !jeInteraktivnaMeta(event.target as Element | null),
    },
  ];
}

export const MIS_OGRANICENJE = { distance: MIS_POMERAJ_PX } as const;
export const DODIR_OGRANICENJE = { delay: DODIR_ZADRZI_MS, tolerance: DODIR_TOLERANCIJA_PX } as const;
