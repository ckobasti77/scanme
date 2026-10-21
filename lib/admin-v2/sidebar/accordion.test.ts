import { describe, expect, test } from "vitest";
import {
  accordionReducer,
  activeFilterCount,
  clearFiltersPatch,
  groupControlKind,
  groupSummary,
  hasSidebarFilters,
  SIDEBAR_RADIO_MAX,
  sidebarHasFilters,
  sidebarChips,
} from "./accordion";
import type { SidebarConfig, SidebarGroup } from "./types";

// ADMIN v2 — the rules of the sidebar filter accordion (ZADATAK §3).

const options = (count: number) => Array.from({ length: count }, (_, index) => ({ value: `v${index + 1}`, label: `TEST opcija ${index + 1}` }));

const config: SidebarConfig = {
  id: "test/lista",
  views: { key: "pogled", label: "Pogledi", defaultValue: "sve", items: [{ value: "sve", label: "Sve" }, { value: "danas", label: "Danas" }] },
  search: { key: "q", label: "Pretraga" },
  groups: [
    { id: "status", label: "Status", options: [{ value: "aktivan", label: "Aktivni" }, { value: "arhiviran", label: "Arhivirani" }] },
    { id: "klijent", label: "Klijent" },
    { id: "period", label: "Period", kind: "custom", keys: ["od", "do"] },
    { id: "model", label: "Model", chipOnly: true },
  ],
  sort: { key: "sort", label: "Sortiranje", defaultValue: "hitnost", options: [{ value: "hitnost", label: "Hitnost" }, { value: "naziv", label: "Naziv" }] },
};

describe("accordion: at most one open group", () => {
  test("opening a group closes the one that was open", () => {
    let open = accordionReducer(null, { type: "toggle", id: "status" });
    expect(open).toBe("status");
    open = accordionReducer(open, { type: "toggle", id: "klijent" });
    expect(open).toBe("klijent");
  });

  test("a click on the open group closes it; close closes whatever is open", () => {
    expect(accordionReducer("status", { type: "toggle", id: "status" })).toBeNull();
    expect(accordionReducer("status", { type: "close" })).toBeNull();
    expect(accordionReducer(null, { type: "close" })).toBeNull();
  });

  test("no sequence of clicks leaves two groups open (the state is one id)", () => {
    let open: string | null = null;
    for (const id of ["status", "klijent", "klijent", "period", "status", "status"]) {
      open = accordionReducer(open, { type: "toggle", id });
      expect(open === null || typeof open === "string").toBe(true);
    }
    expect(open).toBeNull();
  });
});

describe("the threshold of 7 options", () => {
  test("up to 7 options are a radio list, more than 7 a search-select", () => {
    expect(SIDEBAR_RADIO_MAX).toBe(7);
    expect(groupControlKind(0)).toBe("radio");
    expect(groupControlKind(7)).toBe("radio");
    expect(groupControlKind(8)).toBe("search");
    expect(groupControlKind(150)).toBe("search");
  });
});

describe("the header of a group and the chips", () => {
  const status = config.groups![0];

  test("the header shows the label of the chosen option, nothing when no choice", () => {
    expect(groupSummary(status, {}, status.options!)).toBeNull();
    expect(groupSummary(status, { status: "aktivan" }, status.options!)).toBe("Aktivni");
    // An option the page has not sent yet: the value itself, never an empty header.
    expect(groupSummary(config.groups![1], { klijent: "k1" }, [])).toBe("k1");
  });

  test("a custom group shows the summary the page sends", () => {
    const period = config.groups![2] as SidebarGroup;
    expect(groupSummary(period, { od: "2026-10-09" }, [], "od 2026-10-09")).toBe("od 2026-10-09");
    expect(groupSummary(period, {}, [], "")).toBeNull();
  });

  test("one chip per active filter, search first; each carries the patch that removes it", () => {
    const chips = sidebarChips(
      config,
      { q: "test", status: "aktivan", klijent: "k1", od: "2026-10-09", model: "m1", pogled: "danas", sort: "naziv" },
      { options: { klijent: [{ value: "k1", label: "TEST Klijent" }], model: [{ value: "m1", label: "TEST Model" }] }, custom: { period: { summary: "od 2026-10-09" } } },
    );
    expect(chips.map((chip) => chip.label)).toEqual(["Pretraga: test", "Status: Aktivni", "Klijent: TEST Klijent", "Period: od 2026-10-09", "Model: TEST Model"]);
    expect(chips[0].clear).toEqual({ q: null });
    expect(chips[3].clear).toEqual({ od: null, do: null });
  });

  test("a group that always has a value shows its default in the header and is not an active filter", () => {
    const period: SidebarGroup = { id: "period", label: "Period", defaultValue: "mesec", options: [{ value: "mesec", label: "Ovaj mesec" }, { value: "godina", label: "Godina" }] };
    const page: SidebarConfig = { id: "test/period", groups: [period] };
    expect(groupSummary(period, {}, period.options!)).toBe("Ovaj mesec");
    expect(groupSummary(period, { period: "godina" }, period.options!)).toBe("Godina");
    // The default is never in the state (lib/admin-v2/query/url-state.ts), so it is neither a chip nor counted.
    expect(sidebarChips(page, {})).toEqual([]);
    expect(activeFilterCount(page, {})).toBe(0);
    expect(sidebarChips(page, { period: "godina" }).map((chip) => chip.label)).toEqual(["Period: Godina"]);
    expect(activeFilterCount(page, { period: "godina" })).toBe(1);
  });

  test("Očisti sve removes search and every group; the view and the sort stay", () => {
    expect(clearFiltersPatch(config)).toEqual({ q: null, status: null, klijent: null, od: null, do: null, model: null });
  });

  test("Filteri (N) counts the active filters, not the view or the sort", () => {
    expect(activeFilterCount(config, {})).toBe(0);
    expect(activeFilterCount(config, { pogled: "danas", sort: "naziv" })).toBe(0);
    expect(activeFilterCount(config, { q: "x", status: "aktivan", od: "2026-10-09", do: "2026-10-11" })).toBe(3);
  });

  test("a page has filters when it has search, views, sort or a group with a control", () => {
    expect(hasSidebarFilters(config)).toBe(true);
    expect(hasSidebarFilters({ id: "x", blocks: ["jumps"] })).toBe(false);
    expect(hasSidebarFilters({ id: "x", groups: [{ id: "model", label: "Model", chipOnly: true }] })).toBe(false);
    expect(hasSidebarFilters({ id: "x", groups: [{ id: "status", label: "Status", options: options(3) }] })).toBe(true);
  });

  test("a page with only sections or a view has a drawer button, but nothing to filter (the button names the sections)", () => {
    const sections: SidebarConfig = { id: "x", views: { key: "tab", label: "Odeljci", defaultValue: "a", items: [{ value: "a", label: "A" }, { value: "b", label: "B" }] } };
    expect(hasSidebarFilters(sections)).toBe(true);
    expect(sidebarHasFilters(sections)).toBe(false);
    expect(sidebarHasFilters(config)).toBe(true);
    expect(sidebarHasFilters({ ...sections, search: { key: "q", label: "Pretraga" } })).toBe(true);
    expect(sidebarHasFilters({ id: "x", groups: [{ id: "model", label: "Model", chipOnly: true }] })).toBe(false);
  });
});
