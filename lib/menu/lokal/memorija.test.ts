// ScanMe Menu V1 (K20) — the in-memory "Lokal i QR": the izlog applies the
// same rules as the Convex mutations (labels and zone names unique, seats and
// batch bounds, the floor grid, positions with a QR card stay, cards of ScanMe
// are read-only), atomically and deterministically.

import { describe, expect, test } from "vitest";
import { MENU_ERROR } from "../errors/core";
import { FLOOR_ERROR } from "../errors/floor";
import {
  autoArrange,
  defaultLayoutSize,
  isValidLayout,
  overlaps,
  placeLayouts,
  type FloorLayout,
} from "../floor-layout";
import {
  MENU_MAX_POSITION_BATCH,
  MENU_MAX_POSITIONS,
  MENU_MAX_QR_MINT_BATCH,
  MENU_MAX_SEATS,
  MENU_MAX_ZONES,
  MENU_TEXT,
} from "../limits";
import {
  kodKartice,
  LOKAL_MEMORIJA_SADA,
  LOKAL_PODRAZUMEVANA_OZNAKA,
  memorijaOd,
  napraviRadnje,
  praznaMemorija,
  primeniRadnju,
  type LokalMemorija,
  type LokalRadnjaMemorije,
} from "./memorija";
import type { LokalKartica, LokalPodaci, LokalPozicija, LokalStranica } from "./model";

const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

// --- Data -------------------------------------------------------------------------

function raspored(x: number, y: number, w = 3, h = 2, shape: FloorLayout["shape"] = "rect"): FloorLayout {
  return { x, y, w, h, shape };
}

function pozicija(id: string, label: string, izmena: Partial<LokalPozicija> = {}): LokalPozicija {
  return { id, key: `ps_${id}`, kind: "table", label, seats: 4, zoneId: null, layout: null, order: 0, ...izmena };
}

function kartica(id: string, izmena: Partial<LokalKartica> = {}): LokalKartica {
  return {
    id,
    cardCode: `ZZ${id.toUpperCase().replace(/[^0-9A-Z]/g, "").padEnd(6, "0").slice(0, 6)}`,
    label: id,
    status: "active",
    managedByScanMe: false,
    opensMenu: true,
    link: { pageKey: null, positionId: null, active: true },
    totalScans: 3,
    lastScanAt: LOKAL_MEMORIJA_SADA - 60_000,
    createdAt: LOKAL_MEMORIJA_SADA - 86_400_000,
    ...izmena,
  };
}

const STRANICE: LokalStranica[] = [
  { key: "pg_glavni", name: "Kompletan meni", slug: "glavni", isDefault: true },
  { key: "pg_vinska", name: "Vinska karta", slug: "vinska-karta", isDefault: false },
];

/**
 * Sala: Sto 1, Sto 2. Terasa: Sto 3 (round, 4x4). Bez zone: Šank (no layout yet,
 * the plan draws it at 0,0). Cards: Sto 1 active, Sto 2 disabled, one adopted by
 * ScanMe, one that leads elsewhere (link to Sto 3 kept).
 */
function osnovniPodaci(): LokalPodaci {
  return {
    zones: [
      { id: "z-sala", key: "zn_sala", name: "Sala", order: 0 },
      { id: "z-terasa", key: "zn_terasa", name: "Terasa", order: 1 },
    ],
    positions: [
      pozicija("p-a", "Sto 1", { zoneId: "z-sala", layout: raspored(0, 0), order: 0 }),
      pozicija("p-b", "Sto 2", { zoneId: "z-sala", layout: raspored(5, 0), order: 1 }),
      pozicija("p-c", "Sto 3", { zoneId: "z-terasa", layout: raspored(0, 0, 4, 4, "round"), order: 2 }),
      pozicija("p-d", "Šank", { kind: "other", seats: null, order: 3 }),
    ],
    cards: [
      kartica("k-a", { label: "Sto 1", link: { pageKey: null, positionId: "p-a", active: true } }),
      kartica("k-b", { label: "Sto 2", status: "disabled", link: { pageKey: null, positionId: "p-b", active: true } }),
      kartica("k-c", { label: "Ulaz", managedByScanMe: true, link: null }),
      kartica("k-d", { label: "Sto 3 staro", opensMenu: false, link: { pageKey: null, positionId: "p-c", active: true } }),
    ],
    pages: STRANICE.map((stranica) => ({ ...stranica })),
    cardsTruncated: false,
  };
}

function osnovno(): LokalMemorija {
  return memorijaOd(osnovniPodaci(), { sledeciBroj: 100 });
}

function sPozicijama(broj: number): LokalMemorija {
  const positions = Array.from({ length: broj }, (_, index) =>
    pozicija(`p-m${index}`, `Mesto ${index + 1}`, { order: index }),
  );
  return memorijaOd({ ...osnovniPodaci(), positions, cards: [] }, { sledeciBroj: 1000 });
}

function zamrzni<T>(vrednost: T): T {
  if (vrednost && typeof vrednost === "object" && !Object.isFrozen(vrednost)) {
    Object.freeze(vrednost);
    for (const unutra of Object.values(vrednost)) zamrzni(unutra);
  }
  return vrednost;
}

// --- Assertions ---------------------------------------------------------------------

function uspeh(stanje: LokalMemorija, radnja: LokalRadnjaMemorije): LokalMemorija {
  const korak = primeniRadnju(stanje, radnja);
  expect(korak.ishod).toEqual({ ok: true });
  return korak.stanje;
}

/** Refused: the right code and nothing changed (the very same state object). */
function odbijeno(stanje: LokalMemorija, radnja: LokalRadnjaMemorije, kod: string): void {
  const korak = primeniRadnju(stanje, radnja);
  expect(korak.ishod).toEqual({ ok: false, code: kod });
  expect(korak.stanje).toBe(stanje);
}

function poz(stanje: LokalMemorija, id: string): LokalPozicija {
  const nadjena = stanje.podaci.positions.find((p) => p.id === id);
  if (!nadjena) throw new Error(`no position ${id}`);
  return nadjena;
}

function kart(stanje: LokalMemorija, id: string): LokalKartica {
  const nadjena = stanje.podaci.cards.find((k) => k.id === id);
  if (!nadjena) throw new Error(`no card ${id}`);
  return nadjena;
}

function nacrtano(stanje: LokalMemorija, zoneId: string | null): FloorLayout[] {
  const stavke = stanje.podaci.positions
    .filter((p) => p.zoneId === zoneId)
    .map((p) => ({ id: p.id, kind: p.kind, order: p.order, layout: p.layout }));
  return Array.from(placeLayouts(stavke).values());
}

/** Every surface (each zone and "Bez zone"): all drawn layouts valid and none overlapping. */
function provera(stanje: LokalMemorija): void {
  const povrsine = [null, ...stanje.podaci.zones.map((z) => z.id)];
  for (const zoneId of povrsine) {
    const crtezi = nacrtano(stanje, zoneId);
    crtezi.forEach((a, i) => {
      expect(isValidLayout(a)).toBe(true);
      crtezi.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false));
    });
  }
}

const SEDISTA = (sedista: number | null) => ({ kind: "table" as const, label: "Sto 9", seats: sedista, zoneId: null });

// --- Constructors ---------------------------------------------------------------------

describe("memorijaOd / praznaMemorija", () => {
  test("memorijaOd keeps the data and fills the izlog defaults", () => {
    const podaci = osnovniPodaci();
    const stanje = memorijaOd(podaci);
    expect(stanje.podaci).toBe(podaci);
    expect(stanje.sledeciBroj).toBe(1);
    expect(stanje.sada).toBe(LOKAL_MEMORIJA_SADA);
    expect(stanje.podrazumevanaOznaka).toBe(LOKAL_PODRAZUMEVANA_OZNAKA);
    expect(memorijaOd(podaci, { sledeciBroj: 7, sada: 5, podrazumevanaOznaka: "X" })).toMatchObject({
      sledeciBroj: 7,
      sada: 5,
      podrazumevanaOznaka: "X",
    });
  });

  test("praznaMemorija has pages only", () => {
    const stanje = praznaMemorija({ stranice: STRANICE });
    expect(stanje.podaci.zones).toEqual([]);
    expect(stanje.podaci.positions).toEqual([]);
    expect(stanje.podaci.cards).toEqual([]);
    expect(stanje.podaci.pages).toEqual(STRANICE);
    expect(stanje.podaci.pages[0]).not.toBe(STRANICE[0]);
    expect(praznaMemorija().podaci.pages).toEqual([]);
  });
});

// --- createPosition -------------------------------------------------------------------

describe("createPosition", () => {
  test("creates a position with a cleaned label, a counter id and a concrete layout on the surface of its zone", () => {
    const stanje = uspeh(osnovno(), {
      vrsta: "createPosition",
      input: { kind: "table", label: "  Sto   9 ", seats: 6, zoneId: "z-sala" },
    });
    const nova = poz(stanje, "p-100");
    expect(nova).toMatchObject({ key: "ps_mem0100", kind: "table", label: "Sto 9", seats: 6, zoneId: "z-sala", order: 4 });
    expect(nova.layout).not.toBeNull();
    expect(nova.layout).toMatchObject({ w: 3, h: 2, shape: "rect" });
    expect(stanje.sledeciBroj).toBe(101);
    provera(stanje);
  });

  test("the first position of an empty zone starts in the corner; the size follows the kind", () => {
    const sa = uspeh(osnovno(), { vrsta: "createZone", name: "Bašta" });
    const zona = sa.podaci.zones[2];
    const sto = uspeh(sa, { vrsta: "createPosition", input: { kind: "other", label: "Pult", seats: null, zoneId: zona.id } });
    expect(poz(sto, "p-101").layout).toEqual({ x: 0, y: 0, ...defaultLayoutSize("other") });
  });

  test("a new position avoids the drawn spot of a position that has no layout yet", () => {
    const stanje = uspeh(osnovno(), {
      vrsta: "createPosition",
      input: { kind: "table", label: "Sto 9", seats: 2, zoneId: null },
    });
    // Šank has no stored layout; the plan draws it at 0,0 (4x2), so the table goes beside it.
    expect(poz(stanje, "p-100").layout).toEqual(raspored(5, 0));
    provera(stanje);
  });

  test("an empty or too long label is refused as invalid input", () => {
    odbijeno(osnovno(), { vrsta: "createPosition", input: { ...SEDISTA(2), label: "   " } }, MENU_ERROR.invalidInput);
    odbijeno(
      osnovno(),
      { vrsta: "createPosition", input: { ...SEDISTA(2), label: "x".repeat(MENU_TEXT.positionLabel + 1) } },
      MENU_ERROR.invalidInput,
    );
    const granicna = uspeh(osnovno(), {
      vrsta: "createPosition",
      input: { ...SEDISTA(2), label: "x".repeat(MENU_TEXT.positionLabel) },
    });
    expect(poz(granicna, "p-100").label).toHaveLength(MENU_TEXT.positionLabel);
  });

  test("a label is unique among positions ignoring case, diacritics and spacing", () => {
    for (const label of ["Sto 1", "sto  1", "STO 1", "šank", "Sank", "  Šank "]) {
      odbijeno(osnovno(), { vrsta: "createPosition", input: { ...SEDISTA(2), label } }, FLOOR_ERROR.positionLabelTaken);
    }
  });

  test("seats are null or a whole number from 1 to the maximum", () => {
    for (const sedista of [null, 1, 12, MENU_MAX_SEATS]) {
      uspeh(osnovno(), { vrsta: "createPosition", input: SEDISTA(sedista) });
    }
    for (const sedista of [0, -1, 2.5, MENU_MAX_SEATS + 1, Number.NaN]) {
      odbijeno(osnovno(), { vrsta: "createPosition", input: SEDISTA(sedista) }, MENU_ERROR.invalidInput);
    }
  });

  test("an unknown kind is refused", () => {
    const losa = { ...SEDISTA(2), kind: "ormar" as unknown as "table" };
    odbijeno(osnovno(), { vrsta: "createPosition", input: losa }, MENU_ERROR.invalidInput);
  });

  test("the zone must exist", () => {
    odbijeno(
      osnovno(),
      { vrsta: "createPosition", input: { ...SEDISTA(2), zoneId: "z-nema" } },
      FLOOR_ERROR.zoneArchived,
    );
  });

  test("the position ceiling is enforced", () => {
    odbijeno(sPozicijama(MENU_MAX_POSITIONS), { vrsta: "createPosition", input: SEDISTA(2) }, MENU_ERROR.limitReached);
  });

  test("each new position gets the next order", () => {
    let stanje = osnovno();
    for (const label of ["Sto 5", "Sto 6"]) {
      stanje = uspeh(stanje, { vrsta: "createPosition", input: { ...SEDISTA(2), label } });
    }
    expect(poz(stanje, "p-100").order).toBe(4);
    expect(poz(stanje, "p-101").order).toBe(5);
  });
});

// --- createPositions ------------------------------------------------------------------

describe("createPositions", () => {
  const VISE = { kind: "table" as const, prefix: "Sto", from: 10, count: 5, seats: 4, zoneId: "z-terasa" };

  test("creates `count` labelled positions on distinct free spots of the zone", () => {
    const stanje = uspeh(osnovno(), { vrsta: "createPositions", input: VISE });
    const nove = stanje.podaci.positions.slice(4);
    expect(nove.map((p) => p.label)).toEqual(["Sto 10", "Sto 11", "Sto 12", "Sto 13", "Sto 14"]);
    expect(nove.map((p) => p.id)).toEqual(["p-100", "p-101", "p-102", "p-103", "p-104"]);
    expect(nove.every((p) => p.zoneId === "z-terasa" && p.seats === 4 && p.layout !== null)).toBe(true);
    expect(stanje.sledeciBroj).toBe(105);
    provera(stanje);
  });

  test("a batch of the maximum size fits one zone without overlaps", () => {
    const stanje = uspeh(osnovno(), {
      vrsta: "createPositions",
      input: { ...VISE, from: 100, count: MENU_MAX_POSITION_BATCH, zoneId: "z-sala" },
    });
    expect(stanje.podaci.positions).toHaveLength(4 + MENU_MAX_POSITION_BATCH);
    provera(stanje);
  });

  test("the cleaned prefix is used", () => {
    const stanje = uspeh(osnovno(), { vrsta: "createPositions", input: { ...VISE, prefix: "  Soba  ", from: 0, count: 2 } });
    expect(stanje.podaci.positions.slice(4).map((p) => p.label)).toEqual(["Soba 0", "Soba 1"]);
  });

  test("count 1..100 and from 0..9999, both whole numbers", () => {
    for (const count of [0, -1, 1.5, MENU_MAX_POSITION_BATCH + 1]) {
      odbijeno(osnovno(), { vrsta: "createPositions", input: { ...VISE, count } }, MENU_ERROR.invalidInput);
    }
    for (const from of [-1, 1.5, 10_000]) {
      odbijeno(osnovno(), { vrsta: "createPositions", input: { ...VISE, from } }, MENU_ERROR.invalidInput);
    }
    uspeh(osnovno(), { vrsta: "createPositions", input: { ...VISE, from: 0, count: 1 } });
    uspeh(osnovno(), { vrsta: "createPositions", input: { ...VISE, from: 9999, count: 1 } });
  });

  test("an empty prefix, a prefix that makes a label too long, bad seats: invalid input", () => {
    odbijeno(osnovno(), { vrsta: "createPositions", input: { ...VISE, prefix: " " } }, MENU_ERROR.invalidInput);
    odbijeno(
      osnovno(),
      { vrsta: "createPositions", input: { ...VISE, prefix: "x".repeat(MENU_TEXT.positionLabel - 1) } },
      MENU_ERROR.invalidInput,
    );
    odbijeno(osnovno(), { vrsta: "createPositions", input: { ...VISE, seats: 0 } }, MENU_ERROR.invalidInput);
  });

  test("one taken label refuses the whole batch and changes nothing", () => {
    // "Stol 3" exists; the batch Stol 1..Stol 3 collides with it only on its last label.
    const stanje = uspeh(osnovno(), {
      vrsta: "createPosition",
      input: { kind: "table", label: "Stol 3", seats: 2, zoneId: null },
    });
    odbijeno(
      stanje,
      { vrsta: "createPositions", input: { ...VISE, prefix: "stol", from: 1, count: 3 } },
      FLOOR_ERROR.positionLabelTaken,
    );
    expect(stanje.podaci.positions).toHaveLength(5);
  });

  test("the zone must exist and the ceiling counts the whole batch", () => {
    odbijeno(osnovno(), { vrsta: "createPositions", input: { ...VISE, zoneId: "z-nema" } }, FLOOR_ERROR.zoneArchived);
    odbijeno(
      sPozicijama(MENU_MAX_POSITIONS - 2),
      { vrsta: "createPositions", input: { ...VISE, prefix: "Novi", count: 3, zoneId: null } },
      MENU_ERROR.limitReached,
    );
  });
});

// --- updatePosition -------------------------------------------------------------------

describe("updatePosition", () => {
  test("renames, changes the kind and the seats", () => {
    const stanje = uspeh(osnovno(), {
      vrsta: "updatePosition",
      positionId: "p-a",
      change: { label: "  Sto  11 ", kind: "other", seats: null },
    });
    expect(poz(stanje, "p-a")).toMatchObject({ label: "Sto 11", kind: "other", seats: null, zoneId: "z-sala" });
    expect(poz(stanje, "p-a").layout).toEqual(raspored(0, 0));
  });

  test("an empty change is accepted and changes nothing", () => {
    const stanje = uspeh(osnovno(), { vrsta: "updatePosition", positionId: "p-a", change: {} });
    expect(stanje.podaci.positions).toEqual(osnovno().podaci.positions);
  });

  test("a position may take another spelling of its own label, but not the label of another position", () => {
    const stanje = uspeh(osnovno(), { vrsta: "updatePosition", positionId: "p-a", change: { label: "STO 1" } });
    expect(poz(stanje, "p-a").label).toBe("STO 1");
    odbijeno(osnovno(), { vrsta: "updatePosition", positionId: "p-a", change: { label: "sto 2" } }, FLOOR_ERROR.positionLabelTaken);
    odbijeno(osnovno(), { vrsta: "updatePosition", positionId: "p-a", change: { label: "Sank" } }, FLOOR_ERROR.positionLabelTaken);
  });

  test("invalid label, kind or seats are refused; a refusal applies none of the other changes", () => {
    odbijeno(osnovno(), { vrsta: "updatePosition", positionId: "p-a", change: { label: " " } }, MENU_ERROR.invalidInput);
    odbijeno(
      osnovno(),
      { vrsta: "updatePosition", positionId: "p-a", change: { label: "Novi", seats: 100 } },
      MENU_ERROR.invalidInput,
    );
    odbijeno(
      osnovno(),
      { vrsta: "updatePosition", positionId: "p-a", change: { kind: "ormar" as unknown as "table" } },
      MENU_ERROR.invalidInput,
    );
  });

  test("an unknown position is archived", () => {
    odbijeno(osnovno(), { vrsta: "updatePosition", positionId: "p-nema", change: { label: "X" } }, FLOOR_ERROR.positionArchived);
  });

  test("moving to another zone keeps the size and the shape and takes a free spot on that surface", () => {
    // Sto 3 (round, 4x4) goes from Terasa to Sala, beside Sto 1 and Sto 2.
    const stanje = uspeh(osnovno(), { vrsta: "updatePosition", positionId: "p-c", change: { zoneId: "z-sala" } });
    expect(poz(stanje, "p-c")).toMatchObject({ zoneId: "z-sala", layout: raspored(9, 0, 4, 4, "round") });
    provera(stanje);
  });

  test("moving into 'Bez zone' avoids the position drawn there", () => {
    const stanje = uspeh(osnovno(), { vrsta: "updatePosition", positionId: "p-a", change: { zoneId: null } });
    expect(poz(stanje, "p-a").zoneId).toBeNull();
    expect(poz(stanje, "p-a").layout).toMatchObject({ w: 3, h: 2, shape: "rect" });
    provera(stanje);
  });

  test("a position without a layout gets a concrete one of its kind when it changes zone", () => {
    const stanje = uspeh(osnovno(), { vrsta: "updatePosition", positionId: "p-d", change: { zoneId: "z-terasa" } });
    expect(poz(stanje, "p-d").layout).toMatchObject(defaultLayoutSize("other"));
    provera(stanje);
  });

  test("the same zone leaves the layout alone; an unknown zone is refused", () => {
    const stanje = uspeh(osnovno(), { vrsta: "updatePosition", positionId: "p-a", change: { zoneId: "z-sala" } });
    expect(poz(stanje, "p-a").layout).toEqual(raspored(0, 0));
    odbijeno(osnovno(), { vrsta: "updatePosition", positionId: "p-a", change: { zoneId: "z-nema" } }, FLOOR_ERROR.zoneArchived);
  });
});

// --- archivePosition ------------------------------------------------------------------

describe("archivePosition", () => {
  test("removes a position without cards", () => {
    const stanje = uspeh(osnovno(), { vrsta: "archivePosition", positionId: "p-d" });
    expect(stanje.podaci.positions.map((p) => p.id)).toEqual(["p-a", "p-b", "p-c"]);
  });

  test("an active card on the position blocks it", () => {
    odbijeno(osnovno(), { vrsta: "archivePosition", positionId: "p-a" }, FLOOR_ERROR.positionHasQr);
  });

  test("a disabled card, a card that leads elsewhere or an inactive link does not block it", () => {
    uspeh(osnovno(), { vrsta: "archivePosition", positionId: "p-b" });
    uspeh(osnovno(), { vrsta: "archivePosition", positionId: "p-c" });
    const neaktivna = osnovno();
    const bezVeze = {
      ...neaktivna,
      podaci: {
        ...neaktivna.podaci,
        cards: [kartica("k-x", { link: { pageKey: null, positionId: "p-d", active: false } })],
      },
    };
    uspeh(bezVeze, { vrsta: "archivePosition", positionId: "p-d" });
  });

  test("a card of ScanMe on the position still blocks it", () => {
    const stanje = osnovno();
    const sa = {
      ...stanje,
      podaci: {
        ...stanje.podaci,
        cards: [kartica("k-s", { managedByScanMe: true, link: { pageKey: null, positionId: "p-d", active: true } })],
      },
    };
    odbijeno(sa, { vrsta: "archivePosition", positionId: "p-d" }, FLOOR_ERROR.positionHasQr);
  });

  test("a card unlinked or disabled first lets the position go", () => {
    let stanje = uspeh(osnovno(), { vrsta: "setCardActive", cardId: "k-a", active: false });
    stanje = uspeh(stanje, { vrsta: "archivePosition", positionId: "p-a" });
    expect(stanje.podaci.positions.some((p) => p.id === "p-a")).toBe(false);
    let drugo = uspeh(osnovno(), { vrsta: "linkCard", cardId: "k-a", link: { pageKey: null, positionId: "p-b" } });
    drugo = uspeh(drugo, { vrsta: "archivePosition", positionId: "p-a" });
    expect(drugo.podaci.positions.some((p) => p.id === "p-a")).toBe(false);
  });

  test("an unknown or already archived position is refused", () => {
    odbijeno(osnovno(), { vrsta: "archivePosition", positionId: "p-nema" }, FLOOR_ERROR.positionArchived);
    const stanje = uspeh(osnovno(), { vrsta: "archivePosition", positionId: "p-d" });
    odbijeno(stanje, { vrsta: "archivePosition", positionId: "p-d" }, FLOOR_ERROR.positionArchived);
  });
});

// --- setLayout / setLayouts -------------------------------------------------------------

describe("setLayout", () => {
  test("moves a position to a free spot of its zone", () => {
    const stanje = uspeh(osnovno(), { vrsta: "setLayout", positionId: "p-a", layout: raspored(3, 0, 2, 2, "round") });
    expect(poz(stanje, "p-a").layout).toEqual(raspored(3, 0, 2, 2, "round"));
    provera(stanje);
  });

  test("the layout is stored as a copy", () => {
    const novi = raspored(10, 5);
    const stanje = uspeh(osnovno(), { vrsta: "setLayout", positionId: "p-a", layout: novi });
    expect(poz(stanje, "p-a").layout).not.toBe(novi);
  });

  test("an invalid layout is refused", () => {
    for (const layout of [
      raspored(22, 0),
      raspored(-1, 0),
      raspored(0, 0, 9, 2),
      raspored(0, 0, 0, 2),
      raspored(0.5, 0),
      raspored(0, 119, 3, 2),
      { ...raspored(0, 0), shape: "triangle" as unknown as "rect" },
    ]) {
      odbijeno(osnovno(), { vrsta: "setLayout", positionId: "p-a", layout }, FLOOR_ERROR.invalidLayout);
    }
  });

  test("overlapping a position of the same zone is refused, overlap with another zone is fine", () => {
    odbijeno(osnovno(), { vrsta: "setLayout", positionId: "p-a", layout: raspored(5, 0) }, FLOOR_ERROR.invalidLayout);
    odbijeno(osnovno(), { vrsta: "setLayout", positionId: "p-a", layout: raspored(4, 1) }, FLOOR_ERROR.invalidLayout);
    uspeh(osnovno(), { vrsta: "setLayout", positionId: "p-a", layout: raspored(0, 0, 4, 4, "round") });
  });

  test("a position may be put back where it already is", () => {
    uspeh(osnovno(), { vrsta: "setLayout", positionId: "p-a", layout: raspored(0, 0) });
  });

  test("the drawn spot of a position without a layout counts as taken", () => {
    const sa = uspeh(osnovno(), {
      vrsta: "createPosition",
      input: { kind: "table", label: "Sto 9", seats: 2, zoneId: null },
    });
    odbijeno(sa, { vrsta: "setLayout", positionId: "p-100", layout: raspored(0, 0) }, FLOOR_ERROR.invalidLayout);
    uspeh(sa, { vrsta: "setLayout", positionId: "p-100", layout: raspored(4, 0) });
  });

  test("an unknown position is refused", () => {
    odbijeno(osnovno(), { vrsta: "setLayout", positionId: "p-nema", layout: raspored(10, 10) }, FLOOR_ERROR.positionArchived);
  });
});

describe("setLayouts", () => {
  test("positions may swap places in one call", () => {
    const stanje = uspeh(osnovno(), {
      vrsta: "setLayouts",
      items: [
        { positionId: "p-a", layout: raspored(5, 0) },
        { positionId: "p-b", layout: raspored(0, 0) },
      ],
    });
    expect(poz(stanje, "p-a").layout).toEqual(raspored(5, 0));
    expect(poz(stanje, "p-b").layout).toEqual(raspored(0, 0));
    provera(stanje);
  });

  test("applies an automatic arrangement of a whole zone", () => {
    const stavke = osnovno().podaci.positions.filter((p) => p.zoneId === "z-sala");
    const uredjeno = autoArrange(stavke.map((p) => ({ id: p.id, kind: p.kind, order: p.order, layout: p.layout })));
    const stanje = uspeh(osnovno(), {
      vrsta: "setLayouts",
      items: stavke.map((p) => ({ positionId: p.id, layout: uredjeno.get(p.id) as FloorLayout })),
    });
    for (const p of stavke) expect(poz(stanje, p.id).layout).toEqual(uredjeno.get(p.id));
    provera(stanje);
  });

  test("is atomic: one invalid layout refuses all", () => {
    odbijeno(
      osnovno(),
      {
        vrsta: "setLayouts",
        items: [
          { positionId: "p-a", layout: raspored(10, 0) },
          { positionId: "p-b", layout: raspored(23, 0) },
        ],
      },
      FLOOR_ERROR.invalidLayout,
    );
  });

  test("is atomic: two new layouts that overlap each other refuse all", () => {
    odbijeno(
      osnovno(),
      {
        vrsta: "setLayouts",
        items: [
          { positionId: "p-a", layout: raspored(10, 0) },
          { positionId: "p-b", layout: raspored(11, 1) },
        ],
      },
      FLOOR_ERROR.invalidLayout,
    );
  });

  test("a new layout on a position left in place is refused", () => {
    odbijeno(
      osnovno(),
      { vrsta: "setLayouts", items: [{ positionId: "p-a", layout: raspored(5, 0) }] },
      FLOOR_ERROR.invalidLayout,
    );
  });

  test("an unknown position, a duplicate, an empty list and a list over the batch size are refused", () => {
    odbijeno(
      osnovno(),
      { vrsta: "setLayouts", items: [{ positionId: "p-nema", layout: raspored(10, 0) }] },
      FLOOR_ERROR.positionArchived,
    );
    odbijeno(
      osnovno(),
      {
        vrsta: "setLayouts",
        items: [
          { positionId: "p-a", layout: raspored(10, 0) },
          { positionId: "p-a", layout: raspored(14, 0) },
        ],
      },
      MENU_ERROR.invalidInput,
    );
    odbijeno(osnovno(), { vrsta: "setLayouts", items: [] }, MENU_ERROR.invalidInput);
    const mnogo = Array.from({ length: MENU_MAX_POSITION_BATCH + 1 }, () => ({ positionId: "p-a", layout: raspored(10, 0) }));
    odbijeno(osnovno(), { vrsta: "setLayouts", items: mnogo }, MENU_ERROR.invalidInput);
  });
});

// --- Zones ------------------------------------------------------------------------------

describe("createZone", () => {
  test("appends a zone with the next order, a counter id and a cleaned name", () => {
    const stanje = uspeh(osnovno(), { vrsta: "createZone", name: "  Bašta   za pušače " });
    expect(stanje.podaci.zones.at(-1)).toEqual({ id: "z-100", key: "zn_mem0100", name: "Bašta za pušače", order: 2 });
    expect(stanje.sledeciBroj).toBe(101);
  });

  test("an empty or too long name is refused", () => {
    odbijeno(osnovno(), { vrsta: "createZone", name: "  " }, MENU_ERROR.invalidInput);
    odbijeno(osnovno(), { vrsta: "createZone", name: "x".repeat(MENU_TEXT.zoneName + 1) }, MENU_ERROR.invalidInput);
    uspeh(osnovno(), { vrsta: "createZone", name: "x".repeat(MENU_TEXT.zoneName) });
  });

  test("the name is unique ignoring case and diacritics", () => {
    odbijeno(osnovno(), { vrsta: "createZone", name: "sala" }, FLOOR_ERROR.zoneNameTaken);
    odbijeno(osnovno(), { vrsta: "createZone", name: " TERASA " }, FLOOR_ERROR.zoneNameTaken);
    const stanje = uspeh(osnovno(), { vrsta: "createZone", name: "Bašta" });
    odbijeno(stanje, { vrsta: "createZone", name: "basta" }, FLOOR_ERROR.zoneNameTaken);
  });

  test("the zone ceiling is enforced", () => {
    let stanje = osnovno();
    for (let i = stanje.podaci.zones.length; i < MENU_MAX_ZONES; i += 1) {
      stanje = uspeh(stanje, { vrsta: "createZone", name: `Zona ${i}` });
    }
    expect(stanje.podaci.zones).toHaveLength(MENU_MAX_ZONES);
    odbijeno(stanje, { vrsta: "createZone", name: "Jedna previše" }, MENU_ERROR.limitReached);
  });
});

describe("renameZone", () => {
  test("renames a zone, also to another spelling of its own name", () => {
    const stanje = uspeh(osnovno(), { vrsta: "renameZone", zoneId: "z-sala", name: " Velika  sala " });
    expect(stanje.podaci.zones[0].name).toBe("Velika sala");
    expect(uspeh(osnovno(), { vrsta: "renameZone", zoneId: "z-sala", name: "SALA" }).podaci.zones[0].name).toBe("SALA");
  });

  test("refuses the name of another zone, an invalid name and an unknown zone", () => {
    odbijeno(osnovno(), { vrsta: "renameZone", zoneId: "z-sala", name: "terasa" }, FLOOR_ERROR.zoneNameTaken);
    odbijeno(osnovno(), { vrsta: "renameZone", zoneId: "z-sala", name: " " }, MENU_ERROR.invalidInput);
    odbijeno(osnovno(), { vrsta: "renameZone", zoneId: "z-nema", name: "Nova" }, FLOOR_ERROR.zoneArchived);
  });
});

describe("moveZone", () => {
  test("swaps the order with the neighbour", () => {
    const dole = uspeh(osnovno(), { vrsta: "moveZone", zoneId: "z-sala", direction: "down" });
    expect(dole.podaci.zones.map((z) => [z.id, z.order])).toEqual([
      ["z-terasa", 0],
      ["z-sala", 1],
    ]);
    const gore = uspeh(dole, { vrsta: "moveZone", zoneId: "z-sala", direction: "up" });
    expect(gore.podaci.zones.map((z) => [z.id, z.order])).toEqual([
      ["z-sala", 0],
      ["z-terasa", 1],
    ]);
  });

  test("moves the middle zone among three", () => {
    let stanje = uspeh(osnovno(), { vrsta: "createZone", name: "Bašta" });
    stanje = uspeh(stanje, { vrsta: "moveZone", zoneId: "z-terasa", direction: "down" });
    expect(stanje.podaci.zones.map((z) => z.id)).toEqual(["z-sala", "z-100", "z-terasa"]);
    expect(stanje.podaci.zones.map((z) => z.order)).toEqual([0, 1, 2]);
  });

  test("without a neighbour it is a successful no-op", () => {
    const stanje = osnovno();
    for (const radnja of [
      { vrsta: "moveZone", zoneId: "z-sala", direction: "up" },
      { vrsta: "moveZone", zoneId: "z-terasa", direction: "down" },
    ] as const) {
      const korak = primeniRadnju(stanje, radnja);
      expect(korak.ishod).toEqual({ ok: true });
      expect(korak.stanje).toBe(stanje);
    }
  });

  test("an unknown zone is refused", () => {
    odbijeno(osnovno(), { vrsta: "moveZone", zoneId: "z-nema", direction: "up" }, FLOOR_ERROR.zoneArchived);
  });
});

describe("archiveZone", () => {
  test("removes the zone and moves its positions to 'Bez zone' on fresh free spots", () => {
    const stanje = uspeh(osnovno(), { vrsta: "archiveZone", zoneId: "z-sala" });
    expect(stanje.podaci.zones.map((z) => z.id)).toEqual(["z-terasa"]);
    expect(poz(stanje, "p-a")).toMatchObject({ zoneId: null, layout: raspored(5, 0) });
    expect(poz(stanje, "p-b")).toMatchObject({ zoneId: null, layout: raspored(9, 0) });
    expect(poz(stanje, "p-c").zoneId).toBe("z-terasa");
    expect(stanje.podaci.positions).toHaveLength(4);
    provera(stanje);
  });

  test("keeps the size and the shape of the moved positions", () => {
    const stanje = uspeh(osnovno(), { vrsta: "archiveZone", zoneId: "z-terasa" });
    expect(poz(stanje, "p-c")).toMatchObject({ zoneId: null, layout: expect.objectContaining({ w: 4, h: 4, shape: "round" }) });
    provera(stanje);
  });

  test("a zone without positions just disappears; an unknown zone is refused", () => {
    const sa = uspeh(osnovno(), { vrsta: "createZone", name: "Bašta" });
    const bez = uspeh(sa, { vrsta: "archiveZone", zoneId: "z-100" });
    expect(bez.podaci.zones).toHaveLength(2);
    expect(bez.podaci.positions).toEqual(sa.podaci.positions);
    odbijeno(osnovno(), { vrsta: "archiveZone", zoneId: "z-nema" }, FLOOR_ERROR.zoneArchived);
  });

  test("cards of the moved positions stay linked", () => {
    const stanje = uspeh(osnovno(), { vrsta: "archiveZone", zoneId: "z-sala" });
    expect(kart(stanje, "k-a").link?.positionId).toBe("p-a");
  });
});

// --- QR cards ---------------------------------------------------------------------------

describe("kodKartice", () => {
  test("is 8 characters of the code alphabet and deterministic", () => {
    expect(kodKartice(1)).toMatch(CODE_PATTERN);
    expect(kodKartice(1)).toBe(kodKartice(1));
    expect(kodKartice(1)).not.toBe(kodKartice(2));
  });

  test("never repeats for different counters", () => {
    const kodovi = new Set<string>();
    for (let n = 0; n < 20_000; n += 1) {
      const kod = kodKartice(n);
      expect(kod).toMatch(CODE_PATTERN);
      kodovi.add(kod);
    }
    expect(kodovi.size).toBe(20_000);
  });
});

describe("mintForPositions", () => {
  test("makes one active card per position, labelled like it, linked to it", () => {
    const stanje = uspeh(osnovno(), { vrsta: "mintForPositions", positionIds: ["p-d", "p-b"], pageKey: "pg_vinska" });
    expect(stanje.podaci.cards).toHaveLength(6);
    expect(stanje.podaci.cards.slice(4)).toEqual([
      {
        id: "k-100",
        cardCode: kodKartice(100),
        label: "Šank",
        status: "active",
        managedByScanMe: false,
        opensMenu: true,
        link: { pageKey: "pg_vinska", positionId: "p-d", active: true },
        totalScans: 0,
        lastScanAt: null,
        createdAt: LOKAL_MEMORIJA_SADA,
      },
      {
        id: "k-101",
        cardCode: kodKartice(101),
        label: "Sto 2",
        status: "active",
        managedByScanMe: false,
        opensMenu: true,
        link: { pageKey: "pg_vinska", positionId: "p-b", active: true },
        totalScans: 0,
        lastScanAt: null,
        createdAt: LOKAL_MEMORIJA_SADA,
      },
    ]);
    expect(stanje.sledeciBroj).toBe(102);
  });

  test("pageKey null opens the menu's entry; createdAt follows the izlog clock", () => {
    const stanje = uspeh(memorijaOd(osnovniPodaci(), { sledeciBroj: 5, sada: 1234 }), {
      vrsta: "mintForPositions",
      positionIds: ["p-a"],
      pageKey: null,
    });
    expect(stanje.podaci.cards.at(-1)).toMatchObject({ link: { pageKey: null, positionId: "p-a", active: true }, createdAt: 1234 });
  });

  test("an unknown page is refused whole; so is an unknown position", () => {
    odbijeno(osnovno(), { vrsta: "mintForPositions", positionIds: ["p-a"], pageKey: "pg_stara" }, FLOOR_ERROR.pageUnavailable);
    odbijeno(osnovno(), { vrsta: "mintForPositions", positionIds: ["p-a", "p-nema"], pageKey: null }, FLOOR_ERROR.positionArchived);
  });

  test("1..50 positions; a repeated id makes one card", () => {
    odbijeno(osnovno(), { vrsta: "mintForPositions", positionIds: [], pageKey: null }, MENU_ERROR.invalidInput);
    odbijeno(
      osnovno(),
      { vrsta: "mintForPositions", positionIds: Array.from({ length: MENU_MAX_QR_MINT_BATCH + 1 }, () => "p-a"), pageKey: null },
      MENU_ERROR.invalidInput,
    );
    const stanje = uspeh(osnovno(), { vrsta: "mintForPositions", positionIds: ["p-a", "p-a"], pageKey: null });
    expect(stanje.podaci.cards).toHaveLength(5);
  });

  test("the maximum batch works and every code is unique", () => {
    const veliko = sPozicijama(60);
    const ids = veliko.podaci.positions.slice(0, MENU_MAX_QR_MINT_BATCH).map((p) => p.id);
    const stanje = uspeh(veliko, { vrsta: "mintForPositions", positionIds: ids, pageKey: null });
    const kodovi = stanje.podaci.cards.map((k) => k.cardCode);
    expect(kodovi).toHaveLength(MENU_MAX_QR_MINT_BATCH);
    expect(new Set(kodovi).size).toBe(MENU_MAX_QR_MINT_BATCH);
    kodovi.forEach((kod) => expect(kod).toMatch(CODE_PATTERN));
  });

  test("a code already on a card is skipped, so codes stay unique", () => {
    const osnova = osnovno();
    const sudar = {
      ...osnova,
      podaci: { ...osnova.podaci, cards: [kartica("k-z", { cardCode: kodKartice(100) })] },
    };
    const stanje = uspeh(sudar, { vrsta: "mintForPositions", positionIds: ["p-a"], pageKey: null });
    expect(stanje.podaci.cards.at(-1)).toMatchObject({ id: "k-101", cardCode: kodKartice(101) });
    expect(stanje.sledeciBroj).toBe(102);
  });

  test("the same inputs give the same ids and codes", () => {
    const radnja: LokalRadnjaMemorije = { vrsta: "mintForPositions", positionIds: ["p-a", "p-b", "p-c"], pageKey: null };
    expect(uspeh(osnovno(), radnja)).toEqual(uspeh(osnovno(), radnja));
  });
});

describe("mintForPage", () => {
  test("makes `count` cards with no position, labelled with the page name", () => {
    const stanje = uspeh(osnovno(), { vrsta: "mintForPage", pageKey: "pg_vinska", count: 3 });
    const nove = stanje.podaci.cards.slice(4);
    expect(nove.map((k) => k.label)).toEqual(["Vinska karta", "Vinska karta", "Vinska karta"]);
    expect(nove.map((k) => k.id)).toEqual(["k-100", "k-101", "k-102"]);
    expect(nove.every((k) => k.link?.pageKey === "pg_vinska" && k.link.positionId === null && k.link.active)).toBe(true);
    expect(new Set(nove.map((k) => k.cardCode)).size).toBe(3);
  });

  test("the entry and the default page use the default label", () => {
    const stanje = memorijaOd(osnovniPodaci(), { sledeciBroj: 1, podrazumevanaOznaka: "Meni (probni)" });
    const odUlaza = uspeh(stanje, { vrsta: "mintForPage", pageKey: null, count: 1 });
    expect(odUlaza.podaci.cards.at(-1)).toMatchObject({ label: "Meni (probni)", link: { pageKey: null, positionId: null } });
    const odGlavne = uspeh(stanje, { vrsta: "mintForPage", pageKey: "pg_glavni", count: 1 });
    expect(odGlavne.podaci.cards.at(-1)).toMatchObject({ label: "Meni (probni)", link: { pageKey: "pg_glavni" } });
    expect(uspeh(osnovno(), { vrsta: "mintForPage", pageKey: null, count: 1 }).podaci.cards.at(-1)?.label).toBe(
      LOKAL_PODRAZUMEVANA_OZNAKA,
    );
  });

  test("count 1..50, whole; the page must exist", () => {
    for (const count of [0, -1, 1.5, MENU_MAX_QR_MINT_BATCH + 1]) {
      odbijeno(osnovno(), { vrsta: "mintForPage", pageKey: null, count }, MENU_ERROR.invalidInput);
    }
    uspeh(osnovno(), { vrsta: "mintForPage", pageKey: null, count: MENU_MAX_QR_MINT_BATCH });
    odbijeno(osnovno(), { vrsta: "mintForPage", pageKey: "pg_stara", count: 1 }, FLOOR_ERROR.pageUnavailable);
  });
});

describe("linkCard", () => {
  test("sets the page and the position, active", () => {
    const stanje = uspeh(osnovno(), {
      vrsta: "linkCard",
      cardId: "k-a",
      link: { pageKey: "pg_vinska", positionId: "p-d" },
    });
    expect(kart(stanje, "k-a").link).toEqual({ pageKey: "pg_vinska", positionId: "p-d", active: true });
    expect(kart(stanje, "k-a").label).toBe("Sto 1");
  });

  test("both null opens the entry with no position", () => {
    const stanje = uspeh(osnovno(), { vrsta: "linkCard", cardId: "k-a", link: { pageKey: null, positionId: null } });
    expect(kart(stanje, "k-a").link).toEqual({ pageKey: null, positionId: null, active: true });
  });

  test("an inactive link becomes active again", () => {
    const osnova = osnovno();
    const stanje = {
      ...osnova,
      podaci: {
        ...osnova.podaci,
        cards: [kartica("k-x", { link: { pageKey: "pg_stara", positionId: null, active: false } })],
      },
    };
    const posle = uspeh(stanje, { vrsta: "linkCard", cardId: "k-x", link: { pageKey: "pg_glavni", positionId: null } });
    expect(kart(posle, "k-x").link).toEqual({ pageKey: "pg_glavni", positionId: null, active: true });
  });

  test("refuses an unknown card, a card of ScanMe and a card that opens something else", () => {
    const veza = { pageKey: null, positionId: "p-a" };
    odbijeno(osnovno(), { vrsta: "linkCard", cardId: "k-nema", link: veza }, MENU_ERROR.notFound);
    odbijeno(osnovno(), { vrsta: "linkCard", cardId: "k-c", link: veza }, FLOOR_ERROR.cardReadOnly);
    odbijeno(osnovno(), { vrsta: "linkCard", cardId: "k-d", link: veza }, FLOOR_ERROR.cardNotMenu);
  });

  test("refuses an unavailable page and a missing position", () => {
    odbijeno(
      osnovno(),
      { vrsta: "linkCard", cardId: "k-a", link: { pageKey: "pg_stara", positionId: null } },
      FLOOR_ERROR.pageUnavailable,
    );
    odbijeno(
      osnovno(),
      { vrsta: "linkCard", cardId: "k-a", link: { pageKey: null, positionId: "p-nema" } },
      FLOOR_ERROR.positionArchived,
    );
  });
});

describe("setCardActive", () => {
  test("disables and enables a card", () => {
    const iskljucena = uspeh(osnovno(), { vrsta: "setCardActive", cardId: "k-a", active: false });
    expect(kart(iskljucena, "k-a").status).toBe("disabled");
    const ukljucena = uspeh(iskljucena, { vrsta: "setCardActive", cardId: "k-a", active: true });
    expect(kart(ukljucena, "k-a").status).toBe("active");
    expect(kart(osnovno(), "k-b").status).toBe("disabled");
    expect(kart(uspeh(osnovno(), { vrsta: "setCardActive", cardId: "k-b", active: true }), "k-b").status).toBe("active");
  });

  test("a card of ScanMe is read-only; an unknown card is refused", () => {
    odbijeno(osnovno(), { vrsta: "setCardActive", cardId: "k-c", active: false }, FLOOR_ERROR.cardReadOnly);
    odbijeno(osnovno(), { vrsta: "setCardActive", cardId: "k-nema", active: false }, MENU_ERROR.notFound);
  });

  test("K34: a card that opens something else than the Menu is refused, as on the server", () => {
    odbijeno(osnovno(), { vrsta: "setCardActive", cardId: "k-d", active: false }, FLOOR_ERROR.cardNotMenu);
  });
});

// --- Purity and the adapter -----------------------------------------------------------------

const SVE_RADNJE: LokalRadnjaMemorije[] = [
  { vrsta: "createPosition", input: { kind: "table", label: "Sto 9", seats: 2, zoneId: "z-sala" } },
  { vrsta: "createPositions", input: { kind: "room", prefix: "Soba", from: 1, count: 3, seats: null, zoneId: null } },
  { vrsta: "updatePosition", positionId: "p-a", change: { label: "Prvi", zoneId: "z-terasa" } },
  { vrsta: "archivePosition", positionId: "p-d" },
  { vrsta: "setLayout", positionId: "p-b", layout: raspored(10, 4) },
  { vrsta: "setLayouts", items: [{ positionId: "p-a", layout: raspored(12, 4) }] },
  { vrsta: "createZone", name: "Bašta" },
  { vrsta: "renameZone", zoneId: "z-sala", name: "Velika sala" },
  { vrsta: "moveZone", zoneId: "z-sala", direction: "down" },
  { vrsta: "archiveZone", zoneId: "z-terasa" },
  { vrsta: "mintForPositions", positionIds: ["p-b"], pageKey: "pg_glavni" },
  { vrsta: "mintForPage", pageKey: "pg_vinska", count: 2 },
  { vrsta: "linkCard", cardId: "k-a", link: { pageKey: null, positionId: "p-b" } },
  { vrsta: "setCardActive", cardId: "k-a", active: false },
];

describe("immutability and determinism", () => {
  test("no action changes the state it is given", () => {
    const zamrznuto = zamrzni(osnovno());
    const pre = JSON.stringify(zamrznuto);
    for (const radnja of SVE_RADNJE) {
      expect(() => primeniRadnju(zamrznuto, radnja)).not.toThrow();
      expect(primeniRadnju(zamrznuto, radnja).ishod).toEqual({ ok: true });
    }
    expect(JSON.stringify(zamrznuto)).toBe(pre);
  });

  test("the same sequence from the same start gives the same state", () => {
    const pokreni = () => SVE_RADNJE.reduce<LokalMemorija>((stanje, radnja) => primeniRadnju(stanje, radnja).stanje, osnovno());
    const prvo = pokreni();
    expect(pokreni()).toEqual(prvo);
    expect(prvo.sledeciBroj).toBeGreaterThan(100);
  });

  test("a long run keeps every surface valid and every card code unique", () => {
    let stanje = osnovno();
    stanje = uspeh(stanje, { vrsta: "createPositions", input: { kind: "table", prefix: "Sto", from: 10, count: 30, seats: 4, zoneId: "z-sala" } });
    stanje = uspeh(stanje, { vrsta: "createPositions", input: { kind: "table", prefix: "T", from: 1, count: 30, seats: 4, zoneId: "z-terasa" } });
    stanje = uspeh(stanje, { vrsta: "updatePosition", positionId: "p-100", change: { zoneId: "z-terasa" } });
    stanje = uspeh(stanje, { vrsta: "updatePosition", positionId: "p-131", change: { zoneId: null } });
    stanje = uspeh(stanje, { vrsta: "archiveZone", zoneId: "z-sala" });
    provera(stanje);
    stanje = uspeh(stanje, {
      vrsta: "mintForPositions",
      positionIds: stanje.podaci.positions.slice(0, MENU_MAX_QR_MINT_BATCH).map((p) => p.id),
      pageKey: null,
    });
    const kodovi = stanje.podaci.cards.map((k) => k.cardCode);
    expect(new Set(kodovi).size).toBe(kodovi.length);
  });
});

describe("napraviRadnje", () => {
  function sadrzaj(pocetno: LokalMemorija) {
    const drzac = { stanje: pocetno, upisa: 0 };
    const radnje = napraviRadnje(
      () => drzac.stanje,
      (sledece) => {
        drzac.stanje = sledece;
        drzac.upisa += 1;
      },
    );
    return { drzac, radnje };
  }

  test("an accepted action resolves ok and stores the next state", async () => {
    const { drzac, radnje } = sadrzaj(osnovno());
    await expect(radnje.createZone("Bašta")).resolves.toEqual({ ok: true });
    expect(drzac.upisa).toBe(1);
    expect(drzac.stanje.podaci.zones.map((z) => z.name)).toEqual(["Sala", "Terasa", "Bašta"]);
  });

  test("a refused action resolves with its code and stores nothing", async () => {
    const { drzac, radnje } = sadrzaj(osnovno());
    const pocetno = drzac.stanje;
    await expect(radnje.createZone("sala")).resolves.toEqual({ ok: false, code: FLOOR_ERROR.zoneNameTaken });
    await expect(radnje.archivePosition("p-a")).resolves.toEqual({ ok: false, code: FLOOR_ERROR.positionHasQr });
    expect(drzac.upisa).toBe(0);
    expect(drzac.stanje).toBe(pocetno);
  });

  test("each call sees the state the previous call stored", async () => {
    const { drzac, radnje } = sadrzaj(osnovno());
    await radnje.createPosition({ kind: "table", label: "Sto 9", seats: 2, zoneId: null });
    await radnje.createPosition({ kind: "table", label: "Sto 10", seats: 2, zoneId: null });
    expect(drzac.stanje.podaci.positions.slice(4).map((p) => p.id)).toEqual(["p-100", "p-101"]);
    provera(drzac.stanje);
  });

  test("every LokalRadnje method is wired to its action", async () => {
    const { drzac, radnje } = sadrzaj(osnovno());
    const ok = { ok: true };
    await expect(radnje.createPosition({ kind: "table", label: "Sto 9", seats: 2, zoneId: "z-sala" })).resolves.toEqual(ok);
    await expect(radnje.createPositions({ kind: "room", prefix: "Soba", from: 1, count: 2, seats: null, zoneId: null })).resolves.toEqual(ok);
    await expect(radnje.updatePosition("p-a", { seats: 8 })).resolves.toEqual(ok);
    await expect(radnje.setLayout("p-b", raspored(10, 4))).resolves.toEqual(ok);
    await expect(radnje.setLayouts([{ positionId: "p-b", layout: raspored(14, 4) }])).resolves.toEqual(ok);
    await expect(radnje.createZone("Bašta")).resolves.toEqual(ok);
    await expect(radnje.renameZone("z-sala", "Velika sala")).resolves.toEqual(ok);
    await expect(radnje.moveZone("z-sala", "down")).resolves.toEqual(ok);
    await expect(radnje.mintForPositions(["p-b"], null)).resolves.toEqual(ok);
    await expect(radnje.mintForPage("pg_vinska", 1)).resolves.toEqual(ok);
    await expect(radnje.linkCard("k-a", { pageKey: "pg_vinska", positionId: null })).resolves.toEqual(ok);
    await expect(radnje.setCardActive("k-a", false)).resolves.toEqual(ok);
    await expect(radnje.archivePosition("p-d")).resolves.toEqual(ok);
    await expect(radnje.archiveZone("z-terasa")).resolves.toEqual(ok);
    const { positions, zones, cards } = drzac.stanje.podaci;
    expect(poz(drzac.stanje, "p-a").seats).toBe(8);
    expect(poz(drzac.stanje, "p-b").layout).toEqual(raspored(14, 4));
    expect(zones.map((z) => z.name)).toEqual(["Velika sala", "Bašta"]);
    expect(positions.some((p) => p.id === "p-d")).toBe(false);
    expect(cards).toHaveLength(6);
    expect(kart(drzac.stanje, "k-a")).toMatchObject({ status: "disabled", link: { pageKey: "pg_vinska", positionId: null } });
    provera(drzac.stanje);
  });
});
