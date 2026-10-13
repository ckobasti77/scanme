"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { REDUCED_MOTION_QUERY } from "@/components/admin/frame/use-admin-gsap";
import { ADMIN_DURATION, ADMIN_EASE, ADMIN_REVEAL, ADMIN_REVEAL_EASE } from "@/lib/admin-v2/motion";
import { clearRevealLog, isPageExit, lastFullEntrance, revealMode, writeRevealVisit } from "@/lib/admin-v2/reveal/gate";
import { adminMotion } from "./gsap-plugins";
import { startVisit } from "./reveal-engine";
import { setAdminRevealState } from "./use-admin-reveal";

// ADMIN v3 V1 — the orchestrator of the reveal engine, used by the screen of
// the frame. On every change of the path it asks the gate how the page enters
// (reduced motion, the quiet mode, a hidden tab, hydration, Back, the visit
// log of the session) and starts one visit of the engine; the visit is
// reverted when the path changes. It also dims the old page for 140 ms on a
// click that leaves it (the frame stays). The engine is idempotent, so the
// double run of effects in development changes nothing.

/** A shortcut („G pa slovo“) leaves the page like a click on a link does. */
export const ADMIN_NAV_INTENT_EVENT = "scanme:admin-nav-intent";
/** Dev: clears the visit log and plays the entrance of the open page again. */
export const ADMIN_REVEAL_REPLAY_EVENT = "scanme:admin-reveal-replay";
const PHONE_QUERY = "(max-width: 47.99rem)";

const noSubscription = () => () => undefined;

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export type AdminRevealRootInput = {
  screen: RefObject<HTMLElement | null>;
  page: RefObject<HTMLElement | null>;
  scanLine: RefObject<HTMLElement | null>;
  pathname: string;
  /** The key of the page in the visit log (`revealRouteKey`). */
  routeKey: string;
  quiet: boolean;
  /** Set by the screen on `popstate`; read once per visit. */
  history: RefObject<boolean>;
};

export function useAdminRevealRoot({ screen, page, scanLine, pathname, routeKey, quiet, history }: AdminRevealRootInput): void {
  // true only while the server's markup is being hydrated: what is already painted is never hidden.
  const hydrating = useSyncExternalStore(noSubscription, () => false, () => true);
  const mountedHydrating = useRef<boolean | null>(null);
  if (mountedHydrating.current === null) mountedHydrating.current = hydrating;
  const firstPath = useRef(pathname);
  const navigated = useRef(false);
  const [replay, setReplay] = useState(0);
  const pathRef = useRef(pathname);

  useLayoutEffect(() => {
    pathRef.current = pathname;
    const screenElement = screen.current;
    const pageElement = page.current;
    if (!screenElement || !pageElement) return;
    if (pathname !== firstPath.current) navigated.current = true;
    const first = !navigated.current && replay === 0;
    const back = history.current;
    const storage = sessionStore();
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    const visible = document.visibilityState === "visible";
    const mode = revealMode({
      reducedMotion,
      quiet,
      visible,
      hydrating: first && mountedHydrating.current === true,
      history: back,
      lastFullAt: lastFullEntrance(storage, routeKey),
      now: Date.now(),
    });
    setAdminRevealState({ mode, firstVisit: mode === "full", enteredAt: performance.now() });
    try {
      return startVisit({
        screen: screenElement,
        page: pageElement,
        scanLine: scanLine.current,
        mode,
        watch: !reducedMotion && !quiet && visible,
        first,
        phone: window.matchMedia(PHONE_QUERY).matches,
        onFull: () => void writeRevealVisit(sessionStore(), routeKey, Date.now()),
      });
    } catch {
      // An animation never takes the page down (ZADATAK-V3 §0): the page simply stands, as with reduced motion.
      adminMotion().gsap.set(pageElement, { clearProps: "opacity,transform" });
      return undefined;
    }
    // The quiet mode is read when a page is entered; switching it does not replay the open page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, replay]);

  // The old page dims on a click that leaves it; the frame stays. It is never hidden: the router keeps
  // the old page until the new one arrives, and an empty screen in between would read as a fault.
  useEffect(() => {
    const pageElement = page.current;
    if (!pageElement) return;
    const { gsap } = adminMotion();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const still = () => quiet || window.matchMedia(REDUCED_MOTION_QUERY).matches;
    const leave = (target: URL) => {
      if (still() || !isPageExit({ current: window.location.pathname, target, origin: window.location.origin, plain: true })) return;
      const from = pathRef.current;
      gsap.to(pageElement, { opacity: ADMIN_REVEAL.exitOpacity, scale: ADMIN_REVEAL.exitScale, duration: ADMIN_REVEAL.exit, ease: ADMIN_REVEAL_EASE.in, overwrite: true });
      if (timer) clearTimeout(timer);
      // The path did not change (the link opened a dialog, the navigation was cancelled): the page comes back.
      timer = setTimeout(() => {
        timer = null;
        if (pathRef.current === from) gsap.to(pageElement, { opacity: 1, scale: 1, duration: ADMIN_DURATION.state, ease: ADMIN_EASE.out, overwrite: true, clearProps: "opacity,transform" });
      }, ADMIN_REVEAL.exitBack * 1000);
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || !anchor.closest(".admin-v1")) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      leave(new URL(anchor.href, window.location.href));
    };
    const onIntent = (event: Event) => {
      const href = (event as CustomEvent<string>).detail;
      if (typeof href === "string") leave(new URL(href, window.location.href));
    };
    document.addEventListener("click", onClick);
    window.addEventListener(ADMIN_NAV_INTENT_EVENT, onIntent);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(ADMIN_NAV_INTENT_EVENT, onIntent);
      if (timer) clearTimeout(timer);
    };
  }, [page, quiet]);

  // Dev only: the frame script reads GSAP (to switch off its lag smoothing under a fake clock; V5: to make SplitText
  // throw and see that the page survives) and can replay an entrance.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const { gsap, SplitText } = adminMotion();
    (window as unknown as { __adminMotion?: unknown }).__adminMotion = { gsap, SplitText };
    const onReplay = () => {
      clearRevealLog(sessionStore());
      setReplay((value) => value + 1);
    };
    window.addEventListener(ADMIN_REVEAL_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(ADMIN_REVEAL_REPLAY_EVENT, onReplay);
  }, []);
}
