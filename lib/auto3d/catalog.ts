// Katalog 3D Rendgen limuzine: sistemi, delovi, instance i redosled.
//
// Jedini izvor id-jeva (docs/auto3d/planovi/A01.md §2). Blender ga čita kao JSON koji
// generiše `node 3d/auto3d/catalog-json.mjs`, a rečnik delova ga koristi preko tipova.
// Fajl namerno nema importe i koristi samo sintaksu koju Node ume da ukloni (type
// stripping), da bi ga Node skripta mogla direktno da uveze.
//
// Posle koraka A02 id-jevi su zamrznuti: geometrija i tekst se menjaju, id-jevi ne.

export const SYSTEMS = [
  { id: "karoserija", color: "#9FE9FF" },
  { id: "enterijer", color: "#D8C3A5" },
  { id: "motor", color: "#FF8C2E" },
  { id: "usis_izduv", color: "#FF4D4D" },
  { id: "hladjenje", color: "#3D9BFF" },
  { id: "prenos", color: "#FFD23F" },
  { id: "vesanje", color: "#8F7CFF" },
  { id: "kocnice", color: "#C8D2DC" },
  { id: "energija", color: "#2BD4B4" },
  { id: "elektrika", color: "#F06BFF" },
] as const;

export type SystemId = (typeof SYSTEMS)[number]["id"];

/** `l`/`d` = levo/desno sa vozačevog mesta (levo je +x); `p`/`z` = prednji/zadnji duž motora. */
export type Instance = "l" | "d" | "p" | "z";

type PartDef = {
  readonly id: string;
  readonly system: SystemId;
  readonly instances: readonly Instance[];
};

export const PARTS = [
  // karoserija
  { id: "hauba", system: "karoserija", instances: [] },
  { id: "blatobran", system: "karoserija", instances: ["l", "d"] },
  { id: "vrata_prednja", system: "karoserija", instances: ["l", "d"] },
  { id: "vrata_zadnja", system: "karoserija", instances: ["l", "d"] },
  { id: "prag", system: "karoserija", instances: ["l", "d"] },
  { id: "krov", system: "karoserija", instances: [] },
  { id: "poklopac_prtljaznika", system: "karoserija", instances: [] },
  { id: "skelet", system: "karoserija", instances: [] },
  { id: "branik_prednji", system: "karoserija", instances: [] },
  { id: "branik_zadnji", system: "karoserija", instances: [] },
  { id: "maska", system: "karoserija", instances: [] },
  { id: "retrovizor", system: "karoserija", instances: ["l", "d"] },
  { id: "vetrobran", system: "karoserija", instances: [] },
  { id: "zadnje_staklo", system: "karoserija", instances: [] },
  { id: "bocna_stakla", system: "karoserija", instances: ["l", "d"] },
  // enterijer
  { id: "sediste_prednje", system: "enterijer", instances: ["l", "d"] },
  { id: "zadnja_klupa", system: "enterijer", instances: [] },
  { id: "tabla", system: "enterijer", instances: [] },
  { id: "volan", system: "enterijer", instances: [] },
  { id: "konzola", system: "enterijer", instances: [] },
  { id: "pedale", system: "enterijer", instances: [] },
  // motor
  { id: "blok_motora", system: "motor", instances: [] },
  { id: "glava_motora", system: "motor", instances: [] },
  { id: "poklopac_ventila", system: "motor", instances: [] },
  { id: "usisna_grana", system: "motor", instances: [] },
  { id: "izduvna_grana", system: "motor", instances: [] },
  { id: "turbopunjac", system: "motor", instances: ["p", "z"] },
  { id: "starter_generator", system: "motor", instances: [] },
  { id: "karter", system: "motor", instances: [] },
  { id: "remenski_prenos", system: "motor", instances: [] },
  // usis i izduv
  { id: "filter_vazduha", system: "usis_izduv", instances: [] },
  { id: "usisne_cevi", system: "usis_izduv", instances: [] },
  { id: "katalizator", system: "usis_izduv", instances: [] },
  { id: "gpf", system: "usis_izduv", instances: [] },
  { id: "srednji_lonac", system: "usis_izduv", instances: [] },
  { id: "zadnji_lonac", system: "usis_izduv", instances: [] },
  // hlađenje
  { id: "hladnjak", system: "hladjenje", instances: [] },
  { id: "interkuler", system: "hladjenje", instances: [] },
  { id: "ventilator", system: "hladjenje", instances: [] },
  { id: "ekspanziona_posuda", system: "hladjenje", instances: [] },
  { id: "creva_hladjenja", system: "hladjenje", instances: [] },
  // prenos snage
  { id: "menjac", system: "prenos", instances: [] },
  { id: "prenosna_kutija", system: "prenos", instances: [] },
  { id: "kardan_prednji", system: "prenos", instances: [] },
  { id: "kardan_zadnji", system: "prenos", instances: [] },
  { id: "diferencijal_prednji", system: "prenos", instances: [] },
  { id: "diferencijal_zadnji", system: "prenos", instances: [] },
  { id: "poluosovina_prednja", system: "prenos", instances: ["l", "d"] },
  { id: "poluosovina_zadnja", system: "prenos", instances: ["l", "d"] },
  // vešanje i upravljanje
  { id: "ramena_prednja", system: "vesanje", instances: ["l", "d"] },
  { id: "ramena_zadnja", system: "vesanje", instances: ["l", "d"] },
  { id: "amortizer_prednji", system: "vesanje", instances: ["l", "d"] },
  { id: "amortizer_zadnji", system: "vesanje", instances: ["l", "d"] },
  { id: "stabilizator_prednji", system: "vesanje", instances: [] },
  { id: "stabilizator_zadnji", system: "vesanje", instances: [] },
  { id: "podokvir_prednji", system: "vesanje", instances: [] },
  { id: "podokvir_zadnji", system: "vesanje", instances: [] },
  { id: "letva_volana", system: "vesanje", instances: [] },
  // kočnice i točkovi
  { id: "felna_prednja", system: "kocnice", instances: ["l", "d"] },
  { id: "felna_zadnja", system: "kocnice", instances: ["l", "d"] },
  { id: "guma_prednja", system: "kocnice", instances: ["l", "d"] },
  { id: "guma_zadnja", system: "kocnice", instances: ["l", "d"] },
  { id: "disk_prednji", system: "kocnice", instances: ["l", "d"] },
  { id: "disk_zadnji", system: "kocnice", instances: ["l", "d"] },
  { id: "celjust_prednja", system: "kocnice", instances: ["l", "d"] },
  { id: "celjust_zadnja", system: "kocnice", instances: ["l", "d"] },
  { id: "kocioni_modul", system: "kocnice", instances: [] },
  // gorivo i energija
  { id: "rezervoar", system: "energija", instances: [] },
  { id: "pumpa_goriva", system: "energija", instances: [] },
  { id: "visokopritisna_pumpa", system: "energija", instances: [] },
  { id: "baterija_48v", system: "energija", instances: [] },
  { id: "akumulator_12v", system: "energija", instances: [] },
  // elektrika i svetla
  { id: "far", system: "elektrika", instances: ["l", "d"] },
  { id: "led_traka_prednja", system: "elektrika", instances: [] },
  { id: "stop_svetlo", system: "elektrika", instances: ["l", "d"] },
  { id: "led_traka_zadnja", system: "elektrika", instances: [] },
  { id: "ecu_motora", system: "elektrika", instances: [] },
  { id: "kablovski_snop", system: "elektrika", instances: [] },
] as const satisfies readonly PartDef[];

export type PartId = (typeof PARTS)[number]["id"];

/** Neklikabilni čvorovi (`deco__<sistem>__<naziv>`): ne pomeraju se i nemaju karticu. */
export const DECO_NODES = [
  "deco__karoserija__pod",
  "deco__karoserija__obloge_lukova",
  "deco__karoserija__brisaci",
] as const;

export const ROOT_NODE = "limuzina";

/** Ime klikabilnog čvora u GLB-u: `part__<sistem>__<deo>` ili `part__<sistem>__<deo>__<inst>`. */
export function partNodeName(system: SystemId, id: string, instance?: Instance | ""): string {
  return instance ? `part__${system}__${id}__${instance}` : `part__${system}__${id}`;
}

/** Svi čvorovi jednog dela, prvi je primarni (fokus iz liste i deep link). */
export function partNodes(part: { id: string; system: SystemId; instances: readonly Instance[] }): string[] {
  if (part.instances.length === 0) return [partNodeName(part.system, part.id)];
  return part.instances.map((instance) => partNodeName(part.system, part.id, instance));
}

export const PART_NODE_PATTERN =
  /^part__(karoserija|enterijer|motor|usis_izduv|hladjenje|prenos|vesanje|kocnice|energija|elektrika)__([a-z0-9]+(?:_[a-z0-9]+)*)(?:__(l|d|p|z))?$/;

export const DECO_NODE_PATTERN =
  /^deco__(karoserija|enterijer|motor|usis_izduv|hladjenje|prenos|vesanje|kocnice|energija|elektrika)__[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** Prozori faza rasklapanja (napredak 0–1) i oblik krive; isto računa Blender (lib/views.py). */
export const EXPLODE_WINDOWS = [
  [0.0, 0.3],
  [0.15, 0.5],
  [0.4, 0.75],
  [0.65, 1.0],
] as const;
