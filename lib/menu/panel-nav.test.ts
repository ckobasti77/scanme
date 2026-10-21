import { describe, expect, test } from "vitest";
import { menuPanelSr } from "../i18n/sr/menu-panel";
import { PANEL_SEKCIJE } from "./izlog-params";
import {
  PANEL_NAV_SEKCIJE,
  PANEL_SEKCIJA_DOZVOLA,
  PANEL_SEKCIJA_SEGMENT,
  klijentskiPanelHref,
  konobarskiPanelUlazHref,
  navSkupljenaPodrazumevano,
  panelKoren,
  panelNavStavke,
  panelPristup,
  panelSekcijaHref,
  postojeciEditorHref,
  sekcijaIzSegmenta,
  sekcijaVidljiva,
  vidljiveSekcije,
  type PanelNavSekcija,
} from "./panel-nav";
import { roleCan, type MenuActor } from "./permissions";

const REDOSLED: readonly PanelNavSekcija[] = [
  "pocetna",
  "editor",
  "operativa",
  "lokal",
  "funkcionalnosti",
  "tim",
  "analitika",
  "podesavanja",
];

const ULOGE: readonly MenuActor[] = ["owner", "manager", "admin", "editor", "staff"];

/** `part` is a subsequence of `whole`: same items, same relative order, nothing added. */
function jePodniz(part: readonly string[], whole: readonly string[]): boolean {
  let next = 0;
  for (const item of part) {
    const found = whole.indexOf(item, next);
    if (found === -1) return false;
    next = found + 1;
  }
  return true;
}

describe("panel navigation: the eight sections in the locked order (master 13.1)", () => {
  test("there are exactly eight sections, in the locked order", () => {
    expect(PANEL_NAV_SEKCIJE).toHaveLength(8);
    expect([...PANEL_NAV_SEKCIJE]).toEqual([...REDOSLED]);
  });

  test("Analitika is second to last and Podesavanja is last", () => {
    expect(PANEL_NAV_SEKCIJE.indexOf("analitika")).toBe(PANEL_NAV_SEKCIJE.length - 2);
    expect(PANEL_NAV_SEKCIJE[PANEL_NAV_SEKCIJE.length - 1]).toBe("podesavanja");
  });

  test("the Serbian labels, mapped over the list, read in the locked order", () => {
    expect(PANEL_NAV_SEKCIJE.map((sekcija) => menuPanelSr.sekcije[sekcija])).toEqual([
      "Početna",
      "Editor",
      "Operativa",
      "Lokal i QR",
      "Funkcionalnosti",
      "Tim i pristupi",
      "Analitika",
      "Podešavanja",
    ]);
  });

  test("every section has a permission and a segment, and nothing else does", () => {
    expect(Object.keys(PANEL_SEKCIJA_DOZVOLA).sort()).toEqual([...REDOSLED].sort());
    expect(Object.keys(PANEL_SEKCIJA_SEGMENT).sort()).toEqual([...REDOSLED].sort());
  });
});

describe("panel navigation never drifts from the izlog", () => {
  test("PANEL_SEKCIJE without primitivi equals PANEL_NAV_SEKCIJE, same order", () => {
    expect(PANEL_SEKCIJE.filter((sekcija) => sekcija !== "primitivi")).toEqual([...PANEL_NAV_SEKCIJE]);
  });

  test("primitivi is the only extra page of the izlog", () => {
    expect(PANEL_SEKCIJE).toHaveLength(PANEL_NAV_SEKCIJE.length + 1);
    expect(PANEL_NAV_SEKCIJE.map(String)).not.toContain("primitivi");
  });
});

describe("visibility per role: vidljiveSekcije", () => {
  test("owner sees all eight sections in order", () => {
    expect(vidljiveSekcije("owner")).toEqual([...REDOSLED]);
  });

  test("manager sees all eight sections in order", () => {
    expect(vidljiveSekcije("manager")).toEqual([...REDOSLED]);
  });

  test("admin sees all eight sections in order", () => {
    expect(vidljiveSekcije("admin")).toEqual([...REDOSLED]);
  });

  test("editor sees only Pocetna and Editor", () => {
    expect(vidljiveSekcije("editor")).toEqual(["pocetna", "editor"]);
  });

  test("staff sees no section at all", () => {
    expect(vidljiveSekcije("staff")).toEqual([]);
  });

  test.each(ULOGE.map((uloga) => [uloga]))(
    "filtering never reorders: %s sees a subsequence of the locked order",
    (uloga) => {
      const vidljive = vidljiveSekcije(uloga);
      expect(jePodniz(vidljive, PANEL_NAV_SEKCIJE)).toBe(true);
      expect(new Set(vidljive).size).toBe(vidljive.length);
    },
  );
});

describe("visibility per role: sekcijaVidljiva, full role x section table", () => {
  // Expected values are written out, never derived from the matrix.
  const TABELA: [MenuActor, PanelNavSekcija, boolean][] = [
    ["owner", "pocetna", true],
    ["owner", "editor", true],
    ["owner", "operativa", true],
    ["owner", "lokal", true],
    ["owner", "funkcionalnosti", true],
    ["owner", "tim", true],
    ["owner", "analitika", true],
    ["owner", "podesavanja", true],

    ["manager", "pocetna", true],
    ["manager", "editor", true],
    ["manager", "operativa", true],
    ["manager", "lokal", true],
    ["manager", "funkcionalnosti", true],
    ["manager", "tim", true],
    ["manager", "analitika", true],
    ["manager", "podesavanja", true],

    ["admin", "pocetna", true],
    ["admin", "editor", true],
    ["admin", "operativa", true],
    ["admin", "lokal", true],
    ["admin", "funkcionalnosti", true],
    ["admin", "tim", true],
    ["admin", "analitika", true],
    ["admin", "podesavanja", true],

    ["editor", "pocetna", true],
    ["editor", "editor", true],
    ["editor", "operativa", false],
    ["editor", "lokal", false],
    ["editor", "funkcionalnosti", false],
    ["editor", "tim", false],
    ["editor", "analitika", false],
    ["editor", "podesavanja", false],

    ["staff", "pocetna", false],
    ["staff", "editor", false],
    ["staff", "operativa", false],
    ["staff", "lokal", false],
    ["staff", "funkcionalnosti", false],
    ["staff", "tim", false],
    ["staff", "analitika", false],
    ["staff", "podesavanja", false],
  ];

  test("the table covers every role and every section exactly once", () => {
    expect(TABELA).toHaveLength(ULOGE.length * REDOSLED.length);
    expect(TABELA).toHaveLength(40);
    const kljucevi = TABELA.map(([uloga, sekcija]) => `${uloga}:${sekcija}`);
    expect(new Set(kljucevi).size).toBe(40);
  });

  test.each(TABELA)("%s / %s -> %s", (uloga, sekcija, ocekivano) => {
    expect(sekcijaVidljiva(uloga, sekcija)).toBe(ocekivano);
  });
});

describe("consistency with the permission matrix", () => {
  const PAROVI = ULOGE.flatMap((uloga) =>
    REDOSLED.map((sekcija): [MenuActor, PanelNavSekcija] => [uloga, sekcija]),
  );

  test.each(PAROVI)("%s / %s: sekcijaVidljiva equals roleCan of the section permission", (uloga, sekcija) => {
    expect(sekcijaVidljiva(uloga, sekcija)).toBe(roleCan(uloga, PANEL_SEKCIJA_DOZVOLA[sekcija]));
  });

  test("the permission a section needs is the one of the work done there", () => {
    expect(PANEL_SEKCIJA_DOZVOLA).toEqual({
      pocetna: "menu.read",
      editor: "menu.read",
      operativa: "operations.read",
      lokal: "venue.edit",
      funkcionalnosti: "features.edit",
      tim: "team.manage",
      analitika: "analytics.read",
      podesavanja: "settings.edit",
    });
  });
});

describe("panelPristup: client panel or waiter panel", () => {
  test("staff gets the waiter panel entry, never an empty client panel", () => {
    expect(panelPristup("staff")).toEqual({ vrsta: "konobarski-panel" });
  });

  const PANEL: [MenuActor, PanelNavSekcija[]][] = [
    ["owner", [...REDOSLED]],
    ["manager", [...REDOSLED]],
    ["admin", [...REDOSLED]],
    ["editor", ["pocetna", "editor"]],
  ];

  test.each(PANEL)("%s gets the client panel with the visible sections", (uloga, sekcije) => {
    expect(panelPristup(uloga)).toEqual({ vrsta: "panel", sekcije });
  });
});

describe("hrefs", () => {
  test("the panel root of a venue", () => {
    expect(panelKoren("demo-restoran")).toBe("/demo-restoran/client-panel/meni");
  });

  test("a slug that needs encoding is encoded", () => {
    expect(panelKoren("a b")).toBe("/a%20b/client-panel/meni");
    expect(panelKoren("a/b")).toBe("/a%2Fb/client-panel/meni");
    expect(panelSekcijaHref("a b", "tim")).toBe("/a%20b/client-panel/meni/tim");
    expect(klijentskiPanelHref("a b")).toBe("/a%20b/client-panel");
    expect(postojeciEditorHref("a b")).toBe("/a%20b/meni/editor");
    expect(konobarskiPanelUlazHref("a b")).toBe("/a%20b/konobar");
  });

  test("Pocetna links to the panel root", () => {
    expect(panelSekcijaHref("demo-restoran", "pocetna")).toBe(panelKoren("demo-restoran"));
  });

  test.each(REDOSLED.filter((sekcija) => sekcija !== "pocetna").map((sekcija) => [sekcija]))(
    "%s links to the panel root plus its segment",
    (sekcija) => {
      expect(panelSekcijaHref("demo-restoran", sekcija)).toBe(
        `/demo-restoran/client-panel/meni/${sekcija}`,
      );
    },
  );

  test("the eight section hrefs are all different", () => {
    const hrefovi = PANEL_NAV_SEKCIJE.map((sekcija) => panelSekcijaHref("demo-restoran", sekcija));
    expect(hrefovi).toHaveLength(8);
    expect(new Set(hrefovi).size).toBe(8);
  });

  test("the link to the existing client panel", () => {
    expect(klijentskiPanelHref("demo-restoran")).toBe("/demo-restoran/client-panel");
  });

  test("the existing editor that Editor opens until the new one exists", () => {
    expect(postojeciEditorHref("demo-restoran")).toBe("/demo-restoran/meni/editor");
  });

  test("the waiter panel entry never reveals the secret code", () => {
    expect(konobarskiPanelUlazHref("demo-restoran")).toBe("/demo-restoran/konobar");
  });
});

describe("panelNavStavke", () => {
  const href = (sekcija: PanelNavSekcija): string => `/x/${sekcija}`;

  test("an owner gets all eight sections with the given href applied, in order", () => {
    expect(panelNavStavke("owner", href)).toEqual(
      REDOSLED.map((sekcija) => ({ sekcija, href: `/x/${sekcija}` })),
    );
  });

  test("an editor gets only the sections they see, in order", () => {
    expect(panelNavStavke("editor", href)).toEqual([
      { sekcija: "pocetna", href: "/x/pocetna" },
      { sekcija: "editor", href: "/x/editor" },
    ]);
  });

  test("staff gets no items", () => {
    expect(panelNavStavke("staff", href)).toEqual([]);
  });

  test("with panelSekcijaHref the items point into the panel of the venue", () => {
    expect(panelNavStavke("editor", (sekcija) => panelSekcijaHref("demo-restoran", sekcija))).toEqual([
      { sekcija: "pocetna", href: "/demo-restoran/client-panel/meni" },
      { sekcija: "editor", href: "/demo-restoran/client-panel/meni/editor" },
    ]);
  });
});

describe("sekcijaIzSegmenta: URL segment to section", () => {
  test("no segment is Pocetna, the index of the panel", () => {
    expect(sekcijaIzSegmenta(null)).toBe("pocetna");
  });

  test.each(REDOSLED.filter((sekcija) => sekcija !== "pocetna").map((sekcija) => [sekcija]))(
    "round trip: the segment of %s maps back to it",
    (sekcija) => {
      const segment = PANEL_SEKCIJA_SEGMENT[sekcija];
      expect(segment).not.toBeNull();
      expect(sekcijaIzSegmenta(segment)).toBe(sekcija);
    },
  );

  test("round trip for all eight sections", () => {
    for (const sekcija of PANEL_NAV_SEKCIJE) {
      expect(sekcijaIzSegmenta(PANEL_SEKCIJA_SEGMENT[sekcija])).toBe(sekcija);
    }
  });

  test.each([["kuhinja"], [""], ["Editor"], ["primitivi"], ["editor/"]])(
    "an unknown segment (%j) maps to null",
    (segment) => {
      expect(sekcijaIzSegmenta(segment)).toBeNull();
    },
  );
});

describe("navSkupljenaPodrazumevano: the rail is collapsed only while the Editor is open", () => {
  test("true for editor", () => {
    expect(navSkupljenaPodrazumevano("editor")).toBe(true);
  });

  test.each(REDOSLED.filter((sekcija) => sekcija !== "editor").map((sekcija) => [sekcija]))(
    "false for %s",
    (sekcija) => {
      expect(navSkupljenaPodrazumevano(sekcija)).toBe(false);
    },
  );

  test("false when no section is open", () => {
    expect(navSkupljenaPodrazumevano(null)).toBe(false);
  });
});
