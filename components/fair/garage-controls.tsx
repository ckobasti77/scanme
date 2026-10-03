"use client";

import { CarFront } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import {
  addFairGarageModel,
  getFairGarageModels,
  hasFairGarageModel,
  readFairGarage,
  removeFairGarageModel,
  writeFairGarage,
  type FairGarageLastKnownModel,
} from "@/lib/fair-client/garage-store";
import { fmt } from "@/lib/i18n";

const FAIR_GARAGE_CHANGE_EVENT = "scanme:fair-garage-change";

function subscribe(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === "scanme:fair-garage" || event.key === null) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(FAIR_GARAGE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(FAIR_GARAGE_CHANGE_EVENT, onStoreChange);
  };
}

function getGarageCount(eventId: string) {
  return getFairGarageModels(readFairGarage(window.localStorage).document, eventId).length;
}

function hasModel(eventId: string, modelId: string) {
  return hasFairGarageModel(readFairGarage(window.localStorage).document, eventId, modelId);
}

export function GarageBadge({
  eventId,
  ariaTemplate,
}: {
  eventId: string;
  ariaTemplate: string;
}) {
  const count = useSyncExternalStore(
    subscribe,
    () => getGarageCount(eventId),
    () => 0,
  );

  return (
    <span
      key={count}
      className="fair-garage-badge"
      aria-label={fmt(ariaTemplate, { count })}
    >
      {count}
    </span>
  );
}

export function GarageSaveButton({
  eventId,
  modelId,
  lastKnown,
  saveLabel,
  savedLabel,
  errorLabel,
}: {
  eventId: string;
  modelId: string;
  lastKnown: FairGarageLastKnownModel;
  saveLabel: string;
  savedLabel: string;
  errorLabel: string;
}) {
  const [writeFailed, setWriteFailed] = useState(false);
  const saved = useSyncExternalStore(
    subscribe,
    () => hasModel(eventId, modelId),
    () => false,
  );

  function toggleSaved() {
    const current = readFairGarage(window.localStorage);
    const next = saved
      ? removeFairGarageModel(current.document, eventId, modelId)
      : addFairGarageModel(current.document, { eventId, modelId, lastKnown });
    const result = writeFairGarage(window.localStorage, next);
    setWriteFailed(!result.ok);
    if (result.ok) window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT));
  }

  return (
    <div className="fair-save-bar">
      <button
        type="button"
        aria-pressed={saved}
        onClick={toggleSaved}
        className="fair-save-button"
      >
        <CarFront aria-hidden="true" />
        <span>{saved ? savedLabel : saveLabel}</span>
      </button>
      {writeFailed ? (
        <p className="fair-save-error" role="alert">
          {errorLabel}
        </p>
      ) : null}
    </div>
  );
}
