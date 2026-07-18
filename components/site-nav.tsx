"use client";

import { useConvexAuth } from "convex/react";
import { ArrowUpRight, Menu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "#kako-radi", label: "Kako radi" },
  { href: "#resenja", label: "Rešenja" },
  { href: "#za-koga", label: "Za koga" },
  { href: "#faq", label: "FAQ" },
];

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-base font-semibold tracking-[-0.04em]">
      <span className="scan-mark" aria-hidden="true" />
      ScanMe
    </span>
  );
}

export function SiteNav() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clientLoginOpen, setClientLoginOpen] = useState(false);
  const router = useRouter();

  function openClientLogin() {
    setMobileOpen(false);
    setClientLoginOpen(true);
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-foreground/10 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/72">
        <nav
          className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-10"
          aria-label="Glavna navigacija"
        >
          <Link
            href="#pocetak"
            className="focus-signal inline-flex min-h-11 items-center lg:justify-self-start"
            aria-label="ScanMe, početak"
          >
            <Wordmark />
          </Link>

          <div className="hidden items-center gap-7 lg:flex lg:justify-self-center">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="focus-signal inline-flex min-h-11 items-center text-sm text-foreground/72 transition-colors duration-200 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-3 lg:flex lg:justify-self-end">
            <ThemeToggle />
            <ClientAccessAction isAuthenticated={isAuthenticated} isLoading={isLoading} onOpen={openClientLogin} />
            <Link href="#ponuda" className="button-primary focus-signal">
              Zatraži ponudu
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Link>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="focus-signal inline-flex size-11 items-center justify-center border border-foreground/20 text-foreground lg:hidden"
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
        </nav>
      </header>

      <Dialog open={clientLoginOpen} onOpenChange={setClientLoginOpen}>
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
