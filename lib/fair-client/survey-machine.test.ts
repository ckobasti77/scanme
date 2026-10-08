import { describe, expect, it } from "vitest";
import {
  answeredCount,
  canSendSurvey,
  initialSurveyState,
  isFinalStep,
  isSurveyLocked,
  surveyAnswersPayload,
  surveyHeadCopy,
  surveyReducer,
  type SurveyAction,
  type SurveyState,
} from "./survey-machine";

const run = (state: SurveyState, ...actions: SurveyAction[]) => actions.reduce(surveyReducer, state);

describe("survey state machine", () => {
  it("caps at five questions and starts fresh", () => {
    const state = initialSurveyState(7);
    expect(state.total).toBe(5);
    expect(surveyHeadCopy(state)).toEqual({ kind: "fresh", total: 5 });
  });

  it("answers, skips and goes back; partial and ready head copy", () => {
    let state = initialSurveyState(3);
    state = run(state, { type: "choose", value: "yes" }, { type: "next" }, { type: "next" });
    expect(state.step).toBe(2);
    expect(surveyHeadCopy(state)).toEqual({ kind: "partial", remaining: 2 });
    state = run(state, { type: "back" }, { type: "choose", value: "opt-b" }, { type: "next" }, { type: "choose", value: "opt-c" });
    expect(answeredCount(state)).toBe(3);
    expect(surveyHeadCopy(state)).toEqual({ kind: "ready" });
  });

  it("re-opens at the first unanswered question, or the final step", () => {
    let state = run(initialSurveyState(3), { type: "choose", value: "yes" }, { type: "next" });
    state = run(state, { type: "goTo", step: 0 }, { type: "open" });
    expect(state.step).toBe(1);
    state = run(state, { type: "choose", value: "a" }, { type: "next" }, { type: "choose", value: "b" }, { type: "goTo", step: 0 }, { type: "open" });
    expect(isFinalStep(state)).toBe(true);
  });

  it("needs at least one answer to send; zero answers may go back to the questions", () => {
    let state = run(initialSurveyState(2), { type: "next" }, { type: "next" });
    expect(isFinalStep(state)).toBe(true);
    expect(canSendSurvey(state)).toBe(false);
    expect(isSurveyLocked(state)).toBe(false);
    expect(run(state, { type: "submit" }).phase).toBe("editing");
    state = run(state, { type: "goTo", step: 0 });
    expect(state.step).toBe(0);
  });

  it("locks the final step with answers: no back, no goTo", () => {
    const state = run(initialSurveyState(2), { type: "choose", value: "yes" }, { type: "next" }, { type: "next" });
    expect(isSurveyLocked(state)).toBe(true);
    expect(run(state, { type: "back" }).step).toBe(2);
    expect(run(state, { type: "goTo", step: 0 }).step).toBe(2);
  });

  it("sending → sent is final and ignores every later change", () => {
    let state = run(initialSurveyState(2), { type: "choose", value: "yes" }, { type: "next" }, { type: "next" }, { type: "submit" });
    expect(state.phase).toBe("sending");
    expect(run(state, { type: "back" })).toBe(state);
    state = run(state, { type: "submitted" });
    expect(state.phase).toBe("sent");
    expect(run(state, { type: "goTo", step: 0 }, { type: "submit" })).toBe(state);
  });

  it("a failed send keeps the answers and allows retry or leaving", () => {
    let state = run(initialSurveyState(2), { type: "choose", value: "no" }, { type: "next" }, { type: "next" }, { type: "submit" });
    state = run(state, { type: "failed", code: "SERVICE_UNAVAILABLE" });
    expect(state).toMatchObject({ phase: "error", errorCode: "SERVICE_UNAVAILABLE", answers: ["no", null] });
    expect(isSurveyLocked(state)).toBe(false);
    expect(canSendSurvey(state)).toBe(true);
    expect(run(state, { type: "submit" }).phase).toBe("sending");
  });

  it("sends only answered questions, in question order", () => {
    const state = run(initialSurveyState(3), { type: "next" }, { type: "choose", value: "opt-2" }, { type: "next" }, { type: "choose", value: "yes" });
    expect(surveyAnswersPayload(state, ["q1", "q2", "q3"])).toEqual([
      { questionId: "q2", value: "opt-2" },
      { questionId: "q3", value: "yes" },
    ]);
  });
});
