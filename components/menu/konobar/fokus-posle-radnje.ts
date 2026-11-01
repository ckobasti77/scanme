// ScanMe Menu V1 (K33) — where the keyboard focus goes after the action of a card (MENU-UX §10).
// "Preuzmi" moves a card from `Novi` to `Prihvaćeni` (a new element: the button under the focus is
// gone) and "Završi" removes it, so the focus would fall to the page and the next Tab would start
// from the top. The focus follows the card instead: to the same card in its new place, or, when the
// card left, to the next card still in the list, else to the heading of the pane.
//
// Only after a keyboard action (the focus ring was visible): a tap keeps the list where it is, and
// nobody scrolls under a finger. The panel remembers the card BEFORE the action (`zapamtiKarticu`),
// and after the answer waits until the list shows the new state (`vratiFokus`, run after every
// render) and then moves the focus once.

export type CekaFokus = {
  id: string;
  /** What the action answered. */
  ishod: "accepted" | "done" | "cancelled";
  /** The ids of the cards of the pane in the order they stood before the action. */
  redosled: string[];
  /** Epoch ms after which the list is left alone (the new state never came). */
  rok: number;
};

/** The card that takes the focus when `id` is gone: the next one still in the list, else the one before it. */
export function sledeciFokus(redosled: readonly string[], id: string, ostali: ReadonlySet<string>): string | null {
  const mesto = redosled.indexOf(id);
  if (mesto < 0) return null;
  const posle = redosled.slice(mesto + 1).find((kandidat) => ostali.has(kandidat));
  if (posle !== undefined) return posle;
  return redosled.slice(0, mesto).reverse().find((kandidat) => ostali.has(kandidat)) ?? null;
}

const KARTICE = "[data-bocni-pano] article[data-zahtev], [data-bocni-pano] article[data-rezervacija]";

function idKartice(kartica: Element): string {
  return kartica.getAttribute("data-zahtev") ?? kartica.getAttribute("data-rezervacija") ?? "";
}

function selektor(id: string): string {
  const e = CSS.escape(id);
  return `[data-bocni-pano] article[data-zahtev="${e}"], [data-bocni-pano] article[data-rezervacija="${e}"]`;
}

/** The first button of a card: its title, the one that opens it (the next Tab reaches the card's action). */
function prvoDugme(kartica: Element | null): HTMLElement | null {
  return kartica?.querySelector<HTMLElement>("button") ?? null;
}

/**
 * Call BEFORE the action: when the keyboard focus (a visible ring) is on a button of the card of
 * request `id`, the order of the cards of the pane; otherwise null (a tap, or the action came from elsewhere).
 */
export function zapamtiKarticu(id: string): string[] | null {
  const aktivan = document.activeElement;
  if (!(aktivan instanceof HTMLElement) || !vidljivFokus(aktivan)) return null;
  if (aktivan.closest("article[data-zahtev]")?.getAttribute("data-zahtev") !== id) return null;
  return [...document.querySelectorAll(KARTICE)].map(idKartice);
}

/** Does the element show a focus ring (keyboard focus)? An engine without `:focus-visible` says no: the action must never fail for this. */
function vidljivFokus(element: HTMLElement): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

/**
 * Moves the focus once the list shows the answer of the action. Returns true when it is finished (the
 * focus moved, or it was left where the person put it), false to try again after the next render.
 * `naslovId` is the heading that takes the focus when no card is left.
 */
export function vratiFokus(ceka: CekaFokus, naslovId: string): boolean {
  const kartica = document.querySelector(selektor(ceka.id));
  // Wait for the new state: `Prihvaćen` drawn on the card, or the card gone.
  if (ceka.ishod === "accepted" ? kartica?.getAttribute("data-status") !== "accepted" : kartica !== null) return false;
  const aktivan = document.activeElement;
  // The focus is somewhere on purpose (it stayed, or the person moved on): hands off.
  if (aktivan && aktivan !== document.body) return true;
  if (kartica) {
    prvoDugme(kartica)?.focus();
    return true;
  }
  const ostali = new Set(ceka.redosled.filter((id) => id !== ceka.id && document.querySelector(selektor(id)) !== null));
  const sledeca = sledeciFokus(ceka.redosled, ceka.id, ostali);
  (prvoDugme(sledeca === null ? null : document.querySelector(selektor(sledeca))) ?? document.getElementById(naslovId))?.focus();
  return true;
}
