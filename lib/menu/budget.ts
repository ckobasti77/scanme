// ScanMe Menu V1 (K05) — the budget of one publication (K01 §3.3). Publish and
// restore are ONE Convex transaction each, so a version must fit the
// transaction limits (16 MiB written, 16 000 documents, 4 096 index ranges).
// These ceilings are technical, not commercial; when a menu outgrows them the
// mutation refuses with menu/publish_too_large or menu/restore_too_large and
// writes nothing (phased publishing and batched restore are later steps).

/** One menuVersionParts document (Convex documents are ≤ 1 MiB). */
export const MENU_VERSION_PART_MAX_BYTES = 512 * 1024;
/** All parts of one version together. */
export const MENU_VERSION_MAX_BYTES = 8 * 1024 * 1024;
/** Parts of one version (pages × languages, splitter, Room service, internal). */
export const MENU_VERSION_MAX_PARTS = 1000;
/** Master §6.1: the newest 20 published versions are kept. */
export const MENU_RETAINED_VERSIONS = 20;
/** Versions one publication may retire (normally exactly one). */
export const MENU_MAX_RETIRE_PER_PUBLISH = 10;
/** Parts deleted per pruning batch. */
export const MENU_PRUNE_BATCH = 100;

/** Writes one restore may plan (inserts, patches, deletes, counters). */
export const MENU_RESTORE_MAX_WRITES = 8000;
/** Bytes one restore may write. */
export const MENU_RESTORE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Rows one publish or restore reads from the draft, per table. A draft beyond
 * any of them is refused as too large (nothing is written).
 */
export const MENU_DRAFT_LOAD_LIMITS = {
  pages: 50,
  sections: 1000,
  articles: 2000,
  placements: 8000,
  variants: 8000,
  addonGroups: 500,
  addonOptions: 5000,
  articleAddonGroups: 8000,
  comboComponents: 4000,
  roomServiceCategories: 100,
  roomServiceItems: 2000,
} as const;

/** Headroom kept free after a publication's own writes (audit, scheduling, counters). */
export const MENU_TX_RESERVE = {
  documentsWritten: 200,
  bytesWritten: 512 * 1024,
} as const;

/** UTF-8 length of a string without allocating its encoding. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

export type VersionBudgetCheck =
  | { ok: true }
  | { ok: false; reason: "bytes" | "parts" | "part_too_large" };

/** Whether compiled parts fit one version. */
export function checkVersionBudget(parts: readonly { bytes: number }[]): VersionBudgetCheck {
  if (parts.length > MENU_VERSION_MAX_PARTS) return { ok: false, reason: "parts" };
  let total = 0;
  for (const part of parts) {
    if (part.bytes > MENU_VERSION_PART_MAX_BYTES) return { ok: false, reason: "part_too_large" };
    total += part.bytes;
  }
  return total > MENU_VERSION_MAX_BYTES ? { ok: false, reason: "bytes" } : { ok: true };
}

/**
 * Whether the remaining transaction budget (ctx.meta.getTransactionMetrics)
 * still has room for `documents` writes of `bytes` plus the reserve.
 */
export function hasWriteHeadroom(
  remaining: { documentsWritten: number; bytesWritten: number },
  planned: { documents: number; bytes: number },
): boolean {
  return (
    remaining.documentsWritten >= planned.documents + MENU_TX_RESERVE.documentsWritten &&
    remaining.bytesWritten >= planned.bytes + MENU_TX_RESERVE.bytesWritten
  );
}
