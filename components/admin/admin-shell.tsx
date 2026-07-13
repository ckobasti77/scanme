"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/admin/google-reviews", label: "Google Review kartice" },
  { href: "/admin/page", label: "ScanMe Page" },
  { href: "/admin/venue", label: "ScanMe Venue" },
  { href: "/admin/memories", label: "ScanMe Memories" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link href="/admin/google-reviews" className="flex min-h-11 shrink-0 items-center gap-3 font-semibold">
            <span className="scan-mark" aria-hidden="true" />
            <span className="hidden sm:inline">SCANME ADMIN</span>
          </Link>
          <button type="button" onClick={() => void signOut()} className="button-secondary h-11 min-h-11 px-3" aria-label="Odjavi se">
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Odjava</span>
          </button>
        </div>
        <nav aria-label="Admin servisi" className="mx-auto max-w-[1500px] overflow-x-auto px-4 lg:px-8">
          <div className="flex min-w-max gap-1">
            {navigation.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center border-b-2 px-3 text-xs font-semibold transition-colors",
                    active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main id="main-content" className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8 lg:py-10">{children}</main>
    </div>
  );
}
