"use client";

import gsap from "gsap";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FairAudienceResultView, FairErrorCode, FairResult } from "@/lib/fair-contract";
import { FAIR_PRIVACY_PATH } from "@/lib/fair-contract";
import { postFair, useFairModelState } from "@/lib/fair-client/fair-api";
import { fairErrorText } from "@/lib/fair-client/fair-errors";
import type {
  FairAudienceQuestionCountFixture,
  FairAudienceResponseFixture,
  FairAudienceThresholdFixture,
  FairFixtureMode,
  FairPublicModelFixture,
} from "@/lib/fair-client/model-fixtures";
import { fmt, type FairModelDict } from "@/lib/i18n";
import { fairEventThemeClass } from "@/lib/fair-theme";

// Glas publike (MASTER §9.1): votes go through POST /api/fair/audience-vote;
// the server returns the visitor's own choice and, from five votes, whole
// percentages. Below the threshold only the own choice and "Rezultati uskoro"
// are shown. A vote can be changed. DEV fixtures (no live model) simulate the
// same result shape and never touch browser storage.

export type AudienceQuestion = {
  id: string;
  prompt: string;
  answers: Array<{ id: string; label: string }>;
  /** DEV fixture only: percentages per chosen answer. */
  fixturePercentages?: Record<string, number[]>;
};

export type AudienceSource =
  | { kind: "live"; eventModelId: string }
  | {
      kind: "fixture";
      threshold: FairAudienceThresholdFixture;
      response: FairAudienceResponseFixture;
    };

type AudienceSelection = {
  mode: FairFixtureMode;
  threshold: FairAudienceThresholdFixture;
  response: FairAudienceResponseFixture;
  questionCount: FairAudienceQuestionCountFixture;
};

type VoteAnimation = {
  questionId: string;
  from: number[];
  revision: number;
};

function resultPercentages(result: FairAudienceResultView | undefined, question: AudienceQuestion) {
  if (result?.state !== "public") return null;
  return question.answers.map(
    (answer) => result.options.find((option) => option.optionId === answer.id)?.percentage ?? 0,
  );
}

async function fixtureVote(
  source: Extract<AudienceSource, { kind: "fixture" }>,
  question: AudienceQuestion,
  optionId: string,
): Promise<FairResult<FairAudienceResultView>> {
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  if (source.response === "error") return { ok: false, code: "SERVICE_UNAVAILABLE" };
  if (source.threshold === "below") {
    return { ok: true, value: { questionId: question.id, state: "waiting_for_minimum", myOptionId: optionId } };
  }
  const percentages = question.fixturePercentages?.[optionId] ?? [];
  return {
    ok: true,
    value: {
      questionId: question.id,
      state: "public",
      options: question.answers.map((answer, index) => ({ optionId: answer.id, percentage: percentages[index] ?? 0 })),
      myOptionId: optionId,
    },
  };
}

function audienceDevHref(
  routePath: string,
  current: AudienceSelection,
  update: Partial<AudienceSelection>,
) {
  const next = { ...current, ...update };
  const search = new URLSearchParams({
    dev: "1",
    mode: next.mode,
    threshold: next.threshold,
    result: next.response,
    questions: String(next.questionCount),
  });
  return `${routePath}?${search.toString()}#fair-dev`;
}

function AudienceDevPanel({
  routePath,
  selection,
  dict,
}: {
  routePath: string;
  selection: AudienceSelection;
  dict: FairModelDict;
}) {
  const option = (
    label: string,
    update: Partial<AudienceSelection>,
    active: boolean,
  ) => (
    <Link
      href={audienceDevHref(routePath, selection, update)}
      scroll={false}
      aria-current={active ? "true" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <aside id="fair-dev" className="fair-dev-panel" aria-label={dict.devPanelTitle}>
      <h2>{dict.devPanelTitle}</h2>
      <div className="fair-dev-panel__group">
        <strong>{dict.devModeLabel}</strong>
        <div>
          {option(dict.fixtureStarter, { mode: "starter" }, selection.mode === "starter")}
          {option(dict.fixtureAdvanced, { mode: "advanced" }, selection.mode === "advanced")}
        </div>
      </div>
      <div className="fair-dev-panel__group">
        <strong>{dict.devThresholdLabel}</strong>
        <div>
          {option(
            dict.fixtureBelowThreshold,
            { threshold: "below" },
            selection.threshold === "below",
          )}
          {option(
            dict.fixturePublicResults,
            { threshold: "public" },
            selection.threshold === "public",
          )}
        </div>
      </div>
      <div className="fair-dev-panel__group">
        <strong>{dict.devResponseLabel}</strong>
        <div>
          {option(dict.fixtureSuccess, { response: "success" }, selection.response === "success")}
          {option(dict.fixtureError, { response: "error" }, selection.response === "error")}
        </div>
      </div>
      <div className="fair-dev-panel__group">
        <strong>{dict.devQuestionCountLabel}</strong>
        <div>
          {option(
            dict.fixtureOneQuestion,
            { questionCount: 1 },
            selection.questionCount === 1,
          )}
          {option(
            dict.fixtureFiveQuestions,
            { questionCount: 5 },
            selection.questionCount === 5,
          )}
        </div>
      </div>
    </aside>
  );
}

export function AudienceFlow({
  model,
  questions,
  source,
  dict,
  routePath,
  modelHref,
  selection,
  showDevPanel,
}: {
  model: FairPublicModelFixture;
  questions: AudienceQuestion[];
  source: AudienceSource;
  dict: FairModelDict;
  routePath: string;
  modelHref: string;
  /** DEV fixture switcher state; null for live models. */
  selection: AudienceSelection | null;
  showDevPanel: boolean;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [modelState] = useFairModelState(
    source.kind === "live" ? source.eventModelId : model.id,
    source.kind === "live",
  );
  const loadedResults = useMemo(() => {
    const map: Record<string, FairAudienceResultView> = {};
    if (modelState.status === "ready") {
      for (const result of modelState.value.audience) map[result.questionId] = result;
    }
    return map;
  }, [modelState]);
  const [localResults, setLocalResults] = useState<Record<string, FairAudienceResultView>>({});
  const [pending, setPending] = useState<{ questionId: string; optionId: string } | null>(null);
  const [failed, setFailed] = useState<{ optionId: string; code: FairErrorCode } | null>(null);
  const [animation, setAnimation] = useState<VoteAnimation | null>(null);
  const requestRef = useRef(0);
  const animationRevisionRef = useRef(0);
  const answersRef = useRef<HTMLDivElement>(null);

  const question = questions[questionIndex];
  const result = question ? (localResults[question.id] ?? loadedResults[question.id]) : undefined;
  const selectedAnswer =
    pending && question && pending.questionId === question.id ? pending.optionId : result?.myOptionId;
  const publicResults = result?.state === "public" && failed === null;

  useLayoutEffect(() => {
    if (!question || !publicResults || !result || !answersRef.current) return;
    const targets = resultPercentages(result, question) ?? [];
    const rows = Array.from(
      answersRef.current.querySelectorAll<HTMLElement>(".fair-vote-answer"),
    );
    const shouldAnimate = animation?.questionId === question.id;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      const timeline = gsap.timeline();
      rows.forEach((row, index) => {
        const fill = row.querySelector<HTMLElement>(".fair-vote-answer__fill");
        const counter = row.querySelector<HTMLElement>(".fair-vote-answer__percent");
        if (!fill || !counter) return;
        const target = targets[index] ?? 0;
        const from = shouldAnimate ? (animation?.from[index] ?? 0) : target;
        gsap.set(fill, { width: `${from}%` });
        counter.textContent = `${Math.round(from)}%`;
        if (!shouldAnimate || reduceMotion) {
          gsap.set(fill, { width: `${target}%` });
          counter.textContent = `${target}%`;
          return;
        }
        const value = { current: from };
        timeline.to(fill, { width: `${target}%`, duration: 0.75, ease: "power3.out" }, 0);
        timeline.to(
          value,
          {
            current: target,
            duration: 0.75,
            ease: "power3.out",
            onUpdate: () => {
              counter.textContent = `${Math.round(value.current)}%`;
            },
          },
          0,
        );
      });
    }, answersRef);

    return () => context.revert();
  }, [animation, publicResults, question, result]);

  async function submitVote(answerId: string) {
    if (!question) return;
    const request = ++requestRef.current;
    const previous = resultPercentages(result, question) ?? question.answers.map(() => 0);
    setPending({ questionId: question.id, optionId: answerId });
    setFailed(null);
    const response =
      source.kind === "live"
        ? await postFair<FairAudienceResultView>("/api/fair/audience-vote", {
            questionId: question.id,
            optionId: answerId,
          })
        : await fixtureVote(source, question, answerId);
    if (request !== requestRef.current) return;
    setPending(null);
    if (!response.ok) {
      setFailed({ optionId: answerId, code: response.code });
      return;
    }
    setLocalResults((current) => ({ ...current, [question.id]: response.value }));
    animationRevisionRef.current += 1;
    setAnimation({
      questionId: question.id,
      from: previous,
      revision: animationRevisionRef.current,
    });
  }

  function changeQuestion(index: number) {
    requestRef.current += 1;
    setPending(null);
    setFailed(null);
    setAnimation(null);
    setQuestionIndex(index);
  }

  const answeredResult = (id: string) => localResults[id] ?? loadedResults[id];

  return (
    <div className={`fair-event fair-audience-page ${fairEventThemeClass(model.eventSlug)}`} data-reveal="off">
      <header className="fair-flow-header">
        <Link href={modelHref} aria-label={dict.audienceBack}>
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div>
          <span>{dict.audienceEyebrow}</span>
          <strong>{model.displayName}</strong>
        </div>
      </header>

      <main className="fair-audience-main">
        {!question ? (
          <section className="fair-question-card" aria-labelledby="fair-question-title">
            <h1 id="fair-question-title">{dict.audienceEmptyTitle}</h1>
            <div className="fair-vote-status">
              <p>{dict.audienceEmptyBody}</p>
            </div>
          </section>
        ) : (
          <>
            <nav className="fair-question-progress" aria-label={dict.audienceProgressAria}>
              {questions.map((item, index) => {
                const available = index === questionIndex || Boolean(answeredResult(item.id));
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={fmt(dict.audienceQuestionOf, {
                      current: index + 1,
                      total: questions.length,
                    })}
                    aria-current={index === questionIndex ? "step" : undefined}
                    disabled={!available}
                    onClick={() => changeQuestion(index)}
                  />
                );
              })}
            </nav>

            <section className="fair-question-card" aria-labelledby="fair-question-title">
              <p>
                {fmt(dict.audienceQuestionOf, {
                  current: questionIndex + 1,
                  total: questions.length,
                })}
              </p>
              <h1 id="fair-question-title">{question.prompt}</h1>

              <div ref={answersRef} className="fair-vote-answers">
                {question.answers.map((answer, index) => {
                  const selected = selectedAnswer === answer.id;
                  return (
                    <button
                      key={answer.id}
                      type="button"
                      className="fair-vote-answer"
                      aria-pressed={selected}
                      onClick={() => submitVote(answer.id)}
                    >
                      <span className="fair-vote-answer__fill" aria-hidden="true" />
                      <span className="fair-vote-answer__label">{answer.label}</span>
                      {publicResults ? (
                        <strong className="fair-vote-answer__percent">
                          {resultPercentages(result, question)?.[index] ?? 0}%
                        </strong>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="fair-vote-status" aria-live="polite">
                {pending ? <p>{dict.audienceSubmitting}</p> : null}
                {failed ? (
                  <div role="alert">
                    <p>
                      {failed.code === "SERVICE_UNAVAILABLE"
                        ? dict.audienceVoteError
                        : fairErrorText(failed.code, dict)}
                    </p>
                    <button type="button" onClick={() => submitVote(failed.optionId)}>
                      {dict.audienceRetry}
                    </button>
                  </div>
                ) : null}
                {result?.state === "waiting_for_minimum" && !failed && !pending ? (
                  <p>{dict.audienceResultsSoon}</p>
                ) : null}
              </div>
            </section>

            {result && !failed ? (
              questionIndex < questions.length - 1 ? (
                <button
                  type="button"
                  className="fair-flow-primary"
                  onClick={() => changeQuestion(questionIndex + 1)}
                >
                  {dict.audienceNextQuestion}
                  <ArrowRight aria-hidden="true" />
                </button>
              ) : (
                <Link className="fair-flow-primary" href={modelHref}>
                  {dict.audienceBackToModel}
                  <ArrowRight aria-hidden="true" />
                </Link>
              )
            ) : null}
          </>
        )}
      </main>

      <footer className="fair-footer">
        <span>{dict.poweredBy}</span>
        <Link prefetch={false} href={FAIR_PRIVACY_PATH} className="fair-dev-entry">{dict.privacyLink}</Link>
        {selection ? (
          <Link
            href={showDevPanel ? routePath : `${routePath}?dev=1#fair-dev`}
            scroll={false}
            className="fair-dev-entry"
          >
            {dict.devLink}
          </Link>
        ) : null}
      </footer>

      {showDevPanel && selection ? (
        <AudienceDevPanel routePath={routePath} selection={selection} dict={dict} />
      ) : null}
    </div>
  );
}
