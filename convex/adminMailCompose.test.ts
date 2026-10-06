import { describe, expect, test } from "vitest";
import { buildMailQuote, checkRecipients, composeSubject, htmlToQuoteText, normalizeRecipient, replyRecipients } from "./lib/adminMailCompose";
import type { AdminMailMessage } from "./lib/adminMailContract";

// Admin UX Z2 — pure rules of writing in Pošta (shared by the send action and
// the compose window): address validation, Re:/Fwd:, reply and reply-all
// recipients, the quote of the original. TEST addresses only.

const ORIGINAL: AdminMailMessage = {
  messageId: "1709887058769100001",
  folderId: "9000000002014",
  subject: "TEST ponuda",
  from: { name: "TEST Izlagač", address: "izlagac@example.invalid" },
  to: [{ name: "TEST A", address: "posta-a@scanme.test" }, { name: null, address: "kolega@example.invalid" }],
  cc: [{ name: null, address: "kopija@example.invalid" }, { name: null, address: "POSTA-A@scanme.test" }],
  receivedAt: Date.parse("2026-10-06T07:40:00Z"),
  unread: false,
  body: { kind: "html", content: "<p>Zdravo,</p><p>cena je <b>na upit</b> &amp; važi do 9.&nbsp;10.</p><script>alert(1)</script><ul><li>X1</li><li>X2</li></ul>" },
  attachments: [],
};

describe("addresses", () => {
  test("one valid address, display name allowed, lower-cased", () => {
    expect(normalizeRecipient("  Ana <Ana.Petrovic+sajam@Example.invalid> ")).toBe("ana.petrovic+sajam@example.invalid");
    expect(normalizeRecipient("tim@scanme.rs")).toBe("tim@scanme.rs");
    for (const bad of ["", "ana", "a@b", "a@@b.rs", "a b@c.rs", "a@b..rs", ".a@b.rs", "a@-b.rs", "a@b.r", "x".repeat(250) + "@b.rs", "a@b.rs, c@d.rs"]) {
      expect({ bad, value: normalizeRecipient(bad) }).toEqual({ bad, value: null });
    }
  });

  test("To is required, duplicates are dropped (To wins), at most 50 in total, every invalid address is reported", () => {
    expect(checkRecipients({ to: ["A@example.invalid", "a@example.invalid"], cc: ["a@example.invalid", "c@example.invalid"], bcc: ["c@example.invalid", "d@example.invalid", " "] })).toEqual({
      ok: true, to: ["a@example.invalid"], cc: ["c@example.invalid"], bcc: ["d@example.invalid"],
    });
    expect(checkRecipients({ to: [], cc: ["c@example.invalid"], bcc: [] })).toEqual({ ok: false, reason: "missing_to", invalid: [] });
    expect(checkRecipients({ to: ["ok@example.invalid", "los"], cc: ["takođe los"], bcc: [] })).toEqual({ ok: false, reason: "invalid", invalid: ["los", "takođe los"] });
    const many = Array.from({ length: 51 }, (_, index) => `p${index}@example.invalid`);
    expect(checkRecipients({ to: many.slice(0, 30), cc: many.slice(30), bcc: [] })).toEqual({ ok: false, reason: "too_many", invalid: [] });
    expect(checkRecipients({ to: many.slice(0, 50), cc: [], bcc: [] }).ok).toBe(true);
  });
});

describe("reply and forward", () => {
  test("Re: and Fwd: are added once", () => {
    expect(composeSubject("reply", "TEST ponuda")).toBe("Re: TEST ponuda");
    expect(composeSubject("reply_all", "RE: TEST ponuda")).toBe("RE: TEST ponuda");
    expect(composeSubject("reply", "Odg: TEST")).toBe("Odg: TEST");
    expect(composeSubject("forward", "TEST ponuda")).toBe("Fwd: TEST ponuda");
    expect(composeSubject("forward", "Fw: TEST")).toBe("Fw: TEST");
    expect(composeSubject("forward", "Re: TEST")).toBe("Fwd: Re: TEST");
    expect(composeSubject("reply", "  ")).toBe("Re:");
    expect(composeSubject("new", " TEST  novo ")).toBe("TEST novo");
  });

  test("reply goes to the sender; reply-all adds To and Cc without the own addresses", () => {
    const own = ["posta-a@scanme.test"];
    expect(replyRecipients(ORIGINAL, "reply", own)).toEqual({ to: ["izlagac@example.invalid"], cc: [] });
    expect(replyRecipients(ORIGINAL, "reply_all", own)).toEqual({ to: ["izlagac@example.invalid", "kolega@example.invalid"], cc: ["kopija@example.invalid"] });
    expect(replyRecipients(ORIGINAL, "forward", own)).toEqual({ to: [], cc: [] });
    // a reply to an own sent message goes to its recipients
    const sent = { ...ORIGINAL, from: { name: "TEST A", address: "posta-a@scanme.test" } };
    expect(replyRecipients(sent, "reply", own)).toEqual({ to: ["kolega@example.invalid"], cc: [] });
  });

  test("the quote is readable text of the original, never its HTML", () => {
    expect(htmlToQuoteText(ORIGINAL.body.content)).toBe("Zdravo,\n\ncena je na upit & važi do 9. 10.\n\n• X1\n• X2");
    const reply = buildMailQuote("reply", ORIGINAL);
    expect(reply).toEqual({ kind: "reply", header: expect.stringMatching(/^6\.\s?(10\.|okt)\s?2026\.\s.*09:40, TEST Izlagač <izlagac@example\.invalid> piše:$/), text: "Zdravo,\n\ncena je na upit & važi do 9. 10.\n\n• X1\n• X2" });
    const forward = buildMailQuote("forward", { ...ORIGINAL, body: { kind: "text", content: "  Običan tekst  " } });
    expect(forward).toEqual({
      kind: "forward",
      header: "---------- Prosleđena poruka ----------",
      lines: [
        { label: "Od", value: "TEST Izlagač <izlagac@example.invalid>" },
        { label: "Datum", value: expect.stringContaining("09:40") },
        { label: "Naslov", value: "TEST ponuda" },
        { label: "Za", value: "TEST A <posta-a@scanme.test>, kolega@example.invalid" },
        { label: "Kopija", value: "kopija@example.invalid, POSTA-A@scanme.test" },
      ],
      text: "Običan tekst",
    });
    expect(buildMailQuote("new", ORIGINAL)).toBeNull();
  });
});
