// ADMIN v3 V4 — the ids of the game (plan §6). This file imports nothing, so the
// dictionary types (lib/i18n/types.ts) may key their texts by these ids.

/** The five ranks of an operator, in order; each spans five levels (the last one has no end). */
export const RANK_IDS = ["pripravnik", "operater", "dispecer", "komandant", "legenda"] as const;
export type RankId = (typeof RANK_IDS)[number];

/** How rare a badge is; the material of its medal says it (matte, metal, holo, holo with a glow). */
export const RARITIES = ["obicna", "retka", "epska", "legendarna"] as const;
export type Rarity = (typeof RARITIES)[number];

/** The badges of one operator, from their own work. */
export const PERSONAL_BADGE_IDS = [
  "prvi_korak",
  "sef_je_pao",
  "inbox_nula",
  "nula_hitnih",
  "sef_pre_podne",
  "kombo_x3",
  "pet_u_nizu",
  "stotka",
  "kurir",
  "operater",
  "dispecer",
  "dvadeset_u_nizu",
  "prvi_u_nedelji",
  "komandant",
  "savrsena_nedelja",
  "legenda",
] as const;

/** The badges of the fair: facts of an event, shared by the team; they carry no XP. */
export const FAIR_BADGE_IDS = ["sajam_spreman", "prvi_lead", "rekord_sata", "sto_skenova"] as const;

export const BADGE_IDS = [...PERSONAL_BADGE_IDS, ...FAIR_BADGE_IDS] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

/** What an action of the XP table is called in the UI (several server actions may share a name). */
export const XP_ACTION_IDS = [
  "resena_stavka",
  "zavrsen_zadatak",
  "isporuka",
  "odgovor",
  "uplata",
  "dizajn",
  "kontrola",
  "stampa",
  "kanal",
  "nalepnica",
  "digitalni_qr",
  "komunikacija",
  "novi_zadatak",
] as const;
export type XpActionId = (typeof XP_ACTION_IDS)[number];

/** The nodes of the mission map before a fair, in the order of the chain. */
export const FAIR_NODE_IDS = ["katalog", "nalepnice", "izlagaci", "pitanja", "leadovi", "spremno"] as const;
export type FairNodeId = (typeof FAIR_NODE_IDS)[number];

/** The daily challenges while a fair runs. */
export const FAIR_CHALLENGE_IDS = [
  "skenovi_10",
  "skenovi_50",
  "skenovi_100",
  "pre_podne_50",
  "prestigni_prepodne",
  "obori_rekord_sata",
  "prvi_lead_danas",
  "hitni_na_nuli",
] as const;
export type FairChallengeId = (typeof FAIR_CHALLENGE_IDS)[number];
