// ScanMe Menu V1 (K29) — the device class of an analytics event, from the
// User-Agent header only; `null` = do not record (no User-Agent, a bot, a link
// preview or a headless browser). docs/menu/ANALITIKA-DEFINICIJE.md §2 "Botovi".

import { describe, expect, test } from "vitest";
import { klasaUredjaja } from "./uredjaj";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
  ipodTouch:
    "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
  androidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  androidFirefoxPhone: "Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  kindleFire:
    "Mozilla/5.0 (Linux; Android 9; KFMAWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/124.5.1 like Chrome/124.0.6367.82 Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  googlebotSmartphone:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  whatsapp: "WhatsApp/2.23.20.0 A",
  headlessChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.0.0 Safari/537.36",
  lighthouse:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.169 Mobile Safari/537.36 Chrome-Lighthouse",
  slackbot: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  skypePreview: "SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com",
  baiduSpider: "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
} as const;

describe("klasaUredjaja", () => {
  test("[uredjaj] no User-Agent is not recorded", () => {
    expect(klasaUredjaja(null)).toBeNull();
    expect(klasaUredjaja(undefined)).toBeNull();
    expect(klasaUredjaja("")).toBeNull();
    expect(klasaUredjaja("   ")).toBeNull();
  });

  test.each([
    ["Googlebot", UA.googlebot],
    ["Googlebot smartphone (looks like a phone)", UA.googlebotSmartphone],
    ["bingbot", UA.bingbot],
    ["facebookexternalhit", UA.facebook],
    ["WhatsApp link preview", UA.whatsapp],
    ["HeadlessChrome", UA.headlessChrome],
    ["Lighthouse (looks like a phone)", UA.lighthouse],
    ["Slackbot", UA.slackbot],
    ["Skype preview", UA.skypePreview],
    ["Baiduspider", UA.baiduSpider],
  ])("[uredjaj] %s is not recorded", (_ime, userAgent) => {
    expect(klasaUredjaja(userAgent)).toBeNull();
  });

  test.each(["bot", "crawler", "spider", "preview", "facebookexternalhit", "whatsapp", "headless", "lighthouse"])(
    "[uredjaj] the documented bot marker %s is not recorded, in any letter case",
    (oznaka) => {
      expect(klasaUredjaja(`Mozilla/5.0 (compatible; X-${oznaka}/1.0)`)).toBeNull();
      expect(klasaUredjaja(`Mozilla/5.0 (compatible; X-${oznaka.toUpperCase()}/1.0)`)).toBeNull();
    },
  );

  test("[uredjaj] an iPhone is a telefon", () => {
    expect(klasaUredjaja(UA.iphoneSafari)).toBe("telefon");
    expect(klasaUredjaja(UA.iphoneChrome)).toBe("telefon");
    expect(klasaUredjaja(UA.ipodTouch)).toBe("telefon");
  });

  test("[uredjaj] an Android phone (the UA says Mobile) is a telefon", () => {
    expect(klasaUredjaja(UA.androidPhone)).toBe("telefon");
    expect(klasaUredjaja(UA.androidFirefoxPhone)).toBe("telefon");
  });

  test("[uredjaj] an Android device without Mobile is a tablet", () => {
    expect(klasaUredjaja(UA.androidTablet)).toBe("tablet");
    expect(klasaUredjaja(UA.kindleFire)).toBe("tablet");
  });

  test("[uredjaj] an iPad is a tablet even though its UA also says Mobile", () => {
    expect(klasaUredjaja(UA.ipad)).toBe("tablet");
  });

  test("[uredjaj] a UA that says tablet is a tablet", () => {
    expect(klasaUredjaja("Mozilla/5.0 (Linux; U; Tablet PC 2.0; en-us) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Safari/533.1")).toBe(
      "tablet",
    );
  });

  test("[uredjaj] Windows, macOS and Linux browsers are a racunar", () => {
    expect(klasaUredjaja(UA.windowsChrome)).toBe("racunar");
    expect(klasaUredjaja(UA.windowsEdge)).toBe("racunar");
    expect(klasaUredjaja(UA.macSafari)).toBe("racunar");
    expect(klasaUredjaja(UA.linuxFirefox)).toBe("racunar");
  });

  test("[uredjaj] the result does not depend on letter case or surrounding spaces", () => {
    expect(klasaUredjaja(UA.iphoneSafari.toUpperCase())).toBe("telefon");
    expect(klasaUredjaja(UA.macSafari.toLowerCase())).toBe("racunar");
    expect(klasaUredjaja(`  ${UA.androidTablet}\n`)).toBe("tablet");
    expect(klasaUredjaja(UA.googlebot.toUpperCase())).toBeNull();
  });

  test("[uredjaj] only the three device classes (or null) ever come out", () => {
    for (const userAgent of Object.values(UA)) {
      expect([null, "telefon", "tablet", "racunar"]).toContain(klasaUredjaja(userAgent));
    }
  });
});
