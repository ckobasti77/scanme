import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AdminLoadingState, AdminPanel, AdminTable } from "@/components/admin/admin-primitives";
import { AdminDataView } from "@/components/admin/admin-ui/admin-data-view";
import { AdminKpiRow } from "@/components/admin/admin-ui/admin-kpi";
import { AdminMissionRing } from "@/components/admin/admin-ui/admin-missions";
import { ChartFrame, HBar, MiniBars, StackedBar } from "@/components/admin/events/analytics/chart-kit";
import { AdminFrame } from "@/components/admin/frame/admin-frame";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import { AdminPulse } from "@/components/admin/frame/admin-pulse";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { PreviewDelay } from "./preview-delay";
import { AdminRingMask } from "./reveal-marks";

// ADMIN v3 V1 — the markup the reveal engine reads. The shared primitives
// carry the attributes, so every page built from them enters without marking
// anything itself. The server's markup never hides content: no inline opacity,
// visibility or clip-path (the engine sets them itself, in the browser, after
// its gate), so without JavaScript and with reduced motion all of it is there.

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/klijenti",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useConvex: () => ({}) }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signOut: async () => undefined }) }));

const html = (node: ReactNode) => renderToStaticMarkup(node);
const count = (markup: string, part: string) => markup.split(part).length - 1;
const HIDING = /style="[^"]*(opacity|visibility|clip-path|transform)/;

describe("the shared primitives carry the reveal attributes", () => {
  test("a panel is a card and wears the light; the caller can keep it still", () => {
    const panel = html(<AdminPanel><p>TEST</p></AdminPanel>);
    expect(panel).toContain('data-admin-reveal="card"');
    expect(panel).toContain('data-admin-glow=""');
    // The light is one element of the screen, not a layer inside the panel: nothing is added to it and nothing is clipped.
    expect(panel).toMatch(/^<section[^>]*><p>TEST<\/p><\/section>$/);
    expect(panel).not.toContain("overflow-hidden");
    expect(html(<AdminPanel data-admin-reveal="off" />)).toContain('data-admin-reveal="off"');
    expect(html(<AdminPanel data-admin-reveal="off" />)).not.toContain('data-admin-reveal="card"');
  });

  test("the page header: the title block with its lines, the copy layer, then description and actions as text", () => {
    const header = html(<AdminPageHeader eyebrow="TEST oblast" title="TEST naslov" description="TEST opis" actions={<button type="button">TEST</button>} />);
    expect(header).toContain('data-admin-reveal="title"');
    expect(count(header, 'data-admin-title-line=""')).toBe(2);
    expect(header).toMatch(/<h1 data-admin-title-line=""[^>]*>TEST naslov<\/h1>/);
    expect(header).toMatch(/<span aria-hidden="true" data-admin-title-ghosts=""[^>]*><\/span>/);
    expect(count(header, 'data-admin-reveal="text"')).toBe(2);
    // Without an eyebrow only the title is a line.
    expect(count(html(<AdminPageHeader title="TEST naslov" />), 'data-admin-title-line=""')).toBe(1);
  });

  test("a row of key numbers: every tile lights up, tilts and counts", () => {
    const row = html(<AdminKpiRow label="TEST brojevi" items={[{ id: "a", label: "TEST A", value: "412" }, { id: "b", label: "TEST B", value: "12 %", hint: "TEST napomena" }]} />);
    expect(count(row, 'data-admin-reveal="kpi"')).toBe(2);
    expect(count(row, 'data-admin-tilt=""')).toBe(2);
    expect(count(row, 'data-admin-count=""')).toBe(2);
    expect(row).toMatch(/<dd data-admin-count=""[^>]*>412<\/dd>/);
  });

  test("a list: the toolbar is text, the table body and the card list are rows, the table wears the light", () => {
    const rows = [{ id: "1", name: "TEST jedan" }, { id: "2", name: "TEST dva" }];
    const view = html(
      <AdminDataView listKey="test.reveal" caption="TEST lista" rows={rows} getRowId={(row) => row.id} columns={[{ id: "name", header: "Naziv", cell: (row) => row.name }]} renderCard={(row) => row.name} toolbar={<span>TEST alat</span>} />,
    );
    expect(view).toContain('<tbody data-admin-reveal="rows">');
    expect(view).toMatch(/<ul aria-label="TEST lista" data-admin-reveal="rows"/);
    expect(view).toMatch(/<div data-admin-reveal="text"[^>]*><span>TEST alat<\/span><\/div>/);
    expect(view).toContain('data-admin-table-wrap="" data-admin-glow=""');
    // The header row is never a row of the cascade (it is sticky).
    expect(view).not.toMatch(/<thead[^>]*data-admin/);
    const table = html(<AdminTable caption="TEST tabela"><tbody><tr><td>TEST</td></tr></tbody></AdminTable>);
    expect(table).toContain('data-admin-glow=""');
  });

  test("a chart frame is a chart; bars say from where they grow", () => {
    const frame = html(<ChartFrame id="test" title="TEST" question="TEST pitanje?"><HBar share={0.4} /></ChartFrame>);
    expect(frame).toContain('data-admin-reveal="chart"');
    expect(frame).not.toContain('data-admin-reveal="card"');
    expect(frame).toMatch(/<span aria-hidden="true" data-admin-draw="bars"[^>]*><span data-admin-bar="x"/);
    const stacked = html(<StackedBar label="TEST" segments={[{ key: "a", label: "TEST A", value: 3, color: "red" }, { key: "b", label: "TEST B", value: 1, color: "blue" }]} />);
    expect(stacked).toContain('data-admin-draw="bars"');
    expect(count(stacked, 'data-admin-bar="x"')).toBe(2);
    const mini = html(<MiniBars label="TEST" values={[1, 4, 2]} />);
    expect(mini).toContain('data-admin-draw="bars"');
    expect(count(mini, 'data-admin-bar="y"')).toBe(3);
  });

  test("a ring is drawn through a mask of one circle; its segments keep their own dashes", () => {
    const ring = html(<AdminMissionRing share={0.5} label="TEST prsten" />);
    expect(ring).toContain('data-admin-draw="ring"');
    expect(count(ring, 'data-admin-ring-mask=""')).toBe(1);
    const id = /<mask id="([^"]+)"/.exec(ring)?.[1];
    expect(id).toBeTruthy();
    expect(ring).toContain(`mask="url(#${id})"`);
    expect(ring).toMatch(/stroke-dasharray="[\d. ]+" mask=/);
    // An empty ring has no progress circle, so nothing wears the mask.
    expect(html(<AdminMissionRing share={0} />)).not.toContain('mask="url(');
    const mask = html(<svg><AdminRingMask id="m" size={120} r={46} strokeWidth={12} /></svg>);
    expect(mask).toContain('<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">');
    expect(mask).toContain('cx="60" cy="60" r="46" fill="none" stroke="#fff" stroke-width="14"');
  });

  test("the skeleton has the shimmer and no pulsing bars", () => {
    for (const shape of ["panel", "table"] as const) {
      const skeleton = html(<AdminLoadingState shape={shape} />);
      expect(skeleton).toContain('data-admin-primitive="loading"');
      expect(skeleton).toContain("admin-shimmer");
      expect(skeleton).not.toContain("animate-pulse");
      expect(skeleton).toContain(adminV1Sr.loadingLabel);
    }
    // The dev delay shows the skeleton first, then the content.
    expect(html(<PreviewDelay ms={600}><p>TEST sadržaj</p></PreviewDelay>)).toContain('data-admin-primitive="loading"');
    expect(html(<PreviewDelay ms={0}><p>TEST sadržaj</p></PreviewDelay>)).toBe("<p>TEST sadržaj</p>");
  });

  test("nothing in the server's markup hides content", () => {
    const pieces = [
      html(<AdminPanel><p>TEST</p></AdminPanel>),
      html(<AdminPageHeader eyebrow="TEST" title="TEST naslov" description="TEST opis" />),
      html(<AdminKpiRow label="TEST" items={[{ id: "a", label: "TEST", value: "412" }]} />),
      html(<AdminMissionRing share={0.5} />),
      html(<ChartFrame id="test" title="TEST" question="TEST?"><p>TEST</p></ChartFrame>),
    ];
    for (const piece of pieces) expect(piece).not.toMatch(HIDING);
  });
});

describe("the frame", () => {
  const frame = () => html(<AdminFrame previewIdentity="TEST admin"><AdminPageHeader title="TEST naslov" /></AdminFrame>);

  test("keeps its three parts; the page is in the screen with the two decoration layers", () => {
    const markup = frame();
    expect((markup.match(/data-admin-frame="(sidebar|navbar|screen)"/g) ?? []).sort()).toEqual(['data-admin-frame="navbar"', 'data-admin-frame="screen"', 'data-admin-frame="sidebar"']);
    expect(count(markup, 'data-admin-page=""')).toBe(1);
    expect(markup).toMatch(/<div aria-hidden="true" data-admin-scan="" class="admin-scan"><span class="admin-scan-line"><\/span><\/div>/);
    expect(markup).toMatch(/<div aria-hidden="true" data-admin-glow-light="" class="admin-glow">/);
    expect(markup).toMatch(/<div aria-hidden="true" data-admin-edge="" class="admin-edge">/);
    // The page content itself carries no inline style that would hide it.
    const page = markup.slice(markup.indexOf('data-admin-page=""'), markup.indexOf("data-admin-scan"));
    expect(page).toContain("TEST naslov");
    expect(page).not.toMatch(HIDING);
  });

  test("the Pulse is a hidden canvas on the navbar with its sentence for assistive technology", () => {
    const pulse = html(<AdminPulse />);
    expect(pulse).toBe(`<canvas aria-hidden="true" data-admin-pulse="" class="admin-pulse"></canvas><span class="sr-only">${adminUiSr.pulse.description}</span>`);
    const markup = frame();
    const navbar = markup.slice(markup.indexOf('data-admin-frame="navbar"'), markup.indexOf('data-admin-frame="screen"'));
    expect(count(navbar, "data-admin-pulse")).toBe(1);
    // The canvas takes no tab stop and no pointer (app/globals.css); the links stay the first thing in the navbar's row.
    expect(navbar).not.toMatch(/<canvas[^>]*tabindex/);
  });

  test("the quiet mode is off by default: the root does not say `data-admin-quiet`", () => {
    expect(frame()).not.toContain("data-admin-quiet");
  });

  test("the chip after G is not in the markup until the key is pressed", () => {
    const markup = frame();
    expect(markup).not.toContain("data-admin-go-pending");
    expect(adminUiSr.shortcuts.goPending).toBe("G …");
  });
});
