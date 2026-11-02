// ADMIN v2 X4 — the quiet mode (ZADATAK §5.7): one switch in the profile menu
// that turns off the celebrations (the confirmation of a solved mission, the
// „Sve čisto“ moment) and the toasts (a new record). Numbers, progress and the
// odometer stay: they are information, not a celebration. The choice is kept in
// this browser only; a storage that throws (private mode, a blocked site) means
// "not quiet" and never an error.

export const QUIET_MODE_KEY = "scanme.admin.quiet";

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem" | "removeItem">;

export function readQuietMode(storage: ReadStorage | null | undefined): boolean {
  try {
    return storage?.getItem(QUIET_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

/** false when the choice could not be kept (it still holds until the page is closed). */
export function writeQuietMode(storage: WriteStorage | null | undefined, quiet: boolean): boolean {
  try {
    if (!storage) return false;
    if (quiet) storage.setItem(QUIET_MODE_KEY, "1");
    else storage.removeItem(QUIET_MODE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Celebrations and toasts are shown only while the quiet mode is off; everything that only informs stays. */
export const celebrationsOn = (quiet: boolean) => !quiet;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The quiet mode of this tab: read once from the storage, then kept in memory and written through. */
export function createQuietModeStore(storage: () => (ReadStorage & WriteStorage) | null = browserStorage) {
  let value: boolean | null = null;
  let watching = false;
  const listeners = new Set<() => void>();
  const get = () => {
    if (value === null) value = readQuietMode(storage());
    return value;
  };
  // Another tab changed the choice: this one follows (the browser tells every other tab of the site).
  const watch = () => {
    if (watching || typeof window === "undefined") return;
    watching = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== QUIET_MODE_KEY && event.key !== null) return;
      const next = readQuietMode(storage());
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    });
  };
  return {
    get,
    set(quiet: boolean) {
      if (get() === quiet) return;
      value = quiet;
      writeQuietMode(storage(), quiet);
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      watch();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const quietModeStore = createQuietModeStore();
