"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { prelaunchSr as dict } from "@/lib/i18n/sr/prelaunch";
import styles from "./prelaunch-landing.module.css";

const links = [
  { href: "#kako-radi", label: dict.nav.story },
  { href: "#usluge", label: dict.nav.services },
  { href: "#kontakt", label: dict.nav.contact },
] as const;

export function PrelaunchNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header} data-reveal="off">
      <nav className={`${styles.nav} section-shell`} aria-label={dict.nav.aria}>
        <Link href="#pocetak" className="focus-signal inline-flex min-h-11 items-center" aria-label={dict.nav.homeAria} onClick={() => setOpen(false)}>
          <BrandLogo />
          <span className="sr-only">ScanMe</span>
        </Link>

        <div className={styles.desktopLinks}>
          {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </div>

        <div className={styles.navActions}>
          <ThemeToggle />
          <Link href="#kako-radi" className={`${styles.navCta} button-primary focus-signal`}>
            {dict.nav.cta}
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
          </Link>
          <button
            type="button"
            className={`${styles.mobileMenuButton} focus-signal`}
            aria-label={dict.nav.menu}
            aria-expanded={open}
            aria-controls="prelaunch-mobile-menu"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X aria-hidden="true" className="size-5" strokeWidth={1.7} /> : <Menu aria-hidden="true" className="size-5" strokeWidth={1.7} />}
          </button>
        </div>

        {open ? (
          <div id="prelaunch-mobile-menu" className={styles.mobileMenuPanel}>
            {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
            <Link href="#kako-radi" className="button-primary focus-signal" onClick={() => setOpen(false)}>{dict.nav.cta}</Link>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
