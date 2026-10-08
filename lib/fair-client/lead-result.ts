import type { FairLeadSubmitResult } from "@/lib/fair-contract";
import { fmt, type FairModelDict } from "@/lib/i18n";

// D1 (RN N2): what a lead sheet says once the gateway answered OK. A
// duplicate (this visitor already sent this kind for this model) politely says
// it was already received; no text here ever promises a confirmation email.

export type FairLeadSentDict = Pick<FairModelDict, "interestSent" | "testDriveSent" | "interestAlreadySent" | "testDriveAlreadySent">;

export function fairLeadSentText(
  kind: "interest" | "testDrive",
  result: Pick<FairLeadSubmitResult, "duplicate">,
  dict: FairLeadSentDict,
  brandName: string,
): string {
  if (result.duplicate) {
    return kind === "testDrive" ? dict.testDriveAlreadySent : fmt(dict.interestAlreadySent, { brand: brandName });
  }
  return kind === "testDrive" ? dict.testDriveSent : fmt(dict.interestSent, { brand: brandName });
}
