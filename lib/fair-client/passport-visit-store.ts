const STORAGE_KEY = "scanme:fair-passport-visits:v1";

type PassportVisitDocument = {
  version: 1;
  seen: Record<string, string[]>;
  /** Stamp passport: when each seen model was stuck on this device (ms). */
  stuckAt: Record<string, Record<string, number>>;
  /** Stamp passport overview: passports whose completion seal already landed here. */
  sealShown: string[];
};

type PassportVisitStorage = Pick<Storage, "getItem" | "setItem">;

function entryKey(eventId: string, passportId: string) {
  return `${eventId}:${passportId}`;
}

function emptyDocument(): PassportVisitDocument {
  return { version: 1, seen: {}, stuckAt: {}, sealShown: [] };
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
    const stuckSource = (value as { stuckAt?: unknown }).stuckAt;
    const stuckAt: Record<string, Record<string, number>> = {};
    if (stuckSource && typeof stuckSource === "object" && !Array.isArray(stuckSource)) {
      for (const [key, dates] of Object.entries(stuckSource)) {
        if (!dates || typeof dates !== "object" || Array.isArray(dates)) continue;
        const entry: Record<string, number> = {};
        for (const [modelId, at] of Object.entries(dates)) {
          if (typeof at === "number" && Number.isFinite(at)) entry[modelId] = at;
        }
        stuckAt[key] = entry;
      }
    }
    const sealSource = (value as { sealShown?: unknown }).sealShown;
    const sealShown = Array.isArray(sealSource)
      ? [...new Set(sealSource.filter((key): key is string => typeof key === "string" && key.length > 0))]
      : [];
    return { version: 1, seen, stuckAt, sealShown };
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
  /** Stamp passport: records the sticking moment for ids that have none yet. */
  stuckAt?: number,
): boolean {
  try {
    const document = readDocument(storage);
    const key = entryKey(eventId, passportId);
    document.seen[key] = [...new Set([...(document.seen[key] ?? []), ...modelIds])];
    if (stuckAt !== undefined) {
      const dates = { ...(document.stuckAt[key] ?? {}) };
      for (const modelId of modelIds) dates[modelId] ??= stuckAt;
      document.stuckAt[key] = dates;
    }
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
    const dates = { ...(document.stuckAt[key] ?? {}) };
    for (const modelId of forgotten) delete dates[modelId];
    document.stuckAt[key] = dates;
    // Un-sticking breaks the full set, so its seal may land again later.
    if (forgotten.size > 0) document.sealShown = document.sealShown.filter((entry) => entry !== key);
    storage.setItem(STORAGE_KEY, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}

/** Stamp passport: model id → moment it was stuck on this device. */
export function passportStuckAt(
  storage: PassportVisitStorage,
  eventId: string,
  passportId: string,
): Record<string, number> {
  return { ...(readDocument(storage).stuckAt[entryKey(eventId, passportId)] ?? {}) };
}

/** Stamp passport overview: the completion seal of this passport already landed on this device. */
export function passportSealShown(storage: PassportVisitStorage, eventId: string, passportId: string): boolean {
  return readDocument(storage).sealShown.includes(entryKey(eventId, passportId));
}

export function markPassportSealShown(storage: PassportVisitStorage, eventId: string, passportId: string): boolean {
  try {
    const document = readDocument(storage);
    const key = entryKey(eventId, passportId);
    if (!document.sealShown.includes(key)) document.sealShown.push(key);
    storage.setItem(STORAGE_KEY, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}

export const FAIR_PASSPORT_VISIT_CHANGE_EVENT = "scanme:fair-passport-visits-change";
