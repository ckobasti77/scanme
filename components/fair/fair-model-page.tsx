import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type {
  FairFixtureMode,
  FairPhotoPresentation,
  FairPublicModelFixture,
} from "@/lib/fair-client/model-fixtures";
import { fmt, type FairModelDict } from "@/lib/i18n";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { FAIR_PRIVACY_PATH } from "@/lib/fair-contract";
import type { FairModelInteractions, FairModelStand } from "@/lib/fair-server/model-page";
import { FairEventShell } from "./event-shell";
import { GarageSaveButton } from "./garage-controls";
import { ModelActionsCheckpoint } from "./model-actions-checkpoint";
import { FairModelInteractionsProvider } from "./model-interactions";
import { fairModelKeySpecs, fairModelSpecGroups } from "./model-key-specs";
import { ModelNewStamp } from "./model-new-stamp";
import { ModelSpecsCard } from "./model-specs-card";
import { SurveyChatHead } from "./survey/survey-chat-head";

/** "Cena na upit" / empty → "na upit"; a leading "Cena " is dropped (the block already says Cena). */
function priceValue(priceText: string, dict: FairModelDict) {
  const text = priceText.trim();
  if (!text || /^(cena\s+)?na upit$/i.test(text)) return dict.priceOnRequest;
  return text.replace(/^cena\s+/i, "");
}

type FixtureSelection = {
  mode: FairFixtureMode;
  withPhoto: boolean;
  alignment: FairPhotoPresentation;
};

function devHref(
  routePath: string,
  current: FixtureSelection,
  update: Partial<FixtureSelection>,
) {
  const next = { ...current, ...update };
  const search = new URLSearchParams({
    dev: "1",
    mode: next.mode,
    photo: next.withPhoto ? "1" : "0",
    align: next.alignment,
  });
  return `${routePath}?${search.toString()}#fair-dev`;
}

function DevOption({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "true" : undefined}>
      {children}
    </Link>
  );
}

function FairDevFixtureSwitcher({
  routePath,
  selection,
  dict,
}: {
  routePath: string;
  selection: FixtureSelection;
  dict: FairModelDict;
}) {
  return (
    <aside id="fair-dev" className="fair-dev-panel" aria-label={dict.devPanelTitle}>
      <h2>{dict.devPanelTitle}</h2>
      <div className="fair-dev-panel__group">
        <strong>{dict.devModeLabel}</strong>
        <div>
          <DevOption
            href={devHref(routePath, selection, { mode: "free" })}
            active={selection.mode === "free"}
          >
            {dict.fixtureFree}
          </DevOption>
          <DevOption
            href={devHref(routePath, selection, { mode: "starter" })}
            active={selection.mode === "starter"}
          >
            {dict.fixtureStarter}
          </DevOption>
          <DevOption
            href={devHref(routePath, selection, { mode: "advanced" })}
            active={selection.mode === "advanced"}
          >
            {dict.fixtureAdvanced}
          </DevOption>
        </div>
      </div>
      <div className="fair-dev-panel__group">
        <strong>{dict.devPhotoLabel}</strong>
        <div>
          <DevOption
            href={devHref(routePath, selection, { withPhoto: true })}
            active={selection.withPhoto}
          >
            {dict.fixtureWithPhoto}
          </DevOption>
          <DevOption
            href={devHref(routePath, selection, { withPhoto: false })}
            active={!selection.withPhoto}
          >
            {dict.fixtureWithoutPhoto}
          </DevOption>
        </div>
      </div>
      <div className="fair-dev-panel__group">
        <strong>{dict.devAlignmentLabel}</strong>
        <div>
          <DevOption
            href={devHref(routePath, selection, { alignment: "left" })}
            active={selection.alignment === "left"}
          >
            {dict.alignmentLeft}
          </DevOption>
          <DevOption
            href={devHref(routePath, selection, { alignment: "right" })}
            active={selection.alignment === "right"}
          >
            {dict.alignmentRight}
          </DevOption>
          <DevOption
            href={devHref(routePath, selection, { alignment: "bottom" })}
            active={selection.alignment === "bottom"}
          >
            {dict.alignmentBottom}
          </DevOption>
        </div>
      </div>
    </aside>
  );
}

export function FairModelPage({
  model,
  dict,
  routePath,
  selection,
  showDevPanel,
  interactions,
  stand,
  audienceTeaser,
  openSurvey,
  adminTools,
}: {
  model: FairPublicModelFixture;
  dict: FairModelDict;
  routePath: string;
  selection: FixtureSelection;
  showDevPanel: boolean;
  /** Server-read survey and lead forms of a live model; null for DEV fixtures. */
  interactions: FairModelInteractions | null;
  /** Stand chip on the hero ("Štand 9 · Hala" → map focused on it); null hides it. */
  stand: FairModelStand | null;
  /** Today's first Glas publike question, shown on its card. */
  audienceTeaser: string | null;
  /** `/anketa` deep link: open the survey sheet when the model offers one. */
  openSurvey: boolean;
  /** Admin DEV tools (components/fair/admin): null for every visitor. */
  adminTools?: ReactNode;
}) {
  const keySpecs = fairModelKeySpecs(model.specificationGroups.flatMap((group) => group.items));
  const specGroups = fairModelSpecGroups(model.specificationGroups, {
    drivetrain: dict.specsGroupDrivetrain,
    performance: dict.specsGroupPerformance,
  });
  const actions = [
    ...(model.capabilities.canSubmitInterest
      ? [{ kind: "interest" as const, label: dict.submitInterest }]
      : []),
    ...(model.capabilities.canRequestTestDrive
      ? [{ kind: "testDrive" as const, label: dict.requestTestDrive }]
      : []),
  ];
  const audienceSearch = new URLSearchParams({
    mode: selection.mode,
    photo: selection.withPhoto ? "1" : "0",
    align: selection.alignment,
    threshold: "public",
    result: "success",
    questions: selection.mode === "starter" ? "1" : "5",
  });
  const audienceHref = interactions
    ? `${routePath}/glas-publike`
    : `${routePath}/glas-publike?${audienceSearch.toString()}`;

  return (
    <div
      className={`fair-event fair-model-page ${fairEventThemeClass(model.eventSlug)}`}
      data-package={selection.mode}
      data-reveal="off"
    >
      <FairEventShell
        eventId={model.eventId}
        eventSlug={model.eventSlug}
        eventTitle={model.eventTitle}
        eventName={model.eventName}
        dict={dict}
        adminTools={adminTools}
      />

      <FairModelInteractionsProvider
        dict={dict}
        model={{
          id: model.id,
          eventId: model.eventId,
          participationId: model.participationId,
          brandName: model.brandName,
          displayName: model.displayName,
          exhibitorName: model.exhibitorName,
        }}
        interactions={interactions}
        routePath={routePath}
        openSurvey={openSurvey}
      >
      <main className="fair-model-main">
        <section
          className={`fair-model-hero${model.photoUrl ? "" : " fair-model-hero--no-photo"}`}
          data-presentation={model.photoPresentation}
        >
          {model.photoUrl ? (
            <Image
              src={model.photoUrl}
              alt={fmt(dict.modelPhotoAlt, { model: model.displayName })}
              fill
              priority
              sizes="(max-width: 767px) 100vw, 560px"
              className="fair-model-hero__image"
            />
          ) : (
            <div className="fair-model-hero__tonal-mark" aria-hidden="true">
              {model.brandName.slice(0, 1)}
            </div>
          )}
          <div className="fair-model-hero__scrim" aria-hidden="true" />
          {stand ? (
            <Link
              className="fair-model-stand"
              href={stand.href}
              aria-label={fmt(dict.standChipAria, { stand: stand.text })}
            >
              <MapPin aria-hidden="true" />
              {stand.text}
            </Link>
          ) : null}
          <div className="fair-model-identity">
            <div className="fair-model-identity__name">
              <span>{model.brandName}</span>
              <h1>{model.displayName}</h1>
              {model.variant ? <p>{model.variant}</p> : null}
            </div>
            <p className="fair-model-price">
              <small>{dict.priceLabel}</small>
              <span>{priceValue(model.priceText, dict)}</span>
            </p>
          </div>
          <SurveyChatHead />
        </section>

        <ModelNewStamp eventSlug={model.eventSlug} modelSlug={model.modelSlug} />

        <ModelSpecsCard
          keySpecs={keySpecs}
          groups={specGroups}
          description={model.description || undefined}
          defaultOpen={selection.mode === "free"}
          dict={dict}
        />

        <ModelActionsCheckpoint
          audience={
            model.capabilities.hasAudienceQuestions
              ? { eyebrow: dict.audienceCardEyebrow, question: audienceTeaser ?? dict.audienceBody, href: audienceHref }
              : undefined
          }
          actions={actions}
          ratingMode={model.capabilities.ratingMode}
          dict={dict}
        />

        <GarageSaveButton
          eventId={model.eventId}
          modelId={model.id}
          saveLabel={dict.saveToGarage}
          savedLabel={dict.garageSavedState}
          openGarageLabel={dict.openGarage}
          garageHref={`/sajam/${model.eventSlug}/garaza`}
          errorLabel={dict.garageStorageError}
          lastKnown={{
            eventSlug: model.eventSlug,
            modelSlug: model.modelSlug,
            brandName: model.brandName,
            displayName: model.displayName,
            priceText: model.priceText,
            ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}),
          }}
        />
      </main>
      </FairModelInteractionsProvider>

      <footer className="fair-footer">
        <span>{dict.poweredBy}</span>
        <Link prefetch={false} href={FAIR_PRIVACY_PATH} className="fair-dev-entry">{dict.privacyLink}</Link>
      </footer>

      {showDevPanel ? (
        <FairDevFixtureSwitcher routePath={routePath} selection={selection} dict={dict} />
      ) : null}
    </div>
  );
}
