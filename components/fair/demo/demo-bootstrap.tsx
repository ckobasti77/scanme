"use client";

import { useEffect } from "react";
import { FAIR_DEMO_EVENT, FAIR_DEMO_MODELS, FAIR_DEMO_SLUG } from "@/lib/fair-demo";
import { addFairGarageModel, readFairGarage, writeFairGarage, FAIR_GARAGE_CHANGE_EVENT, FAIR_GARAGE_MODEL_CHANGE_EVENT } from "@/lib/fair-client/garage-store";

export function DemoBootstrap() {
  useEffect(() => {
    try {
      const key = "scanme:amf-demo-initialized:v1";
      if (localStorage.getItem(key)) return;
      let document = readFairGarage(localStorage).document;
      for (const model of FAIR_DEMO_MODELS.slice(1, 3)) document = addFairGarageModel(document, {
        eventId: FAIR_DEMO_EVENT.id, modelId: model.id,
        lastKnown: { eventSlug: FAIR_DEMO_SLUG, modelSlug: model.slug, brandName: model.brandName, displayName: model.displayName, priceText: model.priceText, photoUrl: model.photoUrl },
      });
      if (writeFairGarage(localStorage, document).ok) localStorage.setItem(key, "1");
      window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT));
      window.dispatchEvent(new Event(FAIR_GARAGE_MODEL_CHANGE_EVENT));
    } catch { /* The existing garage shows its storage-unavailable state. */ }
  }, []);
  return null;
}
