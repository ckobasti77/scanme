// ScanMe Menu V1 (K25) — the link of a venue's own reservation system
// (lib/menu/external-url.ts; master §11.6). Only an https address with a real
// host name, no credentials, at most 500 characters, stored in the URL's own
// normalization. Invented addresses only.

import { describe, expect, test } from "vitest";
import { EXTERNAL_RESERVATION_URL_MAX, normalizeExternalReservationUrl } from "./external-url";

describe("normalizeExternalReservationUrl: accepted", () => {
  test("a plain https address is kept", () => {
    expect(normalizeExternalReservationUrl("https://rezervacije.primer.rs/sto")).toBe("https://rezervacije.primer.rs/sto");
    expect(normalizeExternalReservationUrl("https://primer.rs/rezervacija?lang=sr&sto=2")).toBe(
      "https://primer.rs/rezervacija?lang=sr&sto=2",
    );
  });

  test("it is the URL's own normalization: lower-case host, a slash for the bare host, no stray spaces", () => {
    expect(normalizeExternalReservationUrl("https://primer.rs")).toBe("https://primer.rs/");
    expect(normalizeExternalReservationUrl("HTTPS://Rezervacije.PRIMER.rs/Sto")).toBe("https://rezervacije.primer.rs/Sto");
    expect(normalizeExternalReservationUrl("  https://primer.rs/book  ")).toBe("https://primer.rs/book");
    expect(normalizeExternalReservationUrl("https://primer.rs:443/book")).toBe("https://primer.rs/book");
  });

  test("a non-default port, a fragment and a deep host are fine", () => {
    expect(normalizeExternalReservationUrl("https://primer.rs:8443/book")).toBe("https://primer.rs:8443/book");
    expect(normalizeExternalReservationUrl("https://a.b.c.primer.rs/book#sto")).toBe("https://a.b.c.primer.rs/book#sto");
  });

  test("the normalized form is stable: normalizing it again changes nothing", () => {
    const once = normalizeExternalReservationUrl("HTTPS://Primer.RS");
    expect(once).not.toBeNull();
    expect(normalizeExternalReservationUrl(once)).toBe(once);
  });

  test("exactly 500 characters are allowed", () => {
    const prefix = "https://primer.rs/";
    const url = prefix + "a".repeat(EXTERNAL_RESERVATION_URL_MAX - prefix.length);
    expect(url).toHaveLength(500);
    expect(normalizeExternalReservationUrl(url)).toBe(url);
  });
});

describe("normalizeExternalReservationUrl: refused", () => {
  test.each([
    ["http (not https)", "http://primer.rs/rezervacija"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<b>x</b>"],
    ["ftp", "ftp://primer.rs/rezervacija"],
    ["file", "file:///etc/hosts"],
    ["mailto", "mailto:sto@primer.rs"],
    ["a protocol-relative link", "//primer.rs/rezervacija"],
    ["credentials (user and password)", "https://marko:tajna@primer.rs/rezervacija"],
    ["credentials (user only)", "https://marko@primer.rs/rezervacija"],
    ["credentials (password only)", "https://:tajna@primer.rs/rezervacija"],
    ["localhost", "https://localhost/rezervacija"],
    ["localhost with a port", "https://localhost:3000/rezervacija"],
    ["a bare host name", "https://rezervacije/sto"],
    // K25 (main agent): an IP address is not a venue's site (and may be a local network).
    ["an IPv4 address", "https://127.0.0.1/rezervacija"],
    ["a private IPv4 address", "https://192.168.0.5/rezervacija"],
    ["an IPv6 address", "https://[::1]/rezervacija"],
    ["a bare word", "rezervacije"],
    ["no scheme", "primer.rs/rezervacija"],
    ["a space in the address", "https://primer.rs/moja rezervacija"],
    ["a space in the host", "https://pri mer.rs/rezervacija"],
    ["a tab in the address", "https://primer.rs/a\tb"],
    ["a trailing-dot host", "https://primer.rs./rezervacija"],
    ["an underscore host", "https://pri_mer.rs/rezervacija"],
    ["a host with no name before the dot", "https://.rs/rezervacija"],
    ["empty", ""],
    ["blank", "   "],
    ["only the scheme", "https://"],
  ])("%s", (_name, value) => {
    expect(normalizeExternalReservationUrl(value)).toBeNull();
  });

  test("501 characters are too long", () => {
    const prefix = "https://primer.rs/";
    expect(normalizeExternalReservationUrl(prefix + "a".repeat(EXTERNAL_RESERVATION_URL_MAX - prefix.length + 1))).toBeNull();
    expect(normalizeExternalReservationUrl(`https://primer.rs/${"a".repeat(5_000)}`)).toBeNull();
  });

  test("anything that is not text is refused", () => {
    for (const value of [undefined, null, 42, true, {}, ["https://primer.rs/"], new URL("https://primer.rs/")]) {
      expect(normalizeExternalReservationUrl(value), String(value)).toBeNull();
    }
  });
});
