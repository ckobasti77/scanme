import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { resolveAdminSidebar, DEFAULT_SIDEBAR } from "@/lib/admin-v2/sidebar/registry";
import { adminSearchSr } from "@/lib/i18n/sr/admin-search";
import { AdminDebugSupportPreview } from "./admin-debug-support";

// ADMIN v2 X2 — the Debug support page in the new frame: the header of the
// page is AdminPageHeader (one H1 on the fixed scale) and the debug bar sticks
// to the top of the screen, which is the scroll container.

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => undefined }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/debug/preview",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, replace() {} }),
}));

describe("Debug support page", () => {
  const html = renderToStaticMarkup(<AdminDebugSupportPreview />);

  test("one H1 in the page header, on the fixed scale", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('data-admin-primitive="page-header"');
    expect(html).toContain(`>${adminSearchSr.debugOverviewTitle}</h1>`);
    expect(html).not.toContain("clamp(");
  });

  test("the debug bar sticks to the top of the screen, not below a header that no longer exists", () => {
    expect(html).toContain(adminSearchSr.debugMode);
    expect(html).toContain("sticky top-0");
    expect(html).not.toContain("top-[4.5rem]");
  });

  test("the page has no list filters: its sidebar is the default one", () => {
    expect(html).not.toContain("<select");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('type="search"');
    expect(resolveAdminSidebar("/admin/debug/c1")).toBe(DEFAULT_SIDEBAR);
    expect(resolveAdminSidebar("/dev/admin-18-preview", "?mode=debug")).toBe(DEFAULT_SIDEBAR);
  });
});
