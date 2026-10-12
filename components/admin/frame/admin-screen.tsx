"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { ADMIN_DURATION, ADMIN_EASE, ADMIN_PAGE_OFFSET } from "@/lib/admin-v2/motion";
import { gsap, useAdminGsapLayout } from "./use-admin-gsap";

// ADMIN v2 — the screen (ZADATAK §2): everything right of the sidebar and
// under the navbar is one panel with its own surface and rounded corners.
// It is the only scroll container of the admin (the window never scrolls),
// its content is centred and at most 1440 px wide. Next resets only the
// window scroll on navigation, so the screen returns to the top on a new
// page itself and restores its place on Back/Forward. Pages read the query
// string (useSearchParams), so the one <Suspense> they need is here. It is
// `relative` so that absolutely placed content (every `sr-only` label) is
// positioned and clipped inside it and never makes the window scroll.
// X4: a new page fades in with a small rise inside the screen (the frame
// stays); nothing moves on the first load and the page takes input at once.

export function AdminScreen({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const history = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const entered = useRef<string | null>(null);

  useAdminGsapLayout(
    ({ reduced }) => {
      const previous = entered.current;
      entered.current = pathname;
      if (previous === null || previous === pathname || !content.current) return;
      const fade = { duration: ADMIN_DURATION.move, ease: ADMIN_EASE.out, clearProps: "opacity,transform" };
      // Reduced motion: the page only fades in, it does not rise.
      if (reduced) gsap.fromTo(content.current, { opacity: 0 }, { opacity: 1, ...fade });
      else gsap.fromTo(content.current, { opacity: 0, y: ADMIN_PAGE_OFFSET }, { opacity: 1, y: 0, ...fade });
    },
    [pathname],
  );

  useEffect(() => {
    const onPop = () => {
      history.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const saved = positions.current;
    const back = history.current;
    history.current = false;
    element.scrollTop = back ? saved.get(pathname) ?? 0 : 0;
    const remember = () => saved.set(pathname, element.scrollTop);
    element.addEventListener("scroll", remember, { passive: true });
    return () => element.removeEventListener("scroll", remember);
  }, [pathname]);

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
    </main>
  );
}
