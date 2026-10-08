"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { fairPassportBrandSlug } from "@/lib/fair-passport";
import {
  FAIR_PASSPORT_VISIT_CHANGE_EVENT,
  unreadPassportModelIds,
} from "@/lib/fair-client/passport-visit-store";
import { NewStampCard } from "./passport/new-stamp-card";
import { useFairModelInteractions } from "./model-interactions";

// Model page v2: the "Nov pečat" strip, in flow between the hero and the key
// specs. Shown while this model is stamped in the visitor's brand passport
// (server state) and not yet unlocked (passport visit store); "×" hides it for
// the session. The slot opens and closes its height so nothing jumps.

const DISMISS_PREFIX = "scanme:fair-new-stamp-dismissed:";
const CLOSE_MS = 260;

function subscribe(onChange: () => void) {
  const onStorage = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(FAIR_PASSPORT_VISIT_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(FAIR_PASSPORT_VISIT_CHANGE_EVENT, onChange);
  };
}

function sessionDismissed(modelId: string) {
  try {
    return window.sessionStorage.getItem(DISMISS_PREFIX + modelId) === "1";
  } catch {
    return false;
  }
}

export function ModelNewStamp({ eventSlug, modelSlug }: { eventSlug: string; modelSlug: string }) {
  const { model, modelState } = useFairModelInteractions();
  const passport = modelState.status === "ready" ? modelState.value.passport : null;
  const stamped = Boolean(passport?.stampedModelIds.includes(model.id));
  const unread = useSyncExternalStore(
    subscribe,
    () =>
      stamped && passport
        ? unreadPassportModelIds(window.localStorage, model.eventId, passport.passportId, [model.id]).length > 0
        : false,
    () => false,
  );
  // Nothing renders before the client model state loads, so reading session
  // storage here cannot cause a hydration mismatch.
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && sessionDismissed(model.id));
  const [closing, setClosing] = useState(false);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(DISMISS_PREFIX + model.id, "1");
    } catch {
      // Private mode: hidden for this page view only.
    }
    setClosing(true);
    window.setTimeout(() => setDismissed(true), CLOSE_MS);
  }, [model.id]);

  if (!stamped || !unread || dismissed) return null;
  return (
    <div className="fair-new-stamp-slot" data-closing={closing || undefined}>
      <div className="fair-new-stamp-slot__inner">
        <NewStampCard
          layout="strip"
          brandName={model.brandName}
          brandSlug={fairPassportBrandSlug(model.brandName)}
          modelSlug={modelSlug}
          eventSlug={eventSlug}
          onDismiss={dismiss}
        />
      </div>
    </div>
  );
}
