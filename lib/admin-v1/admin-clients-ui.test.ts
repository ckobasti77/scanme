import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
}));
import { AdminClientsPreview } from "@/components/admin/admin-clients";

describe("ADMIN-06 clients presentation", () => {
  test("same-name clients remain identifiable and only Premium receives a badge", () => {
    const html = renderToStaticMarkup(createElement(AdminClientsPreview));

    expect(html.match(/Ana Petrović/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("SMK-ANA-014");
    expect(html).toContain("SMK-ANA-027");
    expect(html).toContain("Bistro Zelen");
    expect(html).toContain("Mala terasa");
    expect(html.match(/data-premium=/g)).toHaveLength(2); // desktop + mobile rendering of one account
  });

  test("service summary exposes exact counts without inventing unread activity", () => {
    const html = renderToStaticMarkup(createElement(AdminClientsPreview));

    expect(html).toContain("2 aktivna / 1 grace");
    expect(html).not.toMatch(/nova poruka|nepročit/i);
  });
});
