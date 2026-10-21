// ScanMe Menu V1 (K26) — tests for telHref.
import { describe, expect, test } from "vitest";
import { telHref } from "./phone";

describe("telHref", () => {
  test("keeps the leading plus and the digits", () => {
    expect(telHref("+381 60 000 0000")).toBe("tel:+381600000000");
  });

  test("strips separators from a local number", () => {
    expect(telHref("060/000-0000")).toBe("tel:0600000000");
  });

  test("returns null without enough digits", () => {
    expect(telHref("abc")).toBeNull();
    expect(telHref("")).toBeNull();
    expect(telHref("+12345")).toBeNull();
  });

  test("drops brackets and spaces", () => {
    expect(telHref("+381 (60) 000")).toBe("tel:+38160000");
  });

  test("drops a plus that is not leading", () => {
    expect(telHref("060+000 0000")).toBe("tel:0600000000");
  });

  test("ignores surrounding whitespace before the plus", () => {
    expect(telHref("  +381 60 000 0000 ")).toBe("tel:+381600000000");
  });
});
