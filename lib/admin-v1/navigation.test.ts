import { describe, expect, test } from "vitest";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import {
  ADMIN_NAV_ITEMS,
  getActiveAdminNavId,
  isAdminNavChildActive,
} from "./navigation";

describe("ADMIN-05 navigation contract", () => {
  test("contains exactly the eight locked top-level items in order", () => {
    expect(ADMIN_NAV_ITEMS.map((item) => adminV1Sr[item.labelKey])).toEqual([
      "Dashboard",
      "Klijenti",
      "Inbox",
      "Zadaci",
      "Operativa",
      "Usluge",
      "Finansije",
      "Tim",
    ]);
  });

  test("keeps products only under operations", () => {
    const operations = ADMIN_NAV_ITEMS.find((item) => item.id === "operations");
    expect(operations?.children?.map((item) => adminV1Sr[item.labelKey])).toEqual([
      "Proizvodi",
      "QR kodovi",
      "Porudžbine",
    ]);
    const topLevelLabels: readonly string[] = ADMIN_NAV_ITEMS.map(
      (item) => adminV1Sr[item.labelKey],
    );
    expect(topLevelLabels).not.toContain("Proizvodi");
  });

  test("keeps the V1 services list limited to Links, Review, and Menu", () => {
    const services = ADMIN_NAV_ITEMS.find((item) => item.id === "services");
    expect(services?.children?.map((item) => adminV1Sr[item.labelKey])).toEqual([
      "Links",
      "Review",
      "Meni",
    ]);
  });

  test("resolves canonical and retained legacy paths to one active item", () => {
    expect(getActiveAdminNavId("/admin")).toBe("dashboard");
    expect(getActiveAdminNavId("/admin/klijenti/SMK-1")).toBe("clients");
    expect(getActiveAdminNavId("/admin/customers/legacy-id")).toBe("clients");
    expect(getActiveAdminNavId("/admin/cards")).toBe("operations");
    expect(getActiveAdminNavId("/admin/scanme-links/example/editor")).toBe(
      "services",
    );
    expect(getActiveAdminNavId("/admin/venue")).toBeNull();
    expect(getActiveAdminNavId("/admin/memories")).toBeNull();
  });

  test("marks the matching dropdown child active on legacy routes", () => {
    const services = ADMIN_NAV_ITEMS.find((item) => item.id === "services");
    const links = services?.children?.find((item) => item.id === "links");
    expect(links && isAdminNavChildActive("/admin/scanme-links", links)).toBe(
      true,
    );
  });
});
