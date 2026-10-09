import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairModelInteractionsProvider } from "@/components/fair/model-interactions";
import { SurveyChatHead } from "@/components/fair/survey/survey-chat-head";
import { fairModelSr as dict } from "@/lib/i18n/sr/fair-model";
import "../../sajam/fair-event.css";

// Model page v2 — DEV preview of the survey with an OPEN interest form (the
// DEV TEST consent is still pending, so no live model offers the contact step
// yet). TEST data only; the browser still talks to the real gateway paths,
// which a review script mocks. Never in production.

export const metadata: Metadata = {
  title: "DEV anketa (TEST podaci)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TEST_MODEL_ID = "test-p6-survey-model";

export default function FairSurveyPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="fair-event fair-event--electromobility fair-model-page">
      <FairModelInteractionsProvider
        dict={dict}
        model={{
          id: TEST_MODEL_ID,
          eventId: "test-p6-event",
          participationId: "test-p6-participation",
          brandName: "JMEV",
          displayName: "EV3",
          exhibitorName: "TEST Izlagač A",
        }}
        interactions={{
          survey: {
            surveyId: "test-p6-survey",
            eventModelId: TEST_MODEL_ID,
            version: 1,
            questions: [
              { id: "q1", prompt: "TEST Da li biste vozili električni automobil svaki dan?", kind: "yes_no", options: [], order: 1 },
              { id: "q2", prompt: "TEST Da li vam je važno brzo DC punjenje?", kind: "yes_no", options: [], order: 2 },
            ],
          },
          leadForms: {
            interest: {
              eventModelId: TEST_MODEL_ID,
              kind: "interest",
              state: "open",
              contactRequirement: "one_of",
              consent: {
                version: 1,
                text: "TEST saglasnost: ScanMe prosleđuje vaše ime i kontakt samo izlagaču TEST Izlagač A.",
              },
            },
          },
        }}
        routePath="/dev/sajam-anketa"
        openSurvey={false}
      >
        <main className="fair-model-main">
          <section className="fair-model-hero fair-model-hero--no-photo">
            <SurveyChatHead />
          </section>
        </main>
      </FairModelInteractionsProvider>
    </div>
  );
}
