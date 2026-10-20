import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FAIR_DEMO_EVENT as event, FAIR_DEMO_SLUG, FAIR_DEMO_MODELS, FAIR_DEMO_PASSPORTS, FAIR_DEMO_PROGRESS, FAIR_DEMO_STUCK, FAIR_DEMO_ROTATION } from "@/lib/fair-demo";
import { fairPublicModelToFixture } from "@/lib/fair-client/model-fixtures";
import { fairPassportBrandSlug } from "@/lib/fair-passport";
import { AUTO_MOTO_FEST_2026_MAP } from "@/lib/fair-map/auto-moto-fest-2026";
import { buildFairMapView } from "@/lib/fair-map/view";
import { FairEventShell } from "@/components/fair/event-shell";
import { FairModelPage } from "@/components/fair/fair-model-page";
import { FairPassportExperience } from "@/components/fair/passport/fair-passport";
import { FairGarage } from "@/components/fair/garage/fair-garage";
import { FairGarageComparison } from "@/components/fair/garage/fair-garage-comparison";
import { AmfTopographicMap } from "@/components/fair/map/amf-topographic-map";
import { AudienceFlow } from "@/components/fair/audience-flow";
import { DemoBootstrap } from "@/components/fair/demo/demo-bootstrap";
import { fairDemoSr as dict } from "@/lib/i18n/sr/fair-demo";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { fairGarageSr } from "@/lib/i18n/sr/fair-garage";
import { fairPassportSr } from "@/lib/i18n/sr/fair-passport";

export const metadata: Metadata = { title: dict.title, robots: { index: false, follow: false } };
const eventView = { publicSlug: FAIR_DEMO_SLUG, dataSlug: FAIR_DEMO_SLUG, event, fallbackId: event.id, fallbackTitle: dict.title, fallbackDates: dict.dates, passportCatalog: FAIR_DEMO_PASSPORTS, sponsoredRotation: { ...FAIR_DEMO_ROTATION, surface: "garage" as const } };
const base = `/sajam/${FAIR_DEMO_SLUG}`;
const demoModelDict = { ...fairModelSr, ...dict.modelCopy };
const demoMapView = buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [], []);

export default async function DemoPage({ params, searchParams }: {
  params: Promise<{ screen?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ screen = [] }, query] = await Promise.all([params, searchParams]);
  const section = screen[0] ?? (query.stand ? "mapa" : "model");
  const model = FAIR_DEMO_MODELS.find((item) => item.slug === screen[1]) ?? (!screen.length ? FAIR_DEMO_MODELS[0] : null);
  const fixture = model ? fairPublicModelToFixture({ model, publicEventSlug: FAIR_DEMO_SLUG, eventName: dict.title, withPhoto: true, photoPresentation: "left" }).model : null;
  let content;
  if (section === "mapa" && screen.length <= 1) content = <>
    <FairEventShell eventId={event.id} eventSlug={FAIR_DEMO_SLUG} eventTitle={fairPassportSr.umbrellaTitle} eventName={dict.title} dict={fairModelSr} current="map" />
    <AmfTopographicMap demo eventSlug={FAIR_DEMO_SLUG} view={demoMapView} rotation={FAIR_DEMO_ROTATION} display={false} passportProgress={FAIR_DEMO_PROGRESS} />
  </>;
  else if (section === "pasosi" && screen.length <= 2) {
    const passport = screen[1] ? FAIR_DEMO_PASSPORTS.find((item) => fairPassportBrandSlug(item.brandName) === screen[1]) : undefined;
    if (screen[1] && !passport) notFound();
    content = <>
      <FairEventShell eventId={event.id} eventSlug={FAIR_DEMO_SLUG} eventTitle={fairPassportSr.umbrellaTitle} eventName={dict.title} dict={fairModelSr} current="passports" />
      <FairPassportExperience event={{ id: event.id, publicSlug: FAIR_DEMO_SLUG, dataSlug: FAIR_DEMO_SLUG, title: event.title, venueName: event.venueName, startsAt: event.startsAt }} catalog={FAIR_DEMO_PASSPORTS} models={FAIR_DEMO_MODELS} selectedPassportId={passport?.passportId} dict={fairPassportSr} simulation={{ progress: FAIR_DEMO_PROGRESS, stuck: FAIR_DEMO_STUCK, version: "offer-v2" }} />
    </>;
  } else if (section === "garaza" && screen.length === 1) content = <FairGarage routeEventSlug={FAIR_DEMO_SLUG} event={eventView} switchEvents={[]} dict={fairGarageSr} shellDict={fairModelSr} />;
  else if (section === "garaza" && screen[1] === "poredjenje" && screen.length === 2) {
    const ids = query.model;
    const demoIds = (Array.isArray(ids) ? ids : ids ? [ids] : []).filter((id) => FAIR_DEMO_MODELS.some((model) => model.id === id));
    content = <FairGarageComparison routeEventSlug={FAIR_DEMO_SLUG} event={eventView} modelIds={demoIds} dict={fairGarageSr} shellDict={fairModelSr} />;
  } else if (section === "model" && model && fixture && screen[2] === "glas-publike" && screen.length === 3) {
    content = <AudienceFlow model={fixture} questions={[{ id: "demo-question", prompt: dict.question, answers: [{ id: "yes", label: dict.yes }, { id: "no", label: dict.no }], fixturePercentages: { yes: [60, 40], no: [60, 40] } }]} source={{ kind: "fixture", threshold: "public", response: "success" }} dict={fairModelSr} routePath={`${base}/model/${model.slug}/glas-publike`} modelHref={`${base}/model/${model.slug}`} selection={null} showDevPanel={false} />;
  } else if (section === "model" && model && fixture && (screen.length <= 2 || (screen[2] === "anketa" && screen.length === 3))) {
    const form = (kind: "interest" | "test_drive") => ({ eventModelId: model.id, kind, state: "open" as const, contactRequirement: "email" as const, consent: { version: 1, text: dict.consent } });
    content = <FairModelPage model={fixture} dict={demoModelDict} routePath={`${base}/model/${model.slug}`} selection={{ mode: "advanced", withPhoto: true, alignment: "left" }} showDevPanel={false} interactions={{ leadForms: { interest: form("interest"), testDrive: form("test_drive") }, survey: { surveyId: "demo-survey", eventModelId: model.id, version: 1, title: dict.specsTitle, questions: [{ id: "demo-question", prompt: dict.question, kind: "yes_no", options: [], order: 0 }] } }} stand={null} audienceTeaser={dict.question} openSurvey={screen[2] === "anketa"} />;
  } else notFound();
  return <div className="fair-event fair-event--auto-moto" data-reveal="off"><DemoBootstrap />{content}</div>;
}
