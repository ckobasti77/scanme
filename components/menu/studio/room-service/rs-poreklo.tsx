// ScanMe Menu V1 — where a Room service price comes from (K16; master §5.3).
// Every row says it in words, never by colour alone: Preuzeta (the base
// price), Izračunata (base + markup, with the percent) or Ručna (typed for
// Room service only).

import { Equal, PencilLine, Percent } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { RoomServicePriceOrigin } from "@/lib/menu/room-service-pricing";
import { StatusOznaka } from "../../zajednicko/status-oznaka";

const t = menuStudioSr.posebno.roomService.poreklo;

const IKONICE = { inherited: Equal, computed: Percent, manual: PencilLine } as const;

/** The one-line explanation of an origin (also the label's title). */
export function opisPorekla(poreklo: RoomServicePriceOrigin, uvecanje: number | null): string {
  if (poreklo === "computed") return fmt(t.computedOpis, { p: formatProcenat(uvecanje ?? 0) });
  return poreklo === "manual" ? t.manualOpis : t.inheritedOpis;
}

/** 15 → "15", 12.5 → "12,5". */
export function formatProcenat(p: number): string {
  return String(p).replace(".", ",");
}

export function RsPoreklo({ poreklo, uvecanje }: { poreklo: RoomServicePriceOrigin; uvecanje: number | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5" data-poreklo={poreklo} title={opisPorekla(poreklo, uvecanje)}>
      <StatusOznaka ton={poreklo === "computed" ? "info" : "neutralno"} ikonica={IKONICE[poreklo]} velicina="mala">
        {t[poreklo]}
        {poreklo === "computed" && uvecanje !== null ? <span className="tabular-nums"> · +{formatProcenat(uvecanje)} %</span> : null}
      </StatusOznaka>
    </span>
  );
}
