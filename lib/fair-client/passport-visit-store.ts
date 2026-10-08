const STORAGE_KEY = "scanme:fair-passport-visits:v1";

type PassportVisitDocument = {
  version: 1;
  seen: Record<string, string[]>;
};

type PassportVisitStorage = Pick<Storage, "getItem" | "setItem">;

function entryKey(eventId: string, passportId: string) {
  return `${eventId}:${passportId}`;
}

function emptyDocument(): PassportVisitDocument {
  return { version: 1, seen: {} };
}

function readDocument(storage: PassportVisitStorage): PassportVisitDocument {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyDocument();
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) {
      return emptyDocument();
    }
    const source = (value as { seen?: unknown }).seen;
    if (!source || typeof source !== "object" || Array.isArray(source)) return emptyDocument();
    const seen: Record<string, string[]> = {};
    for (const [key, ids] of Object.entries(source)) {
      if (!Array.isArray(ids)) continue;
      seen[key] = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
    }
    return { version: 1, seen };
  } catch {
    return emptyDocument();
  }
}

export function unreadPassportModelIds(
  storage: PassportVisitStorage,
  eventId: string,
  passportId: string,
  stampedModelIds: readonly string[],
): string[] {
  const seen = new Set(readDocument(storage).seen[entryKey(eventId, passportId)] ?? []);
  return stampedModelIds.filter((modelId) => !seen.has(modelId));
}

export function markPassportModelsSeen(
  storage: PassportVisitStorage,
  eventId: string,
  passportId: string,
  modelIds: readonly string[],
): boolean {
  try {
    const document = readDocument(storage);
    const key = entryKey(eventId, passportId);
    document.seen[key] = [...new Set([...(document.seen[key] ?? []), ...modelIds])];
    storage.setItem(STORAGE_KEY, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}

export function forgetPassportModelsSeen(
  storage: PassportVisitStorage,
  eventId: string,
  passportId: string,
  modelIds: readonly string[],
): boolean {
  try {
    const document = readDocument(storage);
    const key = entryKey(eventId, passportId);
    const forgotten = new Set(modelIds);
    document.seen[key] = (document.seen[key] ?? []).filter((modelId) => !forgotten.has(modelId));
    storage.setItem(STORAGE_KEY, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}

export const FAIR_PASSPORT_VISIT_CHANGE_EVENT = "scanme:fair-passport-visits-change";
