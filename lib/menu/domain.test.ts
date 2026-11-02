// ScanMe Menu V1 (K02) — pure domain helpers: roles and permissions, modes,
// keys, slugs, text normalization, RSD, CAS and sparse ordering.

import { describe, expect, test } from "vitest";
import { MENU_ERROR } from "./errors/core";
import { checkCas } from "./cas";
import { isMenuKey, newMenuKey } from "./keys";
import {
  AVAILABLE_MENU_MODES,
  featuresDroppedByModeChange,
  isModeAvailable,
} from "./modes";
import { moveItem, orderAfter, orderBetween, renumberedOrders } from "./order";
import {
  MENU_PERMISSIONS,
  canAssignRole,
  permissionsOf,
  roleCan,
  strongerRole,
} from "./permissions";
import { effectiveMenuRole, roleFromMembership } from "./roles";
import { isValidRsd } from "./rsd";
import {
  DEFAULT_PAGE_SLUG,
  RESERVED_PAGE_SLUGS,
  isValidPageSlug,
  slugifyPageName,
  uniquePageSlug,
} from "./slugs";
import { foldSerbian, normalizeArticleName, optionalText, requiredText } from "./text";
import { menuDomenSr } from "../i18n/sr/menu-domen";

describe("permissions (master §10.6)", () => {
  test("owner and manager share the management set; only admin has admin.*", () => {
    expect(permissionsOf("owner")).toEqual(permissionsOf("manager"));
    for (const actor of ["owner", "manager", "editor", "staff"] as const) {
      expect(roleCan(actor, "admin.mode")).toBe(false);
      expect(roleCan(actor, "admin.import")).toBe(false);
    }
    expect(permissionsOf("admin")).toEqual([...MENU_PERMISSIONS]);
  });

  test("editor: offer, design, preview and publish — nothing else", () => {
    expect(permissionsOf("editor")).toEqual([
      "menu.read",
      "menu.edit",
      "menu.publish",
      "menu.availability",
    ]);
  });

  test("staff: the waiter panel only (no availability toggle in V1)", () => {
    expect(permissionsOf("staff")).toEqual(["waiter.work"]);
  });

  test("a manager never grants the owner role", () => {
    expect(canAssignRole("manager", "owner")).toBe(false);
    expect(canAssignRole("manager", "editor")).toBe(true);
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("editor", "editor")).toBe(false);
    expect(canAssignRole("staff", "editor")).toBe(false);
  });

  test("strongerRole", () => {
    expect(strongerRole("editor", "owner")).toBe("owner");
    expect(strongerRole("manager", null)).toBe("manager");
    expect(strongerRole(null, null)).toBeNull();
  });
});

describe("roles from existing memberships (K01 §4.2)", () => {
  test("account roles", () => {
    expect(roleFromMembership({ kind: "account", role: "full_access" })).toBe("owner");
    expect(roleFromMembership({ kind: "account", role: "venue_management" })).toBe("manager");
    expect(roleFromMembership({ kind: "account", role: "finance" })).toBeNull();
    expect(roleFromMembership({ kind: "account", role: "view_only" })).toBeNull();
    expect(roleFromMembership({ kind: "legacy" })).toBe("manager");
    expect(roleFromMembership({ kind: "none" })).toBeNull();
  });

  test("the effective role is the stronger of derived and explicit", () => {
    expect(effectiveMenuRole({ membership: { kind: "none" }, explicitRole: "editor" })).toBe("editor");
    expect(
      effectiveMenuRole({ membership: { kind: "account", role: "full_access" }, explicitRole: "editor" }),
    ).toBe("owner");
    expect(
      effectiveMenuRole({ membership: { kind: "account", role: "finance" }, explicitRole: null }),
    ).toBeNull();
  });
});

describe("modes (master §4)", () => {
  test("V1 builds hospitality only", () => {
    expect(AVAILABLE_MENU_MODES).toEqual(["hospitality"]);
    expect(isModeAvailable("services")).toBe(false);
    expect(isModeAvailable("retail")).toBe(false);
  });

  test("a mode change lists the features that are not carried over", () => {
    expect(featuresDroppedByModeChange("hospitality", "services")).toEqual([
      "callWaiter",
      "billRequest",
      "ordering",
      "roomService",
      "occupancy",
    ]);
    expect(featuresDroppedByModeChange("hospitality", "hospitality")).toEqual([]);
  });
});

describe("keys", () => {
  test("format and prefix", () => {
    const key = newMenuKey("article");
    expect(isMenuKey(key, "article")).toBe(true);
    expect(isMenuKey(key, "page")).toBe(false);
    expect(newMenuKey("page", (n) => new Uint8Array(n))).toBe("pg_000000000000");
  });

  test("keys differ", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newMenuKey("section")));
    expect(keys.size).toBe(200);
  });
});

describe("page slugs", () => {
  test("slugify folds Serbian Latin and punctuation", () => {
    expect(slugifyPageName("Vinska karta — crvena")).toBe("vinska-karta-crvena");
    expect(slugifyPageName("Ćevapi & Đuveč")).toBe("cevapi-djuvec");
    expect(slugifyPageName("!!!")).toBe("");
  });

  test("unique, non-reserved, bounded", () => {
    expect(uniquePageSlug("Editor", new Set())).toBe("editor-2");
    expect(uniquePageSlug("Glavni", new Set())).toBe("glavni-2");
    expect(uniquePageSlug("Piće", new Set(["pice", "pice-2"]))).toBe("pice-3");
    expect(uniquePageSlug("???", new Set())).toBe("stranica");
    const long = uniquePageSlug("a".repeat(100), new Set(["a".repeat(60)]));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(isValidPageSlug(long)).toBe(true);
  });

  test("the default page slug is reserved for it", () => {
    expect(RESERVED_PAGE_SLUGS.has(DEFAULT_PAGE_SLUG)).toBe(true);
    expect(isValidPageSlug(DEFAULT_PAGE_SLUG)).toBe(true);
  });
});

describe("text", () => {
  test("article names normalize for duplicate detection", () => {
    expect(normalizeArticleName("  Šljivovica  0,5 ")).toBe(normalizeArticleName("sljivovica 0.5"));
    expect(normalizeArticleName("Đuveč")).toBe("djuvec");
    expect(foldSerbian("ČĆŠŽĐ")).toBe("ccszdj");
  });

  test("required and optional text are cleaned and never silently cut", () => {
    expect(requiredText("  Kafa   sa  mlekom ", 120)).toBe("Kafa sa mlekom");
    expect(requiredText("   ", 120)).toBeNull();
    expect(requiredText("x".repeat(121), 120)).toBeNull();
    expect(optionalText(undefined, 10)).toBeUndefined();
    expect(optionalText("   ", 10)).toBeUndefined();
    expect(optionalText("x".repeat(11), 10)).toBe(false);
  });
});

describe("RSD", () => {
  test("whole dinars only", () => {
    expect(isValidRsd(0)).toBe(true);
    expect(isValidRsd(1490)).toBe(true);
    expect(isValidRsd(1_000_000)).toBe(true);
    expect(isValidRsd(1_000_001)).toBe(false);
    expect(isValidRsd(1.5)).toBe(false);
    expect(isValidRsd(-1)).toBe(false);
    expect(isValidRsd(Number.NaN)).toBe(false);
  });
});

describe("CAS by value", () => {
  test("matching values pass; a changed value is reported with the current value", () => {
    expect(checkCas({ name: "Kafa", basePriceRsd: 200 }, { basePriceRsd: 200 })).toEqual({ ok: true });
    expect(checkCas({ basePriceRsd: 280 }, { basePriceRsd: 250 })).toEqual({
      ok: false,
      conflicts: ["basePriceRsd"],
      current: { basePriceRsd: 280 },
    });
  });

  test("null means absent", () => {
    expect(checkCas({ description: undefined }, { description: null })).toEqual({ ok: true });
    expect(checkCas({ description: "Topla" }, { description: null })).toMatchObject({ ok: false });
  });
});

describe("sparse ordering", () => {
  test("after, between, exhausted gap", () => {
    expect(orderAfter(null)).toBe(1024);
    expect(orderAfter(2048)).toBe(3072);
    expect(orderBetween(1024, 2048)).toBe(1536);
    expect(orderBetween(null, 1024)).toBe(0);
    expect(orderBetween(1, 1 + Number.EPSILON)).toBeNull();
    expect(renumberedOrders(3)).toEqual([1024, 2048, 3072]);
  });

  test("moveItem clamps the target", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 9, 0)).toEqual(["a", "b", "c"]);
  });
});

describe("menu-domen dictionary", () => {
  test("every core error code has Serbian text", () => {
    for (const code of Object.values(MENU_ERROR)) {
      expect(menuDomenSr.errors[code].length).toBeGreaterThan(0);
    }
    expect(menuDomenSr.defaultPageName).toBe("Kompletan meni");
  });
});
