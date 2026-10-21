// ScanMe Menu V1 (K26) — tests for buildMailto.
import { describe, expect, test } from "vitest";
import { MAILTO_MAX_LENGTH, buildMailto, normalizeNewlines } from "./mailto";

const SERBIAN = "čćžšđ ČĆŽŠĐ";
const SERBIAN_ENCODED =
  "%C4%8D%C4%87%C5%BE%C5%A1%C4%91%20%C4%8C%C4%86%C5%BD%C5%A0%C4%90";

function parts(href: string) {
  const [, rest] = href.split("mailto:");
  const [to, query] = rest.split("?");
  const [subject, body] = query.split("&");
  return {
    to,
    subjectValue: subject.replace(/^subject=/, ""),
    bodyValue: body.replace(/^body=/, ""),
  };
}

describe("buildMailto encoding", () => {
  test("encodes Serbian letters as UTF-8 percent sequences", () => {
    const { href, truncated } = buildMailto({
      to: "gost@example.com",
      subject: SERBIAN,
      body: SERBIAN,
    });
    const p = parts(href);
    expect(p.subjectValue).toBe(SERBIAN_ENCODED);
    expect(p.bodyValue).toBe(SERBIAN_ENCODED);
    expect(truncated).toBe(false);
  });

  test("turns a newline into %0D%0A and keeps no raw specials in values", () => {
    const { href } = buildMailto({
      to: "gost@example.com",
      subject: "a b&c?d\ne",
      body: "red 1\nred 2 & x ? y\r\nred 3\rred 4",
    });
    const p = parts(href);
    expect(p.bodyValue).toContain("%0D%0A");
    for (const value of [p.subjectValue, p.bodyValue]) {
      expect(value).not.toMatch(/[\r\n &?]/);
    }
    expect(p.subjectValue).toBe("a%20b%26c%3Fd%20e");
    expect(decodeURIComponent(p.bodyValue)).toBe(
      "red 1\r\nred 2 & x ? y\r\nred 3\r\nred 4",
    );
  });

  test("decodes back to the CRLF-normalized body", () => {
    const body = `Poštovani,\n${SERBIAN}\n— Demo restoran`;
    const { href } = buildMailto({ to: "gost@example.com", subject: "x", body });
    expect(decodeURIComponent(parts(href).bodyValue)).toBe(
      normalizeNewlines(body),
    );
  });
});

describe("buildMailto recipient", () => {
  test("keeps a plain address readable", () => {
    const { href } = buildMailto({
      to: "  gost@example.com ",
      subject: "s",
      body: "b",
    });
    expect(href.startsWith("mailto:gost@example.com?subject=")).toBe(true);
  });

  test("cannot add a header through the address", () => {
    const { href } = buildMailto({
      to: "gost@example.com?cc=x@example.com",
      subject: "s",
      body: "b",
    });
    const p = parts(href);
    expect(p.to).toBe("gost@example.com%3Fcc%3Dx@example.com");
    expect(href.split("?")).toHaveLength(2);
  });

  test("cannot add a second recipient", () => {
    const { href } = buildMailto({
      to: "a@example.com,b@example.com",
      subject: "s",
      body: "b",
    });
    expect(parts(href).to).toBe("a@example.com%2Cb@example.com");
  });
});

describe("buildMailto truncation", () => {
  test("truncates a long Serbian body to the limit and ends with the note", () => {
    const note = "[Tekst je skraćen]";
    const body = "Poštovani, želim rezervaciju čćžšđ. ".repeat(140);
    expect(body.length).toBeGreaterThan(4900);
    const { href, truncated } = buildMailto({
      to: "gost@example.com",
      subject: "Rezervacija",
      body,
      truncatedNote: note,
    });
    expect(truncated).toBe(true);
    expect(href.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH);
    const decoded = decodeURIComponent(parts(href).bodyValue);
    expect(decoded.endsWith("\r\n\r\n" + note)).toBe(true);
    expect(decoded.length).toBeLessThan(body.length);
    expect(body.startsWith(decoded.slice(0, 100))).toBe(true);
  });

  test("terminates for a 10 000 character body without a note", () => {
    const { href, truncated } = buildMailto({
      to: "gost@example.com",
      subject: "s",
      body: "x".repeat(10000),
    });
    expect(truncated).toBe(true);
    expect(href.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH);
  });

  test("honors a custom maxLength", () => {
    const { href, truncated } = buildMailto({
      to: "gost@example.com",
      subject: "s",
      body: "reč ".repeat(200),
      maxLength: 300,
    });
    expect(truncated).toBe(true);
    expect(href.length).toBeLessThanOrEqual(300);
  });

  test("never splits an emoji at the cut", () => {
    for (const maxLength of [400, 401, 402, 403, 404, 1800]) {
      const { href, truncated } = buildMailto({
        to: "gost@example.com",
        subject: "s",
        body: "😀".repeat(2000),
        truncatedNote: "...",
        maxLength,
      });
      expect(truncated).toBe(true);
      expect(href.length).toBeLessThanOrEqual(maxLength);
      expect(() => decodeURIComponent(parts(href).bodyValue)).not.toThrow();
    }
  });

  test("short text is not truncated", () => {
    const { href, truncated } = buildMailto({
      to: "gost@example.com",
      subject: "s",
      body: "kratko",
      truncatedNote: "skraćeno",
    });
    expect(truncated).toBe(false);
    expect(href).toBe("mailto:gost@example.com?subject=s&body=kratko");
  });
});
