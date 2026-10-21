// ScanMe Menu V1 (K26) — tests for the reply templates (master §11.4; K24-19).
import { describe, expect, test } from "vitest";
import { menuOdgovorSr } from "../i18n/sr/menu-odgovor";
import {
  REPLY_BODY_MAX,
  REPLY_KINDS,
  REPLY_SIGNATURE_MAX,
  REPLY_SUBJECT_MAX,
  TEMPLATE_KINDS,
  cleanSubject,
  composeReply,
  defaultTemplate,
  fillTemplate,
  isReplyKind,
  isTemplateKind,
  isValidReply,
  isValidSignature,
  replyDate,
  replyGuests,
  replyKindForStatus,
  replyTime,
  signatureOf,
  templateFor,
  type ReplyFacts,
  type ReplyKind,
} from "./reply-templates";
import { MENU_RESERVATION_STATUSES } from "./reservation-status";

const SATURDAY_1900 = Date.UTC(2026, 9, 24, 17, 0);

const facts: ReplyFacts = {
  guestName: "Marija",
  venueName: "Demo restoran",
  requestedAt: SATURDAY_1900,
  partySize: 4,
  proposedAt: null,
  proposalNote: null,
};

const noVenueTemplates = { templates: {}, signature: null };

describe("defaultTemplate", () => {
  test.each(REPLY_KINDS)("%s equals the dictionary", (kind) => {
    expect(defaultTemplate(kind)).toEqual(menuOdgovorSr.podrazumevano[kind]);
  });

  test("returns a copy, not the dictionary object", () => {
    expect(defaultTemplate("accept")).not.toBe(menuOdgovorSr.podrazumevano.accept);
  });
});

describe("templateFor", () => {
  const stored = {
    accept: { subject: "Potvrda {ime}", body: "Zdravo {ime}" },
    decline: { subject: "Odbijeno", body: "Žao nam je" },
  };

  test("a stored template is custom", () => {
    expect(templateFor("accept", stored)).toEqual({ template: stored.accept, custom: true });
  });

  test("a missing one falls back to the default", () => {
    expect(templateFor("propose", stored)).toEqual({ template: defaultTemplate("propose"), custom: false });
    expect(templateFor("accept", {})).toEqual({ template: defaultTemplate("accept"), custom: false });
  });

  test("other is never custom", () => {
    const withOther = { ...stored, other: { subject: "x", body: "y" } } as unknown as Parameters<typeof templateFor>[1];
    expect(templateFor("other", withOther)).toEqual({ template: defaultTemplate("other"), custom: false });
  });
});

describe("replyKindForStatus", () => {
  test.each([
    ["new", "other"],
    ["accepted", "accept"],
    ["declined", "decline"],
    ["change_proposed", "propose"],
    ["arrived", "accept"],
    ["cancelled", "other"],
  ] as const)("%s -> %s", (status, kind) => {
    expect(replyKindForStatus(status)).toBe(kind);
  });

  test("covers every status", () => {
    expect(MENU_RESERVATION_STATUSES).toHaveLength(6);
  });
});

describe("signatureOf", () => {
  test("a stored signature is trimmed", () => {
    expect(signatureOf("  Pozdrav,\nTim  ", "Demo restoran")).toBe("Pozdrav,\nTim");
  });

  test.each([[""], ["   \n "], [null], [undefined]])("%j gives the default", (stored) => {
    expect(signatureOf(stored, "Demo restoran")).toBe("Srdačno,\nDemo restoran");
  });
});

describe("replyDate and replyTime (Belgrade)", () => {
  test("summer time", () => {
    expect(replyDate(SATURDAY_1900)).toBe("subota, 24. 10. 2026.");
    expect(replyTime(SATURDAY_1900)).toBe("19:00");
  });

  test("after the switch to winter time", () => {
    const after = Date.UTC(2026, 9, 25, 23, 30);
    expect(replyDate(after)).toBe("ponedeljak, 26. 10. 2026.");
    expect(replyTime(after)).toBe("00:30");
  });

  test("a Thursday and a Sunday", () => {
    expect(replyDate(Date.UTC(2026, 9, 22, 10, 0))).toBe("četvrtak, 22. 10. 2026.");
    expect(replyDate(Date.UTC(2026, 9, 25, 10, 0))).toBe("nedelja, 25. 10. 2026.");
  });
});

describe("replyGuests", () => {
  test.each([
    [1, "1 osobu"],
    [2, "2 osobe"],
    [5, "5 osoba"],
    [11, "11 osoba"],
    [21, "21 osobu"],
    [22, "22 osobe"],
  ])("%i -> %s", (n, text) => {
    expect(replyGuests(n)).toBe(text);
  });
});

describe("fillTemplate", () => {
  test("replaces known keys", () => {
    expect(fillTemplate("Dobar dan, {ime} u {lokal}.", { ime: "Marija", lokal: "Demo restoran" })).toBe(
      "Dobar dan, Marija u Demo restoran.",
    );
  });

  test("an unknown placeholder stays literally", () => {
    expect(fillTemplate("Zdravo {nepoznato} i {ime}", { ime: "Marija" })).toBe("Zdravo {nepoznato} i Marija");
    expect(fillTemplate("{toString} {constructor}", {})).toBe("{toString} {constructor}");
  });

  test("a key without a value stays", () => {
    expect(fillTemplate("Zdravo {ime}", {})).toBe("Zdravo {ime}");
    expect(fillTemplate("Zdravo {ime}", { ime: undefined })).toBe("Zdravo {ime}");
  });

  test("works in one pass: a value with a placeholder is not expanded again", () => {
    expect(fillTemplate("Dobar dan, {ime}\n{potpis}", { ime: "{potpis}", potpis: "Srdačno" })).toBe(
      "Dobar dan, {potpis}\nSrdačno",
    );
  });

  test("CRLF and lone CR become LF", () => {
    expect(fillTemplate("a\r\nb\rc", {})).toBe("a\nb\nc");
  });

  test("trailing spaces and tabs are removed from each line", () => {
    expect(fillTemplate("a   \nb \t\nc", {})).toBe("a\nb\nc");
  });

  test("an empty value leaves no triple newline", () => {
    expect(fillTemplate("a\n\n{poruka}\n\nb", { poruka: "" })).toBe("a\n\nb");
  });

  test("trims the result", () => {
    expect(fillTemplate("\n\n  tekst  \n\n", {})).toBe("tekst");
    expect(fillTemplate("{poruka}\ntekst", { poruka: "" })).toBe("tekst");
  });
});

describe("composeReply", () => {
  test("accept", () => {
    const reply = composeReply("accept", facts, noVenueTemplates);
    expect(reply.subject).toBe("Rezervacija je potvrđena — Demo restoran");
    expect(reply.body).toBe(
      "Dobar dan, Marija,\n\npotvrđujemo Vašu rezervaciju: subota, 24. 10. 2026. u 19:00, 4 osobe.\n\nRadujemo se Vašem dolasku.\n\nSrdačno,\nDemo restoran",
    );
  });

  test("decline", () => {
    const reply = composeReply("decline", facts, noVenueTemplates);
    expect(reply.subject).toBe("Vaša rezervacija — Demo restoran");
    expect(reply.body).toContain("Dobar dan, Marija,");
    expect(reply.body).toContain("ne možemo da potvrdimo rezervaciju za subota, 24. 10. 2026. u 19:00.");
    expect(reply.body.endsWith("\n\nSrdačno,\nDemo restoran")).toBe(true);
  });

  test("propose with a proposal and a note", () => {
    const reply = composeReply(
      "propose",
      { ...facts, proposedAt: Date.UTC(2026, 9, 24, 18, 30), proposalNote: "Imamo sto u bašti." },
      noVenueTemplates,
    );
    expect(reply.subject).toBe("Predlog drugog termina — Demo restoran");
    expect(reply.body).toContain("nemamo slobodno mesto za 4 osobe.");
    expect(reply.body).toContain("Možemo da Vam ponudimo subota, 24. 10. 2026. u 20:30.");
    expect(reply.body).toContain("\n\nImamo sto u bašti.\n\nJavite nam da li Vam odgovara.");
    expect(reply.body.endsWith("Srdačno,\nDemo restoran")).toBe(true);
  });

  test("propose without a note leaves no blank run", () => {
    const reply = composeReply(
      "propose",
      { ...facts, proposedAt: Date.UTC(2026, 9, 24, 18, 30), proposalNote: "   " },
      noVenueTemplates,
    );
    expect(reply.body).not.toContain("\n\n\n");
    expect(reply.body).toContain("u 20:30.\n\nJavite nam");
  });

  test("other starts from a greeting and the signature", () => {
    const reply = composeReply("other", facts, noVenueTemplates);
    expect(reply.subject).toBe("Vaša rezervacija — Demo restoran");
    expect(reply.body).toBe("Dobar dan, Marija,\n\nSrdačno,\nDemo restoran");
  });

  test("a custom template and a custom signature", () => {
    const reply = composeReply("accept", facts, {
      templates: { accept: { subject: "Potvrda\n za {ime}", body: "Zdravo {ime}, vidimo se u {vreme}.\n{potpis}  " } },
      signature: "  Pozdrav,\nTim lokala  ",
    });
    expect(reply.subject).toBe("Potvrda za Marija");
    expect(reply.body).toBe("Zdravo Marija, vidimo se u 19:00.\nPozdrav,\nTim lokala");
  });

  test("a custom template is not used for other", () => {
    const reply = composeReply("other", facts, {
      templates: { accept: { subject: "Potvrda", body: "Telo" } },
      signature: null,
    });
    expect(reply.subject).toBe("Vaša rezervacija — Demo restoran");
  });

  test("a guest name with a placeholder is not expanded", () => {
    const reply = composeReply("other", { ...facts, guestName: "{potpis}" }, noVenueTemplates);
    expect(reply.body).toBe("Dobar dan, {potpis},\n\nSrdačno,\nDemo restoran");
  });

  test.each(REPLY_KINDS)("%s leaves no known placeholder behind", (kind: ReplyKind) => {
    const reply = composeReply(
      kind,
      { ...facts, proposedAt: Date.UTC(2026, 9, 24, 18, 30), proposalNote: "Napomena" },
      noVenueTemplates,
    );
    expect(reply.subject).not.toMatch(/\{\w+\}/);
    expect(reply.body).not.toMatch(/\{\w+\}/);
  });
});

describe("cleanSubject", () => {
  test("removes CR, LF, tab and control characters", () => {
    expect(cleanSubject("a\r\nb\tc" + String.fromCharCode(0) + "d" + String.fromCharCode(0x7f) + "e")).toBe(
      "a b c d e",
    );
  });

  test("turns the Unicode line separators into spaces", () => {
    expect(cleanSubject("a" + String.fromCharCode(0x2028) + "b" + String.fromCharCode(0x2029) + "c")).toBe("a b c");
  });

  test("collapses spaces and trims", () => {
    expect(cleanSubject("  a    b   ")).toBe("a b");
  });
});

describe("isValidReply", () => {
  const ok = { subject: "Predmet", body: "Tekst" };

  test("accepts a normal reply", () => {
    expect(isValidReply(ok)).toBe(true);
  });

  test("rejects an empty subject or body", () => {
    expect(isValidReply({ ...ok, subject: "" })).toBe(false);
    expect(isValidReply({ ...ok, subject: "   " })).toBe(false);
    expect(isValidReply({ ...ok, body: "" })).toBe(false);
    expect(isValidReply({ ...ok, body: " \n " })).toBe(false);
  });

  test("subject limit is 150", () => {
    expect(REPLY_SUBJECT_MAX).toBe(150);
    expect(isValidReply({ ...ok, subject: "a".repeat(150) })).toBe(true);
    expect(isValidReply({ ...ok, subject: "a".repeat(151) })).toBe(false);
  });

  test("body limit is 4000", () => {
    expect(REPLY_BODY_MAX).toBe(4000);
    expect(isValidReply({ ...ok, body: "a".repeat(4000) })).toBe(true);
    expect(isValidReply({ ...ok, body: "a".repeat(4001) })).toBe(false);
  });

  test("a subject with a line break is invalid; extra spaces are fine (cleaned before sending)", () => {
    expect(isValidReply({ ...ok, subject: "a\nb" })).toBe(false);
    expect(isValidReply({ ...ok, subject: "a\r\nBcc: x@example.com" })).toBe(false);
    expect(isValidReply({ ...ok, subject: "a  b" })).toBe(true);
    expect(isValidReply({ ...ok, subject: "a	b" })).toBe(false);
  });
});

describe("isValidSignature", () => {
  test("limit is 500", () => {
    expect(REPLY_SIGNATURE_MAX).toBe(500);
    expect(isValidSignature("a".repeat(500))).toBe(true);
    expect(isValidSignature("a".repeat(501))).toBe(false);
    expect(isValidSignature("")).toBe(true);
  });
});

describe("kind guards", () => {
  test("isReplyKind", () => {
    for (const kind of REPLY_KINDS) expect(isReplyKind(kind)).toBe(true);
    for (const value of ["", "Accept", "arrived", null, undefined, 1, {}]) expect(isReplyKind(value)).toBe(false);
  });

  test("isTemplateKind excludes other", () => {
    for (const kind of TEMPLATE_KINDS) expect(isTemplateKind(kind)).toBe(true);
    for (const value of ["other", "", "Accept", null, undefined, 1]) expect(isTemplateKind(value)).toBe(false);
  });
});
