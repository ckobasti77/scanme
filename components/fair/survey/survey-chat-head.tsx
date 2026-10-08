"use client";

import { AnimatePresence, motion, useAnimate, useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { answeredCount, surveyHeadCopy } from "@/lib/fair-client/survey-machine";
import { fmt, type FairModelDict } from "@/lib/i18n";
import { serbianPluralForm } from "@/lib/serbian-plural";
import { useFairModelInteractions, type FairSurveyController } from "../model-interactions";

// Messenger-style survey "chat head" docked on the model hero (prototype
// public/prototip/anketa.html). Absolutely positioned: it never adds height
// to the single-screen model page. Timing: enters 0.9 s after load with a
// ~0.9 s spring, a preview bubble types for 1.1 s, then collapses after 7 s.

const ENTER_PREVIEW_MS = 700;
const TYPING_MS = 1100;
const COLLAPSE_FRESH_MS = 7000;
const COLLAPSE_AGAIN_MS = 3500;
const SPARKS = 12;

type Preview = { id: number; typing: boolean; collapseMs: number };
type ExitKind = "dismiss" | "celebrate";

function previewCopy(survey: FairSurveyController, dict: FairModelDict) {
  const copy = surveyHeadCopy(survey.state);
  if (copy.kind === "fresh") {
    const template = serbianPluralForm(copy.total, [dict.surveyFreshOne, dict.surveyFreshFew, dict.surveyFreshMany]);
    return { message: fmt(template, { count: copy.total }), meta: dict.surveyFreshMeta, fresh: true };
  }
  if (copy.kind === "ready") return { message: dict.surveyReadyMessage, meta: dict.surveyReadyMeta, fresh: false };
  const template = serbianPluralForm(copy.remaining, [dict.surveyRemainingOne, dict.surveyRemainingMany, dict.surveyRemainingMany]);
  return { message: fmt(template, { count: copy.remaining }), meta: dict.surveyPartialMeta, fresh: false };
}

export function SurveyChatHead() {
  const { survey } = useFairModelInteractions();
  const exitKind: ExitKind = survey?.celebrate ? "celebrate" : "dismiss";
  return (
    <AnimatePresence custom={exitKind}>
      {survey?.headVisible ? <ChatHead key="survey-head" survey={survey} /> : null}
    </AnimatePresence>
  );
}

function ChatHead({ survey }: { survey: FairSurveyController }) {
  const { dict, model } = useFairModelInteractions();
  const reduceMotion = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typingDoneFor, setTypingDoneFor] = useState<number | null>(null);
  const [seenSignal, setSeenSignal] = useState(survey.reopenSignal);
  const copy = previewCopy(survey, dict);
  const answered = answeredCount(survey.state);
  const total = survey.state.total;
  const done = survey.celebrate ? 1 : total > 0 ? answered / total : 0;

  // Closing the sheet unsent shows the preview again, without typing.
  if (seenSignal !== survey.reopenSignal) {
    setSeenSignal(survey.reopenSignal);
    setPreview({ id: 1000 + survey.reopenSignal, typing: false, collapseMs: COLLAPSE_AGAIN_MS });
  }

  useEffect(() => {
    fairHaptic(14);
    const fresh = copy.fresh;
    const timer = window.setTimeout(
      () => setPreview({ id: 1, typing: fresh, collapseMs: fresh ? COLLAPSE_FRESH_MS : COLLAPSE_AGAIN_MS }),
      reduceMotion ? 0 : ENTER_PREVIEW_MS,
    );
    return () => window.clearTimeout(timer);
    // Runs once per appearance; later copy changes do not replay the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewId = preview?.id;
  const previewTyping = preview?.typing ?? false;
  const collapseMs = preview?.collapseMs ?? 0;
  useEffect(() => {
    if (previewId === undefined) return;
    const timers: number[] = [];
    if (previewTyping && !reduceMotion) {
      timers.push(
        window.setTimeout(() => {
          setTypingDoneFor(previewId);
          fairHaptic(8);
        }, TYPING_MS),
      );
    }
    timers.push(
      window.setTimeout(() => setPreview((current) => (current?.id === previewId ? null : current)), collapseMs),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [collapseMs, previewId, previewTyping, reduceMotion]);

  useEffect(() => {
    if (!survey.celebrate) return;
    const sparks = Array.from(scope.current?.querySelectorAll<HTMLElement>(".fair-survey-head__spark") ?? []);
    const controls = [
      animate(".fair-survey-head__badge", { scale: [1, 0], opacity: [1, 0] }, { duration: 0.2, delay: 0.45 }),
      animate(".fair-survey-head__mark", { opacity: [1, 0] }, { duration: 0.2, delay: 0.5 }),
      animate(".fair-survey-head__accent", { opacity: [0, 1] }, { duration: 0.3, delay: 0.52 }),
      animate(
        ".fair-survey-head__check",
        { opacity: [0, 1, 1], scale: [0.4, 1.15, 1], rotate: [-20, 0, 0] },
        { duration: 0.36, delay: 0.56, times: [0, 0.7, 1], ease: [0.2, 0.9, 0.2, 1] },
      ),
      animate(
        ".fair-survey-head__face",
        { scaleX: [1, 1, 0.82, 1.14, 1, 1], scaleY: [1, 1, 0.9, 1.14, 1, 1] },
        { duration: 1.5, times: [0, 0.45, 0.55, 0.68, 0.8, 1], ease: "easeOut" },
      ),
      ...sparks.map((spark, index) => {
        const angle = (index / SPARKS) * Math.PI * 2;
        const radius = 42 + (index % 3) * 9;
        return animate(
          spark,
          { x: [0, Math.cos(angle) * radius], y: [0, Math.sin(angle) * radius], scale: [1, 0.3], opacity: [1, 0] },
          { duration: 0.52, delay: 1, ease: [0.1, 0.8, 0.3, 1] },
        );
      }),
    ];
    const burst = window.setTimeout(() => fairHaptic(30), 1000);
    const vanish = window.setTimeout(() => survey.onCelebrationVanish(), 2300);
    return () => {
      controls.forEach((control) => control.stop());
      window.clearTimeout(burst);
      window.clearTimeout(vanish);
    };
    // The celebration runs once; the controller identity changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey.celebrate]);

  const previewVisible = preview !== null && !survey.sheetOpen && !survey.celebrate;
  const typing = previewVisible && preview.typing && !reduceMotion && typingDoneFor !== preview.id;

  return (
    <motion.div
      ref={scope}
      className="fair-survey-head-wrap"
      custom={survey.celebrate ? "celebrate" : "dismiss"}
      variants={{
        exit: (kind: ExitKind) =>
          reduceMotion
            ? { opacity: 0, transition: { duration: 0 } }
            : kind === "celebrate"
              ? { scale: [1, 1.08, 0], opacity: [1, 1, 0], transition: { duration: 0.42, times: [0, 0.3, 1], ease: [0.5, 0, 0.6, 1] } }
              : { opacity: 0, x: 40, scale: 0.7, transition: { duration: 0.26, ease: "easeIn" } },
      }}
      exit="exit"
    >
      <motion.button
        type="button"
        className="fair-survey-head"
        aria-label={fmt(dict.surveyHeadAria, { brand: model.brandName, answered, total })}
        onClick={survey.openSheet}
        variants={{
          hidden: { x: 90, scale: 0.6, opacity: 0 },
          shown: {
            x: [90, -5, 0],
            scale: [0.6, 1.04, 1],
            opacity: [0, 1, 1],
            transition: { duration: 0.9, times: [0, 0.72, 1], ease: [0.22, 1, 0.36, 1] },
          },
        }}
        initial={reduceMotion ? false : "hidden"}
        animate={reduceMotion ? undefined : "shown"}
        style={{ "--fair-survey-done": done } as React.CSSProperties}
      >
        <span className="fair-survey-head__face" aria-hidden="true">
          <span className="fair-survey-head__accent" />
          <span className="fair-survey-head__mark">{model.brandName.slice(0, 1)}</span>
          <span className="fair-survey-head__check">
            <Check />
          </span>
        </span>
        <svg className="fair-survey-head__ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="16" pathLength={100} />
        </svg>
        <span className="fair-survey-head__badge" aria-hidden="true">
          {answered}/{total}
        </span>
        {Array.from({ length: SPARKS }, (_, index) => (
          <span key={index} className="fair-survey-head__spark" aria-hidden="true" />
        ))}
      </motion.button>

      <AnimatePresence>
        {previewVisible ? (
          <motion.div
            key={preview.id}
            className="fair-survey-preview"
            variants={{
              hidden: { scale: 0.5, opacity: 0 },
              shown: {
                scale: [0.5, 1.02, 1],
                opacity: [0, 1, 1],
                transition: { duration: 0.62, times: [0, 0.75, 1], ease: [0.22, 1, 0.36, 1] },
              },
              gone: reduceMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { scale: 0.5, opacity: 0, transition: { duration: 0.38, ease: [0.5, 0, 0.75, 0] } },
            }}
            initial={reduceMotion ? false : "hidden"}
            animate={reduceMotion ? undefined : "shown"}
            exit="gone"
          >
            <button type="button" className="fair-survey-preview__open" onClick={survey.openSheet}>
              <span className="fair-survey-preview__who">{fmt(dict.surveyWho, { brand: model.brandName })}</span>
              {typing ? (
                <span className="fair-survey-preview__typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <motion.span
                  className="fair-survey-preview__text"
                  initial={reduceMotion || !preview.typing ? false : { opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.36, ease: "easeOut" }}
                >
                  <span className="fair-survey-preview__msg">{copy.message}</span>
                  <span className="fair-survey-preview__meta">{copy.meta}</span>
                </motion.span>
              )}
            </button>
            <button
              type="button"
              className="fair-survey-preview__dismiss"
              aria-label={dict.surveyDismiss}
              onClick={survey.dismissHead}
            >
              <X aria-hidden="true" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
