// ADMIN v3 V3 — „2D | 3D“ of the hall heat map. On a desktop the 3D hall is the
// default and 2D stays a choice and the fallback; below 768 px the 2D map is the
// default. A choice is kept in this browser only; a storage that throws
// (private mode, a blocked site) means the default and never an error, like the
// quiet mode. When 3D cannot run here the page shows 2D until 3D is asked for again.

export const HALL_VIEW_KEY = "scanme.admin.hall.view";
/** From this window width (px) the 3D hall is what opens first. */
export const HALL_3D_FROM = 768;

export type HallView = "2d" | "3d";

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

/** The kept choice; null when there is none (or the storage is not readable). */
export function readHallView(storage: ReadStorage | null | undefined): HallView | null {
  try {
    const value = storage?.getItem(HALL_VIEW_KEY);
    return value === "2d" || value === "3d" ? value : null;
  } catch {
    return null;
  }
}

/** false when the choice could not be kept (it still holds until the page is closed). */
export function writeHallView(storage: WriteStorage | null | undefined, view: HallView): boolean {
  try {
    if (!storage) return false;
    storage.setItem(HALL_VIEW_KEY, view);
    return true;
  } catch {
    return false;
  }
}

/** What opens first: the kept choice, else 3D on a desktop and 2D on a phone. */
export function hallViewFor(choice: HallView | null, viewportWidth: number): HallView {
  return choice ?? (viewportWidth >= HALL_3D_FROM ? "3d" : "2d");
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let value: HallView | null = null;
/** 3D could not run in this tab: 2D is shown, whatever the default says. */
let failed = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

export const hallViewStore = {
  get(): HallView {
    value ??= hallViewFor(readHallView(browserStorage()), window.innerWidth);
    return failed ? "2d" : value;
  },
  /** The server and the first paint show the 2D map: it needs no script and no WebGL. */
  getServer: (): HallView => "2d",
  /** The choice of the user: kept, and 3D is tried again after a failure. */
  set(view: HallView) {
    failed = false;
    value = view;
    writeHallView(browserStorage(), view);
    emit();
  },
  /** 3D cannot run here (no WebGL, a lost context, a chunk that did not load). */
  fail() {
    if (failed) return;
    failed = true;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
