import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { PRODUCTS_URL_FIELDS, QR_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/operations";
import { legacySearchHref } from "./legacy-param";

// ADMIN v2 X2 — older links to QR kodovi (`?code=`) and Proizvodi (`?smf=`)
// keep working: their search text moves to `q`, which the lists read.

const QR = "/admin/operativa/qr";
const PRODUCTS = "/admin/operativa/proizvodi";

describe("an older search parameter becomes q", () => {
  test("a link without the old parameter is not redirected", () => {
    expect(legacySearchHref(QR, {}, "code")).toBeNull();
    expect(legacySearchHref(QR, { q: "r-9QM4Z", channel: "c1" }, "code")).toBeNull();
  });

  test("the old parameter moves to q and the rest of the query stays", () => {
    expect(legacySearchHref(QR, { code: "r-9QM4Z" }, "code")).toBe(`${QR}?q=r-9QM4Z`);
    expect(legacySearchHref(QR, { code: "r-9QM4Z", channel: "c1" }, "code")).toBe(`${QR}?channel=c1&q=r-9QM4Z`);
    expect(legacySearchHref(PRODUCTS, { venue: "b1", product: "p1", smf: "SMF-0102-01-011" }, "smf")).toBe(`${PRODUCTS}?venue=b1&product=p1&q=SMF-0102-01-011`);
  });

  test("a search the link already has wins; an empty old parameter is only dropped", () => {
    expect(legacySearchHref(QR, { code: "staro", q: "novo" }, "code")).toBe(`${QR}?q=novo`);
    expect(legacySearchHref(QR, { code: "" }, "code")).toBe(QR);
    expect(legacySearchHref(QR, { code: ["prvi", "drugi"] }, "code")).toBe(`${QR}?q=prvi`);
  });

  test("the redirected link is read by the list as its search", () => {
    const qr = legacySearchHref(QR, { code: "r-9QM4Z", channel: "c1" }, "code")!;
    expect(readUrlState(QR_URL_FIELDS, qr.split("?")[1])).toEqual({ q: "r-9QM4Z" });
    const products = legacySearchHref(PRODUCTS, { venue: "b1", smf: "SMF-0102-01-011" }, "smf")!;
    expect(readUrlState(PRODUCTS_URL_FIELDS, products.split("?")[1])).toEqual({ venue: "b1", q: "SMF-0102-01-011" });
  });
});
