import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Wordmark } from "@/components/site-nav";

/**
 * Lagano podnožje za tok ponude (/ponuda i /ponuda/pregled).
 *
 * Namerno NIJE puna kopija home footera: home footer nosi ankere ka sekcijama
 * početne strane (#kako-radi, #scanme-review …) koji van home-a ne postoje, plus
 * reveal/parallax omotače vezane za `[data-text-reveal-root]` i `SiteScrollMotion`.
 * Ovde je zato samostalna, manja varijanta koja koristi isti vizuelni jezik
 * (`landing-footer`, `section-shell`, `Wordmark`, kontakt, copyright) sa
 * apsolutnim linkovima — bez ijedne izmene na početnoj strani.
 */
export function OfferFooter({ contactHref = "/#ponuda" }: { contactHref?: string } = {}) {
  return (
    <footer className="landing-footer border-t border-foreground/10">
      <div className="section-shell py-14 sm:py-16 lg:py-20">
        <div className="grid gap-x-12 gap-y-12 md:grid-cols-[minmax(18rem,1.4fr)_1fr]">
          <div className="max-w-[34rem]">
            <Link
              href="/"
              className="focus-signal inline-flex min-h-11 items-center"
              aria-label="ScanMe, povratak na početnu"
            >
              <Wordmark />
            </Link>
            <p className="mt-6 max-w-[36ch] text-base leading-7 text-foreground/58">
              Fizički predmet postaje jasan digitalni put, bez dodatne aplikacije i bez
              tehničkog tereta za vaš tim.
            </p>
            <Link href={contactHref} className="button-secondary focus-signal mt-7">
              Zatraži ponudu
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
            </Link>
          </div>

          <div>
            <h2 className="text-sm font-semibold tracking-[-0.02em]">Kontakt</h2>
            <dl className="mt-5 grid gap-5 text-sm">
              <div className="grid gap-1.5">
                <dt className="text-foreground/44">Telefon</dt>
                <dd>
                  <a
                    href="tel:+381658644488"
                    className="focus-signal inline-flex min-h-11 items-center leading-6 text-foreground/72 transition-colors duration-200 hover:text-foreground"
                  >
                    065/86-444-88 (Aleksa Đorđević)
                  </a>
                </dd>
              </div>
              <div className="grid gap-1.5">
                <dt className="text-foreground/44">Email</dt>
                <dd>
                  <a
                    href="mailto:office@scanme.rs"
                    className="focus-signal inline-flex min-h-11 items-center text-foreground/72 transition-colors duration-200 hover:text-foreground"
                  >
                    office@scanme.rs
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-12 border-t border-foreground/10 pt-7 text-sm text-foreground/48 sm:mt-14">
          <p>© 2026 ScanMe. Sva prava zadržana.</p>
        </div>
      </div>
    </footer>
  );
}
