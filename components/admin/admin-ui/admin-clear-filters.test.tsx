import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";

const nav = vi.hoisted(() => ({ pathname: "/admin/klijenti", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));

import { AdminClearFilters } from "./admin-clear-filters";

describe("AdminClearFilters", () => {
  beforeEach(() => {
    nav.pathname = "/admin/klijenti";
    nav.search = "";
  });

  test("is not offered while no filter is on", () => {
    expect(renderToStaticMarkup(<AdminClearFilters />)).toBe("");
  });

  test("is offered with a filter or a search on", () => {
    nav.search = "?q=zzz";
    expect(renderToStaticMarkup(<AdminClearFilters />)).toContain(adminUiSr.filters.clearFilters);
    nav.search = "?status=active";
    expect(renderToStaticMarkup(<AdminClearFilters />)).toContain(adminUiSr.filters.clearFilters);
  });
});
