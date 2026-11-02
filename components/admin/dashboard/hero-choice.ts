// ADMIN v3 V2 — „Sazvežđe | Samo lista“: whether the hero of the Dashboard is
// shown. Kept in this browser only; a storage that throws (private mode, a
// blocked site) means the default and never an error, like the quiet mode.

export const DASHBOARD_HERO_KEY = "scanme.admin.dashboard.hero";

export type DashboardHero = "constellation" | "list";

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem" | "removeItem">;

export function readDashboardHero(storage: ReadStorage | null | undefined): DashboardHero {
  try {
    return storage?.getItem(DASHBOARD_HERO_KEY) === "list" ? "list" : "constellation";
  } catch {
    return "constellation";
  }
}

/** false when the choice could not be kept (it still holds until the page is closed). */
export function writeDashboardHero(storage: WriteStorage | null | undefined, hero: DashboardHero): boolean {
  try {
    if (!storage) return false;
    if (hero === "list") storage.setItem(DASHBOARD_HERO_KEY, "list");
    else storage.removeItem(DASHBOARD_HERO_KEY);
    return true;
  } catch {
    return false;
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let value: DashboardHero | null = null;
const listeners = new Set<() => void>();

export const dashboardHeroStore = {
  get(): DashboardHero {
    value ??= readDashboardHero(browserStorage());
    return value;
  },
  /** The server and the first paint show the Constellation: the choice is read after hydration. */
  getServer: (): DashboardHero => "constellation",
  set(hero: DashboardHero) {
    if (dashboardHeroStore.get() === hero) return;
    value = hero;
    writeDashboardHero(browserStorage(), hero);
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
