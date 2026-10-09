"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { FairPassportState } from "@/lib/fair-contract";
import { fairPassportBrandSlug } from "@/lib/fair-passport";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { browserContactStorage, forgetContact } from "@/lib/fair-client/contact-store";
import {
  FAIR_GARAGE_CHANGE_EVENT,
  FAIR_GARAGE_MODEL_CHANGE_EVENT,
  addFairGarageModel,
  readFairGarage,
  writeFairGarage,
} from "@/lib/fair-client/garage-store";
import { FAIR_PASSPORT_VISIT_CHANGE_EVENT, forgetPassportModelsSeen } from "@/lib/fair-client/passport-visit-store";
import { fairSurveyMarkerKey } from "@/lib/fair-client/survey-marker";
import { fmt } from "@/lib/i18n/format";
import type { FairAdminDevDict } from "@/lib/i18n";
import { fairPassportSr } from "@/lib/i18n/sr/fair-passport";
import { NewStampCard } from "../passport/new-stamp-card";
import { PassportFinale } from "../passport/passport-finale";
import { passportBrandSealTexts } from "../passport/passport-seal";

// Admin DEV tools on the public fair pages (JOVAN-DELTA 2026-10-09), 1:1 the
// "Admin (ti)" view of public/prototip/stranica-modela-v2.html. Rendered only
// after the server confirmed an admin session (fair-admin-tools.tsx), so a
// visitor never receives this code. Every server action goes through
// POST /api/fair/admin-dev (admin session + the cookie's visitor hash); the
// rest only touches this browser's own storage.

export type FairAdminPreviewTier = "free" | "starter" | "advanced";

export type FairAdminDevSheetProps = {
  dict: FairAdminDevDict;
  event: { id: string; slug: string; dataSlug: string; title: string };
  model?: { id: string; slug: string; name: string; brandName: string; participationId?: string; tier: FairAdminPreviewTier };
  brandName?: string;
  preview: FairAdminPreviewTier | null;
  visitor: string;
  database: string;
  build: string;
};

type DevModel = { id: string; slug: string; name: string; brandName: string };
type DevState = { passport: FairPassportState | null; garageModelIds: string[]; questionId: string | null; models?: DevModel[] };
type Overlay = { kind: "finale" } | { kind: "newStamp"; modelSlug: string } | null;

const NEW_STAMP_DISMISS_PREFIX = "scanme:fair-new-stamp-dismissed:";
const RELOAD_MS = 900;

async function adminDev<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/fair/admin-dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const json = (await response.json().catch(() => null)) as { ok: boolean; value?: T; code?: string } | null;
  if (!json?.ok) throw new Error(json?.code ?? String(response.status));
  return json.value as T;
}

const subscribeNothing = () => () => {};

export function FairAdminDevSheet({ dict, event, model, brandName, preview, visitor, database, build }: FairAdminDevSheetProps) {
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [state, setState] = useState<DevState | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Pickers (9 Oct 2026): passport pages have no model in context, so the
  // sheet lets the admin choose the brand (overview) and the models itself.
  const [pickedPassportId, setPickedPassportId] = useState<string | null>(null);
  const [pickedStampModelId, setPickedStampModelId] = useState<string | null>(null);
  const [pickedScanModelId, setPickedScanModelId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const say = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1700);
  }, []);

  const loadState = useCallback(async () => {
    try {
      setState(await adminDev<DevState>({ action: "state", eventId: event.id, ...(model ? { eventModelId: model.id } : {}) }));
    } catch {
      setState({ passport: null, garageModelIds: [], questionId: null });
    }
  }, [event.id, model]);

  const openSheet = () => {
    setOpen(true);
    void loadState();
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const close = () => {
    setOpen(false);
    tabRef.current?.focus();
  };

  const catalog = state?.passport?.catalog ?? [];
  const contextBrand = model?.brandName ?? brandName;
  // A model or brand page shows its own brand; the /pasosi overview offers every published passport.
  const pickBrand = !contextBrand;
  const catalogEntry = (pickBrand
    ? catalog.find((entry) => entry.passportId === pickedPassportId) ?? catalog[0]
    : catalog.find((entry) => entry.brandName === contextBrand)) ?? null;
  const passportBrand = catalogEntry?.brandName ?? contextBrand;
  const progress = catalogEntry ? state?.passport?.progress.find((row) => row.passportId === catalogEntry.passportId) ?? null : null;
  const brandLabel = catalogEntry?.brandName.replace(/^TEST\s+/i, "") ?? "";
  const members = catalogEntry?.models ?? [];
  const memberName = (member: (typeof members)[number]) => (member.variant ? `${member.displayName} ${member.variant}` : member.displayName);
  const stampTarget = members.find((member) => member.eventModelId === pickedStampModelId)
    ?? members.find((member) => member.eventModelId === model?.id)
    ?? members[0]
    ?? null;
  const scanModels: DevModel[] = state?.models ?? (model ? [{ id: model.id, slug: model.slug, name: model.name, brandName: model.brandName }] : []);
  const scanTarget = scanModels.find((row) => row.id === pickedScanModelId) ?? scanModels.find((row) => row.id === model?.id) ?? scanModels[0] ?? null;

  const run = async (work: () => Promise<string | void>, reload = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const message = await work();
      if (message) say(message);
      if (reload) window.setTimeout(() => window.location.reload(), RELOAD_MS);
      else await loadState();
    } catch (error) {
      say(fmt(dict.toastFailed, { code: error instanceof Error ? error.message : "?" }));
    } finally {
      setBusy(false);
    }
  };

  /** Locks the given stamps again (all of this event when omitted): hold-to-unlock and "Nov pečat" return. */
  const forgetSeen = (modelIds?: string[]) => {
    for (const entry of state?.passport?.catalog ?? []) {
      const members = entry.models.map((member) => member.eventModelId);
      const ids = modelIds ? members.filter((id) => modelIds.includes(id)) : members;
      if (!ids.length) continue;
      forgetPassportModelsSeen(window.localStorage, event.id, entry.passportId, ids);
      for (const id of ids) {
        try {
          window.sessionStorage.removeItem(NEW_STAMP_DISMISS_PREFIX + id);
        } catch {
          // Private mode: nothing was stored.
        }
      }
    }
    window.dispatchEvent(new Event(FAIR_PASSPORT_VISIT_CHANGE_EVENT));
  };

  const writeGarage = (update: (eventItems: Parameters<typeof addFairGarageModel>[0]) => Parameters<typeof addFairGarageModel>[0]) => {
    const next = update(readFairGarage(window.localStorage).document);
    writeFairGarage(window.localStorage, next);
    window.dispatchEvent(new Event(FAIR_GARAGE_MODEL_CHANGE_EVENT));
    window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT));
  };

  const clearSurveyMarkers = () => {
    const prefix = fairSurveyMarkerKey(event.id, "");
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  };

  // The preview cookie is set by the server, after the admin check.
  const setPreview = (tier: FairAdminPreviewTier | null) => void run(async () => {
    await adminDev({ action: "preview", tier });
    router.refresh();
    return fmt(dict.previewToast, { tier: tier ? tierName(tier) : fmt(dict.previewRealName, { tier: model ? tierName(model.tier) : "" }) });
  });

  const tierName = (tier: FairAdminPreviewTier) => (tier === "free" ? dict.previewFree : tier === "starter" ? dict.previewStarter : dict.previewAdvanced);
  const view = preview ? tierName(preview) : model ? fmt(dict.previewRealName, { tier: tierName(model.tier) }) : dict.stateNone;
  const themeClass = fairEventThemeClass(event.slug);

  const sheet = (
    <div className={`fair-admin-dev ${open ? "is-open" : ""}`}>
      <button ref={tabRef} type="button" className="fair-admin-dev__tab" aria-label={dict.tabAria} aria-expanded={open} onClick={openSheet}>
        {dict.tab}
      </button>
      <div className="fair-admin-dev__scrim" onClick={close} aria-hidden="true" />
      <div className="fair-admin-dev__sheet" role="dialog" aria-modal="true" aria-label={dict.title} inert={!open} aria-busy={busy}>
        <div className="fair-admin-dev__hd">
          <div className="fair-admin-dev__grab" aria-hidden="true" />
          <div className="fair-admin-dev__row">
            <h3>{dict.title} <i>{dict.chip}</i></h3>
            <button ref={closeRef} type="button" className="fair-admin-dev__x" aria-label={dict.close} onClick={close}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="fair-admin-dev__note">{dict.note}</div>
        </div>
        <div className="fair-admin-dev__bd">
          <section className="fair-admin-dev__sec">
            <h4>{dict.previewTitle}</h4>
            <div className="fair-admin-dev__seg">
              {(["free", "starter", "advanced"] as const).map((tier) => (
                <button key={tier} type="button" aria-pressed={preview === tier} onClick={() => setPreview(tier)}>{tierName(tier)}</button>
              ))}
              <button type="button" aria-pressed={preview === null} onClick={() => setPreview(null)}>{dict.previewReal}</button>
            </div>
          </section>

          {catalogEntry ? (
            <section className="fair-admin-dev__sec">
              <h4>{fmt(dict.passportTitle, { brand: brandLabel })}</h4>
              {pickBrand && catalog.length > 1 ? (
                <label className="fair-admin-dev__pick">
                  <span>{dict.pickBrand}</span>
                  <select value={catalogEntry.passportId} onChange={(changeEvent) => { setPickedPassportId(changeEvent.target.value); setPickedStampModelId(null); }}>
                    {catalog.map((entry) => <option key={entry.passportId} value={entry.passportId}>{entry.brandName.replace(/^TEST\s+/i, "")}</option>)}
                  </select>
                </label>
              ) : null}
              {stampTarget ? (
                <label className="fair-admin-dev__pick">
                  <span>{dict.pickStampModel}</span>
                  <select value={stampTarget.eventModelId} onChange={(changeEvent) => setPickedStampModelId(changeEvent.target.value)}>
                    {members.map((member) => <option key={member.eventModelId} value={member.eventModelId}>{memberName(member)}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="fair-admin-dev__grid">
                {stampTarget ? (
                  <button type="button" className="fair-admin-dev__btn" disabled={busy} onClick={() => void run(async () => {
                    await adminDev({ action: "stamps", eventId: event.id, eventModelIds: [stampTarget.eventModelId] });
                    return fmt(dict.toastStampModel, { model: memberName(stampTarget) });
                  }, true)}>{fmt(dict.stampModel, { model: memberName(stampTarget) })}</button>
                ) : null}
                <button type="button" className="fair-admin-dev__btn" disabled={busy} onClick={() => void run(async () => {
                  await adminDev({ action: "stamps", eventId: event.id, eventModelIds: catalogEntry.models.map((member) => member.eventModelId) });
                  return fmt(dict.toastStampBrand, { brand: brandLabel });
                }, true)}>{fmt(dict.stampBrand, { brand: brandLabel })}</button>
                <button type="button" className="fair-admin-dev__btn" disabled={busy} onClick={() => void run(async () => {
                  forgetSeen(progress?.stampedModelIds ?? []);
                  return dict.toastRelock;
                }, true)}>{dict.relock}</button>
                <button type="button" className="fair-admin-dev__btn" onClick={() => {
                  setOpen(false);
                  setOverlay({ kind: "finale" });
                  say(dict.toastFinale);
                }}>{dict.finale}</button>
                <button type="button" className="fair-admin-dev__btn" onClick={() => {
                  setOpen(false);
                  setOverlay({ kind: "newStamp", modelSlug: stampTarget?.slug ?? "" });
                  say(dict.toastNewStamp);
                }}>{dict.newStamp}</button>
                <button type="button" className="fair-admin-dev__btn is-warn" disabled={busy} onClick={() => void run(async () => {
                  await adminDev({ action: "reset", eventId: event.id, scope: "passport" });
                  forgetSeen();
                  writeGarage((document) => ({ ...document, passportBadges: document.passportBadges.filter((badge) => badge.eventId !== event.id) }));
                  return dict.toastResetPassport;
                }, true)}>{dict.resetPassport}</button>
              </div>
            </section>
          ) : null}

          <section className="fair-admin-dev__sec">
            <h4>{dict.garageTitle}</h4>
            <div className="fair-admin-dev__grid">
              <button type="button" className="fair-admin-dev__btn" disabled={busy || !state?.garageModelIds.length} onClick={() => void run(async () => {
                const ids = state?.garageModelIds ?? [];
                writeGarage((document) => ids.reduce((next, modelId, index) => addFairGarageModel(next, { eventId: event.id, modelId, savedAt: Date.now() + index }), document));
                return fmt(dict.toastGarageFill, { count: ids.length });
              })}>{dict.garageFill}</button>
              <button type="button" className="fair-admin-dev__btn is-warn" disabled={busy} onClick={() => void run(async () => {
                writeGarage((document) => {
                  const events = { ...document.events };
                  delete events[event.id];
                  return { ...document, events };
                });
                return dict.toastGarageEmpty;
              })}>{dict.garageEmpty}</button>
            </div>
          </section>

          <section className="fair-admin-dev__sec">
            <h4>{dict.surveyTitle}</h4>
            <div className="fair-admin-dev__grid">
              {model ? (
                <button type="button" className="fair-admin-dev__btn" onClick={() => void run(async () => {
                  if (model.participationId) window.localStorage.removeItem(fairSurveyMarkerKey(event.id, model.participationId));
                  return dict.toastBubble;
                }, true)}>{dict.bubble}</button>
              ) : null}
              <button type="button" className="fair-admin-dev__btn" disabled={busy} onClick={() => void run(async () => {
                await adminDev({ action: "reset", eventId: event.id, scope: "answers" });
                clearSurveyMarkers();
                return dict.toastClearAnswers;
              }, true)}>{dict.clearAnswers}</button>
              <button type="button" className="fair-admin-dev__btn" onClick={() => {
                forgetContact(browserContactStorage());
                say(dict.toastForgetContact);
              }}>{dict.forgetContact}</button>
              {model ? (
                <button type="button" className="fair-admin-dev__btn" disabled={busy} onClick={() => void run(async () => {
                  if (!state?.questionId) return dict.toastNoQuestion;
                  await adminDev({ action: "openQuestion", questionId: state.questionId });
                  window.setTimeout(() => router.push(`/sajam/${event.slug}/model/${model.slug}/glas-publike`), RELOAD_MS);
                  return dict.toastOpenAudience;
                })}>{dict.openAudience}</button>
              ) : null}
            </div>
          </section>

          {scanTarget ? (
            <section className="fair-admin-dev__sec">
              <h4>{dict.qrTitle}</h4>
              {scanModels.length > 1 ? (
                <label className="fair-admin-dev__pick">
                  <span>{dict.pickScanModel}</span>
                  <select value={scanTarget.id} onChange={(changeEvent) => setPickedScanModelId(changeEvent.target.value)}>
                    {scanModels.map((row) => <option key={row.id} value={row.id}>{row.brandName && !row.name.toLowerCase().startsWith(row.brandName.toLowerCase()) ? `${row.brandName} ${row.name}` : row.name}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="fair-admin-dev__grid">
                <button type="button" className="fair-admin-dev__btn" disabled={busy} onClick={() => void run(async () => {
                  await adminDev({ action: "scan", eventId: event.id, eventModelId: scanTarget.id });
                  forgetSeen([scanTarget.id]);
                  return fmt(dict.toastSimulateScan, { model: scanTarget.name });
                }, true)}>{dict.simulateScan}</button>
                <button type="button" className="fair-admin-dev__btn" onClick={() => {
                  say(dict.toastLinkSticker);
                  router.push(`/admin/dogadjaji/${event.dataSlug}/povezi?model=${encodeURIComponent(scanTarget.id)}`);
                }}>{dict.linkSticker}</button>
              </div>
            </section>
          ) : null}

          <section className="fair-admin-dev__sec">
            <h4>{dict.stateTitle}</h4>
            <div className="fair-admin-dev__info">
              {dict.stateEvent} <b>{event.dataSlug}</b> · {dict.stateBrand} <b>{brandLabel || model?.brandName || dict.stateNone}</b><br />
              {dict.stateModel} <b>{model?.slug ?? scanTarget?.slug ?? dict.stateNone}</b><br />
              {dict.statePackage} <b>{model ? tierName(model.tier) : dict.stateNone}</b> · {dict.stateView} <b>{view}</b><br />
              {dict.stateVisitor} <b>{visitor}</b> · {dict.stateInternal} <b>{dict.stateYes}</b><br />
              {dict.stateDatabase} <b>{database}</b> · {dict.stateBuild} <b>{build}</b>
            </div>
          </section>

          <section className="fair-admin-dev__sec">
            <button type="button" className="fair-admin-dev__btn is-warn is-wide" disabled={busy} onClick={() => {
              if (!window.confirm(dict.resetAllConfirm)) return;
              void run(async () => {
                for (let round = 0; round < 10; round += 1) {
                  const result = await adminDev<{ more: boolean }>({ action: "reset", eventId: event.id, scope: "all" });
                  if (!result.more) break;
                }
                forgetSeen();
                clearSurveyMarkers();
                forgetContact(browserContactStorage());
                writeGarage((document) => {
                  const events = { ...document.events };
                  delete events[event.id];
                  return { ...document, events, passportBadges: document.passportBadges.filter((badge) => badge.eventId !== event.id) };
                });
                return dict.toastResetAll;
              }, true);
            }}>{dict.resetAll}</button>
          </section>
        </div>
      </div>
      <div className={`fair-admin-dev__toast ${toast ? "is-on" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );

  const finale = overlay?.kind === "finale" && catalogEntry ? (
    <div className={`fair-event ${themeClass} fair-admin-dev__overlay`}>
      <PassportFinale
        brand={brandLabel}
        seal={passportBrandSealTexts(themeClass, brandLabel, fairPassportSr)}
        sealLabel={fmt(fairPassportSr.finaleSealAria, { brand: brandLabel, event: event.title })}
        thumbs={catalogEntry.models.map((member) => ({ id: member.eventModelId, name: member.variant ? `${member.displayName} ${member.variant}` : member.displayName }))}
        dict={fairPassportSr}
        onPickFavorite={() => {
          setOverlay(null);
          router.push(`/sajam/${event.slug}/pasosi/${fairPassportBrandSlug(catalogEntry.brandName)}`);
        }}
        onLater={() => setOverlay(null)}
      />
    </div>
  ) : null;

  const newStamp = overlay?.kind === "newStamp" && passportBrand ? (
    <div className={`fair-event ${themeClass} fair-admin-dev__overlay`}>
      <div className="fair-admin-dev__stamp">
        <NewStampCard
          layout="strip"
          brandName={passportBrand}
          brandSlug={fairPassportBrandSlug(passportBrand)}
          modelSlug={overlay.modelSlug}
          eventSlug={event.slug}
          dict={fairPassportSr}
          onDismiss={() => setOverlay(null)}
        />
      </div>
    </div>
  ) : null;

  return mounted ? createPortal(<>{sheet}{finale}{newStamp}</>, document.body) : null;
}
