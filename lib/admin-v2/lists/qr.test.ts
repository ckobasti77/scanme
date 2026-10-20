import { describe, expect, test } from "vitest";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { QR_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/operations";
import { filterPreviewChannels, qrListArgs, type QrPreviewRow } from "./qr";

// ADMIN v2 — QR kodovi: the URL state of the sidebar becomes the arguments of
// `adminProductReads.listChannels`, the same ones the filter block above the
// list sent before.

const args = (search: string) => qrListArgs(readUrlState(QR_URL_FIELDS, search));

describe("qrListArgs", () => {
  test("an empty state is the list without filters, newest first", () => {
    expect(qrListArgs({})).toEqual({ direction: "desc" });
    expect(args("")).toEqual({ direction: "desc" });
  });

  test("every filter gives the argument the list sent before", () => {
    expect(args("?q=SMQ-0102")).toEqual({ search: "SMQ-0102", direction: "desc" });
    expect(args("?veza=digital")).toEqual({ binding: "digital", direction: "desc" });
    expect(args("?veza=physical")).toEqual({ binding: "physical", direction: "desc" });
    expect(args("?vrsta=qr")).toEqual({ kind: "qr", direction: "desc" });
    expect(args("?vrsta=nfc")).toEqual({ kind: "nfc", direction: "desc" });
    for (const status of ["active", "inactive", "problem"]) expect(args(`?status=${status}`)).toEqual({ state: status, direction: "desc" });
    expect(args("?q=r-9&veza=physical&vrsta=nfc&status=problem")).toEqual({ search: "r-9", binding: "physical", kind: "nfc", state: "problem", direction: "desc" });
  });

  test("a blank search is not sent; an invalid value reads as absent", () => {
    expect(qrListArgs({ q: "   " })).toEqual({ direction: "desc" });
    expect(args("?veza=sve&vrsta=ostalo&status=zatvoren")).toEqual({ direction: "desc" });
    expect(args("?veza=digital&vrsta=laser")).toEqual({ binding: "digital", direction: "desc" });
  });

  test("parameters the page does not own are ignored", () => {
    expect(args("?channel=abc&code=SMQ-1")).toEqual({ direction: "desc" });
  });
});

const row = (id: string, extra: Partial<QrPreviewRow> = {}): QrPreviewRow => ({
  resolverCode: `r-${id}`, smqCode: `SMQ-TEST-${id}`, smfCode: null, accountName: "TEST Klijent", venueName: `TEST Lokal ${id}`, smkCode: "SMK-TEST", smlCode: `SML-TEST-${id}`,
  binding: "digital", kind: "qr", state: "active", ...extra,
});

const rows = [
  row("1"),
  row("2", { binding: "physical", smqCode: null, smfCode: "SMF-TEST-2" }),
  row("3", { kind: "nfc", binding: "physical", state: "problem" }),
  row("4", { state: "inactive", accountName: "TEST Drugi" }),
];
const ids = (state: Record<string, string>) => filterPreviewChannels(rows, state).map((entry) => entry.resolverCode);

describe("filterPreviewChannels", () => {
  test("without filters every row stays", () => {
    expect(ids({})).toEqual(["r-1", "r-2", "r-3", "r-4"]);
  });

  test("each filter narrows like the query would", () => {
    expect(ids({ veza: "physical" })).toEqual(["r-2", "r-3"]);
    expect(ids({ vrsta: "nfc" })).toEqual(["r-3"]);
    expect(ids({ status: "problem" })).toEqual(["r-3"]);
    expect(ids({ veza: "physical", status: "problem" })).toEqual(["r-3"]);
    expect(ids({ veza: "digital", vrsta: "nfc" })).toEqual([]);
  });

  test("the search looks at the codes, the client, the venue and the SML", () => {
    expect(ids({ q: "smf-test-2" })).toEqual(["r-2"]);
    expect(ids({ q: "SMQ-TEST-1" })).toEqual(["r-1"]);
    expect(ids({ q: "drugi" })).toEqual(["r-4"]);
    expect(ids({ q: "lokal 3" })).toEqual(["r-3"]);
    expect(ids({ q: "sml-test-4" })).toEqual(["r-4"]);
    expect(ids({ q: "nema" })).toEqual([]);
  });
});
