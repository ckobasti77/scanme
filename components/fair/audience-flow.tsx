"use client";

import gsap from "gsap";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  FairAudienceFixture,
  FairAudienceQuestionCountFixture,
  FairAudienceResponseFixture,
  FairAudienceThresholdFixture,
  FairFixtureMode,
  FairPublicModelFixture,
} from "@/lib/fair-client/model-fixtures";
import { fmt, type FairModelDict } from "@/lib/i18n";
import { fairEventThemeClass } from "@/lib/fair-theme";

type SavedVote = {
  answerId: string;
  percentages: number[];
};

type SavedVotes = Record<string, SavedVote>;

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

function storageKey(model: FairPublicModelFixture) {
  return `scanme:fair-audience:v1:${model.eventId}:${model.id}`;
}

function parseSavedVotes(raw: string | null): SavedVotes {
  try {
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as SavedVotes;
  } catch {
    return {};
  }
}

function subscribeToSavedVotes() {
  return () => {};
}

function writeSavedVotes(model: FairPublicModelFixture, votes: SavedVotes) {
  try {
    window.localStorage.setItem(storageKey(model), JSON.stringify(votes));
  } catch {
    // The confirmed fixture state remains usable for this page view.
  }
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
  fixture,
  dict,
  routePath,
  modelHref,
  selection,
  showDevPanel,
}: {
  model: FairPublicModelFixture;
  fixture: FairAudienceFixture;
  dict: FairModelDict;
  routePath: string;
  modelHref: string;
  selection: AudienceSelection;
  showDevPanel: boolean;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [memoryVotes, setMemoryVotes] = useState<SavedVotes | null>(null);
  const savedVotesRaw = useSyncExternalStore(
    subscribeToSavedVotes,
    () => {
      try {
        return window.localStorage.getItem(storageKey(model));
      } catch {
        return null;
      }
    },
    () => null,
  );
  const storedVotes = useMemo(() => parseSavedVotes(savedVotesRaw), [savedVotesRaw]);
  const votes = memoryVotes ?? storedVotes;
  const [failedAnswer, setFailedAnswer] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "error">("idle");
  const [animation, setAnimation] = useState<VoteAnimation | null>(null);
  const requestRef = useRef(0);
  const animationRevisionRef = useRef(0);
  const answersRef = useRef<HTMLDivElement>(null);

  const question = fixture.questions[questionIndex];
  const savedVote = votes[question.id];
  const selectedAnswer = savedVote?.answerId;
  const publicResults =
    fixture.threshold === "public" && Boolean(savedVote) && status !== "error";

  useLayoutEffect(() => {
    if (!publicResults || !savedVote || !answersRef.current) return;
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
        const target = savedVote.percentages[index] ?? 0;
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
  }, [animation, publicResults, question.id, savedVote]);

  async function submitVote(answerId: string) {
    const request = ++requestRef.current;
    const percentages = question.resultPercentagesByAnswer[answerId] ?? [];
    const previous = votes[question.id]?.percentages ?? question.answers.map(() => 0);
    const previousVotes = votes;
    const nextVotes = {
      ...votes,
      [question.id]: { answerId, percentages },
    };
    setMemoryVotes(nextVotes);
    writeSavedVotes(model, nextVotes);
    setFailedAnswer(null);
    setStatus("idle");
    animationRevisionRef.current += 1;
    setAnimation({
      questionId: question.id,
      from: previous,
      revision: animationRevisionRef.current,
    });

    if (fixture.response !== "error") return;
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    if (request !== requestRef.current) return;
    setMemoryVotes(previousVotes);
    writeSavedVotes(model, previousVotes);
    setFailedAnswer(answerId);
    setAnimation(null);
    setStatus("error");
  }

  function changeQuestion(index: number) {
    requestRef.current += 1;
    setFailedAnswer(null);
    setStatus("idle");
    setAnimation(null);
    setQuestionIndex(index);
  }

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
        <nav className="fair-question-progress" aria-label={dict.audienceProgressAria}>
          {fixture.questions.map((item, index) => {
            const available = index === questionIndex || Boolean(votes[item.id]);
            return (
              <button
                key={item.id}
                type="button"
                aria-label={fmt(dict.audienceQuestionOf, {
                  current: index + 1,
                  total: fixture.questions.length,
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
              total: fixture.questions.length,
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
                      {savedVote?.percentages[index] ?? 0}%
                    </strong>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="fair-vote-status" aria-live="polite">
            {status === "error" ? (
              <div role="alert">
                <p>{dict.audienceVoteError}</p>
                <button type="button" onClick={() => failedAnswer && submitVote(failedAnswer)}>
                  {dict.audienceRetry}
                </button>
              </div>
            ) : null}
            {fixture.threshold === "below" && savedVote && status === "idle" ? (
              <p>{dict.audienceResultsSoon}</p>
            ) : null}
          </div>
        </section>

        {savedVote && status === "idle" ? (
          questionIndex < fixture.questions.length - 1 ? (
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
      </main>

      <footer className="fair-footer">
        <span>{dict.poweredBy}</span>
        <Link
          href={showDevPanel ? routePath : `${routePath}?dev=1#fair-dev`}
          scroll={false}
          className="fair-dev-entry"
        >
          {dict.devLink}
        </Link>
      </footer>

      {showDevPanel ? (
        <AudienceDevPanel routePath={routePath} selection={selection} dict={dict} />
      ) : null}
    </div>
  );
}
