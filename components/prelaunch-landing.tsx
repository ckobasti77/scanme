import { existsSync } from "node:fs";
import path from "node:path";
import { BrandLogo } from "@/components/brand-logo";
import { HeroIntro } from "@/components/hero-intro";
import { HeroMedia } from "@/components/hero-media";
import { PrelaunchFairBanner } from "@/components/prelaunch-fair-banner";
import { PrelaunchNav } from "@/components/prelaunch-nav";
import { PrelaunchServiceCards } from "@/components/prelaunch-service-cards";
import { ScanStory } from "@/components/scan-story";
import { prelaunchSr as dict } from "@/lib/i18n/sr/prelaunch";
import { FAIR_BANNER_ENABLED } from "@/lib/prelaunch-fair-banner";
import styles from "./prelaunch-landing.module.css";

const navLinks = [
  { href: "#kako-radi", label: dict.nav.story },
  { href: "#usluge", label: dict.nav.services },
  { href: "#kontakt", label: dict.nav.contact },
] as const;

function Footer() {
  return (
    <footer id="kontakt" className={styles.footer} data-reveal="off">
      <div className="section-shell">
        <div className={styles.footerGrid}>
          <div>
            <a href="#pocetak" className="focus-signal inline-flex min-h-11 items-center" aria-label={dict.nav.homeAria}>
              <BrandLogo />
            </a>
            {FAIR_BANNER_ENABLED ? <p className={styles.footerFair}>{dict.footer.fair}</p> : null}
          </div>
          <nav aria-label={dict.nav.aria} className={styles.footerNav}>
            {navLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          </nav>
          <dl className={styles.contactList}>
            <div>
              <dt>{dict.footer.emailLabel}</dt>
              <dd><a href={`mailto:${dict.footer.email}`}>{dict.footer.email}</a></dd>
            </div>
          </dl>
        </div>
        <p className={styles.rights}>{dict.footer.rights}</p>
      </div>
    </footer>
  );
}

export function PrelaunchLanding() {
  const hasVideo = existsSync(path.join(process.cwd(), "public", "videos", "scanme-hero.mp4"));
  const hasPoster = existsSync(path.join(process.cwd(), "public", "images", "scanme-hero-poster.webp"));

  return (
    <>
      <a href="#glavni-sadrzaj" className="skip-link">{dict.skip}</a>
      <PrelaunchNav />
      <div className={styles.scanBeam} aria-hidden="true" />
      <div className={`${styles.contentLayer} landing-atmosphere`} data-text-reveal-root>
        <main id="glavni-sadrzaj">
          {FAIR_BANNER_ENABLED ? <PrelaunchFairBanner /> : null}
          <section id="pocetak" data-reveal="off" className={`${styles.hero} hero-scan-depth`}>
            <HeroMedia hasVideo={hasVideo} hasPoster={hasPoster} />
            <HeroIntro
              heightFromParent
              primaryLabel={dict.hero.primaryCta}
              primaryHref="#kako-radi"
              singleCta
              showMenuSoon
              menuLabel={dict.services.items[2].name}
              soonLabel={dict.services.soon}
            />
          </section>

          <ScanStory title={dict.story.title} compact />

          <section id="usluge" className={`${styles.servicesSection} section-shell`} data-reveal="off">
            <div className={styles.servicesHeader}>
              <p className={styles.sectionEyebrow}>{dict.services.eyebrow}</p>
              <h2>{dict.services.title}</h2>
              <p className={styles.servicesBody}>{dict.services.body}</p>
            </div>
            <PrelaunchServiceCards />
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
