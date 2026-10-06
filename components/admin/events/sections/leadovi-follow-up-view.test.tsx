import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { followUpPreview, followUpTextState, insertAtCursor, pickFollowUpExhibitor } from "@/components/admin/events/leads-logic";
import { FAIR_FOLLOW_UP_FIELDS } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { eventLeadEmailSr } from "@/lib/i18n/sr/event-lead-email";
import { EventFollowUpView, type ExhibitorFollowUp, type FollowUpActions, type FollowUpPreviewSource } from "./leadovi-follow-up-view";

// Admin UX A8 — `leadovi/follow-up`: the text per exhibitor (state, editor
// with merge fields, live preview, estimate and the K3 switch). SSR markup +
// the pure logic in components/admin/events/leads-logic.ts.

const f = adminEventsSr.followUps;
const AT = Date.parse("2026-10-09T10:00:00+02:00");
const ok = async () => ({ ok: true as const });
const actions: FollowUpActions = { saveDraft: ok, activate: ok, retire: ok };
const exhibitors = [{ id: "p-a", name: "TEST Izlagač A" }, { id: "p-b", name: "TEST Izlagač B" }, { id: "p-c", name: "TEST Izlagač C" }];
const rows: ExhibitorFollowUp[] = [
  { participationId: "p-b", active: null, draft: { templateId: "t-b", subject: "TEST {ime}", plainText: "TEST nacrt za {modeli}", status: "draft", version: 1, updatedAt: AT }, advancedModels: 1, modelTexts: 1 },
  {
    participationId: "p-a",
    active: { templateId: "t-a", subject: "TEST {ime}, hvala od {izlagac}", plainText: "Dragi {ime},\n\nvideli smo interesovanje za {modeli}.\n\nProbna: {modeli_probna_voznja}.", status: "active", version: 2, updatedAt: AT },
    draft: null, advancedModels: 2, modelTexts: 0,
  },
  { participationId: "p-c", active: null, draft: null, advancedModels: 0, modelTexts: 0 },
];
const preview: FollowUpPreviewSource = {
  source: "lead",
  values: { ime: "TEST Goran", izlagac: "TEST Izlagač A", dogadjaj: "TEST sajam", modeli: "TEST X2 i TEST X3", modeli_zainteresovan: "TEST X3", modeli_probna_voznja: "TEST X2", modeli_ocenjeni: null },
  leads: [{ leadId: "l1", contactName: "TEST Goran", kind: "test_drive", createdAt: AT }],
};

function render(overrides: Partial<Parameters<typeof EventFollowUpView>[0]> = {}) {
  return renderToStaticMarkup(
    <EventFollowUpView
      exhibitors={exhibitors}
      eventTitle="TEST sajam"
      rows={rows}
      estimate={{ byParticipation: [{ participationId: "p-a", pairs: 2, sent: 0, suppressed: 1 }], capped: false }}
      switches={{ leadsEnabled: true, followUpEnabled: true }}
      preview={preview}
      query={{ izlagac: "p-a", lead: "l1" }}
      onQueryChange={() => {}}
      actions={actions}
      {...overrides}
    />,
  );
}

describe("A8 follow-up per exhibitor", () => {
  test("the list shows each exhibitor's text state, Advanced models and the email estimate", () => {
    const html = render();
    expect(html).toContain('data-admin-primitive="data-view"');
    for (const text of [
      f.listTitle, f.colExhibitor, f.colText, f.colAdvanced, f.colEstimate, f.estimateHelp,
      f.states.active, f.states.draft, f.states.none, fmt(f.versionActive, { version: 2 }), fmt(f.versionDraft, { version: 1 }), f.noAdvanced,
      fmt(f.estimateDetail, { sent: 0, suppressed: 1 }), fmt(f.editAria, { name: "TEST Izlagač B" }), f.switchOn,
    ]) expect(html).toContain(text);
    // Listed by name: A, B, C.
    expect(html.indexOf("TEST Izlagač A")).toBeLessThan(html.indexOf("TEST Izlagač B"));
  });

  test("the editor: subject, text, every merge field as an insert button, save/activate/retire, preview on the chosen lead", () => {
    const html = render();
    for (const text of [fmt(f.editorTitle, { exhibitor: "TEST Izlagač A" }), f.subject, f.text, f.fieldsTitle, f.saveDraft, f.retire, f.previewTitle, f.previewSample]) expect(html).toContain(text);
    for (const field of FAIR_FOLLOW_UP_FIELDS) {
      expect(html).toContain(fmt(f.insertAria, { field: `{${field}}` }));
      expect(html).toContain(f.fields[field].replace(/„|“/g, (c) => c));
    }
    // No saved draft for A → no "Aktiviraj"; the active text can be retired.
    expect(html).not.toContain(`>${f.activate}<`);
    // The preview is the email as sent: merged values, the ScanMe footer and signature.
    for (const text of ["TEST Goran, hvala od TEST Izlagač A", "Dragi TEST Goran,", "videli smo interesovanje za TEST X2 i TEST X3.", "Probna: TEST X2.", "Ovo je jedina poruka posle sajma.", eventLeadEmailSr.signature]) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/<option value="l1" selected="">TEST Goran/);
  });

  test("a saved draft can be activated; the switch off and an exhibitor without Advanced models are said plainly", () => {
    const draft = render({ query: { izlagac: "p-b" } });
    expect(draft).toContain(`>${f.activate}</button>`);
    expect(draft).toContain(fmt(f.modelTexts, { count: 1 }));
    const off = render({ switches: { leadsEnabled: false, followUpEnabled: false } });
    expect(off).toContain(f.switchOff);
    expect(off).toContain(f.leadsOff);
    const none = render({ query: { izlagac: "p-c" } });
    expect(none).toContain(fmt(f.editorTitle, { exhibitor: "TEST Izlagač C" }));
    expect(none.match(new RegExp(f.noAdvanced, "g"))!.length).toBeGreaterThanOrEqual(2);
    expect(render({ rows: undefined })).toContain(f.loading);
    expect(render({ exhibitors: [] })).toContain(f.noExhibitorsTitle);
  });
});

describe("A8 follow-up logic", () => {
  test("preview = the text with values, fallbacks, the footer and signature; an unknown field is a problem, an empty text no preview", () => {
    const shown = followUpPreview({ subject: "Za {ime}", plainText: "Modeli: {modeli}\n\nOcenjeni: {modeli_ocenjeni}" }, { ime: "TEST <Ana>", modeli: "TEST A" }, { exhibitor: "TEST izlagač", event: "TEST sajam" });
    expect(shown).toEqual({
      subject: "Za TEST <Ana>",
      paragraphs: [
        "Modeli: TEST A",
        `Ocenjeni: ${eventLeadEmailSr.followUpFallbacks.modeli_ocenjeni}`,
        fmt(eventLeadEmailSr.followUpFooter, { exhibitor: "TEST izlagač", event: "TEST sajam", model: "TEST A" }),
        eventLeadEmailSr.signature,
      ],
    });
    expect(followUpPreview({ subject: "x", plainText: "{kupac}" }, {}, { exhibitor: "", event: "" })).toEqual({ problem: "kupac" });
    expect(followUpPreview({ subject: " ", plainText: "x" }, {}, { exhibitor: "", event: "" })).toBeNull();
    // React escapes the preview: a value with markup is shown as text.
    const html = render({ preview: { ...preview, values: { ...preview.values, ime: "<b>TEST</b>" } } });
    expect(html).toContain("&lt;b&gt;TEST&lt;/b&gt;");
    expect(html).not.toContain("<b>TEST</b>");
  });

  test("merge field insertion at the caret, text state and the exhibitor the editor opens", () => {
    expect(insertAtCursor("Dragi ,", 6, 6, "{ime}")).toEqual({ text: "Dragi {ime},", caret: 11 });
    expect(insertAtCursor("Dragi XX!", 6, 8, "{ime}")).toEqual({ text: "Dragi {ime}!", caret: 11 });
    expect(insertAtCursor("abc", 99, 99, "{x}")).toEqual({ text: "abc{x}", caret: 6 });
    expect(followUpTextState({ active: {}, draft: {} })).toBe("active");
    expect(followUpTextState({ active: null, draft: {} })).toBe("draft");
    expect(followUpTextState({ active: null, draft: null })).toBe("none");
    const list = [{ participationId: "p-c", advancedModels: 0 }, { participationId: "p-a", advancedModels: 2 }];
    expect(pickFollowUpExhibitor(list, undefined)?.participationId).toBe("p-a");
    expect(pickFollowUpExhibitor(list, "p-c")?.participationId).toBe("p-c");
    expect(pickFollowUpExhibitor(list, "nepoznat")?.participationId).toBe("p-a");
    expect(pickFollowUpExhibitor([], undefined)).toBeNull();
  });
});
