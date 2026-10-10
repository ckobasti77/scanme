// Sajam 2026 N2 — „Poveži nalepnicu“ on the fair floor (phone, one hand):
// the typed sticker number, the exhibitors in stand order, the cars of one
// exhibitor, what a link would do (warnings, blocks, the arguments of
// fairAdminQr.linkSticker) and the save / confirm / undo steps. Pure; shared
// by the section view, the model detail, the dev preview and the tests.

import { FAIR_QR_LABEL_DEFAULT_FORMAT, formatFairQrLabel, parseFairQrSerialLabel, type FairQrLabelFormat } from "../fair-qr-label";
import { normalizeSearch } from "./hierarchy";
import { qrCodeFromSearch } from "./qr-filters";

// -----------------------------------------------------------------------------
// The sticker number
// -----------------------------------------------------------------------------

/**
 * The code a typed text points to: a sticker number in the series (`7`,
 * `sa26 7` → `SA26-007`), else a whole SMQ serial, resolver code or label;
 * null = not a code (yet).
 */
export function stickerCodeFromInput(text: string, format: FairQrLabelFormat = FAIR_QR_LABEL_DEFAULT_FORMAT): string | null {
  return qrCodeFromSearch(text, format);
}

/** The number of a label of the series, as the field next to the fixed prefix shows it: `SA26-007` → `007`. */
export function stickerNumberOf(label: string | null | undefined, format: FairQrLabelFormat = FAIR_QR_LABEL_DEFAULT_FORMAT): string | null {
  const serial = label ? parseFairQrSerialLabel(label) : null;
  return serial && serial.prefix === format.prefix.toUpperCase() ? String(serial.number).padStart(format.digits, "0") : null;
}

/** „Sledeća“: the next label of the series (`SA26-007` → `SA26-008`); null after the last one or for another code. */
export function nextStickerLabel(label: string | null | undefined, format: FairQrLabelFormat = FAIR_QR_LABEL_DEFAULT_FORMAT): string | null {
  const serial = label ? parseFairQrSerialLabel(label) : null;
  if (!serial || serial.prefix !== format.prefix.toUpperCase() || serial.number >= format.max) return null;
  return formatFairQrLabel(serial.number + 1, format);
}

// -----------------------------------------------------------------------------
// Exhibitors (stand order) and their cars
// -----------------------------------------------------------------------------

export type LinkExhibitorSource = { id: string; exhibitorName: string; logoUrl?: string | null; status: string };
export type LinkStandSource = { participationId: string; code: string; status: string };
export type LinkModelSource = {
  id: string;
  participationId: string;
  displayName: string;
  variant?: string;
  brandName: string;
  standLabel: string;
  status: "draft" | "published" | "withdrawn";
  /** Resolver code of the car's sticker (null = none). */
  qrCode: string | null;
  /** Its printed label (`SA26-012`), when known. */
  qrLabel?: string | null;
};

export type LinkExhibitor = {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Stand codes of the exhibitor, in stand order (`1A`, `2`, `10B` …). */
  stands: string[];
  /** P2 — the brands of those cars, as on the cars (`CUBI d.o.o.` → `JMEV`). */
  brands: string[];
  /** Cars that can take a sticker (not withdrawn). */
  cars: number;
};

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });

/**
 * The exhibitors a sticker can go to, in stand order (numeric: 1A, 1B, 2, 5,
 * 10A …); only active participations with at least one car that is not
 * withdrawn; without a stand at the end, by name.
 */
export function linkExhibitors(participations: readonly LinkExhibitorSource[], stands: readonly LinkStandSource[], models: readonly LinkModelSource[]): LinkExhibitor[] {
  const rows: LinkExhibitor[] = [];
  for (const participation of participations) {
    if (participation.status === "withdrawn") continue;
    const own = models.filter((model) => model.participationId === participation.id && model.status !== "withdrawn");
    if (!own.length) continue;
    const codes = stands
      .filter((stand) => stand.participationId === participation.id && stand.status !== "withdrawn")
      .map((stand) => stand.code)
      .sort(collator.compare);
    const brands = [...new Set(own.map((model) => model.brandName))].sort(collator.compare);
    rows.push({ id: participation.id, name: participation.exhibitorName, logoUrl: participation.logoUrl ?? null, stands: codes, brands, cars: own.length });
  }
  return rows.sort((a, b) => {
    if (a.stands.length && !b.stands.length) return -1;
    if (!a.stands.length && b.stands.length) return 1;
    return (a.stands.length ? collator.compare(a.stands[0], b.stands[0]) : 0) || collator.compare(a.name, b.name);
  });
}

/** Search by exhibitor name, brand or stand code (every word, without case or diacritics). */
export function filterLinkExhibitors(rows: readonly LinkExhibitor[], q: string): LinkExhibitor[] {
  const words = normalizeSearch(q).split(" ").filter(Boolean);
  if (!words.length) return [...rows];
  return rows.filter((row) => {
    const text = normalizeSearch([row.name, ...row.brands, ...row.stands].join(" "));
    return words.every((word) => text.includes(word));
  });
}

/** The cars of one exhibitor: by name; withdrawn cars last (they take no sticker). */
export function exhibitorCars<M extends LinkModelSource>(models: readonly M[], participationId: string): M[] {
  const name = (model: M) => `${model.displayName} ${model.variant ?? ""}`;
  return models
    .filter((model) => model.participationId === participationId)
    .sort((a, b) => Number(a.status === "withdrawn") - Number(b.status === "withdrawn") || collator.compare(name(a), name(b)));
}

// -----------------------------------------------------------------------------
// What a link would do
// -----------------------------------------------------------------------------

/** The scanned / typed sticker as getQrDetail sees it. */
export type LinkStickerFacts = {
  resolverCode: string;
  label: string | null;
  kind: "sticker" | "panel";
  /** The car it leads to now (`sameEvent` = this event). */
  holder: { modelId: string; sameEvent: boolean } | null;
  /** The code is out of service for a reason that is not its destination (damaged, switched off …). */
  outOfService: boolean;
};

/** Nothing can be saved: no sticker, a panel, a car of the other event, no car, a withdrawn car, or already linked. */
export type LinkBlock = "no_sticker" | "panel" | "other_event" | "no_model" | "withdrawn" | "same";
/** Saved, but the admin must see it first. */
export type LinkWarning = "draft" | "move" | "replace" | "out_of_service";

export type LinkPlan = {
  block: LinkBlock | null;
  warnings: LinkWarning[];
  /** fairAdminQr.linkSticker: the holder the admin saw (null = free). */
  expectedHolderModelId: string | null;
  /** fairAdminQr.linkSticker: the car's other sticker is replaced. */
  replaceModelSticker: boolean;
  /** move: the car the sticker leaves. */
  holderModelId: string | null;
  /** replace: the resolver code of the car's other sticker. */
  replacedCode: string | null;
};

export function linkPlan(sticker: LinkStickerFacts | null, model: LinkModelSource | null): LinkPlan {
  const plan: LinkPlan = { block: null, warnings: [], expectedHolderModelId: null, replaceModelSticker: false, holderModelId: null, replacedCode: null };
  if (!sticker) return { ...plan, block: "no_sticker" };
  if (sticker.kind === "panel") return { ...plan, block: "panel" };
  if (sticker.holder && !sticker.holder.sameEvent) return { ...plan, block: "other_event" };
  const holderModelId = sticker.holder?.modelId ?? null;
  const base = { ...plan, expectedHolderModelId: holderModelId, holderModelId };
  if (!model) return { ...base, block: "no_model" };
  if (model.status === "withdrawn") return { ...base, block: "withdrawn" };
  if (holderModelId === model.id) return { ...base, block: "same" };
  const warnings: LinkWarning[] = [];
  if (model.status === "draft") warnings.push("draft");
  if (holderModelId) warnings.push("move");
  const replacedCode = model.qrCode && model.qrCode !== sticker.resolverCode ? model.qrCode : null;
  if (replacedCode) warnings.push("replace");
  if (sticker.outOfService) warnings.push("out_of_service");
  return { ...base, warnings, replaceModelSticker: Boolean(replacedCode), replacedCode };
}

/**
 * P2 (RN N3) — the fairAdminQr.linkSticker arguments of a plan: exactly what
 * the admin saw, the sticker's holder and the car's other sticker (resolver
 * code, null = none); the server refuses (FAIR_QR_HOLDER_CHANGED) when either
 * changed in the meantime.
 */
export function linkStickerArgs(code: string, modelId: string, plan: LinkPlan) {
  return {
    code,
    modelId,
    expectedHolderModelId: plan.expectedHolderModelId,
    replaceModelSticker: plan.replaceModelSticker,
    expectedModelStickerCode: plan.replacedCode,
  };
}

/** Errors after which the screen re-reads the sticker: someone else changed it in the meantime. */
const CONFLICT_CODES = new Set([
  "FAIR_QR_HOLDER_CHANGED",
  "FAIR_QR_ALREADY_ASSIGNED",
  "FAIR_MODEL_ALREADY_ASSIGNED",
  "FAIR_QR_NOT_ASSIGNED",
  "FAIR_QR_OTHER_EVENT",
  "FAIR_QR_UNDO_SUPERSEDED",
]);

export function isQrConflict(code: string): boolean {
  return CONFLICT_CODES.has(code);
}

// -----------------------------------------------------------------------------
// Save → confirmation → undo
// -----------------------------------------------------------------------------

/** fairAdminQr.linkSticker's result, as the confirmation shows it. */
export type LinkDone = {
  assignmentId: string;
  label: string;
  modelId: string;
  modelStatus: "draft" | "published" | "withdrawn";
  created: boolean;
  movedFromModelId?: string;
  replacedLabel?: string;
};

export type LinkFlow =
  | { step: "pick"; error: string | null }
  /** The link is being saved: every action is locked (no double send). */
  | { step: "saving" }
  | { step: "done"; done: LinkDone; undo: "idle" | "saving" | "undone"; error: string | null };

export type LinkFlowEvent =
  | { type: "submit" }
  | { type: "success"; done: LinkDone }
  | { type: "failure"; code: string }
  | { type: "undo" }
  | { type: "undone" }
  | { type: "undo_failed"; code: string }
  /** Another sticker or car, „Sledeća“, or the error was read. */
  | { type: "reset" };

export const LINK_FLOW_START: LinkFlow = { step: "pick", error: null };

export function linkFlowReducer(flow: LinkFlow, event: LinkFlowEvent): LinkFlow {
  switch (event.type) {
    case "submit":
      return flow.step === "pick" ? { step: "saving" } : flow;
    case "success":
      return flow.step === "saving" ? { step: "done", done: event.done, undo: "idle", error: null } : flow;
    case "failure":
      return flow.step === "saving" ? { step: "pick", error: event.code } : flow;
    case "undo":
      return flow.step === "done" && flow.undo === "idle" ? { ...flow, undo: "saving", error: null } : flow;
    case "undone":
      return flow.step === "done" && flow.undo === "saving" ? { ...flow, undo: "undone" } : flow;
    case "undo_failed":
      return flow.step === "done" && flow.undo === "saving" ? { ...flow, undo: "idle", error: event.code } : flow;
    case "reset":
      return flow.step === "saving" ? flow : LINK_FLOW_START;
  }
}
