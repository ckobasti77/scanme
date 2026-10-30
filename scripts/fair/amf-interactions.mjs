// AMF 2026 (30 Oct 2026): Glas publike groups for fairSetup:setupAudienceQuestions
// from amf-2026-unos-podaci.json (questions verbatim, every option kept).
// Usage: node scripts/fair/amf-interactions.mjs <intake.json> <out.json> <actorEmail> <sponsorDateKey>
import { readFileSync, writeFileSync } from "node:fs";

const [input, output, actorEmail, sponsorDateKey] = process.argv.slice(2);
if (!sponsorDateKey) throw new Error("usage: amf-interactions.mjs <intake.json> <out.json> <actorEmail> <sponsorDateKey>");
const intake = JSON.parse(readFileSync(input, "utf8"));
const payload = JSON.parse(readFileSync(new URL("../../docs/events/auto-moto-fest-2026/intake/prod-2026-10-30/b1-payload-dev.json", import.meta.url), "utf8"));
const slugOf = new Map(payload.participations.flatMap((p) => p.brands.flatMap((b) => b.models.map((m) => [`${m.displayName}`, m]))));
const models = (ex) => ex.models.map((m) => ({ ...m, slug: slugOf.get(`${m.brand} ${m.name}`).slug }));
const ex = (key) => intake.exhibitors.find((row) => row.key === key);
const toQuestions = (list) => list.map((q) => ({ prompt: q.text, options: q.options }));
const neutral = [{ prompt: intake._meta.neutral_question.text, options: intake._meta.neutral_question.options }];

const skoda = ex("auto-moto-fest-2026-autocacak-promet");
const nikom = ex("auto-moto-fest-2026-nikom");
const nikomModels = models(nikom);
const groups = [
  { modelSlugs: models(skoda).map((m) => m.slug), questions: toQuestions(skoda.glas_publike.questions), mode: "all", sponsoredQuestion: skoda.glas_publike.sponsored_rotation_question },
  { modelSlugs: nikomModels.filter((m) => m.package === "advanced").map((m) => m.slug), questions: toQuestions(nikom.glas_publike.questions), mode: "all", sponsoredQuestion: nikom.glas_publike.sponsored_rotation_question },
  // Starter: 30.10 → Q1, 31.10 → Q2, 1.11 → Q3.
  { modelSlugs: nikomModels.filter((m) => m.package === "starter").map((m) => m.slug), questions: toQuestions(nikom.glas_publike.questions.slice(0, 3)), mode: "perDay" },
  { modelSlugs: [...models(ex("auto-moto-fest-2026-grand-motors")), ...models(ex("auto-moto-fest-2026-swm"))].map((m) => m.slug), questions: neutral, mode: "all" },
];
writeFileSync(output, JSON.stringify({ actorEmail, eventCode: "auto-moto-fest-2026", sponsorDateKey, groups }));
console.log(groups.map((g) => `${g.mode} ${g.modelSlugs.length} models × ${g.questions.length} q`).join("; "));

// Surveys (fairSetup:setupSurveys): Škoda on its 6 models; Nikom on all 4,
// Starter included (owner override 30 Oct 2026). Every option kept.
const toSurvey = (list) => list.map((q) => ({
  prompt: q.text,
  kind: q.answer_type,
  options: q.options ?? [],
  ...(q.write_in_option ? { writeInLabel: q.write_in_option } : {}),
}));
const surveys = [
  { modelSlugs: models(skoda).map((m) => m.slug), surveyAllTiers: false, questions: toSurvey(skoda.survey.questions) },
  { modelSlugs: nikomModels.map((m) => m.slug), surveyAllTiers: true, questions: toSurvey(nikom.survey.questions) },
];
writeFileSync(output.replace(/\.json$/, "-surveys.json"), JSON.stringify({ actorEmail, eventCode: "auto-moto-fest-2026", groups: surveys }));
console.log(surveys.map((g) => `survey ${g.modelSlugs.length} models × ${g.questions.length} q`).join("; "));
