"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { attachMaterial } from "@/components/admin/reveal/admin-material";
import { useAdminRevealRoot } from "@/components/admin/reveal/admin-reveal-root";
import { adminRoute } from "@/lib/admin-v2/frame/routes";
import { revealRouteKey } from "@/lib/admin-v2/reveal/gate";
import { useAdminFrame } from "./admin-frame-context";

// ADMIN v2 — the screen (ZADATAK §2): everything right of the sidebar and
// under the navbar is one panel with its own surface and rounded corners.
// It is the only scroll container of the admin (the window never scrolls),
// its content is centred and at most 1440 px wide. Next resets only the
// window scroll on navigation, so the screen returns to the top on a new
// page itself and restores its place on Back/Forward. Pages read the query
// string (useSearchParams), so the one <Suspense> they need is here. It is
// `relative` so that absolutely placed content (every `sr-only` label) is
// positioned and clipped inside it and never makes the window scroll.
// V3: the screen is the root of the reveal engine (the entrance of a page in
// the order of the scan line, the reveal on scroll, the dim of the old page)
// and of the material (the light that follows the cursor, the magnet, the
// tilt). Its two layers are decoration: the scan line and the light. Nothing
// here hides content; with reduced motion and in the quiet mode a new page
// only fades in, as in v2.

export function AdminScreen({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const frame = useAdminFrame();
  const [quiet] = useQuietMode();
  const ref = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const history = useRef(false);
  /** This visit came from Back or Forward (read by the reveal engine). */
  const back = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const scan = useRef<HTMLSpanElement>(null);
  const glow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPop = () => {
      history.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Before the engine measures the new page: the screen is where the page will be read.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const saved = positions.current;
    back.current = history.current;
    history.current = false;
    element.scrollTop = back.current ? saved.get(pathname) ?? 0 : 0;
    const remember = () => saved.set(pathname, element.scrollTop);
    element.addEventListener("scroll", remember, { passive: true });
    return () => element.removeEventListener("scroll", remember);
  }, [pathname]);

  useAdminRevealRoot({
    screen: ref,
    page: content,
    scanLine: scan,
    pathname,
    routeKey: revealRouteKey(frame?.route ?? adminRoute(pathname)),
    quiet,
    history: back,
  });

  useEffect(() => {
    if (quiet || !ref.current) return;
    return attachMaterial(ref.current, glow.current);
  }, [quiet]);

  return (
    <main
      ref={ref}
      id="main-content"
      data-admin-frame="screen"
      tabIndex={-1}
      className="@container/screen relative min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain border-t border-[var(--admin-border)] bg-[var(--admin-surface)] outline-none lg:mr-3 lg:mb-3 lg:rounded-[var(--admin-radius-screen)] lg:border"
    >
      <div ref={content} data-admin-page="" className="mx-auto w-full max-w-[90rem] min-w-0 px-4 pt-4 pb-10 sm:px-5 lg:px-6 lg:pt-6">
        <Suspense fallback={<AdminPanel><AdminLoadingState /></AdminPanel>}>{children}</Suspense>
      </div>
      <div aria-hidden="true" data-admin-scan="" className="admin-scan">
        <span ref={scan} className="admin-scan-line" />
      </div>
      <div ref={glow} aria-hidden="true" data-admin-glow-light="" className="admin-glow">
        <i data-admin-glow-fill="" className="admin-glow-fill" />
        <span className="admin-glow-edge"><i data-admin-glow-edge-light="" className="admin-glow-fill" /></span>
      </div>
    </main>
  );
}
