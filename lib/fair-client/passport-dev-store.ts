import type { FairPassportProgress, FairPassportState } from "@/lib/fair-contract";

const STORAGE_KEY = "scanme:fair-passport-dev-stamps:v1";

type PassportDevDocument = {
  version: 1;
  stamps: Record<string, string[]>;
};

type PassportDevStorage = Pick<Storage, "getItem" | "setItem">;

function key(eventId: string, passportId: string) {
  return `${eventId}:${passportId}`;
}

function readDocument(storage: PassportDevStorage): PassportDevDocument {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, stamps: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) {
      return { version: 1, stamps: {} };
    }
    const source = (parsed as { stamps?: unknown }).stamps;
    if (!source || typeof source !== "object" || Array.isArray(source)) return { version: 1, stamps: {} };
    const stamps: Record<string, string[]> = {};
    for (const [entry, ids] of Object.entries(source)) {
      if (!Array.isArray(ids)) continue;
      stamps[entry] = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
    }
    return { version: 1, stamps };
  } catch {
    return { version: 1, stamps: {} };
  }
}

export function readDevPassportStampIds(
  storage: PassportDevStorage,
  eventId: string,
  passportId: string,
): string[] | null {
  const document = readDocument(storage);
  const entry = key(eventId, passportId);
  return Object.hasOwn(document.stamps, entry) ? document.stamps[entry] : null;
}

export function writeDevPassportStampIds(
  storage: PassportDevStorage,
  eventId: string,
  passportId: string,
  modelIds: readonly string[],
): boolean {
  try {
    const document = readDocument(storage);
    document.stamps[key(eventId, passportId)] = [...new Set(modelIds)];
    storage.setItem(STORAGE_KEY, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}

function progressWithIds(progress: FairPassportProgress, modelIds: string[]): FairPassportProgress {
  const stampedModelIds = [...new Set(modelIds)];
  const completed = progress.requiredCount > 0 && stampedModelIds.length >= progress.requiredCount;
  return {
    ...progress,
    stampedModelIds,
    stampedCount: stampedModelIds.length,
    completed,
    ...(!completed ? { favoriteModelId: undefined, favoriteResult: undefined } : {}),
  };
}

export function applyDevPassportStamps(
  storage: PassportDevStorage,
  state: FairPassportState,
): FairPassportState {
  const byPassport = new Map(state.progress.map((progress) => [progress.passportId, progress]));
  const progress = state.catalog.map((passport) => {
    const base = byPassport.get(passport.passportId) ?? {
      passportId: passport.passportId,
      stampedModelIds: [],
      stampedCount: 0,
      requiredCount: passport.models.length,
      completed: false,
    } satisfies FairPassportProgress;
    const override = readDevPassportStampIds(storage, state.eventId, passport.passportId);
    if (override === null) return base;
    const allowed = new Set(passport.models.map((model) => model.eventModelId));
    return progressWithIds(base, override.filter((modelId) => allowed.has(modelId)));
  });
  return { ...state, progress };
}

export function devPassportProgressWithStamp(
  progress: FairPassportProgress,
  eventModelId: string,
  collected: boolean,
): FairPassportProgress {
  const ids = collected
    ? [...progress.stampedModelIds, eventModelId]
    : progress.stampedModelIds.filter((modelId) => modelId !== eventModelId);
  return progressWithIds(progress, ids);
}
