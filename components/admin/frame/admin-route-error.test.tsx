import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminRouteError } from "./admin-route-error";

// ADMIN v2 X6 (RX S5) — a page of the admin that fails shows this inside the
// screen of the frame (app/admin/error.tsx), with a way to try again and a way
// to drop the filters of the link that failed.

describe("the error state of an admin page", () => {
  const d = adminUiSr.routeError;

  test("it is an alert with one title, „Pokušaj ponovo“ as the primary action and „Očisti filtere“ as a plain link without the query", () => {
    const markup = renderToStaticMarkup(<AdminRouteError onRetry={() => undefined} clearHref="/admin/zadaci" />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-admin-route-error=""');
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain(`>${d.title}</h1>`);
    expect(markup).toContain(d.bodyWithFilters);
    expect(markup).toMatch(new RegExp(`<button type="button" class="[^"]*admin-button-primary[^"]*">.*?${adminV1Sr.retryAction}</button>`));
    // A full load of the same page, so nothing of the failed state survives.
    expect(markup).toMatch(new RegExp(`<a href="/admin/zadaci" class="[^"]*">${d.clearFilters}</a>`));
  });

  test("an address without a query has nothing to clear", () => {
    const markup = renderToStaticMarkup(<AdminRouteError onRetry={() => undefined} clearHref={null} />);
    expect(markup).toContain(d.body);
    expect(markup).not.toContain(d.clearFilters);
    expect(markup).not.toContain("<a ");
    expect(markup).toContain(adminV1Sr.retryAction);
  });
});
