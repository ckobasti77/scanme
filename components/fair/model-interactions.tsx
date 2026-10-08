"use client";

import { AnimatePresence } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type {
  FairLeadSubmitResult,
  FairRatingState,
  FairSurveySubmitResult,
  FairSurveyView,
} from "@/lib/fair-contract";
import type { ContactPayload } from "@/lib/fair-client/contact-form";
import { browserContactStorage, saveContact } from "@/lib/fair-client/contact-store";
import {
  newFairSubmissionId,
  postFair,
  useFairModelState,
  type FairModelStateLoad,
} from "@/lib/fair-client/fair-api";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { useFairHistoryLayer } from "@/lib/fair-client/history-layer";
import {
  initialSurveyState,
  surveyAnswersPayload,
  surveyReducer,
  type SurveyAction,
  type SurveyState,
} from "@/lib/fair-client/survey-machine";
import { hasFairSurveyMarker, setFairSurveyMarker } from "@/lib/fair-client/survey-marker";
import { fmt, type FairModelDict } from "@/lib/i18n";
import type { FairModelInteractions } from "@/lib/fair-server/model-page";
import { FairToast, useFairToast } from "./fair-toast";
import { SurveySheet } from "./survey/survey-sheet";

// Client state of one model page: the visitor's own server state (rating,
// votes, survey), the survey bubble/sheet and the toast. Capabilities and
// forms come from the server projection; nothing here derives package rights.

export type FairInteractionModel = {
  id: string;
  eventId: string;
  participationId: string;
  brandName: string;
  displayName: string;
  exhibitorName: string;
};

export type SurveyContactSubmit = { payload: ContactPayload; remember: boolean; consentVersion: number };

export type FairSurveyController = {
  view: FairSurveyView;
  state: SurveyState;
  dispatch: (action: SurveyAction) => void;
  headVisible: boolean;
  sheetOpen: boolean;
  /** Bumped when the sheet closes unsent: the head shows its preview again. */
  reopenSignal: number;
  celebrate: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  dismissHead: () => void;
  onCelebrationVanish: () => void;
  send: (contact: SurveyContactSubmit | null) => Promise<void>;
};

type FairModelInteractionsValue = {
  dict: FairModelDict;
  live: boolean;
  model: FairInteractionModel;
  modelState: FairModelStateLoad;
  setRating: (rating: FairRatingState) => void;
  leadForms: FairModelInteractions["leadForms"];
  showToast: (text: string) => void;
  survey: FairSurveyController | null;
};

const FairModelInteractionsContext = createContext<FairModelInteractionsValue | null>(null);

export function useFairModelInteractions(): FairModelInteractionsValue {
  const value = useContext(FairModelInteractionsContext);
  if (!value) throw new Error("useFairModelInteractions outside FairModelInteractionsProvider");
  return value;
}

const HEAD_DELAY_MS = 900;

function surveyStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FairModelInteractionsProvider({
  dict,
  model,
  interactions,
  routePath,
  openSurvey,
  children,
}: {
  dict: FairModelDict;
  model: FairInteractionModel;
  /** null for DEV fixture models: no server reads or writes. */
  interactions: FairModelInteractions | null;
  routePath: string;
  openSurvey: boolean;
  children: ReactNode;
}) {
  const live = interactions !== null;
  const [modelState, setModelState] = useFairModelState(model.id, live);
  const { toast, show: showToast, clear: clearToast } = useFairToast();
  const view = interactions?.survey && interactions.survey.questions.length > 0 ? interactions.survey : null;
  const [state, dispatch] = useReducer(surveyReducer, view?.questions.length ?? 0, initialSurveyState);
  const [headDelayDone, setHeadDelayDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [doneHere, setDoneHere] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [deepLinkUsed, setDeepLinkUsed] = useState(!openSurvey);
  const [reopenSignal, setReopenSignal] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [toastAfterVanish, setToastAfterVanish] = useState<string | null>(null);

  // Read once per page load: a marker written by this page's own send must not
  // hide the head before its success animation has played.
  const [markerDone] = useState(
    () => typeof window !== "undefined" && hasFairSurveyMarker(surveyStorage(), model.eventId, model.participationId),
  );
  const serverSurvey = modelState.status === "ready" ? modelState.value.survey : null;
  const surveyOpen = Boolean(view) && serverSurvey?.state === "open" && !markerDone && !doneHere;
  const sheetOpen = surveyOpen && (manualOpen || !deepLinkUsed);
  const headVisible = (surveyOpen && headDelayDone && !dismissed) || (celebrate && !doneHere);

  useEffect(() => {
    const timer = window.setTimeout(() => setHeadDelayDone(true), HEAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // The server already holds this visitor's answers for the model: remember it exhibitor-wide.
  useEffect(() => {
    if (serverSurvey?.state === "submitted") {
      setFairSurveyMarker(surveyStorage(), model.eventId, model.participationId);
    }
  }, [model.eventId, model.participationId, serverSurvey?.state]);

  // `/anketa` that cannot open a survey (none, sent, other exhibitor model) settles on the model URL.
  useEffect(() => {
    if (!openSurvey || modelState.status === "loading" || surveyOpen) return;
    if (window.location.pathname !== routePath) window.history.replaceState(window.history.state, "", routePath);
  }, [modelState.status, openSurvey, routePath, surveyOpen]);

  const settleUrl = useCallback(() => {
    if (window.location.pathname !== routePath) window.history.replaceState(window.history.state, "", routePath);
  }, [routePath]);

  const handleSheetDismiss = useCallback(() => {
    setManualOpen(false);
    setDeepLinkUsed(true);
    settleUrl();
  }, [settleUrl]);

  const requestSheetClose = useFairHistoryLayer(sheetOpen, handleSheetDismiss, "survey");

  const setRating = useCallback(
    (rating: FairRatingState) =>
      setModelState((current) => (current.status === "ready" ? { ...current, value: { ...current.value, rating } } : current)),
    [setModelState],
  );

  const survey = useMemo<FairSurveyController | null>(() => {
    if (!view) return null;
    const finishLocally = (text: string) => {
      setDoneHere(true);
      showToast(text);
    };
    return {
      view,
      state,
      dispatch,
      headVisible,
      sheetOpen,
      reopenSignal,
      celebrate,
      openSheet: () => {
        dispatch({ type: "open" });
        setManualOpen(true);
      },
      closeSheet: () =>
        requestSheetClose(() => {
          if (state.phase !== "sent") setReopenSignal((value) => value + 1);
        }),
      dismissHead: () => setDismissed(true),
      onCelebrationVanish: () => {
        // `celebrate` stays true so the head leaves with its celebration exit.
        finishLocally(toastAfterVanish ?? fmt(dict.surveySentToast, { brand: model.brandName }));
      },
      send: async (contact) => {
        const id = submissionId ?? newFairSubmissionId();
        setSubmissionId(id);
        dispatch({ type: "submit" });
        const result = await postFair<FairSurveySubmitResult>("/api/fair/survey", {
          surveyId: view.surveyId,
          submissionId: id,
          answers: surveyAnswersPayload(state, view.questions.map((question) => question.id)),
        });
        if (!result.ok) {
          if (result.code === "SURVEY_ALREADY_SUBMITTED") {
            setFairSurveyMarker(surveyStorage(), model.eventId, model.participationId);
            dispatch({ type: "failed", code: result.code });
            requestSheetClose(() => finishLocally(dict.surveyAlreadySent));
            return;
          }
          dispatch({ type: "failed", code: result.code });
          return;
        }
        setFairSurveyMarker(surveyStorage(), model.eventId, model.participationId);

        let toastText = fmt(dict.surveySentToast, { brand: model.brandName });
        if (contact) {
          const lead = await postFair<FairLeadSubmitResult>("/api/fair/lead", {
            eventModelId: model.id,
            kind: "interest",
            submissionId: newFairSubmissionId(),
            ...contact.payload,
            consentAccepted: true,
            consentVersion: contact.consentVersion,
          });
          if (lead.ok && contact.remember) {
            saveContact(browserContactStorage(), {
              name: contact.payload.contactName,
              email: contact.payload.email,
              phone: contact.payload.phone,
            });
          }
          if (!lead.ok) toastText = dict.surveyContactFailedToast;
        }
        dispatch({ type: "submitted" });
        const animateHead = headVisible && !prefersReducedMotion();
        requestSheetClose(() => {
          if (animateHead) {
            setToastAfterVanish(toastText);
            fairHaptic([18, 50, 30, 50, 90]);
            setCelebrate(true);
          } else {
            finishLocally(toastText);
          }
        });
      },
    };
  }, [
    celebrate,
    dict,
    headVisible,
    model,
    reopenSignal,
    requestSheetClose,
    sheetOpen,
    showToast,
    state,
    submissionId,
    toastAfterVanish,
    view,
  ]);

  const value = useMemo<FairModelInteractionsValue>(
    () => ({
      dict,
      live,
      model,
      modelState,
      setRating,
      leadForms: interactions?.leadForms ?? {},
      showToast,
      survey,
    }),
    [dict, interactions?.leadForms, live, model, modelState, setRating, showToast, survey],
  );

  return (
    <FairModelInteractionsContext.Provider value={value}>
      {children}
      <AnimatePresence>{survey && sheetOpen ? <SurveySheet key="survey" /> : null}</AnimatePresence>
      <FairToast toast={toast} onDone={clearToast} />
    </FairModelInteractionsContext.Provider>
  );
}
