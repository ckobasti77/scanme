// Admin UX A6 — the survey form of an Advanced model (MASTER §9.2): up to
// five short questions, each Da/Ne or "Izbor jednog odgovora" with 2–5
// options as dynamic rows. Pure; the backend (upsertSurveyDraft) validates
// again. Question ids stay stable (q1…q5) inside a version.

import { FAIR_SURVEY_MAX_QUESTIONS, type FairSurveyQuestionKind } from "@/lib/fair-contract";
import { SURVEY_OPTION_LIMITS, emptyOptionRows, optionRowsFrom, toChoiceOptions, validateOptionRows, type OptionRow, type OptionRowsProblem } from "./option-rows";

export type SurveyFormQuestion = { id: string; prompt: string; kind: FairSurveyQuestionKind; options: OptionRow[] };

export type StoredSurveyQuestion = {
  id: string;
  prompt: string;
  kind: FairSurveyQuestionKind;
  options: { id: string; label: string; order: number }[];
  order: number;
};

export type SurveyFormProblem =
  | { kind: "too_many"; max: number }
  | { kind: "prompt_empty"; questionId: string }
  | { kind: "options"; questionId: string; problems: OptionRowsProblem[] };

function nextQuestionId(questions: readonly SurveyFormQuestion[]): string {
  const used = new Set(questions.map((question) => question.id));
  for (let n = 1; ; n += 1) if (!used.has(`q${n}`)) return `q${n}`;
}

export function emptySurveyQuestion(questions: readonly SurveyFormQuestion[] = []): SurveyFormQuestion {
  return { id: nextQuestionId(questions), prompt: "", kind: "yes_no", options: [] };
}

/** The questions of a stored version (a draft to edit, or a published one as the start of the next version). */
export function surveyFormFrom(questions: readonly StoredSurveyQuestion[]): SurveyFormQuestion[] {
  if (!questions.length) return [emptySurveyQuestion()];
  return [...questions].sort((a, b) => a.order - b.order).map((question) => ({
    id: question.id,
    prompt: question.prompt,
    kind: question.kind,
    options: question.kind === "single_choice" ? optionRowsFrom(question.options) : [],
  }));
}

export function addSurveyQuestion(questions: readonly SurveyFormQuestion[]): SurveyFormQuestion[] {
  return questions.length >= FAIR_SURVEY_MAX_QUESTIONS ? [...questions] : [...questions, emptySurveyQuestion(questions)];
}

export function removeSurveyQuestion(questions: readonly SurveyFormQuestion[], id: string): SurveyFormQuestion[] {
  return questions.length <= 1 ? [...questions] : questions.filter((question) => question.id !== id);
}

export function moveSurveyQuestion(questions: readonly SurveyFormQuestion[], id: string, direction: -1 | 1): SurveyFormQuestion[] {
  const from = questions.findIndex((question) => question.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= questions.length) return [...questions];
  const next = [...questions];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function updateSurveyQuestion(questions: readonly SurveyFormQuestion[], id: string, patch: Partial<Omit<SurveyFormQuestion, "id">>): SurveyFormQuestion[] {
  return questions.map((question) => {
    if (question.id !== id) return question;
    const next = { ...question, ...patch };
    // Switching to a choice starts with the two empty rows it needs; Da/Ne has no options.
    if (patch.kind === "single_choice" && !next.options.length) next.options = emptyOptionRows();
    if (patch.kind === "yes_no") next.options = [];
    return next;
  });
}

export function validateSurveyForm(questions: readonly SurveyFormQuestion[]): SurveyFormProblem[] {
  const problems: SurveyFormProblem[] = [];
  if (questions.length > FAIR_SURVEY_MAX_QUESTIONS) problems.push({ kind: "too_many", max: FAIR_SURVEY_MAX_QUESTIONS });
  for (const question of questions) {
    if (!question.prompt.trim()) problems.push({ kind: "prompt_empty", questionId: question.id });
    if (question.kind === "single_choice") {
      const optionProblems = validateOptionRows(question.options, SURVEY_OPTION_LIMITS);
      if (optionProblems.length) problems.push({ kind: "options", questionId: question.id, problems: optionProblems });
    }
  }
  return problems;
}

/** The `questions` argument of upsertSurveyDraft (questions are optional for the visitor: required = false). */
export function toSurveyQuestionInputs(questions: readonly SurveyFormQuestion[]) {
  return questions.map((question, index) => ({
    id: question.id,
    prompt: question.prompt.trim(),
    kind: question.kind,
    options: question.kind === "single_choice" ? toChoiceOptions(question.options) : [],
    required: false,
    order: index + 1,
  }));
}
