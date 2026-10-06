import { describe, expect, test } from "vitest";
import { fairQrPublicUrl } from "./qr-url";
import { normalizeWebsiteUrl, websiteLabel, WEBSITE_URL_MAX } from "./website";

// Izlagači 2026 — the client's website (profile, exhibitor cards) and the
// address a printed fair QR encodes.

describe("normalizeWebsiteUrl", () => {
  test("a pasted host gets https://; http and https stay; the URL is normalized", () => {
    expect(normalizeWebsiteUrl("primer.rs")).toBe("https://primer.rs/");
    expect(normalizeWebsiteUrl("  www.Ferum-DOO.com/o-nama ")).toBe("https://www.ferum-doo.com/o-nama");
    expect(normalizeWebsiteUrl("http://motogrini.rs")).toBe("http://motogrini.rs/");
    expect(normalizeWebsiteUrl("https://www.instagram.com/rentacar_kostic/")).toBe("https://www.instagram.com/rentacar_kostic/");
  });

  test("empty, other schemes, credentials, hosts without a dot and spaces are refused", () => {
    for (const value of [null, undefined, "", "   ", "javascript:alert(1)", "mailto:a@b.rs", "ftp://primer.rs", "https://user:pass@primer.rs", "localhost:3000", "https://primer", "primer .rs", "https://.rs"]) {
      expect(normalizeWebsiteUrl(value)).toBeNull();
    }
    expect(normalizeWebsiteUrl(`https://primer.rs/${"a".repeat(WEBSITE_URL_MAX)}`)).toBeNull();
  });

  test("the short label of a link: host without www., the path without the query, at most 40 characters", () => {
    expect(websiteLabel("https://www.ferum-doo.com/")).toBe("ferum-doo.com");
    expect(websiteLabel("https://visitnis.org/")).toBe("visitnis.org");
    expect(websiteLabel("https://www.instagram.com/rentacar_kostic/")).toBe("instagram.com/rentacar_kostic");
    expect(websiteLabel("https://www.citroen.rs/alati/pronadji-prodajno-servisni-centar.html?searchTerm=raavex")).toBe("citroen.rs/alati/pronadji-prodajno-serv…");
    expect(websiteLabel("nije url")).toBe("nije url");
  });
});

describe("fairQrPublicUrl", () => {
  test("`<origin>/r/<kod>` of the deployment the admin runs on (the printed sticker on production)", () => {
    expect(fairQrPublicUrl("https://scanme.rs", "7KQ2M9XA")).toBe("https://scanme.rs/r/7KQ2M9XA");
    expect(fairQrPublicUrl("http://192.168.1.20:3000/", "7KQ2M9XA")).toBe("http://192.168.1.20:3000/r/7KQ2M9XA");
    expect(fairQrPublicUrl("", "7KQ2M9XA")).toBe("https://scanme.rs/r/7KQ2M9XA");
  });
});
