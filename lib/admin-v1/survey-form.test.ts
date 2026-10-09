import { describe, expect, test } from "vitest";
import {
  addSurveyQuestion,
  emptySurveyQuestion,
  moveSurveyQuestion,
  removeSurveyQuestion,
  surveyFormFrom,
  toSurveyQuestionInputs,
  updateSurveyQuestion,
  validateSurveyForm,
  type SurveyFormQuestion,
} from "./survey-form";

// Admin UX A6 — survey form (MASTER §9.2): up to 5 questions, Da/Ne or
// "Izbor jednog odgovora" with 2–5 options.

describe("survey form", () => {
  test("at most 10 questions (owner, 9 Oct 2026), at least 1; stable ids q1…q10", () => {
    let questions = [emptySurveyQuestion()];
    for (let i = 0; i < 11; i += 1) questions = addSurveyQuestion(questions);
    expect(questions.map((question) => question.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"]);
    questions = removeSurveyQuestion(questions, "q2");
    expect(addSurveyQuestion(questions).map((question) => question.id)).toEqual(["q1", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10", "q2"]);
    expect(removeSurveyQuestion([emptySurveyQuestion()], "q1")).toHaveLength(1);
    expect(validateSurveyForm(Array.from({ length: 11 }, (_, index) => ({ ...emptySurveyQuestion(), id: `q${index + 1}`, prompt: "TEST" })))).toContainEqual({ kind: "too_many", max: 10 });
  });

  test("question types: Da/Ne has no options, a choice starts with two option rows", () => {
    let questions = [emptySurveyQuestion()];
    expect(questions[0].kind).toBe("yes_no");
    questions = updateSurveyQuestion(questions, "q1", { prompt: "TEST način plaćanja?", kind: "single_choice" });
    expect(questions[0].options).toEqual([{ id: "o1", label: "" }, { id: "o2", label: "" }]);
    expect(validateSurveyForm(questions)).toEqual([{ kind: "options", questionId: "q1", problems: [{ kind: "empty", rowIds: ["o1", "o2"] }] }]);
    questions = updateSurveyQuestion(questions, "q1", { options: [{ id: "o1", label: "TEST gotovina" }, { id: "o2", label: "TEST kredit" }] });
    expect(validateSurveyForm(questions)).toEqual([]);
    expect(updateSurveyQuestion(questions, "q1", { kind: "yes_no" })[0].options).toEqual([]);
  });

  test("validation: empty prompt, duplicate options", () => {
    const questions = [
      { id: "q1", prompt: " ", kind: "yes_no" as const, options: [] },
      { id: "q2", prompt: "TEST", kind: "single_choice" as const, options: [{ id: "o1", label: "Da" }, { id: "o2", label: "da" }] },
    ];
    expect(validateSurveyForm(questions)).toEqual([
      { kind: "prompt_empty", questionId: "q1" },
      { kind: "options", questionId: "q2", problems: [{ kind: "duplicate", rowIds: ["o1", "o2"] }] },
    ]);
  });

  test("the upsertSurveyDraft argument: order follows the rows, optional questions, trimmed text", () => {
    let questions: SurveyFormQuestion[] = [
      { id: "q1", prompt: " TEST prvo ", kind: "yes_no", options: [] },
      { id: "q2", prompt: "TEST drugo", kind: "single_choice" as const, options: [{ id: "o1", label: " A " }, { id: "o2", label: "B" }] },
    ];
    questions = moveSurveyQuestion(questions, "q2", -1);
    expect(toSurveyQuestionInputs(questions)).toEqual([
      { id: "q2", prompt: "TEST drugo", kind: "single_choice", options: [{ id: "o1", label: "A", order: 1 }, { id: "o2", label: "B", order: 2 }], required: false, order: 1 },
      { id: "q1", prompt: "TEST prvo", kind: "yes_no", options: [], required: false, order: 2 },
    ]);
  });

  test("a stored version comes back in `order` (draft to edit, or the start of the next version)", () => {
    expect(surveyFormFrom([
      { id: "q2", prompt: "B", kind: "single_choice", options: [{ id: "o2", label: "Y", order: 2 }, { id: "o1", label: "X", order: 1 }], order: 2 },
      { id: "q1", prompt: "A", kind: "yes_no", options: [], order: 1 },
    ])).toEqual([
      { id: "q1", prompt: "A", kind: "yes_no", options: [] },
      { id: "q2", prompt: "B", kind: "single_choice", options: [{ id: "o1", label: "X" }, { id: "o2", label: "Y" }] },
    ]);
    expect(surveyFormFrom([])).toEqual([emptySurveyQuestion()]);
  });
});
