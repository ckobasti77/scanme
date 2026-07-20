"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LiquidGlassSystem } from "@/components/liquid-glass";
import { MarketingVideoBackground } from "@/components/marketing-video-background";
import { ScanStory } from "@/components/scan-story";
import { SiteNav, type MarketingNavMode } from "@/components/site-nav";
import {
  isServiceId,
  type MarketingTheme,
  type ServiceId,
} from "@/lib/marketing-services";

const THEME_STORAGE_KEY = "scanme-marketing-theme";

function getDocumentTheme(): MarketingTheme {
  return document.documentElement.dataset.marketingTheme === "light" ? "light" : "dark";
}

export function MarketingExperience({
  initialService,
  portalFontClassName = "",
  children,
}: {
  initialService: ServiceId;
  portalFontClassName?: string;
  children: ReactNode;
}) {
  const [activeService, setActiveService] = useState<ServiceId>(initialService);
  const [theme, setTheme] = useState<MarketingTheme>("dark");
  const [themeReady, setThemeReady] = useState(false);
  const [navMode, setNavMode] = useState<MarketingNavMode>("full");
  const [heroIsBehindNav, setHeroIsBehindNav] = useState(true);
  const activeServiceRef = useRef(activeService);

  useEffect(() => {
    activeServiceRef.current = activeService;
  }, [activeService]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const syncTheme = () => {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      const nextTheme =
        savedTheme === "light" || savedTheme === "dark"
          ? savedTheme
          : mediaQuery.matches
            ? "light"
            : "dark";
      document.documentElement.dataset.marketingTheme = nextTheme;
      setTheme(nextTheme);
      setThemeReady(true);
    };

    syncTheme();
    mediaQuery.addEventListener("change", syncTheme);
    return () => mediaQuery.removeEventListener("change", syncTheme);
  }, []);

  useEffect(() => {
    const syncServiceFromUrl = () => {
      const url = new URL(window.location.href);
      const requestedService = url.searchParams.get("service");
      const nextService = isServiceId(requestedService) ? requestedService : "reviews";

      if (!isServiceId(requestedService)) {
        url.searchParams.set("service", nextService);
        window.history.replaceState(window.history.state, "", url);
      }

      if (activeServiceRef.current !== nextService) {
        activeServiceRef.current = nextService;
        setActiveService(nextService);
      }
    };

    syncServiceFromUrl();
    window.addEventListener("popstate", syncServiceFromUrl);
    return () => window.removeEventListener("popstate", syncServiceFromUrl);
  }, []);

  useEffect(() => {
    let frame = 0;
    let lastScrollY = window.scrollY;
    let direction = 0;
    let distanceInDirection = 0;

    const updateScrollState = () => {
      frame = 0;
      const scrollY = Math.max(0, window.scrollY);
      const delta = scrollY - lastScrollY;

      if (Math.abs(delta) >= 1) {
        const nextDirection = delta > 0 ? 1 : -1;
        const navigationOverlayOpen = Boolean(
          document.querySelector('[role="menu"], [role="dialog"]'),
        );
        if (nextDirection !== direction) {
          direction = nextDirection;
          distanceInDirection = 0;
        }
        distanceInDirection += delta;

        if (scrollY <= 20) {
          setNavMode("full");
        } else if (
          direction > 0 &&
          distanceInDirection >= 22 &&
          scrollY > 56 &&
          !navigationOverlayOpen
        ) {
          setNavMode("floating");
          distanceInDirection = 0;
        } else if (direction < 0 && distanceInDirection <= -16) {
          setNavMode("full");
          distanceInDirection = 0;
        }
      }

      const hero = document.querySelector<HTMLElement>("[data-scroll-story-hero]");
      if (hero) {
        const rect = hero.getBoundingClientRect();
        const isBehind = rect.top < 88 && rect.bottom > 76;
        setHeroIsBehindNav((current) => (current === isBehind ? current : isBehind));
      }

      lastScrollY = scrollY;
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateScrollState);
    };

    updateScrollState();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const selectService = useCallback((service: ServiceId) => {
    if (service === activeServiceRef.current) return;

    activeServiceRef.current = service;
    setActiveService(service);

    const url = new URL(window.location.href);
    url.searchParams.set("service", service);
    window.history.replaceState(window.history.state, "", url);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme: MarketingTheme = getDocumentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.marketingTheme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  }, []);

  return (
    <>
      {themeReady ? <MarketingVideoBackground theme={theme} /> : null}
      <LiquidGlassSystem theme={theme} />
      <SiteNav
        activeService={activeService}
        heroIsBehindNav={heroIsBehindNav}
        mode={navMode}
        onServiceChange={selectService}
        onThemeToggle={toggleTheme}
        portalFontClassName={portalFontClassName}
        theme={theme}
      />
      <main id="glavni-sadrzaj">
        <ScanStory activeService={activeService} theme={theme} />
        {children}
      </main>
    </>
  );
}
