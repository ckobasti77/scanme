import { describe, expect, test } from "vitest";
import { eventNavGroups } from "@/lib/admin-v1/event-sections";
import type { AdminSubnavGroup } from "@/lib/admin-v1/subnav";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { foldedNavSummary, searchFieldText } from "./nav-fold";

// ADMIN v2 X6 — RX V2 (the search and the filters of Događaji were below the
// fold of the sidebar) and RX S4 (the page search lost the space at its end).

describe("the folded navigation of an area", () => {
  const nav = (active: Parameters<typeof eventNavGroups>[1]) => eventNavGroups((path) => `/x/${path}`, active);

  test("the header names the open sub-page, also a nested one; nothing is named when none is open", () => {
    expect(foldedNavSummary(nav("modeli")).label).toBe(adminEventsSr.sectionLabels.modeli);
    expect(foldedNavSummary(nav("leadovi/follow-up")).label).toBe(adminEventsSr.sectionLabels["leadovi/follow-up"]);
    expect(foldedNavSummary(nav(null)).label).toBeNull();
  });

  test("what waits in the sub-pages stays visible on the header: the most urgent tone with its sum", () => {
    const groups: AdminSubnavGroup[] = [
      { id: "g", items: [
        { id: "a", href: "/a", label: "TEST A", active: true, urgency: { tone: "uskoro", count: 3 } },
        { id: "b", href: "/b", label: "TEST B", active: false, urgency: { tone: "hitno", count: 2 } },
        { id: "c", href: "/c", label: "TEST C", active: false, children: [{ id: "c1", href: "/c/1", label: "TEST C1", active: false, urgency: { tone: "hitno", count: 4 } }] },
        { id: "d", href: "/d", label: "TEST D", active: false, urgency: { tone: "info", count: 0 } },
      ] },
    ];
    expect(foldedNavSummary(groups)).toEqual({ label: "TEST A", urgency: { tone: "hitno", count: 6 } });
    expect(foldedNavSummary([{ id: "g", items: [{ id: "a", href: "/a", label: "TEST A", active: false, urgency: { tone: "uskoro", count: 1 } }] }]).urgency).toEqual({ tone: "uskoro", count: 1 });
    expect(foldedNavSummary(nav("modeli")).urgency).toBeNull();
  });

  test("Događaji: a section with a search, views or filter groups folds its navigation; the others keep it open", () => {
    const base = "/admin/dogadjaji/test-sajam";
    const folded = (path: string) => resolveAdminSidebar(`${base}/${path}`).navFold;
    for (const path of ["modeli", "qr", "izlagaci", "interakcije", "leadovi", "izvestaji"]) {
      expect(folded(path), path).toEqual({ id: "sekcija", label: adminEventsSr.sectionFold });
    }
    // The exhibitor's Interakcije page has filter groups too.
    expect(folded("interakcije/p-a")).toBeDefined();
    // Nothing to filter: the sections are the content of the sidebar.
    for (const path of ["pregled", "povezi", "analitika", "import", "sponzorisano", "brisanje", "leadovi/follow-up", "leadovi/podesavanja", "modeli/m-1"]) {
      expect(folded(path), path).toBeUndefined();
    }
    // Every page still gets the whole navigation: only its drawing changes.
    expect(resolveAdminSidebar(`${base}/modeli`).nav?.flatMap((group) => group.items).length).toBe(resolveAdminSidebar(`${base}/pregled`).nav?.flatMap((group) => group.items).length);
  });
});

describe("the text of the page search after the URL changed", () => {
  test("a space typed after a word survives the write of the trimmed text (hotel␣ + vrbak = hotel vrbak)", () => {
    // 250 ms after „hotel “ the URL holds „hotel“: the field keeps what was typed.
    expect(searchFieldText("hotel ", "hotel", false)).toBe("hotel ");
    expect(searchFieldText("  hotel", "hotel", false)).toBe("  hotel");
    expect(searchFieldText("hotel", "hotel", false)).toBe("hotel");
  });

  test("a change from outside replaces the text: a chip or Očisti sve empties it, Back restores the older one", () => {
    expect(searchFieldText("hotel ", "", false)).toBe("");
    expect(searchFieldText("hotel", "vrbak", false)).toBe("vrbak");
    expect(searchFieldText("", "hotel", false)).toBe("hotel");
  });

  test("while the user types nothing is replaced", () => {
    expect(searchFieldText("hotel v", "hotel", true)).toBe("hotel v");
    expect(searchFieldText("hot", "", true)).toBe("hot");
  });
});
