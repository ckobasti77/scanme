// The key stays stable across schema revisions so a future parser can migrate
// the versioned document instead of silently abandoning the existing garage.
export const FAIR_GARAGE_STORAGE_KEY = "scanme:fair-garage";
export const FAIR_GARAGE_VERSION = 1 as const;

export type FairGarageLastKnownModel = {
  eventSlug: string;
  modelSlug: string;
  brandName: string;
  displayName: string;
  priceText: string;
  photoUrl?: string;
};

export type FairGarageItem = {
  modelId: string;
  savedAt: number;
  lastKnown?: FairGarageLastKnownModel;
};

export type FairGarageDocument = {
  version: typeof FAIR_GARAGE_VERSION;
  events: Record<string, FairGarageItem[]>;
};

export type FairGarageReadResult = {
  document: FairGarageDocument;
  status: "ok" | "empty" | "invalid" | "unavailable";
};

export type FairGarageWriteResult =
  | { ok: true }
  | { ok: false; reason: "storage_unavailable" };

export type FairGarageStorage = Pick<Storage, "getItem" | "setItem">;

export type FairGarageStorageEvent = {
  key: string | null;
  newValue: string | null;
};

export type FairGarageStorageEventSource = {
  addEventListener(
    type: "storage",
    listener: (event: FairGarageStorageEvent) => void,
  ): void;
  removeEventListener(
    type: "storage",
    listener: (event: FairGarageStorageEvent) => void,
  ): void;
};

type AddFairGarageModelInput = {
  eventId: string;
  modelId: string;
  savedAt?: number;
  lastKnown?: FairGarageLastKnownModel;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseLastKnown(value: unknown): FairGarageLastKnownModel | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !nonEmptyString(value.eventSlug) ||
    !nonEmptyString(value.modelSlug) ||
    !nonEmptyString(value.brandName) ||
    !nonEmptyString(value.displayName) ||
    !nonEmptyString(value.priceText)
  ) {
    return undefined;
  }

  return {
    eventSlug: value.eventSlug,
    modelSlug: value.modelSlug,
    brandName: value.brandName,
    displayName: value.displayName,
    priceText: value.priceText,
    ...(nonEmptyString(value.photoUrl) ? { photoUrl: value.photoUrl } : {}),
  };
}

function parseItem(value: unknown): FairGarageItem | null {
  if (!isRecord(value)) return null;
  if (!nonEmptyString(value.modelId)) return null;
  if (typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt) || value.savedAt < 0) {
    return null;
  }

  const lastKnown = parseLastKnown(value.lastKnown);
  return {
    modelId: value.modelId,
    savedAt: value.savedAt,
    ...(lastKnown ? { lastKnown } : {}),
  };
}

function requireKey(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function createEmptyFairGarageDocument(): FairGarageDocument {
  return { version: FAIR_GARAGE_VERSION, events: {} };
}

export function parseFairGarageDocument(raw: string | null): FairGarageReadResult {
  if (raw === null || raw.trim() === "") {
    return { document: createEmptyFairGarageDocument(), status: "empty" };
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== FAIR_GARAGE_VERSION || !isRecord(value.events)) {
      return { document: createEmptyFairGarageDocument(), status: "invalid" };
    }

    const events: Record<string, FairGarageItem[]> = {};
    for (const [eventId, items] of Object.entries(value.events)) {
      if (!eventId.trim() || !Array.isArray(items)) continue;

      const seen = new Set<string>();
      const parsedItems: FairGarageItem[] = [];
      for (const candidate of items) {
        const item = parseItem(candidate);
        if (!item || seen.has(item.modelId)) continue;
        seen.add(item.modelId);
        parsedItems.push(item);
      }

      if (parsedItems.length > 0) events[eventId] = parsedItems;
    }

    return {
      document: { version: FAIR_GARAGE_VERSION, events },
      status: "ok",
    };
  } catch {
    return { document: createEmptyFairGarageDocument(), status: "invalid" };
  }
}

export function readFairGarage(storage: FairGarageStorage): FairGarageReadResult {
  try {
    return parseFairGarageDocument(storage.getItem(FAIR_GARAGE_STORAGE_KEY));
  } catch {
    return { document: createEmptyFairGarageDocument(), status: "unavailable" };
  }
}

export function writeFairGarage(
  storage: FairGarageStorage,
  document: FairGarageDocument,
): FairGarageWriteResult {
  try {
    storage.setItem(FAIR_GARAGE_STORAGE_KEY, JSON.stringify(document));
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

export function addFairGarageModel(
  document: FairGarageDocument,
  input: AddFairGarageModelInput,
): FairGarageDocument {
  const eventId = requireKey(input.eventId, "eventId");
  const modelId = requireKey(input.modelId, "modelId");
  const currentItems = document.events[eventId] ?? [];
  const existingIndex = currentItems.findIndex((item) => item.modelId === modelId);

  let nextItems: FairGarageItem[];
  if (existingIndex >= 0) {
    nextItems = currentItems.map((item, index) =>
      index === existingIndex && input.lastKnown
        ? { ...item, lastKnown: input.lastKnown }
        : item,
    );
  } else {
    const savedAt = input.savedAt ?? Date.now();
    if (!Number.isFinite(savedAt) || savedAt < 0) {
      throw new Error("savedAt must be a finite non-negative number");
    }
    nextItems = [
      ...currentItems,
      {
        modelId,
        savedAt,
        ...(input.lastKnown ? { lastKnown: input.lastKnown } : {}),
      },
    ];
  }

  return {
    version: FAIR_GARAGE_VERSION,
    events: { ...document.events, [eventId]: nextItems },
  };
}

export function removeFairGarageModel(
  document: FairGarageDocument,
  eventIdInput: string,
  modelIdInput: string,
): FairGarageDocument {
  const eventId = requireKey(eventIdInput, "eventId");
  const modelId = requireKey(modelIdInput, "modelId");
  const currentItems = document.events[eventId] ?? [];
  const nextItems = currentItems.filter((item) => item.modelId !== modelId);
  if (nextItems.length === currentItems.length) return document;

  const events = { ...document.events };
  if (nextItems.length === 0) delete events[eventId];
  else events[eventId] = nextItems;

  return { version: FAIR_GARAGE_VERSION, events };
}

export function hasFairGarageModel(
  document: FairGarageDocument,
  eventId: string,
  modelId: string,
): boolean {
  return (document.events[eventId] ?? []).some((item) => item.modelId === modelId);
}

export function getFairGarageModels(
  document: FairGarageDocument,
  eventId: string,
): readonly FairGarageItem[] {
  return document.events[eventId] ?? [];
}

export function subscribeToFairGarage(
  source: FairGarageStorageEventSource,
  onChange: (result: FairGarageReadResult) => void,
): () => void {
  const listener = (event: FairGarageStorageEvent) => {
    if (event.key !== FAIR_GARAGE_STORAGE_KEY && event.key !== null) return;
    onChange(parseFairGarageDocument(event.newValue));
  };

  source.addEventListener("storage", listener);
  return () => source.removeEventListener("storage", listener);
}
