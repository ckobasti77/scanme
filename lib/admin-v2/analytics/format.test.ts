import { describe, expect, test } from "vitest";
import { formatCount, formatShare, formatSigned, formatTimes, hourLabel, lowerFirst, sum } from "./format";

// ADMIN v2 X3 — number formats of the analytics charts (sr-RS: decimal comma).

const MINUS = "−";

describe("formatCount", () => {
  test("a missing value is a dash, never a zero", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(undefined)).toBe("—");
  });

  test("a real zero stays a zero", () => {
    expect(formatCount(0)).toBe("0");
  });

  test("decimal comma, at most one decimal", () => {
    expect(formatCount(1.5)).toBe("1,5");
    expect(formatCount(71.3)).toBe("71,3");
    expect(formatCount(1.24)).toBe("1,2");
    expect(formatCount(12)).toBe("12");
  });

  test("a thousand is grouped with a dot", () => {
    expect(formatCount(1234)).toBe("1.234");
  });
});

describe("formatShare", () => {
  test("a share 0–1 is a percentage with a decimal comma", () => {
    expect(formatShare(0.674)).toBe("67,4 %");
    expect(formatShare(0.5)).toBe("50 %");
    expect(formatShare(1)).toBe("100 %");
  });

  test("zero is a real 0 %, null and undefined are a dash", () => {
    expect(formatShare(0)).toBe("0 %");
    expect(formatShare(null)).toBe("—");
    expect(formatShare(undefined)).toBe("—");
  });

  test("rounds to one decimal of the percentage", () => {
    // 1/3 → 33,3 %; 0.0004 is far below a tenth of a percent.
    expect(formatShare(1 / 3)).toBe("33,3 %");
    expect(formatShare(0.0004)).toBe("0 %");
  });
});

describe("formatTimes", () => {
  test("a ratio with one decimal and the multiplication sign", () => {
    expect(formatTimes(1.71)).toBe("1,7×");
    expect(formatTimes(3.26)).toBe("3,3×");
  });

  test("a whole ratio has no decimals", () => {
    expect(formatTimes(2)).toBe("2×");
  });
});

describe("formatSigned", () => {
  test("a gain has a plus, a loss has a real minus sign (not a hyphen)", () => {
    expect(formatSigned(12)).toBe("+12");
    expect(formatSigned(-3)).toBe(`${MINUS}3`);
    expect(formatSigned(-3)).not.toContain("-");
  });

  test("zero is a plain 0, also when the value rounds to zero", () => {
    expect(formatSigned(0)).toBe("0");
    expect(formatSigned(0.04)).toBe("0");
    expect(formatSigned(-0.04)).toBe("0");
  });

  test("keeps one decimal and groups thousands", () => {
    expect(formatSigned(12.34)).toBe("+12,3");
    expect(formatSigned(-1234)).toBe(`${MINUS}1.234`);
  });
});

describe("hourLabel", () => {
  test("two digits and :00", () => {
    expect(hourLabel(8)).toBe("08:00");
    expect(hourLabel(12)).toBe("12:00");
    expect(hourLabel(0)).toBe("00:00");
    expect(hourLabel(23)).toBe("23:00");
  });
});

describe("lowerFirst", () => {
  test("a plain word is lower-cased inside a sentence", () => {
    expect(lowerFirst("Subota")).toBe("subota");
    expect(lowerFirst("Nedelja")).toBe("nedelja");
    expect(lowerFirst("Đurđevdan")).toBe("đurđevdan");
  });

  test("a label that is not a plain word stays as it is", () => {
    expect(lowerFirst("TEST dan 2")).toBe("TEST dan 2");
    expect(lowerFirst("1. dan")).toBe("1. dan");
  });

  test("a label with a lower-case second letter and a number is still a word", () => {
    expect(lowerFirst("Dan 2")).toBe("dan 2");
  });

  test("empty and one-letter labels are untouched", () => {
    expect(lowerFirst("")).toBe("");
    expect(lowerFirst("A")).toBe("A");
  });
});

describe("sum", () => {
  test("adds the values; an empty list is 0", () => {
    expect(sum([])).toBe(0);
    expect(sum([1, 2, 3.5])).toBe(6.5);
    expect(sum([5])).toBe(5);
  });
});
