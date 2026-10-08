import { FAIR_SURVEY_MAX_QUESTIONS, type FairErrorCode } from "@/lib/fair-contract";

// Sajam 2026 — survey state machine (MASTER §9.2). Pure, shared by the chat
// head and the full-screen sheet. Steps 0..total-1 are questions, `total` is
// the final step. All questions are optional; sending needs at least one
// answer; once `sent`, nothing changes any more.

export type SurveyPhase = "editing" | "sending" | "sent" | "error";

export type SurveyState = {
  total: number;
  /** Per question: the answer value ("yes"/"no" or an option id) or null. */
  answers: Array<string | null>;
  step: number;
  phase: SurveyPhase;
  errorCode: FairErrorCode | null;
};

export type SurveyAction =
  | { type: "open" }
  | { type: "choose"; value: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "goTo"; step: number }
  | { type: "submit" }
  | { type: "submitted" }
  | { type: "failed"; code: FairErrorCode };

export function initialSurveyState(total: number): SurveyState {
  const size = Math.max(0, Math.min(FAIR_SURVEY_MAX_QUESTIONS, total));
  return { total: size, answers: Array.from({ length: size }, () => null), step: 0, phase: "editing", errorCode: null };
}

export function answeredCount(state: SurveyState): number {
  return state.answers.filter((answer) => answer !== null).length;
}

export function isFinalStep(state: SurveyState): boolean {
  return state.step >= state.total;
}

export function canSendSurvey(state: SurveyState): boolean {
  return isFinalStep(state) && answeredCount(state) > 0 && (state.phase === "editing" || state.phase === "error");
}

/** The final step with at least one answer has no way back or out (owner decision). */
export function isSurveyLocked(state: SurveyState): boolean {
  return isFinalStep(state) && answeredCount(state) > 0 && state.phase !== "error";
}

export type SurveyHeadCopy =
  | { kind: "fresh"; total: number }
  | { kind: "partial"; remaining: number }
  | { kind: "ready" };

export function surveyHeadCopy(state: SurveyState): SurveyHeadCopy {
  const answered = answeredCount(state);
  if (answered === 0) return { kind: "fresh", total: state.total };
  if (answered === state.total) return { kind: "ready" };
  return { kind: "partial", remaining: state.total - answered };
}

export function surveyAnswersPayload(
  state: SurveyState,
  questionIds: readonly string[],
): Array<{ questionId: string; value: string }> {
  return state.answers.flatMap((value, index) =>
    value !== null && questionIds[index] ? [{ questionId: questionIds[index], value }] : [],
  );
}

function clampStep(state: SurveyState, step: number) {
  return Math.max(0, Math.min(state.total, step));
}

export function surveyReducer(state: SurveyState, action: SurveyAction): SurveyState {
  if (state.phase === "sent" || (state.phase === "sending" && action.type !== "submitted" && action.type !== "failed")) {
    return state;
  }
  switch (action.type) {
    case "open": {
      const firstOpen = state.answers.findIndex((answer) => answer === null);
      return { ...state, step: firstOpen === -1 ? state.total : firstOpen };
    }
    case "choose": {
      if (isFinalStep(state)) return state;
      const answers = [...state.answers];
      answers[state.step] = action.value;
      return { ...state, answers, phase: "editing", errorCode: null };
    }
    case "next":
      return { ...state, step: clampStep(state, state.step + 1) };
    case "back":
      return isSurveyLocked(state) ? state : { ...state, step: clampStep(state, state.step - 1) };
    case "goTo":
      return isSurveyLocked(state) ? state : { ...state, step: clampStep(state, action.step) };
    case "submit":
      return canSendSurvey(state) ? { ...state, phase: "sending", errorCode: null } : state;
    case "submitted":
      return state.phase === "sending" ? { ...state, phase: "sent", errorCode: null } : state;
    case "failed":
      return state.phase === "sending" ? { ...state, phase: "error", errorCode: action.code } : state;
  }
}
