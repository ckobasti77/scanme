import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { buildPassportRows, type PassportOverviewSource } from "@/lib/admin-v1/passport-overview";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { EventPassportsView, type PassportsActions } from "./interakcije-pasos-view";

// Admin UX A7 — `interakcije/pasos` (SSR markup): the condition with its
// reasons, the five states in Serbian, the members with the emergency
// removal of a withdrawn car, Sakrij/Prikaži with the brand in the name,
// the explanation of the freeze, filters and the empty/loading states. No
// manual "prepare/publish/withdraw" buttons: the passport is automatic.

const p = adminEventsSr.passportAuto;
const OPENING = Date.parse("2026-10-09T00:00:00+02:00");
const NOW = OPENING - 3_600_000;
const published = (passportId: string, extra: Record<string, unknown> = {}) => ({ passportId, status: "published" as const, frozenAt: OPENING, ...extra });
const source: PassportOverviewSource = {
  eventStartsAt: OPENING,
  brands: [
    { brandId: "b1", participationId: "p1", eligible: true, exhibited: 2, problems: [], tooManyModels: false, freezesAt: OPENING, passport: published("pass-1"), members: [
      { eventModelId: "m1", status: "required", removedByAdmin: false },
      { eventModelId: "m2", status: "required", removedByAdmin: false },
      { eventModelId: "m3", status: "removed", removedAt: NOW, removedByAdmin: false },
    ] },
    { brandId: "b2", participationId: "p1", eligible: true, exhibited: 2, problems: [], tooManyModels: false, freezesAt: OPENING, passport: published("pass-2", { hiddenAt: NOW }), members: [] },
    { brandId: "b3", participationId: "p2", eligible: false, exhibited: 3, problems: [{ code: "model_below_starter", count: 1 }, { code: "model_not_published", count: 1 }], tooManyModels: false, freezesAt: OPENING, passport: null, members: [] },
    { brandId: "b4", participationId: "p2", eligible: false, exhibited: 1, problems: [{ code: "fewer_than_two_models", count: 1 }], tooManyModels: false, freezesAt: OPENING, passport: null, members: [] },
    { brandId: "b5", participationId: "p2", eligible: true, exhibited: 2, problems: [], tooManyModels: false, freezesAt: OPENING, passport: null, members: [] },
    { brandId: "b6", participationId: "p2", eligible: true, exhibited: 2, problems: [], tooManyModels: false, freezesAt: NOW - 1, passport: published("pass-6", { frozenAt: NOW - 1 }), members: [
      { eventModelId: "m6", status: "required", removedByAdmin: false },
      { eventModelId: "m7", status: "removed", removedAt: NOW, removedByAdmin: true },
    ] },
  ],
};
const names = {
  brands: new Map([["b1", "TEST Volta"], ["b2", "TEST Amper"], ["b3", "TEST Om"], ["b4", "TEST Vat"], ["b5", "TEST Džul"], ["b6", "TEST Faradej"]]),
  exhibitors: new Map([["p1", "TEST Izlagač A"], ["p2", "TEST Izlagač B"]]),
  models: new Map([
    ["m1", { name: "TEST Volta X1", status: "published" as const }],
    ["m2", { name: "TEST Volta X2", status: "published" as const }],
    ["m3", { name: "TEST Volta X3", status: "withdrawn" as const }],
    ["m6", { name: "TEST Faradej F1", status: "withdrawn" as const }],
    ["m7", { name: "TEST Faradej F2", status: "published" as const }],
  ]),
};
const ok = async () => ({ ok: true as const });
const actions: PassportsActions = { refresh: ok, setHidden: ok, removeModel: ok };
const exhibitors = [{ id: "p1", name: "TEST Izlagač A" }, { id: "p2", name: "TEST Izlagač B" }];
const ROWS = buildPassportRows(source, names, NOW);
const render = (query: AdminQueryState = {}, rows: typeof ROWS | undefined = ROWS) =>
  renderToStaticMarkup(<EventPassportsView rows={rows} eventStartsAt={OPENING} exhibitors={exhibitors} query={query} onQueryChange={() => undefined} actions={actions} />);
/** Visible text only (attribute values such as option values are not shown). */
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("A7 Pasoš brenda view", () => {
  test("every state, the condition and its reasons render in Serbian, with no raw codes and no manual publish", () => {
    const html = render({ prikaz: "tabela" });
    for (const text of [
      adminEventsSr.sectionLabels["interakcije/pasos"], adminEventsSr.passportsTitle, p.help, p.explainTitle, p.explainFreeze, p.explainHide, p.refresh,
      p.states.active, p.states.hidden, p.states.not_eligible, p.states.missing, p.states.frozen, p.conditionMet, p.conditionNotMet,
      fmt(p.problems.model_below_starter, { count: 1, total: 3 }), fmt(p.problems.model_not_published, { count: 1, total: 3 }),
      fmt(p.problems.fewer_than_two_models, { count: 1, total: 1 }), p.hintMissingBefore, p.hintHidden,
      "TEST Volta X1", "TEST Izlagač A", adminEventsSr.passportMemberStatus.removed, p.memberRemovedByAdmin,
    ]) expect(html).toContain(text);
    expect(html).toContain(fmt(p.explainAuto, { date: "" }).split("()")[0]);
    expect(text(html)).not.toMatch(/FAIR_[A-Z_]+|fewer_than_two_models|model_below_starter|not_eligible/);
    expect(html).not.toMatch(/Pripremi pasoš|Zamrzni i objavi|Povuci pasoš/);
  });

  test("Sakrij for a visible passport, Prikaži for a hidden one, each naming its brand; brands without a passport have no action", () => {
    const html = render({ prikaz: "tabela" });
    expect(html).toContain(`aria-label="${fmt(p.hideAria, { brand: "TEST Volta" })}"`);
    expect(html).toContain(`aria-label="${fmt(p.showAria, { brand: "TEST Amper" })}"`);
    expect(html).not.toContain(fmt(p.hideAria, { brand: "TEST Om" }));
    expect(html).not.toContain(fmt(p.hideAria, { brand: "TEST Amper" }));
  });

  test("a required car withdrawn after the freeze blocks completion and offers the emergency removal; a removed member does not", () => {
    const html = render({ prikaz: "tabela" });
    expect(html).toContain(fmt(p.blocking, { count: 1 }));
    expect(html).toContain(p.memberWithdrawn);
    expect(html).toContain(`aria-label="${adminEventsSr.passportRemoveModel}: TEST Faradej F1"`);
    // TEST Volta X3 is withdrawn but already out of the set (removed): no removal offered.
    expect(html).not.toContain(`${adminEventsSr.passportRemoveModel}: TEST Volta X3`);
    expect(html).toContain(p.states.frozen);
  });

  test("filters: exhibitor, state and the brand chip from the model detail; no match offers Očisti; loading and no brands", () => {
    const filtered = render({ izlagac: "p2", stanje: "bez-uslova", prikaz: "tabela" });
    expect(filtered).toContain(fmt(p.count, { shown: 2, total: 6 }));
    expect(filtered).not.toContain(">TEST Volta<");
    expect(render({ brend: "b1", prikaz: "tabela" })).toContain(fmt(p.brandChip, { brand: "TEST Volta" }));
    const none = render({ izlagac: "p1", stanje: "bez-uslova" });
    expect(none).toContain(p.noMatchTitle);
    expect(renderToStaticMarkup(<EventPassportsView rows={undefined} eventStartsAt={undefined} exhibitors={exhibitors} query={{}} onQueryChange={() => undefined} actions={actions} />)).toContain(adminEventsSr.loading);
    const empty = render({}, []);
    expect(empty).toContain(adminEventsSr.passportsEmpty);
  });
});
