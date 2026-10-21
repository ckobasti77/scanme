// ScanMe Menu V1 (K28) — what Tim i pristupi explains and allows. The rights of a role are read from the one matrix; who may
// manage whom follows canAssignRole; the status of a member row follows its term.

import { describe, expect, test } from "vitest";
import { MENU_PERMISSIONS, roleCan } from "./permissions";
import {
  PRAVA,
  TIM_ULOGE,
  pravaUloge,
  smeUpravljati,
  statusClana,
  ulogeZaPoziv,
} from "./team-view";

describe("pravaUloge", () => {
  test("owner and manager hold the same rights except ownership, which only the owner has", () => {
    const owner = pravaUloge("owner");
    const manager = pravaUloge("manager");
    expect(owner).toContain("vlasnistvo");
    expect(manager).not.toContain("vlasnistvo");
    expect(owner.filter((pravo) => pravo !== "vlasnistvo")).toEqual(manager);
    expect(manager).toEqual(PRAVA.map((pravo) => pravo.kljuc));
  });

  test("an editor only edits the menu", () => {
    expect(pravaUloge("editor")).toEqual(["meni"]);
  });

  test("a PIN staff member only works as a waiter", () => {
    expect(pravaUloge("staff")).toEqual(["konobar"]);
  });

  test("every right is tied to a permission that exists in the matrix, and no key is repeated", () => {
    for (const pravo of PRAVA) expect(MENU_PERMISSIONS).toContain(pravo.dozvola);
    const keys = PRAVA.map((pravo) => pravo.kljuc);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("a role lists exactly the rights its permissions give", () => {
    for (const uloga of TIM_ULOGE) {
      const expected = PRAVA.filter((pravo) => roleCan(uloga, pravo.dozvola)).map((pravo) => pravo.kljuc);
      expect(pravaUloge(uloga).filter((pravo) => pravo !== "vlasnistvo")).toEqual(expected);
    }
  });
});

describe("smeUpravljati", () => {
  test("an owner manages every role of another person", () => {
    for (const uloga of ["owner", "manager", "editor"] as const) {
      expect(smeUpravljati("owner", uloga, { svoj: false })).toBe(true);
      expect(smeUpravljati("owner", uloga, { svoj: false, nova: "owner" })).toBe(true);
    }
  });

  test("a manager manages managers and editors but never the Owner role, neither taking nor giving it", () => {
    expect(smeUpravljati("manager", "owner", { svoj: false })).toBe(false);
    expect(smeUpravljati("manager", "manager", { svoj: false })).toBe(true);
    expect(smeUpravljati("manager", "editor", { svoj: false })).toBe(true);
    expect(smeUpravljati("manager", "editor", { svoj: false, nova: "manager" })).toBe(true);
    expect(smeUpravljati("manager", "editor", { svoj: false, nova: "owner" })).toBe(false);
    expect(smeUpravljati("manager", "owner", { svoj: false, nova: "editor" })).toBe(false);
  });

  test("nobody manages their own row", () => {
    for (const actor of ["owner", "manager", "admin"] as const) {
      expect(smeUpravljati(actor, "editor", { svoj: true })).toBe(false);
      expect(smeUpravljati(actor, "owner", { svoj: true, nova: "editor" })).toBe(false);
    }
  });

  test("an editor and a staff member never manage anyone", () => {
    for (const actor of ["editor", "staff"] as const) {
      for (const uloga of ["owner", "manager", "editor"] as const) {
        expect(smeUpravljati(actor, uloga, { svoj: false })).toBe(false);
      }
    }
  });

  test("ScanMe admin manages everything of another person", () => {
    expect(smeUpravljati("admin", "owner", { svoj: false, nova: "manager" })).toBe(true);
  });
});

describe("ulogeZaPoziv", () => {
  test("an owner and an admin may offer all three roles, strongest first", () => {
    expect(ulogeZaPoziv("owner")).toEqual(["owner", "manager", "editor"]);
    expect(ulogeZaPoziv("admin")).toEqual(["owner", "manager", "editor"]);
  });

  test("a manager never offers the Owner role", () => {
    expect(ulogeZaPoziv("manager")).toEqual(["manager", "editor"]);
    expect(ulogeZaPoziv("manager")).not.toContain("owner");
  });

  test("an editor and a staff member offer nothing", () => {
    expect(ulogeZaPoziv("editor")).toEqual([]);
    expect(ulogeZaPoziv("staff")).toEqual([]);
  });
});

describe("statusClana", () => {
  const NOW = 1_800_000_000_000;

  test("an active member is aktivan whatever the term field says", () => {
    expect(statusClana({ status: "active", inviteExpiresAt: null }, NOW)).toBe("aktivan");
    expect(statusClana({ status: "active", inviteExpiresAt: NOW - 1 }, NOW)).toBe("aktivan");
  });

  test("a pending invitation is pozvan inside its term and istekao from the boundary on", () => {
    expect(statusClana({ status: "invited", inviteExpiresAt: NOW + 1 }, NOW)).toBe("pozvan");
    expect(statusClana({ status: "invited", inviteExpiresAt: NOW }, NOW)).toBe("istekao");
    expect(statusClana({ status: "invited", inviteExpiresAt: NOW - 1 }, NOW)).toBe("istekao");
  });

  test("a pending invitation without a term is pozvan", () => {
    expect(statusClana({ status: "invited", inviteExpiresAt: null }, NOW)).toBe("pozvan");
  });
});
