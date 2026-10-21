// ScanMe Menu V1 (K21) — the contract of the guest UI on the public menu
// (master §8, §9.1). Presentational components get data and these actions as
// props: the real route wires Server Actions and the Convex subscription
// (./ostrvo.tsx), the izlog wires an in-memory venue (lib/menu/gost/memorija.ts).

import type { MyRequest } from "@/convex/menuGuest";
import type { OrderLineInput } from "@/lib/menu/cart";
import type { GuestActions, GuestPositionKind } from "@/lib/menu/guest-actions";
import type { GuestActionResult, GuestCancelResult } from "@/lib/menu/http/guest-actions";
import type { MenuPaymentPreference, MenuRequestChannel } from "@/lib/menu/request-status";

export type GostPozicija = { naziv: string; vrsta: GuestPositionKind };

/** Everything the guest UI of one page needs; serializable (server → client). */
export type GostKontekst = {
  slug: string;
  pozicija: GostPozicija;
  radnje: GuestActions;
  /** Which order this page sends: the standard pages, or Room service. */
  kanal: MenuRequestChannel;
  /** The page key the cart lines come from; null on Room service. */
  pageKey: string | null;
  /** Room service: the delivery fee added once per order; null = none. */
  dostavaRsd: number | null;
  linkovi: {
    meni: string;
    mojiZahtevi: string;
    /** Room service, for a room on a standard page; null otherwise. */
    roomService: string | null;
  };
};

export type GostIshod = GuestActionResult;
export type GostOtkazIshod = GuestCancelResult;

export type GostPorudzbina = {
  kanal: MenuRequestChannel;
  linije: OrderLineInput[];
  videnUkupnoRsd: number;
  /** The key of this send attempt: the same cart re-sent after a lost answer is not written twice. */
  kljuc: string;
};

/** What the guest's buttons do. */
export type GostRadnje = {
  pozovi(): Promise<GostIshod>;
  racun(nacin: MenuPaymentPreference): Promise<GostIshod>;
  posalji(porudzbina: GostPorudzbina): Promise<GostIshod>;
  otkazi(requestId: string): Promise<GostOtkazIshod>;
};

/** One of "Moji zahtevi" (convex/menuGuest.ts myRequests), with a plain string id. */
export type GostZahtev = Omit<MyRequest, "id"> & { id: string };
