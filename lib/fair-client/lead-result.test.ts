import { describe, expect, test } from "vitest";
import type { FairLeadSubmitResult } from "@/lib/fair-contract";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { fairLeadSentText } from "./lead-result";

// D1 (RN N2): the lead sheet's text after an OK from the gateway.

const SENT: FairLeadSubmitResult = {
  eventModelId: "m1",
  kind: "interest",
  submittedAt: 1,
  duplicate: false,
  confirmationEmail: true,
  followUpScheduled: false,
};
// The server's duplicate answer since D1: the stored lead, nothing queued.
const DUPLICATE: FairLeadSubmitResult = { ...SENT, duplicate: true, confirmationEmail: false };
const SENT_DRIVE: FairLeadSubmitResult = { ...SENT, kind: "test_drive" };
const DUPLICATE_DRIVE: FairLeadSubmitResult = { ...DUPLICATE, kind: "test_drive" };

describe("fairLeadSentText (RN N2)", () => {
  test("a new lead keeps Aleksa's success texts", () => {
    expect(fairLeadSentText("interest", SENT, fairModelSr, "JMEV")).toBe("Poslato. JMEV će vas kontaktirati.");
    expect(fairLeadSentText("testDrive", SENT_DRIVE, fairModelSr, "JMEV")).toBe(fairModelSr.testDriveSent);
  });

  test("a duplicate politely says it was already received", () => {
    expect(fairLeadSentText("interest", DUPLICATE, fairModelSr, "Mazda")).toBe("Već smo primili vaše interesovanje. Mazda će vas kontaktirati.");
    expect(fairLeadSentText("testDrive", DUPLICATE_DRIVE, fairModelSr, "Mazda")).toBe(
      "Već smo primili vašu prijavu za probnu vožnju. Diler će vas kontaktirati.",
    );
  });

  test("a duplicate never promises a confirmation email, whatever the result says", () => {
    for (const kind of ["interest", "testDrive"] as const) {
      // Even an older server that still echoed confirmationEmail: true for a duplicate.
      for (const result of [DUPLICATE, { ...DUPLICATE, confirmationEmail: true }]) {
        const text = fairLeadSentText(kind, result, fairModelSr, "Chery");
        expect(text).not.toMatch(/potvrd|email|mejl|@/i);
        expect(text).not.toBe(fairLeadSentText(kind, SENT, fairModelSr, "Chery"));
      }
    }
  });
});
