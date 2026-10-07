"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CarFront, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  FAIR_GARAGE_CHANGE_EVENT,
  FAIR_GARAGE_MODEL_CHANGE_EVENT,
  createEmptyFairGarageDocument,
  readFairGarage,
  type FairGarageDocument,
} from "@/lib/fair-client/garage-store";
import {
  fairGarageEventId,
  fairGarageEventTitle,
  fairGarageItemsForEvent,
  fairGarageModelView,
  fetchFairGarageModels,
  type FairGarageEventView,
  type FairGarageModelView,
} from "@/lib/fair-client/garage-view";
import { fairEventThemeClass } from "@/lib/fair-theme";
import type { FairGarageDict, FairModelDict } from "@/lib/i18n/types";
import { FairEventShell } from "../event-shell";
import styles from "./fair-garage.module.css";

type ComparisonState = "loading" | "ready" | "error";

function modelPhoto(model: FairGarageModelView, dict: FairGarageDict) {
  return (
    <div className={styles.comparisonPhoto}>
      {model.photoUrl ? (
        <Image
          fill
          sizes="(max-width: 640px) 46vw, 350px"
          src={model.photoUrl}
          alt={dict.modelPhotoAlt
            .replace("{brand}", model.brandName)
            .replace("{model}", model.displayName)}
        />
      ) : (
        <CarFront aria-hidden="true" />
      )}
    </div>
  );
}

export function FairGarageComparison({
  routeEventSlug,
  event,
  modelIds,
  dict,
  shellDict,
}: {
  routeEventSlug: string;
  event: FairGarageEventView;
  modelIds: string[];
  dict: FairGarageDict;
  shellDict: FairModelDict;
}) {
  const [document, setDocument] = useState<FairGarageDocument>(() =>
    createEmptyFairGarageDocument(),
  );
  const [live, setLive] = useState<Map<string, FairGarageModelView["live"]>>(
    new Map(),
  );
  const [state, setState] = useState<ComparisonState>(
    modelIds.length === 2 ? "loading" : "ready",
  );

  useEffect(() => {
    const refresh = () => setDocument(readFairGarage(window.localStorage).document);
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(FAIR_GARAGE_CHANGE_EVENT, refresh);
    window.addEventListener(FAIR_GARAGE_MODEL_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(FAIR_GARAGE_CHANGE_EVENT, refresh);
      window.removeEventListener(FAIR_GARAGE_MODEL_CHANGE_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (modelIds.length !== 2) return;
    let cancelled = false;
    fetchFairGarageModels(modelIds)
      .then((models) => {
        if (cancelled) return;
        setLive(new Map(models.map((model) => [model.id, model])));
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [modelIds]);

  const models = useMemo(() => {
    const saved = fairGarageItemsForEvent(document, event);
    return modelIds
      .map((id) => {
        const item = saved.find((candidate) => candidate.modelId === id);
        if (!item) return null;
        return fairGarageModelView(item, live.get(id), event.publicSlug);
      })
      .filter((model): model is FairGarageModelView => model !== null);
  }, [document, event, live, modelIds]);

  const specificationRows = useMemo(() => {
    if (models.length !== 2 || !models.every((model) => model.live)) return [];
    const rows: Array<{
      key: string;
      group: string;
      label: string;
      values: [string, string];
    }> = [];
    const order: Array<{ key: string; group: string; label: string }> = [];
    const known = new Set<string>();
    for (const model of models) {
      for (const group of model.live!.specificationGroups) {
        for (const item of group.items) {
          const key = `${group.label}\u0000${item.label}`;
          if (known.has(key)) continue;
          known.add(key);
          order.push({ key, group: group.label, label: item.label });
        }
      }
    }
    for (const item of order) {
      const values = models.map((model) => {
        for (const group of model.live!.specificationGroups) {
          const match = group.items.find(
            (candidate) =>
              group.label === item.group && candidate.label === item.label,
          );
          if (match) return match.value;
        }
        return dict.noSpecification;
      }) as [string, string];
      rows.push({ ...item, values });
    }
    return rows;
  }, [dict.noSpecification, models]);

  const valid = modelIds.length === 2 && models.length === 2;

  return (
    <div className={`fair-event ${fairEventThemeClass(routeEventSlug)} ${styles.comparisonPage}`} data-reveal="off">
      <FairEventShell
        eventId={fairGarageEventId(event)}
        eventSlug={routeEventSlug}
        eventTitle={dict.umbrellaTitle}
        eventName={fairGarageEventTitle(event)}
        dict={shellDict}
        current="garage"
      />
      <div className={styles.comparisonHeader}>
        <div>
          <Link href={`/sajam/${routeEventSlug}/garaza`}>
            <ArrowLeft aria-hidden="true" />
            {dict.comparisonBack}
          </Link>
          <span>{fairGarageEventTitle(event)}</span>
        </div>
      </div>
      <main className={styles.comparisonMain}>
        <h1>{dict.comparisonTitle}</h1>

        {state === "loading" && models.length < 2 ? (
          <div className={styles.comparisonLoading} aria-hidden="true">
            <span />
            <span />
          </div>
        ) : null}

        {state !== "loading" && !valid ? (
          <section className={styles.comparisonMissing}>
            <CarFront aria-hidden="true" />
            <h2>{dict.comparisonMissingTitle}</h2>
            <p>{dict.comparisonMissingBody}</p>
            <Link href={`/sajam/${routeEventSlug}/garaza`}>{dict.comparisonBack}</Link>
          </section>
        ) : null}

        {valid ? (
          <>
            {state === "error" ? (
              <div className={styles.comparisonOffline} role="status">
                <WifiOff aria-hidden="true" />
                {dict.comparisonUnavailable}
              </div>
            ) : null}
            <section className={styles.comparisonModels} aria-label={dict.comparisonTitle}>
              {models.map((model) => (
                <article key={model.id}>
                  {modelPhoto(model, dict)}
                  <span>{model.brandName}</span>
                  <h2>{model.displayName}</h2>
                  {model.variant ? <p>{model.variant}</p> : null}
                  <strong>{model.priceText}</strong>
                  <Link href={`/sajam/${model.eventSlug}/model/${model.modelSlug}`}>
                    {dict.viewModel}
                  </Link>
                </article>
              ))}
            </section>

            {specificationRows.length > 0 ? (
              <section className={styles.specComparison}>
                <h2>{dict.comparisonSpecifications}</h2>
                <div className={styles.specHeader} aria-hidden="true">
                  <span />
                  {models.map((model) => (
                    <strong key={model.id}>{model.displayName}</strong>
                  ))}
                </div>
                {specificationRows.map((row, index) => {
                  const previousGroup = specificationRows[index - 1]?.group;
                  return (
                    <div key={row.key} className={styles.specRow}>
                      {row.group !== previousGroup ? (
                        <h3>{row.group}</h3>
                      ) : null}
                      <span>{row.label}</span>
                      <strong>{row.values[0]}</strong>
                      <strong>{row.values[1]}</strong>
                    </div>
                  );
                })}
              </section>
            ) : state === "loading" ? (
              <p className={styles.comparisonUnavailable} role="status">
                {dict.comparisonLoadingSpecifications}
              </p>
            ) : state === "ready" ? (
              <p className={styles.comparisonUnavailable}>
                {dict.comparisonUnavailable}
              </p>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
