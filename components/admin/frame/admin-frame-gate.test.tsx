import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import AdminLayout from "@/app/admin/layout";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminGuard } from "../admin-guard";
import { AdminShell } from "../admin-shell";
import { AdminFrame } from "./admin-frame";
import { AdminFrameGate } from "./admin-frame-gate";

// ADMIN v2 — the persistent admin layout (app/admin/layout.tsx renders
// AdminFrameGate): AdminGuard protects every framed page exactly as it did
// when each page wrapped itself (no content and no frame until the signed-in
// admin is known), `/admin/login` and the Links editor get neither the guard
// nor the frame, and an AdminShell inside the frame adds no second frame.

const state = vi.hoisted(() => ({ pathname: "/admin/klijenti", me: undefined as unknown }));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));
// The shared next/link stub drops every prop except href/className; the current navbar link is checked here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("convex/react", () => ({ useQuery: () => state.me }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signOut: async () => undefined }) }));

const PAGE = "TEST sadržaj stranice";
const gate = () => renderToStaticMarkup(<AdminFrameGate><p>{PAGE}</p></AdminFrameGate>);
const frames = (html: string) => (html.match(/data-admin-frame="(sidebar|navbar|screen)"/g) ?? []).sort();

beforeEach(() => {
  state.pathname = "/admin/klijenti";
  state.me = undefined;
});

describe("AdminGuard in the persistent layout", () => {
  test("while the session is being checked: the loading state, no page content and no frame", () => {
    const html = gate();
    expect(html).toContain(adminV1Sr.accessLoading);
    expect(html).not.toContain(PAGE);
    expect(frames(html)).toEqual([]);
  });

  test("not signed in: the sign-in screen with the link to /admin/login, no page content and no frame", () => {
    state.me = { authenticated: false, isAdmin: false };
    const html = gate();
    expect(html).toContain(adminV1Sr.signInRequiredTitle);
    expect(html).toContain('href="/admin/login"');
    expect(html).not.toContain(PAGE);
    expect(frames(html)).toEqual([]);
  });

  test("signed in without admin rights: access denied, no page content and no frame", () => {
    state.me = { authenticated: true, isAdmin: false, email: "test@example.invalid" };
    const html = gate();
    expect(html).toContain(adminV1Sr.accessDeniedTitle);
    expect(html).not.toContain(PAGE);
    expect(frames(html)).toEqual([]);
  });

  test("an admin gets the page inside the frame: sidebar, navbar and screen, each once", () => {
    state.me = { authenticated: true, isAdmin: true, email: "test.admin@example.invalid" };
    const html = gate();
    expect(html).toContain(PAGE);
    expect(frames(html)).toEqual(['data-admin-frame="navbar"', 'data-admin-frame="screen"', 'data-admin-frame="sidebar"']);
    // The page is inside the screen (the only scroll container), which is the skip-link target.
    expect(html).toMatch(new RegExp(`<main[^>]*id="main-content"[^>]*data-admin-frame="screen"[\\s\\S]*${PAGE}[\\s\\S]*</main>`));
    // The same guard screens are gone once the admin is known.
    expect(html).not.toContain(adminV1Sr.signInRequiredTitle);
    expect(html).not.toContain(adminV1Sr.accessDeniedTitle);
  });

  test("the guard covers every framed admin path, also the older screens and the sections of an event", () => {
    state.me = { authenticated: false, isAdmin: false };
    for (const pathname of ["/admin", "/admin/zadaci", "/admin/operativa/qr", "/admin/dogadjaji/test-sajam/modeli", "/admin/podesavanja", "/admin/posta", "/admin/memories", "/admin/venue", "/admin/customers/b1"]) {
      state.pathname = pathname;
      const html = gate();
      expect(html, pathname).toContain(adminV1Sr.signInRequiredTitle);
      expect(html, pathname).not.toContain(PAGE);
    }
  });
});

describe("app/admin/layout.tsx (the real layout of every admin page)", () => {
  const layout = () => renderToStaticMarkup(<AdminLayout><p>{PAGE}</p></AdminLayout>);

  test("a visitor who is not signed in gets the sign-in screen; a signed-in admin gets the page in the frame", () => {
    state.me = { authenticated: false, isAdmin: false };
    const signedOut = layout();
    expect(signedOut).toContain(adminV1Sr.signInRequiredTitle);
    expect(signedOut).not.toContain(PAGE);
    expect(frames(signedOut)).toEqual([]);

    state.me = { authenticated: true, isAdmin: false, email: "test@example.invalid" };
    expect(layout()).toContain(adminV1Sr.accessDeniedTitle);
    expect(layout()).not.toContain(PAGE);

    state.me = { authenticated: true, isAdmin: true, email: "test.admin@example.invalid" };
    const signedIn = layout();
    expect(signedIn).toContain(PAGE);
    expect(frames(signedIn)).toHaveLength(3);
  });

  test("/admin/login goes through the same layout without the guard and without the frame", () => {
    state.pathname = "/admin/login";
    expect(layout()).toBe(`<p>${PAGE}</p>`);
  });
});

describe("the same protection as before the persistent layout", () => {
  // Before ADMIN v2 every page wrapped itself in <AdminGuard>; now app/admin/layout.tsx does it once.
  // The guard decides only from the answer of `admin.me`, so these are all the cases there are.
  const before = () => renderToStaticMarkup(<AdminGuard><p>{PAGE}</p></AdminGuard>);
  const after = () => renderToStaticMarkup(<AdminLayout><p>{PAGE}</p></AdminLayout>);
  const KEPT_OUT = [
    undefined,
    { authenticated: false, isAdmin: false, email: null },
    { authenticated: true, isAdmin: false, email: "test@example.invalid" },
  ];

  test("every answer that keeps a visitor out gives exactly the screen the page-level guard gave", () => {
    const screens = new Set<string>();
    for (const me of KEPT_OUT) {
      state.me = me;
      const html = after();
      expect(html).toBe(before());
      expect(html).not.toContain(PAGE);
      screens.add(html);
    }
    // Three different screens: checking, sign-in required, access denied.
    expect(screens.size).toBe(KEPT_OUT.length);
  });

  test("a signed-in admin is let through by both: the page-level guard showed the page, the layout shows it in the frame", () => {
    state.me = { authenticated: true, isAdmin: true, email: "test.admin@example.invalid" };
    expect(before()).toBe(`<p>${PAGE}</p>`);
    expect(after()).toContain(`<p>${PAGE}</p>`);
    expect(frames(after())).toHaveLength(3);
  });

  test("the same holds on every framed admin path", () => {
    for (const pathname of ["/admin", "/admin/klijenti/a1", "/admin/operativa/qr", "/admin/dogadjaji/test-sajam/leadovi", "/admin/venue", "/admin/customers/b1/links"]) {
      state.pathname = pathname;
      for (const me of KEPT_OUT) {
        state.me = me;
        expect(after(), pathname).toBe(before());
      }
    }
  });
});

describe("paths without the frame", () => {
  test("/admin/login and the Links editor render as before: their own content, no frame and no guard screen", () => {
    for (const pathname of ["/admin/login", "/admin/scanme-links/b1/editor"]) {
      state.pathname = pathname;
      for (const me of [undefined, { authenticated: false, isAdmin: false }]) {
        state.me = me;
        const html = gate();
        expect(html, pathname).toBe(`<p>${PAGE}</p>`);
      }
    }
  });
});

describe("AdminShell (the dev previews and the older screens)", () => {
  test("inside a frame it adds nothing; outside it draws the same frame", () => {
    state.me = { authenticated: true, isAdmin: true, email: "test.admin@example.invalid" };
    const nested = renderToStaticMarkup(<AdminFrame><AdminShell><p>{PAGE}</p></AdminShell></AdminFrame>);
    expect(frames(nested)).toHaveLength(3);
    expect(nested).toContain(PAGE);
    state.pathname = "/dev/admin-clients-preview";
    const preview = renderToStaticMarkup(<AdminShell previewIdentity="TEST admin" activePathname="/admin/klijenti"><p>{PAGE}</p></AdminShell>);
    expect(frames(preview)).toHaveLength(3);
    // The navbar marks the admin route the preview stands for.
    expect(preview).toMatch(/<a[^>]*href="\/admin\/klijenti"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/admin\/klijenti"/);
  });
});
