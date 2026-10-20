// ScanMe Menu V1 (K22) — the contract between the waiter panel's screens and
// whoever feeds them: the live route (ruta.tsx, Convex) or the izlog (memory
// over fixtures). The shapes mirror convex/menuWaiter.ts (WaiterRequestRow,
// WaiterRequestDetail, WaiterQueue) with plain string ids, so the
// presentation never imports Convex.

import type {
  MenuPaymentPreference,
  MenuRequestChannel,
  MenuRequestKind,
  MenuRequestStatus,
} from "@/lib/menu/request-status";

export type KonobarMestoVrsta = "table" | "room" | "other";

export type KonobarZahtev = {
  id: string;
  kind: MenuRequestKind;
  status: MenuRequestStatus;
  channel: MenuRequestChannel;
  positionLabel: string;
  positionKind: KonobarMestoVrsta;
  zoneName: string | null;
  createdAt: number;
  acceptedAt: number | null;
  paymentPreference: MenuPaymentPreference | null;
  itemCount: number | null;
  totalRsd: number | null;
  acceptedBy: { name: string; isMe: boolean } | null;
};

export type KonobarStavka = {
  name: string;
  variantName: string | null;
  addons: { groupName: string; optionName: string; priceDeltaRsd: number }[];
  quantity: number;
  unitPriceRsd: number;
  lineTotalRsd: number;
  promoApplied: boolean;
  note: string | null;
};

export type KonobarDetalj = {
  request: KonobarZahtev & {
    sourceLabel: string | null;
    subtotalRsd: number | null;
    deliveryFeeRsd: number | null;
    doneAt: number | null;
    doneBy: string | null;
    cancelledAt: number | null;
    cancelledBy: "guest" | "staff" | null;
  };
  items: KonobarStavka[];
  others: KonobarZahtev[];
};

export type KonobarOtkazan = {
  id: string;
  kind: MenuRequestKind;
  positionLabel: string;
  cancelledAt: number | null;
  cancelledBy: "guest" | "staff" | null;
};

export type KonobarRed = {
  zahtevi: KonobarZahtev[];
  skraceno: boolean;
  otkazani: KonobarOtkazan[];
};

export type KonobarKorisnik = {
  kind: "staff" | "account";
  displayName: string;
  /** When the PIN sign-in ends (12 h); null for an account. */
  expiresAt: number | null;
};

/** What a status action answered (convex/menuWaiter.ts WaiterActionOutcome). */
export type KonobarIshod =
  | { ok: true; status: MenuRequestStatus; changed: boolean }
  | { ok: false; code: string; status?: MenuRequestStatus; takenBy?: string };

export type KonobarRadnje = {
  preuzmi(id: string): Promise<KonobarIshod>;
  zavrsi(id: string): Promise<KonobarIshod>;
  otkazi(id: string, ocekivaniStatus: MenuRequestStatus): Promise<KonobarIshod>;
  odjava(): void | Promise<void>;
};

// -----------------------------------------------------------------------------
// The PIN screen
// -----------------------------------------------------------------------------

export type PinStanje =
  | { kind: "unos" }
  | { kind: "proverava" }
  | { kind: "pogresan"; attemptsLeft: number }
  | { kind: "blokada"; lockedUntil: number }
  /** The answer never came (network, server). */
  | { kind: "veza" }
  /** Too many attempts from this network (the IP bucket). */
  | { kind: "previse" }
  /** PINs were switched off on the deployment meanwhile. */
  | { kind: "nedostupno" };

/** What the PIN sign-in answered (lib/menu/http/staff-session.ts StaffSessionBody, mapped). */
export type PinIshod =
  | { ok: true }
  | { ok: false; stanje: Exclude<PinStanje, { kind: "unos" } | { kind: "proverava" }> };
