// Admin UX A1 — the `Tabela | Kartice` choice of one admin list. Pure logic
// shared by AdminViewToggle/AdminDataView and their tests (vitest runs without
// a DOM, so storage and keyboard behaviour live here).

export type AdminViewMode = "tabela" | "kartice";

export const ADMIN_VIEW_MODES: readonly AdminViewMode[] = ["tabela", "kartice"];
export const ADMIN_VIEW_STORAGE_PREFIX = "scanme-admin-view:";
/** Same-tab notification; `storage` only fires in other tabs. */
export const ADMIN_VIEW_CHANGE_EVENT = "scanme-admin-view-change";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function isAdminViewMode(value: unknown): value is AdminViewMode {
  return value === "tabela" || value === "kartice";
}

/** `?prikaz=tabela|kartice` (URL, dev previews); anything else is no choice. */
export function parseViewModeParam(value: string | string[] | undefined | null): AdminViewMode | null {
  const single = Array.isArray(value) ? value[0] : value;
  return isAdminViewMode(single) ? single : null;
}

export function viewModeStorageKey(listKey: string) {
  return `${ADMIN_VIEW_STORAGE_PREFIX}${listKey}`;
}

/** The saved choice, or null when none is saved or the storage throws (private mode, blocked). */
export function readViewMode(storage: ReadableStorage | null | undefined, listKey: string): AdminViewMode | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(viewModeStorageKey(listKey));
    return isAdminViewMode(value) ? value : null;
  } catch {
    return null;
  }
}

/** Saves the choice; returns false instead of throwing when the storage refuses. */
export function writeViewMode(storage: WritableStorage | null | undefined, listKey: string, mode: AdminViewMode): boolean {
  if (!storage) return false;
  try {
    storage.setItem(viewModeStorageKey(listKey), mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Saved choices with an in-memory fallback: when the browser refuses
 * localStorage the toggle still switches the list for this session.
 */
export function createViewModeStore(getStorage: () => (ReadableStorage & WritableStorage) | null) {
  const memory = new Map<string, AdminViewMode>();
  return {
    read(listKey: string): AdminViewMode | null {
      return memory.get(listKey) ?? readViewMode(getStorage(), listKey);
    },
    /** True when the choice also reached localStorage. */
    write(listKey: string, mode: AdminViewMode): boolean {
      memory.set(listKey, mode);
      return writeViewMode(getStorage(), listKey, mode);
    },
  };
}

/**
 * Which view a list shows: an explicit (URL/preview) value wins, then the
 * saved choice; without either the list is `auto` — Tabela on wide screens,
 * Kartice on phones, decided by CSS so the server render never flickers.
 */
export function resolveViewMode(explicit: AdminViewMode | null | undefined, stored: AdminViewMode | null): AdminViewMode | "auto" {
  return explicit ?? stored ?? "auto";
}

/** Roving focus inside a radiogroup: arrows wrap, Home/End jump; null = key not handled. */
export function nextRadioIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
