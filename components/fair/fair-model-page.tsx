import Image from "next/image";
import Link from "next/link";
import {
  BatteryCharging,
  Gauge,
  PlugZap,
  Route,
  Settings2,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  FairFixtureMode,
  FairPhotoPresentation,
} from "@/lib/fair-client/model-fixtures";
import { fmt, type FairModelDict } from "@/lib/i18n";
import { AnimatedModelDisclosure } from "./animated-model-disclosure";
import { FairEventShell } from "./event-shell";
import { GarageSaveButton } from "./garage-controls";
import { ModelActionsCheckpoint } from "./model-actions-checkpoint";
import type {
  FairModelInteractions,
  FairModelLeadForms,
  FairModelPageModel,
  FairModelSpecificationIcon,
} from "./model-view";

const specificationIcons: Record<FairModelSpecificationIcon, LucideIcon> = {
  power: Zap,
  torque: Settings2,
  acceleration: Timer,
  speed: Gauge,
  range: Route,
  battery: BatteryCharging,
  charging: PlugZap,
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

/**
 * N6 (F3): one page for a real published model (`source: "convex"`, server
 * capabilities, server-read lead forms) and, in `next dev` only, the design
 * fixture (`fixture` set: package/photo switcher, fixture Glas publike).
 * Only `interactions` that are really connected are shown; a lead button
 * exists only for an `open` form.
 */
export function FairModelPage({
  model,
  dict,
  routePath,
  leadForms,
  interactions,
  fixture,
}: {
  model: FairModelPageModel;
  dict: FairModelDict;
  routePath: string;
  leadForms: FairModelLeadForms;
  interactions: FairModelInteractions;
  /** DEV design demo only. */
  fixture?: { selection: FixtureSelection; showDevPanel: boolean };
}) {
  const ratingMode = interactions.rating ? model.capabilities.ratingMode : "none";
  const actions = [
    ...(ratingMode !== "none"
      ? [{ kind: "rating" as const, label: dict.rateModel }]
      : []),
    ...(leadForms.interest
      ? [{ kind: "interest" as const, label: dict.submitInterest }]
      : []),
    ...(leadForms.testDrive
      ? [{ kind: "testDrive" as const, label: dict.requestTestDrive }]
      : []),
  ];
  const selection = fixture?.selection;
  const audienceSearch = selection
    ? new URLSearchParams({
        mode: selection.mode,
        photo: selection.withPhoto ? "1" : "0",
        align: selection.alignment,
        threshold: "public",
        result: "success",
        questions: selection.mode === "starter" ? "1" : "5",
      })
    : null;
  const audienceHref = `${routePath}/glas-publike${audienceSearch ? `?${audienceSearch.toString()}` : ""}`;
  const showAudience = interactions.audience && model.capabilities.hasAudienceQuestions;
  const hasDetails = model.specificationGroups.length > 0 || Boolean(model.description);

  return (
    <div
      className="fair-event fair-model-page"
      data-package={selection?.mode}
      data-source={model.source}
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
              alt={fmt(model.source === "fixture" ? dict.modelPhotoAlt : dict.modelPhotoAltPublic, { model: model.displayName })}
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

        {model.highlights.length > 0 ? (
          <section className="fair-specification-grid" aria-label={dict.allSpecifications}>
            {model.highlights.map((item, index) => {
              const Icon = item.icon ? specificationIcons[item.icon] : Gauge;
              // N6: real data may have an odd number; the last one then spans the row (no empty cell).
              const spansRow = model.highlights.length % 2 === 1 && index === model.highlights.length - 1;
              return (
                <div key={item.id} className="fair-specification" style={spansRow ? { gridColumn: "1 / -1", borderRight: 0 } : undefined}>
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>{item.value}</strong>
                    <small>{item.shortLabel}</small>
                  </span>
                </div>
              );
            })}
          </section>
        ) : null}

        {hasDetails ? (
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
        ) : null}

        <ModelActionsCheckpoint
          audience={
            showAudience
              ? { title: dict.audienceTitle, body: dict.audienceBody, href: audienceHref }
              : undefined
          }
          actions={actions}
          ratingMode={ratingMode}
          dict={dict}
          lead={{
            eventModelId: model.id,
            modelName: model.displayName,
            exhibitorName: model.exhibitorName,
            forms: leadForms,
          }}
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
        {fixture ? (
          <Link
            href={fixture.showDevPanel ? routePath : `${routePath}?dev=1#fair-dev`}
            scroll={false}
            className="fair-dev-entry"
          >
            {dict.devLink}
          </Link>
        ) : null}
      </footer>

      {fixture?.showDevPanel ? (
        <FairDevFixtureSwitcher routePath={routePath} selection={fixture.selection} dict={dict} />
      ) : null}
    </div>
  );
}
