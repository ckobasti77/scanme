"use client";

import { useConvexAuth } from "convex/react";
import { ArrowUpRight, Menu } from "lucide-react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ClientLoginForm } from "@/components/client-panel/client-login";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "#kako-radi", label: "Kako radi" },
  { href: "#scanme-review", label: "ScanMe Review" },
  { href: "#za-koga", label: "Za koga" },
  { href: "#faq", label: "FAQ" },
  { href: "#ponuda", label: "Kontakt" },
];

export function Wordmark() {
  return (
    <span className="inline-flex min-h-11 items-center">
      <BrandLogo />
      <span className="sr-only">ScanMe</span>
    </span>
  );
}

export function SiteNav() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clientLoginOpen, setClientLoginOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);
  const reduceMotion = Boolean(useReducedMotion());
  const { scrollY } = useScroll();
  const router = useRouter();

  useEffect(() => {
    lastScrollY.current = scrollY.get();
  }, [scrollY]);

  useMotionValueEvent(scrollY, "change", (currentScrollY) => {
    const previousScrollY = lastScrollY.current;
    const delta = currentScrollY - previousScrollY;

    if (mobileOpen || clientLoginOpen || currentScrollY <= 8) {
      setNavHidden(false);
    } else if (delta > 1) {
      setNavHidden(true);
    } else if (delta < 0) {
      setNavHidden(false);
    }

    lastScrollY.current = currentScrollY;
  });

  function openClientLogin() {
    setMobileOpen(false);
    setClientLoginOpen(true);
    setNavHidden(false);
  }

  function handleMobileOpenChange(open: boolean) {
    setMobileOpen(open);
    if (open) setNavHidden(false);
  }

  function handleClientLoginOpenChange(open: boolean) {
    setClientLoginOpen(open);
    if (open) setNavHidden(false);
  }

  return (
    <>
      <motion.header
        initial={false}
        animate={{ y: navHidden ? "-100%" : "0%" }}
        transition={reduceMotion
          ? { duration: 0 }
          : navHidden
            ? { duration: 0.2, ease: [0.4, 0, 1, 1] }
            : { duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        onFocusCapture={() => setNavHidden(false)}
        className="pointer-events-none fixed inset-x-0 top-0 z-40 will-change-transform"
      >
        <nav
          className="site-nav-glass pointer-events-auto h-[72px] w-full"
          aria-label="Glavna navigacija"
        >
          <div className="section-shell flex h-full items-center justify-between xl:grid xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:gap-5">
          <Link
            href="#pocetak"
            className="focus-signal inline-flex min-h-11 items-center xl:justify-self-start"
            aria-label="ScanMe, početak"
          >
            <Wordmark />
          </Link>

          <div className="hidden min-w-0 items-center justify-center gap-4 xl:flex xl:justify-self-center 2xl:gap-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="focus-signal inline-flex min-h-11 items-center whitespace-nowrap text-[0.78rem] text-foreground/72 transition-colors duration-200 hover:text-foreground 2xl:text-sm"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-2 xl:flex xl:justify-self-end 2xl:gap-3">
            <ThemeToggle />
            <ClientAccessAction isAuthenticated={isAuthenticated} isLoading={isLoading} onOpen={openClientLogin} />
            <Link href="#ponuda" className="button-primary focus-signal">
              Zatraži ponudu
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Link>
          </div>

          <div className="flex items-center gap-2 xl:hidden">
            <ThemeToggle />
            <Sheet open={mobileOpen} onOpenChange={handleMobileOpenChange}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="focus-signal inline-flex size-11 items-center justify-center border border-foreground/20 text-foreground xl:hidden"
                  aria-label="Otvori meni"
                >
                  <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </button>
              </SheetTrigger>
              <SheetContent className="w-[min(88vw,420px)] border-foreground/15 bg-background p-6 text-foreground shadow-none">
                <SheetHeader className="border-b border-foreground/12 pb-6 text-left">
                  <SheetTitle aria-label="ScanMe meni">
                    <Wordmark />
                  </SheetTitle>
                  <SheetDescription className="text-foreground/60">
                    Fizički materijal koji vodi do prave digitalne akcije.
                  </SheetDescription>
                </SheetHeader>
                <div className="grid gap-1 py-5">
                  {links.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <Link
                        href={link.href}
                        className="focus-signal flex min-h-12 items-center border-b border-foreground/10 text-lg text-foreground/84"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}
                  {!isLoading && isAuthenticated ? (
                    <SheetClose asChild>
                      <Link href="/client-panel" className="focus-signal flex min-h-12 items-center justify-between border-b border-foreground/10 text-lg text-accent-readable">
                        Client panel
                        <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      </Link>
                    </SheetClose>
                  ) : !isLoading ? (
                    <button type="button" onClick={openClientLogin} className="focus-signal flex min-h-12 items-center justify-between border-b border-foreground/10 text-left text-lg text-accent-readable">
                      Prijava klijenta
                      <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    </button>
                  ) : null}
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
          </div>
        </nav>
      </motion.header>

      <Dialog open={clientLoginOpen} onOpenChange={handleClientLoginOpenChange}>
        <DialogContent className="max-h-[min(90dvh,720px)] overflow-y-auto border-foreground/15 bg-card p-6 text-foreground shadow-none sm:p-8">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-2xl tracking-[-0.04em]">Prijava za klijente</DialogTitle>
            <DialogDescription className="text-foreground/60">
              Ulogujte se emailom iz ScanMe pozivnice. Posle prijave otvaramo vaš client panel.
            </DialogDescription>
          </DialogHeader>
          <ClientLoginForm
            compact
            onSuccess={() => {
              setClientLoginOpen(false);
              router.replace("/client-panel");
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClientAccessAction({
  isAuthenticated,
  isLoading,
  onOpen,
}: {
  isAuthenticated: boolean;
  isLoading: boolean;
  onOpen: () => void;
}) {
  if (isLoading) {
    return <span className="h-11 w-28 animate-pulse bg-foreground/8" aria-hidden="true" />;
  }

  if (isAuthenticated) {
    return (
      <Link href="/client-panel" className="focus-signal inline-flex min-h-11 items-center gap-2 px-3 text-sm text-accent-readable transition-colors hover:text-foreground">
        Client panel
        <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </Link>
    );
  }

  return (
    <button type="button" onClick={onOpen} className="focus-signal inline-flex min-h-11 items-center gap-2 border border-foreground/20 px-4 text-sm text-foreground/76 transition-colors hover:border-primary hover:text-accent-readable">
      Prijava klijenta
      <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
    </button>
  );
}
