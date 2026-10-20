"use client";

// ScanMe Menu V1 (K21) — the guest's actions on the splitter of a multi-page
// menu (a table card that opens the menu's entry). The same separate chunk
// as on a page (next/dynamic), loaded only for a guest at a position. The
// cart here only sends what was added on the pages (each line keeps its page).

import dynamic from "next/dynamic";
import type { GostUcitano } from "../gost/ostrvo";

const GostOstrvo = dynamic(() => import("../gost/ostrvo").then((modul) => modul.GostOstrvo));

export function GostRazdelnik({ gost }: { gost: GostUcitano }) {
  return <GostOstrvo gost={gost} nedostupni={[]} />;
}
