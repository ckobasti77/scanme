import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { previewAnalytics } from "@/components/admin/events/preview-analytics-fixtures";
import { fairRecords, type FairRecords } from "@/lib/admin-v2/analytics/records";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// Effects do not run in a static render, and each render is a new tree. So the
// hook is driven by hand: `useEffect` runs its function at once and `useRef`
// keeps one box for the whole file (what a mounted component does over time).
const mocks = vi.hoisted(() => ({ box: { current: null as unknown }, push: vi.fn(), report: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: () => mocks.box,
  useEffect: (effect: () => void) => {
    effect();
  },
}));
vi.mock("@/lib/admin-v2/toast", () => ({ pushAdminToast: mocks.push }));
// The game of the frame: a record is the v2 toast (as outside a frame) and the fair facts are recorded.
vi.mock("@/components/admin/game/game-context", () => ({
  useGameApi: () => ({ celebrate: (record: { key: string; title: string }) => mocks.push(record), reportFair: mocks.report }),
}));

import { RecordBadge, hourRecordValue, useRecordToasts } from "@/components/admin/events/analytics/records";

const v = adminEventsSr.analytics.v2.records;
const base = fairRecords(previewAnalytics, undefined);

const EVENT = "test-sajam";
function Probe({ scope, records, leads, ended }: { scope: string; records: FairRecords; leads: number; ended: boolean }) {
  useRecordToasts(scope, records, leads, { event: EVENT, ended });
  return null;
}
const look = (records: FairRecords, leads = 0, scope = "test:2026-10-11", ended = false) => renderToStaticMarkup(<Probe scope={scope} records={records} leads={leads} ended={ended} />);
const titles = () => mocks.push.mock.calls.map(([toast]) => toast.title);

beforeEach(() => {
  mocks.box.current = null;
  mocks.push.mockClear();
  mocks.report.mockClear();
});

describe("RecordBadge", () => {
  test("one small tag: the name in bold, the value in plain text, an icon that is hidden from assistive technology", () => {
    const html = renderToStaticMarkup(<RecordBadge label={v.hour} value="39 skenova · nedelja u 12:00" />);
    expect(html).toContain("data-record-badge");
    expect(html).toContain(`<span class="font-semibold">${v.hour}</span>`);
    expect(html).toContain("39 skenova · nedelja u 12:00");
    expect(html).toContain('aria-hidden="true"');
    // Text wears the text tokens; the accent is the icon and the border only.
    expect(html).toContain("text-[var(--admin-text)]");
    expect(html).toContain("border-[var(--admin-medal-1)]");
    expect(html).not.toMatch(/animate|transition/);
  });
});

describe("useRecordToasts", () => {
  test("the first look for a page shows nothing", () => {
    look(base, 3);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("the same numbers again show nothing", () => {
    look(base);
    look(base);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("another hour that beats the record is announced once, in words from the dictionary, also while it keeps growing", () => {
    look(base);
    const risen = (value: number): FairRecords => ({ ...base, hour: { ...base.hour!, value, hour: 22, running: true } });
    look(risen(42));
    look(risen(42));
    // The next polls raise the same hour: it is still that one record.
    look(risen(47));
    look(risen(55));
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith({ key: "hour:2026-10-11|22", title: "Novi rekord sata: 42 skena u 22:00" });
  });

  test("the hour that held the record when the page opened is not announced while it grows", () => {
    look(base);
    look({ ...base, hour: { ...base.hour!, value: 44, running: true } });
    look({ ...base, hour: { ...base.hour!, value: 51, running: true } });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("the tag of an hour that still runs says so", () => {
    expect(hourRecordValue({ value: 42, dayLabel: "Nedelja", hour: 22, running: true })).toBe("42 skena · nedelja u 22:00 · sat još traje");
    expect(hourRecordValue({ value: 39, dayLabel: "Nedelja", hour: 12 })).toBe("39 skenova · nedelja u 12:00");
  });

  test("a new strongest stand and the first lead are announced", () => {
    look(base);
    look({ ...base, stand: { locationId: "hala-6", standCode: "6", scansToday: 90 } }, 1);
    expect(titles()).toEqual(["Štand 6 je sada najjači štand dana", v.toastFirstLead]);
  });

  test("a fallen record does not come back as news when the number rises to the old one", () => {
    look(base);
    look({ ...base, hour: { ...base.hour!, value: 30 } });
    look(base);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("another page (event or day) starts over: its first look shows nothing", () => {
    look(base, 0, "a:2026-10-11");
    look({ ...base, hour: { ...base.hour!, value: 42 } }, 0, "b:2026-10-11");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("useRecordToasts: the fair facts of the event", () => {
  const facts = (call: number) => mocks.report.mock.calls[call][0];

  test("every report carries the event and whether its fair has ended", () => {
    look(base);
    look(base, 0, "test:2026-10-11", true);
    for (const [report] of mocks.report.mock.calls) expect(report).toMatchObject({ event: EVENT });
    expect(mocks.report.mock.calls.map(([report]) => report.ended)).toEqual([false, true]);
  });

  test("the first look tells the state as it is: no record is null and no lead is false, so a later rise is news", () => {
    look({ ...base, hour: null, firstLead: null });
    expect(mocks.report).toHaveBeenCalledTimes(1);
    expect(facts(0)).toEqual({ event: EVENT, ended: false, facts: { hourRecord: null, firstLead: false } });
  });

  test("a record that exists at the first look is told as a number, without the flag of a new record", () => {
    look(base);
    expect(facts(0).facts).toEqual({ hourRecord: base.hour!.value, firstLead: base.firstLead !== null });
    expect(facts(0).facts).not.toHaveProperty("hourRecordSeen");
  });

  test("a new record that arrives while the page is open is told as seen, once", () => {
    look(base);
    mocks.report.mockClear();
    look({ ...base, hour: { ...base.hour!, value: 42, hour: 22, running: true } });
    const seen = mocks.report.mock.calls.filter(([report]) => report.facts.hourRecordSeen === true);
    expect(seen).toEqual([[{ event: EVENT, ended: false, facts: { hourRecordSeen: true } }]]);
  });
});
