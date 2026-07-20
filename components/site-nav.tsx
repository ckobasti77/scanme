"use client";

import Link from "next/link";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
} from "framer-motion";
import { ArrowUpRight, ChevronDown, Menu, Moon, Sun } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SERVICE_IDS, type MarketingTheme, type ServiceId } from "@/lib/marketing-services";
import { cn } from "@/lib/utils";

const leftLinks = [
  { href: "#kako-radi", label: "Kako radi" },
  { href: "#resenja", label: "Rešenja" },
] as const;

const rightLinks = [
  { href: "#za-koga", label: "Za koga" },
  { href: "#faq", label: "FAQ" },
] as const;

const mobileLinks = [...leftLinks, ...rightLinks];

export type MarketingNavMode = "full" | "floating";

function MarketingLiquidGlassFilter() {
  return (
    <svg className="hidden" aria-hidden="true">
      <defs>
        <filter
          id="marketing-liquid-glass-filter"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves="1"
            seed="1"
            result="turbulence"
          />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale="70"
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-base font-semibold tracking-[-0.04em]">
      <BrandMark priority />
      <span className="marketing-wordmark-text">ScanMe</span>
    </span>
  );
}

function ThemeToggle({
  compact = false,
  theme,
  onToggle,
}: {
  compact?: boolean;
  theme: MarketingTheme;
  onToggle: () => void;
}) {
  const nextTheme = theme === "dark" ? "svetlu" : "tamnu";
  return (
    <button
      type="button"
      className={cn(
        "marketing-icon-button focus-signal",
        compact && "liquid-glass marketing-floating-theme-toggle",
      )}
      onClick={onToggle}
      aria-label={`Uključi ${nextTheme} temu`}
      title={`Uključi ${nextTheme} temu`}
    >
      <Sun
        aria-hidden="true"
        className="marketing-theme-icon-light size-[18px]"
        strokeWidth={1.7}
      />
      <Moon
        aria-hidden="true"
        className="marketing-theme-icon-dark size-[18px]"
        strokeWidth={1.7}
      />
    </button>
  );
}

function ServiceControl({
  activeService,
  floating,
  onServiceChange,
  service,
}: {
  activeService: ServiceId;
  floating: boolean;
  onServiceChange: (service: ServiceId) => void;
  service: ServiceId;
}) {
  const active = service === activeService;

  return (
    <motion.button
      layout
      layoutId={`marketing-service-${service}`}
      type="button"
      className={cn(
        "focus-signal marketing-service-control",
        floating && "marketing-service-chip",
        active && "is-active",
      )}
      onClick={() => onServiceChange(service)}
      aria-pressed={active}
    >
      {floating ? (
        <span className="liquid-glass marketing-service-chip-surface">
          <span className="marketing-service-label">{service}</span>
        </span>
      ) : (
        <span className="marketing-service-label">{service}</span>
      )}
    </motion.button>
  );
}

function ServiceControls({
  activeService,
  onServiceChange,
  floating = false,
}: {
  activeService: ServiceId;
  onServiceChange: (service: ServiceId) => void;
  floating?: boolean;
}) {
  return (
    <div
      className={floating ? "marketing-floating-services" : "marketing-service-links"}
      aria-label="Izbor usluge"
      role="group"
    >
      {SERVICE_IDS.map((service) => (
        <ServiceControl
          activeService={activeService}
          floating={floating}
          key={service}
          onServiceChange={onServiceChange}
          service={service}
        />
      ))}
    </div>
  );
}

export function SiteNav({
  activeService,
  heroIsBehindNav,
  mode,
  onServiceChange,
  onThemeToggle,
  portalFontClassName = "",
  theme,
}: {
  activeService: ServiceId;
  heroIsBehindNav: boolean;
  mode: MarketingNavMode;
  onServiceChange: (service: ServiceId) => void;
  onThemeToggle: () => void;
  portalFontClassName?: string;
  theme: MarketingTheme;
}) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}>
      <LayoutGroup id="marketing-navigation">
        <MarketingLiquidGlassFilter />
        <AnimatePresence initial={false}>
          {mode === "full" ? (
            <motion.header
              key="full-navigation"
              initial={{ y: -88, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -88, opacity: 0 }}
              className={cn(
                "marketing-site-header liquid-glass",
                heroIsBehindNav && "hero-is-behind",
              )}
            >
              <nav className="section-shell marketing-nav-grid" aria-label="Glavna navigacija">
                <div className="marketing-nav-left">
                  <Link
                    href="#pocetak"
                    className="focus-signal marketing-wordmark-link"
                    aria-label="ScanMe, početak"
                  >
                    <Wordmark />
                  </Link>
                  {leftLinks.map((link) => (
                    <Link key={link.href} href={link.href} className="focus-signal marketing-nav-link">
                      {link.label}
                    </Link>
                  ))}
                </div>

                <div className="marketing-nav-center">
                  <ServiceControls
                    activeService={activeService}
                    onServiceChange={onServiceChange}
                  />
                </div>

                <div className="marketing-nav-right">
                  {rightLinks.map((link) => (
                    <Link key={link.href} href={link.href} className="focus-signal marketing-nav-link">
                      {link.label}
                    </Link>
                  ))}
                  <ThemeToggle theme={theme} onToggle={onThemeToggle} />
                  <Link href="#ponuda" className="button-primary focus-signal">
                    Zatraži ponudu
                    <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  </Link>
                </div>

                <div className="marketing-mobile-nav">
                  <Link
                    href="#pocetak"
                    className="focus-signal marketing-wordmark-link"
                    aria-label="ScanMe, početak"
                  >
                    <Wordmark />
                  </Link>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "liquid-glass focus-signal marketing-context-service is-active",
                        )}
                        aria-label="Izaberi ScanMe uslugu"
                      >
                        <span>{activeService}</span>
                        <ChevronDown aria-hidden="true" className="size-3.5" strokeWidth={1.7} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="center"
                      sideOffset={12}
                      data-marketing-theme={theme}
                      className={`marketing-service-menu ${portalFontClassName}`}
                    >
                      {SERVICE_IDS.map((service) => (
                        <DropdownMenuItem
                          key={service}
                          className={cn(
                            "marketing-service-menu-item",
                            service === activeService && "is-current",
                          )}
                          onSelect={() => onServiceChange(service)}
                        >
                          {service}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Sheet>
                    <SheetTrigger asChild>
                      <button
                        type="button"
                        className="marketing-icon-button focus-signal"
                        aria-label="Otvori meni"
                      >
                        <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
                      </button>
                    </SheetTrigger>
                    <SheetContent
                      data-marketing-theme={theme}
                      className={`marketing-sheet ${portalFontClassName}`}
                    >
                      <SheetHeader className="marketing-sheet-header text-left">
                        <SheetTitle aria-label="ScanMe meni">
                          <Wordmark />
                        </SheetTitle>
                        <SheetDescription>
                          Jedan fizički trenutak. Mnogo digitalnih prilika.
                        </SheetDescription>
                      </SheetHeader>

                      <div className="marketing-sheet-links">
                        {mobileLinks.map((link) => (
                          <SheetClose asChild key={link.href}>
                            <Link href={link.href} className="focus-signal marketing-sheet-link">
                              {link.label}
                            </Link>
                          </SheetClose>
                        ))}
                      </div>

                      <div className="marketing-sheet-theme-row">
                        <span>Tema sajta</span>
                        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
                      </div>

                      <SheetClose asChild>
                        <Link href="#ponuda" className="button-primary focus-signal mt-auto w-full">
                          Zatraži ponudu
                          <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                        </Link>
                      </SheetClose>
                    </SheetContent>
                  </Sheet>
                </div>
              </nav>
            </motion.header>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {mode === "floating" ? (
            <motion.div
              key="floating-services"
              className="marketing-floating-wrap"
              initial={{ y: -42, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -36, opacity: 0, scale: 0.97 }}
            >
              <div className="marketing-floating-shell">
                <Link
                  href="#pocetak"
                  className="liquid-glass focus-signal marketing-floating-wordmark"
                  aria-label={"ScanMe, po\u010detak"}
                >
                  <BrandMark className="size-9" priority />
                </Link>

                <ServiceControls
                  activeService={activeService}
                  onServiceChange={onServiceChange}
                  floating
                />

                <div className="marketing-floating-actions">
                  <ThemeToggle compact theme={theme} onToggle={onThemeToggle} />
                  <Link href="#ponuda" className="button-primary focus-signal marketing-floating-cta">
                    <span>Ponuda</span>
                    <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                  </Link>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </LayoutGroup>
    </MotionConfig>
  );
}
