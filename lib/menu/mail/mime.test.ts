// ScanMe Menu V1 (K26) — tests for the MIME message builder.
import { describe, expect, test } from "vitest";
import {
  MailHeaderError,
  base64Url,
  buildMimeMessage,
  encodeHeaderWord,
  formatAddress,
  gmailRawMessage,
  hasLineBreak,
  utf8ToBase64,
} from "./mime";

const strict = new TextDecoder("utf-8", { fatal: true });

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64ToText(b64: string): string {
  return strict.decode(base64ToBytes(b64));
}

// Decodes folded RFC 2047 words, each word on its own (must be valid UTF-8 alone)
function decodeWords(header: string): { text: string; words: string[] } {
  const words = header.split("\r\n ");
  const text = words
    .map((word) => {
      const match = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/.exec(word);
      expect(match).not.toBeNull();
      return base64ToText(match![1]);
    })
    .join("");
  return { text, words };
}

const baseArgs = {
  from: "rezervacije@demo.example",
  fromName: "Demo restoran",
  to: "gost@example.com",
  subject: "Rezervacija",
  body: "Zdravo",
  date: new Date(Date.UTC(2026, 9, 21, 8, 0, 0)),
};

describe("encodeHeaderWord", () => {
  test("leaves printable ASCII unchanged", () => {
    expect(encodeHeaderWord("Reservation confirmed")).toBe(
      "Reservation confirmed",
    );
    expect(encodeHeaderWord("")).toBe("");
  });

  test("encodes a Serbian subject and decodes back", () => {
    const subject = "Rezervacija potvrđena — Kafana kod Mike";
    const encoded = encodeHeaderWord(subject);
    expect(encoded.startsWith("=?UTF-8?B?")).toBe(true);
    expect(decodeWords(encoded).text).toBe(subject);
  });

  test("splits a long subject into words of at most 75 characters", () => {
    const subject = "čćžšđ ".repeat(60);
    expect(subject).toHaveLength(360);
    const { text, words } = decodeWords(encodeHeaderWord(subject));
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) expect(word.length).toBeLessThanOrEqual(75);
    expect(text).toBe(subject);
  });

  test("never splits an emoji (4-byte sequence)", () => {
    const subject = "😀".repeat(40);
    const { text, words } = decodeWords(encodeHeaderWord(subject));
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) expect(word.length).toBeLessThanOrEqual(75);
    expect(text).toBe(subject);
  });

  test("throws on a line break", () => {
    expect(() => encodeHeaderWord("a\r\nBcc: x@example.com")).toThrow(
      MailHeaderError,
    );
    expect(() => encodeHeaderWord("č\nb")).toThrow(MailHeaderError);
  });
});

describe("hasLineBreak and base64 helpers", () => {
  test("detects every line break kind", () => {
    expect(hasLineBreak("a\rb")).toBe(true);
    expect(hasLineBreak("a\nb")).toBe(true);
    expect(hasLineBreak("a\u2028b")).toBe(true);
    expect(hasLineBreak("a\u2029b")).toBe(true);
    expect(hasLineBreak("a b")).toBe(false);
  });

  test("utf8ToBase64 and base64Url", () => {
    expect(utf8ToBase64("č")).toBe("xI0=");
    expect(utf8ToBase64("hello")).toBe("aGVsbG8=");
    expect(base64Url("???>>>")).toBe("Pz8_Pj4-");
    expect(base64Url("č")).toBe("xI0");
  });
});

describe("formatAddress", () => {
  test("bare email without a name", () => {
    expect(formatAddress("gost@example.com")).toBe("gost@example.com");
    expect(formatAddress("gost@example.com", null)).toBe("gost@example.com");
  });

  test("quotes an ASCII name and escapes quote and backslash", () => {
    expect(formatAddress("a@demo.example", "Demo restoran")).toBe(
      '"Demo restoran" <a@demo.example>',
    );
    expect(formatAddress("a@demo.example", 'Mike "Kafana" \\ Co')).toBe(
      '"Mike \\"Kafana\\" \\\\ Co" <a@demo.example>',
    );
  });

  test("encodes a non-ASCII name", () => {
    const out = formatAddress("a@demo.example", "Kafana Đurđevak");
    expect(out.endsWith(" <a@demo.example>")).toBe(true);
    const word = out.slice(0, -" <a@demo.example>".length);
    expect(decodeWords(word).text).toBe("Kafana Đurđevak");
  });

  test("rejects bad addresses and line breaks", () => {
    for (const bad of [
      "",
      "no-at-sign",
      "a@b@c",
      "a b@example.com",
      "a@example.com\r\nBcc: x@example.com",
      "<a@example.com>",
      "a@example.com,b@example.com",
    ]) {
      expect(() => formatAddress(bad)).toThrow(MailHeaderError);
    }
    expect(() => formatAddress("a@example.com", "x\ny")).toThrow(
      MailHeaderError,
    );
  });

  test("error message carries no user data", () => {
    try {
      formatAddress("secret\r\n@example.com");
    } catch (e) {
      expect((e as Error).message).toBe("mail_header_invalid");
      expect((e as Error).name).toBe("MailHeaderError");
    }
  });
});

describe("buildMimeMessage", () => {
  test("header order and fixed fields", () => {
    const message = buildMimeMessage({
      ...baseArgs,
      messageId: "<abc123@demo.example>",
    });
    const head = message.split("\r\n\r\n")[0].split("\r\n");
    expect(head).toEqual([
      'From: "Demo restoran" <rezervacije@demo.example>',
      "To: gost@example.com",
      "Subject: Rezervacija",
      "Date: Wed, 21 Oct 2026 08:00:00 +0000",
      "Message-ID: <abc123@demo.example>",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
    ]);
  });

  test("omits Message-ID when not given and the date is exact", () => {
    const message = buildMimeMessage(baseArgs);
    expect(message).not.toContain("Message-ID");
    expect(message).toContain("\r\nDate: Wed, 21 Oct 2026 08:00:00 +0000\r\n");
  });

  test("rejects a malformed Message-ID", () => {
    for (const messageId of ["abc@demo.example", "<abc>", "<a b@demo.example>"]) {
      expect(() => buildMimeMessage({ ...baseArgs, messageId })).toThrow(
        MailHeaderError,
      );
    }
  });

  test("encodes a Serbian subject in the message", () => {
    const subject = "Rezervacija potvrđena — Kafana kod Mike";
    const message = buildMimeMessage({ ...baseArgs, subject });
    const head = message.split("\r\n\r\n")[0].replace(/\r\n /g, "\r\n ");
    const line = /^Subject: ((?:.|\r\n )*)$/m.exec(head.replace(/\r\n(?! )/g, "\n"));
    expect(line).not.toBeNull();
    expect(decodeWords(line![1].replace(/\n/g, "")).text).toBe(subject);
  });

  test("body round-trips with CRLF", () => {
    const body = "Poštovana Jovana,\nčćžšđ ČĆŽŠĐ\r\n— Demo restoran";
    const message = buildMimeMessage({ ...baseArgs, body });
    const encoded = message.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(base64ToText(encoded)).toBe(
      "Poštovana Jovana,\r\nčćžšđ ČĆŽŠĐ\r\n— Demo restoran",
    );
  });

  test("body lines are at most 76 characters and the message ends with CRLF", () => {
    const body = "Poštovani gosti, rezervacija je potvrđena. ".repeat(40);
    const message = buildMimeMessage({ ...baseArgs, body });
    const bodyPart = message.split("\r\n\r\n")[1];
    const lines = bodyPart.split("\r\n");
    expect(lines.length).toBeGreaterThan(3);
    expect(lines[lines.length - 1]).toBe("");
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(76);
    expect(message.endsWith("\r\n")).toBe(true);
  });

  test("no bare line feed or carriage return anywhere", () => {
    const message = buildMimeMessage({
      ...baseArgs,
      subject: "čćžšđ ".repeat(60),
      body: "a\nb\rc\r\nd",
    });
    expect(message.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  test("refuses header injection in subject, to, from and fromName", () => {
    const inject = "x\r\nBcc: x@example.com";
    expect(() => buildMimeMessage({ ...baseArgs, subject: inject })).toThrow(
      MailHeaderError,
    );
    expect(() =>
      buildMimeMessage({ ...baseArgs, subject: "x\nBcc: x@example.com" }),
    ).toThrow(MailHeaderError);
    expect(() =>
      buildMimeMessage({ ...baseArgs, to: "gost@example.com\r\nBcc: x@example.com" }),
    ).toThrow(MailHeaderError);
    expect(() =>
      buildMimeMessage({ ...baseArgs, to: "gost@example.com\nBcc: x@example.com" }),
    ).toThrow(MailHeaderError);
    expect(() =>
      buildMimeMessage({ ...baseArgs, from: "a@demo.example\r\nBcc: x@example.com" }),
    ).toThrow(MailHeaderError);
    expect(() => buildMimeMessage({ ...baseArgs, fromName: inject })).toThrow(
      MailHeaderError,
    );
    expect(() =>
      buildMimeMessage({ ...baseArgs, fromName: "x\nBcc: x@example.com" }),
    ).toThrow(MailHeaderError);
  });

  test("the body may contain newlines", () => {
    expect(() =>
      buildMimeMessage({ ...baseArgs, body: "a\r\nBcc: x@example.com" }),
    ).not.toThrow();
  });
});

describe("gmailRawMessage", () => {
  test("is base64url and decodes to the MIME text", () => {
    const args = {
      ...baseArgs,
      subject: "Rezervacija potvrđena — Kafana kod Mike",
      body: "čćžšđ ČĆŽŠĐ ???>>>",
    };
    const raw = gmailRawMessage(args);
    expect(raw).toMatch(/^[A-Za-z0-9\-_]+$/);
    const standard = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
    expect(base64ToText(padded)).toBe(buildMimeMessage(args));
  });
});
