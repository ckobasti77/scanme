// K08 regression: the existing client panel (components/client-panel/client-panel.tsx)
// renders every other service exactly as before the ScanMe Menu entry was added.
//
// The snapshots in __snapshots__/ were written from the UNCHANGED component,
// before K08 touched it; every case here answers `menuPanel.entry` with
// `{ status: "none" }` (a business without ScanMe Menu), so the markup must
// stay byte-identical. Tests in components/client-panel/** do not run
// (vitest.config.ts), so the test lives here.
//
// Convex hooks are replaced by a table of query answers; the sections of the
// other products (Venue, Memories, chat, charts, theme toggle) are markers, so
// this checks the panel's own composition: which tabs, which screen, which
// branch. React's generated ids (useId, Radix) are normalised, since a sibling
// added before the tabs legitimately renumbers them without changing anything
// a person sees.

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const odgovori = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    Authenticated: ({ children }: { children: ReactNode }) => children,
    Unauthenticated: () => null,
    AuthLoading: () => null,
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => odgovori.current[getFunctionName(ref)],
    useMutation: () => async () => null,
    useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  };
});

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: async () => undefined, signOut: async () => undefined }),
}));

vi.mock("@/components/client-panel/venue-panel-section", () => ({
  VenuePanelSection: () => createElement("section", { "data-oznaka": "venue-sekcija" }),
}));
vi.mock("@/components/client-panel/memories-panel-section", () => ({
  MemoriesPanelSection: () => createElement("section", { "data-oznaka": "memories-sekcija" }),
}));
vi.mock("@/components/client-panel/client-panel-chat", () => ({
  ClientPanelChat: () => createElement("section", { "data-oznaka": "chat" }),
}));
vi.mock("@/components/metrics-bar-chart", () => ({
  MetricsBarChart: () => createElement("div", { "data-oznaka": "grafikon" }),
}));
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => createElement("button", { type: "button", "data-oznaka": "tema" }),
}));

import { ClientPanel } from "@/components/client-panel/client-panel";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { MenuUlaz } from "./ulaz";

const SLUG = "demo-restoran";

const overviewAktivan = {
  status: "available",
  businessId: "b_demo",
  businessName: "Demo restoran",
  services: {
    scanMeLinks: { profileId: "p_links", active: true, clientEditingEnabled: true, hasOpenRequest: false },
    googleReview: { profileId: "p_review", active: true, hasOpenRequest: false },
  },
};

const overviewNeaktivan = {
  ...overviewAktivan,
  services: {
    scanMeLinks: { profileId: null, active: false, clientEditingEnabled: false, hasOpenRequest: false },
    googleReview: { profileId: null, active: false, hasOpenRequest: true },
  },
};

const linksMetrika = {
  status: "available",
  businessName: "Demo restoran",
  totalScans: 1204,
  totalPageViews: 977,
  ctr: 0.418,
  destinations: [
    { id: "d_meni", label: "Meni", state: "active", totalClicks: 312, totalDirectVisits: 0 },
    { id: "d_stari", label: "Stara akcija", state: "deleted", totalClicks: 0, totalDirectVisits: 17 },
  ],
  daily: [],
  rangeLabel: "Poslednjih 7 dana",
  range: "7d",
};

const dodatna = { status: "available" };
const nema = { status: "none" };

type Slucaj = {
  overview: unknown;
  venue?: unknown;
  memories?: unknown;
};

function postavi(slucaj: Slucaj) {
  odgovori.current = {
    "clientPanel:publicLocation": { name: "Demo restoran" },
    "clientPanel:overview": slucaj.overview,
    "clientPanel:venuePanel": slucaj.venue ?? nema,
    "clientPanel:memoriesPanel": slucaj.memories ?? nema,
    "clientPanel:scanMeLinksMetrics": linksMetrika,
    "clientPanel:metrics": undefined,
    // A business without ScanMe Menu: the entry is absent.
    "menuPanel:entry": nema,
  };
}

/** React and Radix ids (useId) depend on sibling positions, not on what is shown. */
function bezIdova(markup: string): string {
  return markup.replace(/«[^»]*»/g, "«id»").replace(/_[rR]_[0-9a-z]+_/g, "«id»");
}

function render(slucaj: Slucaj): string {
  postavi(slucaj);
  return bezIdova(renderToStaticMarkup(createElement(ClientPanel, { slug: SLUG })));
}

beforeEach(() => {
  odgovori.current = {};
});

describe("the client panel renders the other services as before (no ScanMe Menu)", () => {
  test("ScanMe Links and Google Review: tabs, Links metrics first", () => {
    expect(render({ overview: overviewAktivan })).toMatchSnapshot();
  });

  test("Links and Google Review plus Venue and Memories tabs", () => {
    expect(render({ overview: overviewAktivan, venue: dodatna, memories: dodatna })).toMatchSnapshot();
  });

  test("an inactive Links service shows the activation request", () => {
    expect(render({ overview: overviewNeaktivan })).toMatchSnapshot();
  });

  test("only Venue (no Links/Google Review overview)", () => {
    expect(render({ overview: { status: "forbidden" }, venue: dodatna })).toMatchSnapshot();
  });

  test("only Memories", () => {
    expect(render({ overview: { status: "forbidden" }, memories: dodatna })).toMatchSnapshot();
  });

  test("Venue and Memories without the overview", () => {
    expect(render({ overview: { status: "forbidden" }, venue: dodatna, memories: dodatna })).toMatchSnapshot();
  });

  test("no service at all: the access-denied screen", () => {
    expect(render({ overview: { status: "forbidden" } })).toMatchSnapshot();
  });

  test("overview still loading: the skeleton", () => {
    expect(render({ overview: undefined })).toMatchSnapshot();
  });
});

describe("a venue with ScanMe Menu: one entry block opens the new shell, the rest is unchanged", () => {
  const DOSTUPAN = { status: "available" };
  /** The Menu query has not answered yet (an explicit undefined would hit the default parameter). */
  const UCITAVA = Symbol("ucitava");

  const ulaz = (naslovNivo: 1 | 2 = 2) =>
    bezIdova(renderToStaticMarkup(createElement(MenuUlaz, { slug: SLUG, naslovNivo })));

  function renderSaMenijem(slucaj: Slucaj, entry: unknown = DOSTUPAN): string {
    postavi(slucaj);
    odgovori.current["menuPanel:entry"] = entry === UCITAVA ? undefined : entry;
    return bezIdova(renderToStaticMarkup(createElement(ClientPanel, { slug: SLUG })));
  }

  test("the entry links to the ScanMe Menu shell of this venue", () => {
    expect(ulaz()).toContain('href="/demo-restoran/client-panel/meni"');
    expect(ulaz()).toContain(menuPanelSr.ulaz.dugme);
  });

  test.each<[string, Slucaj]>([
    ["Links and Google Review tabs", { overview: overviewAktivan }],
    ["all four tabs", { overview: overviewAktivan, venue: dodatna, memories: dodatna }],
    ["only Venue", { overview: { status: "forbidden" }, venue: dodatna }],
    ["Venue and Memories", { overview: { status: "forbidden" }, venue: dodatna, memories: dodatna }],
  ])("%s: the entry comes first and the rest is the panel from before", (_, slucaj) => {
    const saMenijem = renderSaMenijem(slucaj);
    const bezMenija = render(slucaj);
    expect(saMenijem).toContain(ulaz());
    expect(saMenijem.indexOf(ulaz())).toBeLessThan(saMenijem.indexOf("data-oznaka=\"chat\""));
    expect(saMenijem.replace(ulaz(), "")).toBe(bezMenija);
  });

  test("the entry is above the service tabs, never one of them", () => {
    const markup = renderSaMenijem({ overview: overviewAktivan });
    expect(markup.indexOf(ulaz())).toBeLessThan(markup.indexOf('role="tablist"'));
    expect(markup.match(/role="tab"/g)).toHaveLength(2);
  });

  test("a venue with only ScanMe Menu: the entry (as the page heading) replaces the access-denied screen", () => {
    const markup = renderSaMenijem({ overview: { status: "forbidden" } });
    expect(markup).toContain(ulaz(1));
    expect(markup).toContain("<h1");
    expect(markup).not.toContain("Nemate pristup ovom lokalu.");
    expect(markup).toContain('data-oznaka="chat"');
  });

  test("while the ScanMe Menu answer loads, a venue with nothing else shows the skeleton, not \"no access\"", () => {
    const markup = renderSaMenijem({ overview: { status: "forbidden" } }, UCITAVA);
    expect(markup).not.toContain("Nemate pristup ovom lokalu.");
    expect(markup).toContain('aria-label="Učitavanje metrike"');
  });

  test("a venue without ScanMe Menu never shows the entry", () => {
    for (const slucaj of [
      { overview: overviewAktivan },
      { overview: { status: "forbidden" }, venue: dodatna },
      { overview: { status: "forbidden" } },
    ] satisfies Slucaj[]) {
      expect(render(slucaj)).not.toContain("data-menu-ulaz");
    }
  });
});
