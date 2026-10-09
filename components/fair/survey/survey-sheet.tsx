"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { FAIR_DURATION, FAIR_EASE } from "../fair-motion";
import { useEffect, useRef, useState } from "react";
import { EMPTY_CONTACT_DRAFT, contactFormState, type ContactDraft } from "@/lib/fair-client/contact-form";
import { fairErrorText } from "@/lib/fair-client/fair-errors";
import { fairHaptic } from "@/lib/fair-client/haptics";
import {
  answeredCount,
  canSendSurvey,
  isFinalStep,
  isSurveyLocked,
} from "@/lib/fair-client/survey-machine";
import { fmt } from "@/lib/i18n";
import { ContactBlock } from "../contact-block";
import { FairSheet } from "../fair-sheet";
import { useFairModelInteractions } from "../model-interactions";

// Full-screen survey (prototype public/prototip/anketa.html): one question per
// screen, auto-advance after a choice, Nazad/Preskoči, smooth segmented
// progress, and a final step with no way back once there is an answer.

const ADVANCE_MS = 340;

export function SurveySheet() {
  const { survey, dict, model, leadForms } = useFairModelInteractions();
  const reduceMotion = useReducedMotion();
  const advanceTimer = useRef<number | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_CONTACT_DRAFT);
  const step = survey?.state.step ?? 0;
  const [shown, setShown] = useState({ step, direction: 1 });
  if (shown.step !== step) setShown({ step, direction: step > shown.step ? 1 : -1 });

  useEffect(() => () => {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
  }, []);

  if (!survey) return null;
  const { view, state, dispatch } = survey;
  const questions = view.questions.slice(0, state.total);
  const answered = answeredCount(state);
  const final = isFinalStep(state);
  const sending = state.phase === "sending";
  const interestForm = leadForms.interest?.state === "open" ? leadForms.interest : null;
  const contact = interestForm ? contactFormState(draft, interestForm.contactRequirement) : null;
  const contactUsable = !contact || contact.empty || contact.ok;
  const withContact = Boolean(contact?.ok);

  function choose(value: string) {
    if (advanceTimer.current !== null || state.phase === "sending") return;
    dispatch({ type: "choose", value });
    fairHaptic(10);
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      dispatch({ type: "next" });
    }, reduceMotion ? 0 : ADVANCE_MS);
  }

  function send() {
    if (!canSendSurvey(state) || !contactUsable || !survey) return;
    void survey.send(
      interestForm && contact?.ok && contact.payload
        ? { payload: contact.payload, remember: draft.remember, consentVersion: interestForm.consent.version }
        : null,
    );
  }

  const options = (index: number) => {
    const question = questions[index];
    return question.kind === "yes_no"
      ? [
          { id: "yes", label: dict.surveyYes },
          { id: "no", label: dict.surveyNo },
        ]
      : question.options.map((option) => ({ id: option.id, label: option.label }));
  };

  const stepContent = (index: number) => {
    if (index < questions.length) {
      const question = questions[index];
      return (
        <>
          <span className="fair-survey-step__eyebrow">
            {fmt(dict.audienceQuestionOf, { current: index + 1, total: questions.length })}
          </span>
          <h3 id={`fair-survey-q-${index}`}>{question.prompt}</h3>
          <div className="fair-survey-options" role="group" aria-labelledby={`fair-survey-q-${index}`}>
            {options(index).map((option) => (
              <button
                key={option.id}
                type="button"
                className="fair-survey-option"
                aria-pressed={state.answers[index] === option.id}
                onClick={() => choose(option.id)}
              >
                <span className="fair-survey-option__dot" aria-hidden="true">
                  <Check />
                </span>
                {option.label}
              </button>
            ))}
          </div>
        </>
      );
    }
    if (answered === 0) {
      return (
        <>
          <span className="fair-survey-step__eyebrow">{dict.surveyEmptyEyebrow}</span>
          <h3>{dict.surveyEmptyTitle}</h3>
          <p className="fair-survey-step__lead">{dict.surveyEmptyBody}</p>
        </>
      );
    }
    return (
      <>
        <span className="fair-survey-step__eyebrow">
          {fmt(dict.surveyFinalEyebrow, { answered, total: questions.length })}
        </span>
        <h3>{interestForm ? fmt(dict.surveyFinalTitleContact, { brand: model.brandName }) : dict.surveyFinalTitle}</h3>
        <p className="fair-survey-step__lead">
          {interestForm ? fmt(dict.surveyFinalBodyContact, { brand: model.brandName }) : dict.surveyFinalBody}
        </p>
        {interestForm ? (
          <ContactBlock
            idPrefix="fair-survey-contact"
            requirement={interestForm.contactRequirement}
            consentText={interestForm.consent.text}
            draft={draft}
            onChange={setDraft}
            dict={dict}
          />
        ) : null}
      </>
    );
  };

  const footer = !final ? (
    <div className="fair-survey-nav">
      <button
        type="button"
        className="fair-survey-link"
        data-hidden={step === 0 || undefined}
        disabled={step === 0}
        onClick={() => dispatch({ type: "back" })}
      >
        {dict.surveyBack}
      </button>
      <button type="button" className="fair-survey-link" onClick={() => dispatch({ type: "next" })}>
        {dict.surveySkip}
      </button>
    </div>
  ) : answered === 0 ? (
    <button type="button" className="fair-sheet__primary" onClick={() => dispatch({ type: "goTo", step: 0 })}>
      {dict.surveyBackToQuestions}
    </button>
  ) : (
    <div className="fair-survey-send">
      {state.phase === "error" && state.errorCode ? (
        <p className="fair-inline-error" role="alert">
          {fairErrorText(state.errorCode, dict)}
        </p>
      ) : null}
      <button
        type="button"
        className="fair-sheet__primary"
        disabled={sending || !contactUsable}
        aria-busy={sending || undefined}
        onClick={send}
      >
        {sending ? dict.leadSending : withContact ? dict.surveySendWithContact : dict.surveySend}
      </button>
    </div>
  );

  return (
    <FairSheet
      variant="full"
      titleId="fair-survey-title"
      title={fmt(dict.surveySheetTitle, { brand: model.brandName })}
      subtitle={fmt(dict.surveySheetSubtitle, { exhibitor: model.exhibitorName })}
      mark={model.brandName.slice(0, 1)}
      closable={!isSurveyLocked(state) && !sending}
      closeLabel={dict.closeSheet}
      onRequestClose={survey.closeSheet}
      toolbar={
        <div
          className="fair-survey-bars"
          role="progressbar"
          aria-label={fmt(dict.surveyProgressAria, { answered, total: questions.length })}
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={answered}
        >
          {questions.map((question, index) => (
            <i
              key={question.id}
              style={{ "--fair-bar-fill": state.answers[index] !== null ? 1 : index === step ? 0.3 : 0 } as React.CSSProperties}
            />
          ))}
        </div>
      }
      footer={footer}
    >
      <div className="fair-survey-stage">
        <AnimatePresence mode="wait" initial={false} custom={shown.direction}>
          <motion.div
            key={shown.step}
            className="fair-survey-step"
            custom={shown.direction}
            variants={{
              enter: (direction: number) => ({ opacity: 0, x: 24 * direction }),
              center: { opacity: 1, x: 0, transition: { duration: FAIR_DURATION.state, ease: FAIR_EASE.enter } },
              exit: (direction: number) => ({ opacity: 0, x: -24 * direction, transition: { duration: FAIR_DURATION.feedback, ease: FAIR_EASE.exit } }),
            }}
            initial={reduceMotion ? false : "enter"}
            animate="center"
            exit={reduceMotion ? undefined : "exit"}
          >
            {stepContent(shown.step)}
          </motion.div>
        </AnimatePresence>
      </div>
    </FairSheet>
  );
}
