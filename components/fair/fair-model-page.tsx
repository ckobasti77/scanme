import Image from "next/image";
import Link from "next/link";
import {
  Gauge,
  Settings2,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  FairFixtureMode,
  FairPhotoPresentation,
  FairPublicModelFixture,
} from "@/lib/fair-client/model-fixtures";
import { fmt, type FairModelDict } from "@/lib/i18n";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { AnimatedModelDisclosure } from "./animated-model-disclosure";
import { FairEventShell } from "./event-shell";
import { GarageSaveButton } from "./garage-controls";
import { ModelActionsCheckpoint } from "./model-actions-checkpoint";

const specificationIcons: Record<string, LucideIcon> = {
  power: Zap,
  torque: Settings2,
  acceleration: Timer,
  speed: Gauge,
};

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
}: {
  model: FairPublicModelFixture;
  dict: FairModelDict;
  routePath: string;
  selection: FixtureSelection;
  showDevPanel: boolean;
}) {
  const highlights = model.specificationGroups
    .flatMap((group) => group.items)
    .filter((item) => item.isHighlight)
    .slice(0, 4);
  const actions = [
    ...(model.capabilities.ratingMode !== "none"
      ? [{ kind: "rating" as const, label: dict.rateModel }]
      : []),
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
  const audienceHref = `${routePath}/glas-publike?${audienceSearch.toString()}`;

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
      />

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
          <div className="fair-model-identity">
            <span>{model.brandName}</span>
            <h1>{model.displayName}</h1>
            <p>{model.priceText}</p>
          </div>
        </section>

        <section className="fair-specification-grid" aria-label={dict.allSpecifications}>
          {highlights.map((item) => {
            const Icon = specificationIcons[item.icon] ?? Gauge;
            return (
              <div key={item.id} className="fair-specification">
                <Icon aria-hidden="true" />
                <span>
                  <strong>{item.value}</strong>
                  <small>{item.shortLabel}</small>
                </span>
              </div>
            );
          })}
        </section>

        <AnimatedModelDisclosure label={dict.allSpecifications}>
            {model.specificationGroups.map((group) => (
              <section key={group.id}>
                <h2>{group.label}</h2>
                <dl>
                  {group.items.map((item) => (
                    <div key={item.id}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            {model.description ? <p>{model.description}</p> : null}
        </AnimatedModelDisclosure>

        <ModelActionsCheckpoint
          audience={
            model.capabilities.hasAudienceQuestions
              ? { title: dict.audienceTitle, body: dict.audienceBody, href: audienceHref }
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
          savedLabel={dict.savedToGarage}
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

      <footer className="fair-footer">
        <span>{dict.poweredBy}</span>
        <Link
          href={showDevPanel ? routePath : `${routePath}?dev=1#fair-dev`}
          scroll={false}
          className="fair-dev-entry"
        >
          {dict.devLink}
        </Link>
      </footer>

      {showDevPanel ? (
        <FairDevFixtureSwitcher routePath={routePath} selection={selection} dict={dict} />
      ) : null}
    </div>
  );
}
