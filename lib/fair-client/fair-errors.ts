import type { FairErrorCode } from "@/lib/fair-contract";
import type { FairModelDict } from "@/lib/i18n";

/** Gated by the server: the visitor should see "trenutno nedostupno", not a retry. */
export function isFairUnavailableCode(code: FairErrorCode): boolean {
  return (
    code === "FEATURE_NOT_ENTITLED" ||
    code === "CONSENT_NOT_CONFIGURED" ||
    code === "EVENT_NOT_ACTIVE" ||
    code === "FAIR_MODEL_NOT_FOUND" ||
    code === "SURVEY_NOT_OPEN" ||
    code === "QUESTION_NOT_OPEN"
  );
}

export function fairErrorText(code: FairErrorCode, dict: FairModelDict): string {
  if (code === "RATE_LIMITED") return dict.errorRateLimited;
  if (code === "EVENT_NOT_ACTIVE") return dict.errorEventClosed;
  if (isFairUnavailableCode(code)) return dict.errorUnavailable;
  return dict.errorGeneric;
}
