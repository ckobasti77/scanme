// ScanMe Menu V1 (K25) — the guest's reservation request, checked the same way
// on the phone and on the server (lib/menu/reservation-form.ts; master §11.2).
// Reference "now": Wed 21 Oct 2026, 12:00 Belgrade. The venue is open every day
// 10:00-23:00. Invented guests only.

import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "../belgrade-time";
import {
  RESERVATION_CONTACT_MODES,
  cleanNote,
  RESERVATION_EMAIL_MAX,
  RESERVATION_FIELDS,
  RESERVATION_NAME_MAX,
  RESERVATION_NOTE_MAX,
  RESERVATION_PARTY_MAX,
  RESERVATION_PARTY_MIN,
  RESERVATION_PHONE_MAX,
  needsEmail,
  needsPhone,
  normalizeEmail,
  normalizePhone,
  parseReservationForm,
  type ReservationContactMode,
  type ReservationFormResult,
  type ReservationFormValue,
} from "./reservation-form";
import { intervalFromInput, type WorkingHours } from "./working-hours";

function local(value: string): number {
  const epoch = belgradeLocalToEpoch(value);
  if (epoch === null) throw new Error(`bad local time ${value}`);
  return epoch;
}

const NOW = local("2026-10-21T12:00");
const OPEN = intervalFromInput("10:00", "23:00");
if (!OPEN) throw new Error("bad interval");
const HOURS: WorkingHours = { days: Array.from({ length: 7 }, () => [{ ...OPEN }]) };

const REQUESTED = local("2026-10-24T20:00");

const VALID = {
  guestName: "Mira Probić",
  partySize: 4,
  requestedAt: REQUESTED,
  contactEmail: "mira@example.com",
  contactPhone: "+381 64 123 4567",
  note: "Kod prozora, ako može",
};

function parse(over: Record<string, unknown> = {}, mode: ReservationContactMode = "both"): ReservationFormResult {
  return parseReservationForm({ ...VALID, ...over }, mode, HOURS, NOW);
}

function valueOf(result: ReservationFormResult): ReservationFormValue {
  if (!result.ok) throw new Error(`expected ok, got ${result.code} ${JSON.stringify(result.fieldErrors)}`);
  return result.value;
}

function refusal(result: ReservationFormResult) {
  if (result.ok) throw new Error("expected a refusal");
  return result;
}

describe("constants and contact modes", () => {
  test("the limits of the master", () => {
    expect(RESERVATION_NAME_MAX).toBe(80);
    expect(RESERVATION_NOTE_MAX).toBe(500);
    expect(RESERVATION_EMAIL_MAX).toBe(254);
    expect(RESERVATION_PHONE_MAX).toBe(32);
    expect(RESERVATION_PARTY_MIN).toBe(1);
    expect(RESERVATION_PARTY_MAX).toBe(50);
    expect(RESERVATION_CONTACT_MODES).toEqual(["email", "phone", "both"]);
    expect(RESERVATION_FIELDS).toEqual(["guestName", "requestedAt", "partySize", "contactEmail", "contactPhone", "note"]);
  });

  test("which contact each mode asks for", () => {
    expect(needsEmail("email")).toBe(true);
    expect(needsEmail("phone")).toBe(false);
    expect(needsEmail("both")).toBe(true);
    expect(needsPhone("email")).toBe(false);
    expect(needsPhone("phone")).toBe(true);
    expect(needsPhone("both")).toBe(true);
  });
});

describe("a good request", () => {
  test("is accepted and returned in its clean form", () => {
    expect(parse()).toEqual({
      ok: true,
      value: {
        guestName: "Mira Probić",
        partySize: 4,
        requestedAt: REQUESTED,
        contactEmail: "mira@example.com",
        contactPhone: "+381 64 123 4567",
        note: "Kod prozora, ako može",
      },
    });
  });

  test("the boundaries are inside: 1 and 50 guests, an 80-letter name, the first and last grid slot", () => {
    expect(valueOf(parse({ partySize: 1 })).partySize).toBe(1);
    expect(valueOf(parse({ partySize: 50 })).partySize).toBe(50);
    expect(valueOf(parse({ guestName: "m".repeat(80) })).guestName).toHaveLength(80);
    expect(valueOf(parse({ requestedAt: local("2026-10-22T10:00") })).requestedAt).toBe(local("2026-10-22T10:00"));
    expect(valueOf(parse({ requestedAt: local("2026-10-22T22:45") })).requestedAt).toBe(local("2026-10-22T22:45"));
  });

  test("numbers sent as text are read as numbers", () => {
    const value = valueOf(parse({ partySize: "4", requestedAt: String(REQUESTED) }));
    expect(value.partySize).toBe(4);
    expect(value.requestedAt).toBe(REQUESTED);
  });
});

describe("the contact mode: exactly the asked fields are required, the other is dropped", () => {
  test("email: the e-mail is required, the phone is dropped and never checked", () => {
    expect(valueOf(parse({}, "email"))).toMatchObject({ contactEmail: "mira@example.com", contactPhone: null });
    expect(valueOf(parse({ contactPhone: "ovo nije telefon" }, "email"))).toMatchObject({
      contactEmail: "mira@example.com",
      contactPhone: null,
    });
    expect(valueOf(parse({ contactPhone: undefined }, "email")).contactPhone).toBeNull();
    expect(refusal(parse({ contactEmail: undefined }, "email")).fieldErrors).toEqual({ contactEmail: "required" });
  });

  test("phone: the phone is required, the e-mail is dropped and never checked", () => {
    expect(valueOf(parse({}, "phone"))).toMatchObject({ contactEmail: null, contactPhone: "+381 64 123 4567" });
    expect(valueOf(parse({ contactEmail: "nije-adresa" }, "phone"))).toMatchObject({
      contactEmail: null,
      contactPhone: "+381 64 123 4567",
    });
    expect(valueOf(parse({ contactEmail: undefined }, "phone")).contactEmail).toBeNull();
    expect(refusal(parse({ contactPhone: undefined }, "phone")).fieldErrors).toEqual({ contactPhone: "required" });
  });

  test("both: each of the two is required and kept", () => {
    expect(valueOf(parse({}, "both"))).toMatchObject({ contactEmail: "mira@example.com", contactPhone: "+381 64 123 4567" });
    expect(refusal(parse({ contactEmail: undefined }, "both")).fieldErrors).toEqual({ contactEmail: "required" });
    expect(refusal(parse({ contactPhone: undefined }, "both")).fieldErrors).toEqual({ contactPhone: "required" });
  });

  test.each([
    ["email", ["contactEmail"]],
    ["phone", ["contactPhone"]],
    ["both", ["contactEmail", "contactPhone"]],
  ] as const)("with no contact at all, mode %s asks for exactly %j", (mode, fields) => {
    const result = refusal(parse({ contactEmail: undefined, contactPhone: undefined }, mode));
    expect(Object.keys(result.fieldErrors).sort()).toEqual([...fields]);
    expect(Object.values(result.fieldErrors).every((problem) => problem === "required")).toBe(true);
    expect(result.code).toBe("reservation/invalid_input");
  });

  test("blank and whitespace-only contacts count as missing", () => {
    expect(refusal(parse({ contactEmail: "   " }, "email")).fieldErrors).toEqual({ contactEmail: "required" });
    expect(refusal(parse({ contactPhone: "" }, "phone")).fieldErrors).toEqual({ contactPhone: "required" });
    expect(refusal(parse({ contactPhone: null }, "phone")).fieldErrors).toEqual({ contactPhone: "required" });
  });
});

describe("the name", () => {
  test("is trimmed and its inner whitespace collapsed", () => {
    expect(valueOf(parse({ guestName: "  Mira   Probić \t " })).guestName).toBe("Mira Probić");
    expect(valueOf(parse({ guestName: "Mira\n\nProbić" })).guestName).toBe("Mira Probić");
  });

  test("is required: empty, blank or not text", () => {
    for (const guestName of [undefined, null, "", "   ", "\n\t", 42, {}, ["Mira"]]) {
      expect(refusal(parse({ guestName })).fieldErrors, String(guestName)).toEqual({ guestName: "required" });
    }
  });

  test("81 letters is too long, and the length is counted after collapsing", () => {
    expect(refusal(parse({ guestName: "m".repeat(81) })).fieldErrors).toEqual({ guestName: "too_long" });
    // 40 + 5 spaces + 39 is 84 raw characters but 80 after collapsing.
    const name = `${"a".repeat(40)}     ${"b".repeat(39)}`;
    expect(valueOf(parse({ guestName: name })).guestName).toHaveLength(80);
    // 40 + 1 + 40 is 81.
    expect(refusal(parse({ guestName: `${"a".repeat(40)}   ${"b".repeat(40)}` })).fieldErrors).toEqual({ guestName: "too_long" });
  });
});

describe("the number of guests", () => {
  test("missing is required", () => {
    for (const partySize of [undefined, null, ""]) {
      expect(refusal(parse({ partySize })).fieldErrors, String(partySize)).toEqual({ partySize: "required" });
    }
  });

  test("outside 1 to 50 is out of range", () => {
    for (const partySize of [0, -1, 51, 100, "0", "51", -50]) {
      expect(refusal(parse({ partySize })).fieldErrors, String(partySize)).toEqual({ partySize: "range" });
    }
  });

  test("a fraction or something that is not a number is invalid", () => {
    for (const partySize of [2.5, 0.5, Number.NaN, Number.POSITIVE_INFINITY, "abc", "2,5", "4 osobe", "  ", true, {}]) {
      expect(refusal(parse({ partySize })).fieldErrors, String(partySize)).toEqual({ partySize: "invalid" });
    }
  });
});

describe("the time", () => {
  test("missing is required; not a whole number is invalid", () => {
    for (const requestedAt of [undefined, null, ""]) {
      const result = refusal(parse({ requestedAt }));
      expect(result.fieldErrors, String(requestedAt)).toEqual({ requestedAt: "required" });
      expect(result.code).toBe("reservation/invalid_input");
    }
    for (const requestedAt of ["sutra uveče", REQUESTED + 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = refusal(parse({ requestedAt }));
      expect(result.fieldErrors, String(requestedAt)).toEqual({ requestedAt: "invalid" });
      expect(result.code).toBe("reservation/invalid_input");
    }
  });

  test("when only the time is wrong the refusal names that problem", () => {
    const past = refusal(parse({ requestedAt: local("2026-10-20T20:00") }));
    expect(past).toEqual({ ok: false, code: "reservation/in_past", fieldErrors: { requestedAt: "in_past" } });

    const tooFar = refusal(parse({ requestedAt: local("2027-02-01T20:00") }));
    expect(tooFar).toEqual({ ok: false, code: "reservation/too_far", fieldErrors: { requestedAt: "too_far" } });

    const closed = refusal(parse({ requestedAt: local("2026-10-24T03:00") }));
    expect(closed).toEqual({ ok: false, code: "reservation/outside_hours", fieldErrors: { requestedAt: "outside_hours" } });
  });

  test("a minute off the 15-minute grid is outside the hours; so is the closing time itself", () => {
    expect(refusal(parse({ requestedAt: local("2026-10-24T20:10") })).code).toBe("reservation/outside_hours");
    expect(refusal(parse({ requestedAt: local("2026-10-24T23:00") })).code).toBe("reservation/outside_hours");
    expect(refusal(parse({ requestedAt: NOW })).code).toBe("reservation/in_past");
  });

  test("a time sent as text is checked like a number", () => {
    expect(refusal(parse({ requestedAt: String(local("2026-10-20T20:00")) })).code).toBe("reservation/in_past");
  });
});

describe("mixed errors are reservation/invalid_input with every wrong field listed", () => {
  test("a wrong time and a wrong name", () => {
    const result = refusal(parse({ guestName: "", requestedAt: local("2026-10-20T20:00") }));
    expect(result.code).toBe("reservation/invalid_input");
    expect(result.fieldErrors).toEqual({ guestName: "required", requestedAt: "in_past" });
  });

  test("everything wrong at once", () => {
    const result = refusal(
      parseReservationForm(
        { guestName: "", partySize: 0, requestedAt: local("2026-10-24T03:00"), contactEmail: "x", contactPhone: "1", note: "n".repeat(501) },
        "both",
        HOURS,
        NOW,
      ),
    );
    expect(result.code).toBe("reservation/invalid_input");
    expect(result.fieldErrors).toEqual({
      guestName: "required",
      partySize: "range",
      requestedAt: "outside_hours",
      contactEmail: "invalid",
      contactPhone: "invalid",
      note: "too_long",
    });
  });

  test("an empty request lists every shown field except the note", () => {
    const result = refusal(parseReservationForm({}, "both", HOURS, NOW));
    expect(result.code).toBe("reservation/invalid_input");
    expect(result.fieldErrors).toEqual({
      guestName: "required",
      partySize: "required",
      requestedAt: "required",
      contactEmail: "required",
      contactPhone: "required",
    });
  });

  test("a wrong contact alone is invalid_input, not a time code", () => {
    expect(refusal(parse({ contactEmail: "mira" })).code).toBe("reservation/invalid_input");
  });
});

describe("the e-mail", () => {
  test("is lower-cased and trimmed", () => {
    expect(valueOf(parse({ contactEmail: "  Mira.Probic@Example.COM " }, "email")).contactEmail).toBe("mira.probic@example.com");
    expect(normalizeEmail("Ana@Primer.RS")).toBe("ana@primer.rs");
    expect(normalizeEmail(" ana@primer.rs ")).toBe("ana@primer.rs");
    expect(normalizeEmail("ana.petrovic+meni@mail.example.com")).toBe("ana.petrovic+meni@mail.example.com");
  });

  test.each(["", "   ", "ana", "ana@", "@primer.rs", "ana@primer", "ana@primer.r", "ana@@primer.rs", "a@b@c.rs", "ana @primer.rs", "ana@pri mer.rs"])(
    "%j is not an e-mail",
    (value) => {
      expect(normalizeEmail(value)).toBeNull();
    },
  );

  test("anything that is not text is not an e-mail", () => {
    for (const value of [undefined, null, 5, {}, ["ana@primer.rs"], true]) expect(normalizeEmail(value)).toBeNull();
  });

  test("a wrong e-mail is invalid; 254 characters pass, 255 are too long", () => {
    expect(refusal(parse({ contactEmail: "mira@example" }, "email")).fieldErrors).toEqual({ contactEmail: "invalid" });
    const longest = `${"a".repeat(244)}@primer.rs`;
    expect(longest).toHaveLength(RESERVATION_EMAIL_MAX);
    expect(valueOf(parse({ contactEmail: longest }, "email")).contactEmail).toBe(longest);
    expect(refusal(parse({ contactEmail: `${"a".repeat(245)}@primer.rs` }, "email")).fieldErrors).toEqual({ contactEmail: "too_long" });
  });
});

describe("the phone", () => {
  test.each(["+381 64 123 4567", "064/123-456", "(011) 123.456", "011 1234567", "123456", "123456789012345", "+381641234567"])(
    "%j is a phone",
    (value) => {
      expect(normalizePhone(value)).toBe(value);
    },
  );

  test("is trimmed and its inner whitespace collapsed, but its characters are kept as typed", () => {
    expect(normalizePhone("  064   123   456 ")).toBe("064 123 456");
    expect(valueOf(parse({ contactPhone: " +381  64 123   4567 " }, "phone")).contactPhone).toBe("+381 64 123 4567");
  });

  test("it needs 6 to 15 digits", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("1 2 3 4 5")).toBeNull();
    expect(normalizePhone("123456")).toBe("123456");
    expect(normalizePhone("123456789012345")).toBe("123456789012345");
    expect(normalizePhone("1234567890123456")).toBeNull();
    expect(refusal(parse({ contactPhone: "12345" }, "phone")).fieldErrors).toEqual({ contactPhone: "invalid" });
  });

  test.each(["", "   ", "abc", "064-123-45a", "064 123 456 ext", "381+641234567", "++381641234567", "+", "---------", "064#123456"])(
    "%j is not a phone",
    (value) => {
      expect(normalizePhone(value)).toBeNull();
    },
  );

  test("anything that is not text is not a phone", () => {
    for (const value of [undefined, null, 641234567, {}, ["064123456"], true]) expect(normalizePhone(value)).toBeNull();
  });

  test("33 characters are too long, 32 of too many digits are merely invalid", () => {
    const thirtyThree = `${"1-".repeat(16)}1`;
    expect(thirtyThree).toHaveLength(RESERVATION_PHONE_MAX + 1);
    expect(refusal(parse({ contactPhone: thirtyThree }, "phone")).fieldErrors).toEqual({ contactPhone: "too_long" });
    const thirtyTwo = `${"1-".repeat(15)}12`;
    expect(thirtyTwo).toHaveLength(RESERVATION_PHONE_MAX);
    expect(refusal(parse({ contactPhone: thirtyTwo }, "phone")).fieldErrors).toEqual({ contactPhone: "invalid" });
  });
});

describe("the note", () => {
  test("is optional: missing, null, empty and blank all become null", () => {
    for (const note of [undefined, null, "", "   ", "\n"]) {
      expect(valueOf(parse({ note })).note, String(note)).toBeNull();
    }
    const withoutNote: Record<string, unknown> = { ...VALID };
    delete withoutNote.note;
    expect(valueOf(parseReservationForm(withoutNote, "both", HOURS, NOW)).note).toBeNull();
  });

  test("is trimmed at both ends", () => {
    expect(valueOf(parse({ note: "  Rođendan, treba torta  " })).note).toBe("Rođendan, treba torta");
  });

  test("500 characters pass, 501 are too long; the length is counted after trimming", () => {
    expect(valueOf(parse({ note: "n".repeat(500) })).note).toHaveLength(500);
    expect(valueOf(parse({ note: `  ${"n".repeat(500)}  ` })).note).toHaveLength(500);
    const result = refusal(parse({ note: "n".repeat(501) }));
    expect(result.fieldErrors).toEqual({ note: "too_long" });
    expect(result.code).toBe("reservation/invalid_input");
  });

  test("something that is not text is invalid", () => {
    expect(refusal(parse({ note: 5 })).fieldErrors).toEqual({ note: "invalid" });
    expect(refusal(parse({ note: {} })).fieldErrors).toEqual({ note: "invalid" });
  });
});

// K25 (main agent, security review): control and direction characters never reach staff.
describe("cleanNote and the invisible characters", () => {
  test("keeps line breaks, at most one empty line, no control or bidi characters", () => {
    expect(cleanNote("Rođendan\r\n\r\n\r\n\r\nstolica za bebu")).toBe("Rođendan\n\nstolica za bebu");
    expect(cleanNote("a‮b⁦c\u0007d")).toBe("abcd");
    expect(cleanNote("  razmak   unutra  \n kraj ")).toBe("razmak unutra\nkraj");
    expect(cleanNote(5)).toBe("");
  });

  test("the name loses direction overrides and control characters", () => {
    const result = parseReservationForm(
      { guestName: "Jo‮vana\u0000", partySize: 2, requestedAt: Number.NaN },
      "email",
      { days: [[], [], [], [], [], [], []] },
      0,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.guestName).toBeUndefined();
  });
});
