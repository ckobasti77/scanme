import type { MemoriesWallDict } from "../types";

// TASK-22 — the live wall (/zid/[code]). The room's screen: read from across a
// hall, so every line is short and large. Ti-form, warm, celebratory — the same
// register as the guest screens (a party, not a product).
export const memoriesWallSr = {
  metaTitle: "Zid uspomena · {name}",
  liveLabel: "UŽIVO",
  newMoment: "Nova uspomena",
  joinLine: "Skeniraj i dodaj svoju sliku",
  waitingTitle: "Zid je spreman",
  waitingBody: "Prva slika koju dodaš pojaviće se ovde.",
  waitingApprovalBody: "Slike se pojavljuju čim ih domaćin pusti na zid.",
  countOne: "{count} uspomena večeras",
  countFew: "{count} uspomene večeras",
  countMany: "{count} uspomena večeras",
  photoAlt: "Uspomena sa večeras",
} as const satisfies MemoriesWallDict;
