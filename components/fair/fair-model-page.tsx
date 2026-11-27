import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { FairModelSlider } from "./gallery/model-slider";
import { fairModelGallery } from "@/lib/fair-gallery";
import { fairSalonEvent } from "@/lib/fair-salon";
import { ExternalLink, MapPin } from "lucide-react";
import type {
  FairFixtureMode,
  FairPhotoPresentation,
  FairPublicModelFixture,
} from "@/lib/fair-client/model-fixtures";
import { fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fmt, type FairModelDict } from "@/lib/i18n";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { FAIR_PRIVACY_PATH } from "@/lib/fair-contract";
import type { FairModelInteractions, FairModelStand } from "@/lib/fair-server/model-page";
import type { FairCompareOption } from "@/lib/fair-server/brand-compare";
import { FairEventShell } from "./event-shell";
import { GarageSaveButton } from "./garage-controls";
import { ModelActionsCheckpoint } from "./model-actions-checkpoint";
import { ModelCompareAction } from "./model-compare-action";
import { FairModelInteractionsProvider } from "./model-interactions";
import { fairModelHasTractionBattery, fairModelKeySpecs, fairModelSpecGroups } from "./model-key-specs";
import { ModelNewStamp } from "./model-new-stamp";
import { ModelSpecsCard } from "./model-specs-card";
import { SurveyChatHead } from "./survey/survey-chat-head";
import { ModelName } from "./model-name";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import { fairModelPriceLabel, fairModelPriceValue } from "@/lib/fair-client/model-price";

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
  compareOptions = [],
  brandHref = null,
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
  /** Other published models of the same brand ("Uporedi"); empty hides the button. */
  compareOptions?: FairCompareOption[];
  /** Brand page of this model's brand; null (no brand page) keeps the plain-text brand name. */
  brandHref?: string | null;
  /** Admin DEV tools (components/fair/admin): null for every visitor. */
  adminTools?: ReactNode;
}) {
  const amf = model.eventSlug === "auto-moto-fest-2026";
  // Auto Expo (27. 11.): the AMF model page layout in the Auto Expo colours, a photo slider as the hero.
  const salon = fairSalonEvent(model.eventSlug) !== null;
  const amfLayout = amf || salon;
  const gallery = fairModelGallery(model.eventSlug, model.modelSlug);
  const specs = model.specificationGroups.flatMap((group) => group.items);
  const keySpecs = fairModelKeySpecs(specs, amfLayout);
  const drivetrainTitle = amfLayout && !fairModelHasTractionBattery(specs) ? dict.specsGroupEngine : dict.specsGroupDrivetrain;
  const specGroups = fairModelSpecGroups(model.specificationGroups, {
    drivetrain: drivetrainTitle,
    performance: dict.specsGroupPerformance,
    fallback: amfLayout ? drivetrainTitle : undefined,
  });
  const testDriveFormAvailable = !interactions || interactions.leadForms.testDrive?.state === "open";
  const interestActions = model.capabilities.canSubmitInterest
    ? [{ kind: "interest" as const, label: dict.submitInterest }]
    : [];
  const actions = [
    // Auto Expo: the test drive first, stacked full width (fair-event.css).
    ...(salon ? [] : interestActions),
    ...(model.capabilities.canRequestTestDrive
      ? [
          {
            kind: "testDrive" as const,
            label: dict.requestTestDrive,
            highlighted: testDriveFormAvailable,
            shineAfterBadge: Boolean(model.highlight),
          },
        ]
      : []),
    ...(salon ? interestActions : []),
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

  // Scrim, stand chip, badge, name and price: over the photo, or over the slider (Auto Expo).
  const heroOverlay = (
    <>
      <div className="fair-model-hero__scrim" aria-hidden="true" />
      {stand?.href ? (
        <Link
          className="fair-model-stand"
          href={stand.href}
          aria-label={fmt(dict.standChipAria, { stand: stand.text })}
        >
          <MapPin aria-hidden="true" />
          {stand.text}
        </Link>
      ) : stand ? (
        <span className="fair-model-stand">
          <MapPin aria-hidden="true" />
          {stand.text}
        </span>
      ) : null}
      {model.highlight ? (
        <div className="fair-model-highlight">
          <span className="fair-model-highlight__shine" aria-hidden="true" />
          <span className="fair-model-highlight__label">
            {dict.modelHighlights[model.highlight]}
          </span>
        </div>
      ) : null}
      <div className="fair-model-identity">
        <div className="fair-model-identity__name">
          {brandHref ? (
            <Link prefetch={false} href={brandHref}>
              {model.brandName}
            </Link>
          ) : (
            <span>{model.brandName}</span>
          )}
          <ModelName>{model.displayName}</ModelName>
          {model.variant ? <p>{model.variant}</p> : null}
        </div>
        <p className="fair-model-price">
          <small>{fairModelPriceLabel(model.eventSlug, model.brandName, dict)}</small>
          <span>{fairModelPriceValue(model.priceText, dict)}</span>
          {model.priceSecondaryText ? <small className="fair-model-price__secondary">{model.priceSecondaryText}</small> : null}
        </p>
      </div>
      <SurveyChatHead />
    </>
  );

  // Auto Expo (27. 11.): every action fits one phone screen — Probna vožnja, Zainteresovan sam,
  // the rating, then garage | compare; the exhibitor link goes below.
  const standLayout = fairSalonEvent(model.eventSlug) !== null;
  const externalLink = model.externalUrl ? (
    <a className="fair-model-external" href={model.externalUrl} target="_blank" rel="noopener noreferrer">
      {dict.externalModelLink}
      <ExternalLink aria-hidden="true" />
    </a>
  ) : null;
  const garageSave = (
    <GarageSaveButton
      eventId={model.eventId}
      modelId={model.id}
      saveLabel={dict.saveToGarage}
      savedLabel={dict.garageSavedState}
      openGarageLabel={dict.openGarage}
      garageHref={`/sajam/${model.eventSlug}/garaza`}
      errorLabel={dict.garageStorageError}
      aside={
        compareOptions.length > 0 ? (
          <ModelCompareAction
            eventSlug={model.eventSlug}
            modelSlug={model.modelSlug}
            options={compareOptions}
            dict={dict}
          />
        ) : null
      }
      lastKnown={{
        eventSlug: model.eventSlug,
        modelSlug: model.modelSlug,
        brandName: model.brandName,
        displayName: model.displayName,
        priceText: model.priceText,
        ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}),
      }}
    />
  );

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
        {gallery ? (
          <section className="fair-model-hero fair-model-hero--gallery" data-presentation={model.photoPresentation}>
            <FairModelSlider gallery={gallery} modelName={model.displayName}>
              {heroOverlay}
            </FairModelSlider>
          </section>
        ) : (
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
                unoptimized={fairPhotoUnoptimized(model.photoUrl)}
                className="fair-model-hero__image"
                style={fairVehiclePhotoStyle(model.photoUrl)}
              />
            ) : (
              <div className="fair-model-hero__tonal-mark" aria-hidden="true">
                {model.brandName.slice(0, 1)}
              </div>
            )}
            {heroOverlay}
          </section>
        )}

        <ModelNewStamp eventSlug={model.eventSlug} modelSlug={model.modelSlug} />

        <ModelSpecsCard
          uniformValues={amfLayout}
          keySpecs={keySpecs}
          groups={specGroups}
          description={model.description || undefined}
          defaultOpen={selection.mode === "free"}
          dict={dict}
        />

        {standLayout ? null : externalLink}

        <ModelActionsCheckpoint
          audience={
            model.capabilities.hasAudienceQuestions
              ? { eyebrow: dict.audienceCardEyebrow, question: audienceTeaser ?? dict.audienceBody, href: audienceHref }
              : undefined
          }
          actions={actions}
          ratingMode={model.capabilities.ratingMode}
          dict={dict}
          afterActions={standLayout ? garageSave : undefined}
        />

        {standLayout ? externalLink : garageSave}
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
