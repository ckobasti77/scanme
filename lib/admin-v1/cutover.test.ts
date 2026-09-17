import { describe, expect, test } from "vitest";
import {
  firstSearchParam,
  legacyLocationTarget,
  safeAdminReturnPath,
  withSearchParams,
} from "./cutover";

describe("ADMIN-20 cutover route helpers", () => {
  test("preserves scalar and repeated legacy query values", () => {
    expect(withSearchParams("/admin/usluge/links", {
      activationRequest: "request-1",
      tag: ["hitno", "novo"],
      empty: undefined,
    })).toBe(
      "/admin/usluge/links?activationRequest=request-1&tag=hitno&tag=novo",
    );

    expect(withSearchParams("/admin/usluge/links?profile=trusted", {
      profile: "forged",
      q: "Most",
    }, ["profile"])).toBe(
      "/admin/usluge/links?profile=trusted&q=Most",
    );
  });

  test("allows only same-origin admin return paths and prevents login loops", () => {
    expect(safeAdminReturnPath("/admin/klijenti/a?section=venues")).toBe(
      "/admin/klijenti/a?section=venues",
    );
    expect(safeAdminReturnPath(["/admin/zadaci?task=1", "/admin"])).toBe(
      "/admin/zadaci?task=1",
    );
    expect(safeAdminReturnPath("https://example.com/admin")).toBe("/admin");
    expect(safeAdminReturnPath("//example.com/admin")).toBe("/admin");
    expect(safeAdminReturnPath("/admin\\..\\public")).toBe("/admin");
    expect(safeAdminReturnPath("/admin/login?returnTo=/admin")).toBe("/admin");
    expect(firstSearchParam(undefined)).toBeUndefined();
  });

  test("maps only proven business and service identities", () => {
    expect(legacyLocationTarget({
      accountId: "account-1",
      businessId: "business-1",
    })).toBe(
      "/admin/klijenti/account-1?section=venues&venue=business-1",
    );
    expect(legacyLocationTarget({
      accountId: "account-1",
      businessId: "business-1",
      service: "links",
      serviceProfileId: "profile-1",
    })).toBe("/admin/usluge/links?profile=profile-1");
    expect(legacyLocationTarget({
      accountId: "account-1",
      businessId: "business-1",
      service: "review",
      serviceProfileId: "profile-2",
    })).toBe("/admin/usluge/review?profile=profile-2");

    expect(legacyLocationTarget({
      accountId: null,
      businessId: "legacy-business",
    })).toBeNull();
    expect(legacyLocationTarget({
      accountId: "account-1",
      businessId: "business-1",
      service: "venue",
      serviceProfileId: "profile-3",
    })).toBeNull();
    expect(legacyLocationTarget({
      accountId: "account-1",
      businessId: "business-1",
      service: "menu",
      serviceProfileId: "profile-4",
    })).toBeNull();
  });
});
