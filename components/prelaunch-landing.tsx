import { existsSync } from "node:fs";
import path from "node:path";
import { Link2, Star, UtensilsCrossed } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { HeroIntro } from "@/components/hero-intro";
import { HeroMedia } from "@/components/hero-media";
import { PrelaunchNav } from "@/components/prelaunch-nav";
import { ScanStory } from "@/components/scan-story";
import { prelaunchSr as dict } from "@/lib/i18n/sr/prelaunch";
import packageStyles from "./landing-packages.module.css";
import styles from "./prelaunch-landing.module.css";

const serviceIcons = [Link2, Star, UtensilsCrossed] as const;

const navLinks = [
  { href: "#kako-radi", label: dict.nav.story },
  { href: "#usluge", label: dict.nav.services },
  { href: "#kontakt", label: dict.nav.contact },
] as const;

function FairMasthead() {
  return (
    <aside
      className={styles.fairMasthead}
      aria-label={`${dict.hero.partner}: ${dict.hero.fairName}`}
      data-reveal="off"
    >
      <div className={`${styles.fairMastheadInner} section-shell`}>
        <div className={styles.fairMastheadTitle} aria-hidden="true">
          <span className={styles.fairMastheadLabel}>{dict.fair.eventLabel}</span>
          <span className={styles.fairMastheadSolid}>Sajam</span>
          <span className={styles.fairMastheadOutline}>automobila</span>
          <span className={styles.fairMastheadDot}>·</span>
          <span className={styles.fairMastheadCity}>Niš</span>
          <span className={styles.fairMastheadYearRail}>
            <span className={styles.fairMastheadYear}>{dict.fair.year}</span>
          </span>
        </div>

        <div className={styles.fairMastheadMeta}>
          <p className={styles.fairMastheadPartner}>
            <span>{dict.hero.partner}</span>
            <i aria-hidden="true">—</i>
            <BrandLogo className={styles.fairMastheadWordmark} width="clamp(7.5rem, 9vw, 10rem)" />
          </p>
          <div className={styles.fairMastheadDates}>
            {dict.fair.mastheadDates.map((date) => (
              <p key={`${date.firstLine}-${date.secondLine}`}>
                <strong>{date.firstLine}</strong>
                <span>{date.secondLine}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function Footer() {
  return (
    <footer id="kontakt" className={styles.footer} data-reveal="off">
      <div className="section-shell">
        <div className={styles.footerGrid}>
          <div>
            <a href="#pocetak" className="focus-signal inline-flex min-h-11 items-center" aria-label={dict.nav.homeAria}>
              <BrandLogo />
            </a>
            <p className={styles.footerFair}>{dict.footer.fair}</p>
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
          <FairMasthead />
          <section id="pocetak" data-reveal="off" className={`${styles.hero} hero-scan-depth`}>
            <HeroMedia hasVideo={hasVideo} hasPoster={hasPoster} />
            <HeroIntro
              compact
              primaryLabel={dict.hero.primaryCta}
              primaryHref="#kako-radi"
              singleCta
              showMenuSoon
              menuLabel={dict.services.items[2].name}
              soonLabel={dict.services.soon}
            />
          </section>

          <ScanStory title={dict.story.title} compact />

          <section id="usluge" className={`${styles.servicesSection} section-shell offer-surface`}>
            <div className={styles.servicesHeader}>
              <h2>{dict.services.title}</h2>
            </div>
            <div className={styles.serviceGrid} data-reveal-group>
              {dict.services.items.map((service, index) => {
                const Icon = serviceIcons[index];
                return (
                  <article
                    key={service.name}
                    className={`${packageStyles.card} ${styles.serviceCardFrame} offer-glass offer-glass--panel`}
                  >
                    <span className={packageStyles.icon} aria-hidden="true">
                      <Icon size={22} strokeWidth={1.7} />
                    </span>
                    {service.status === "soon" && (
                      <span className={packageStyles.soonTag}>{dict.services.soon}</span>
                    )}
                    <h3 className={packageStyles.name}>{service.name}</h3>
                    <p className={packageStyles.sentence}>{service.body}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
