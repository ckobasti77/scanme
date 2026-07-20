import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Manrope } from "next/font/google";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { MarketingVideoBackground } from "@/components/marketing-video-background";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalPageShellProps = {
  documentCode: string;
  eyebrow: string;
  title: string;
  introduction: ReactNode;
  sections: readonly LegalSection[];
};

const lastUpdated = "20. jul 2026.";

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-manrope",
  display: "swap",
});

const displayType: CSSProperties = {
  fontFamily: "var(--font-display, var(--font-plex-mono)), ui-monospace, monospace",
};

const bodyType: CSSProperties = {
  fontFamily: "var(--font-body, var(--font-sans)), ui-sans-serif, sans-serif",
};

const legalTheme = {
  ...bodyType,
  colorScheme: "dark",
  "--marketing-bg": "#0b0c0a",
  "--marketing-text": "#f1f3ed",
  "--marketing-muted": "#a7ab9f",
  "--marketing-border": "rgb(241 243 237 / 0.13)",
  "--marketing-border-strong": "rgb(241 243 237 / 0.22)",
  "--marketing-glass-still": "rgb(23 25 19 / 0.94)",
} as CSSProperties;

const glassSurface: CSSProperties = {
  background: "rgb(12 14 11 / 0.66)",
  WebkitBackdropFilter: "blur(22px) saturate(135%)",
  backdropFilter: 'url("#marketing-liquid-glass-filter")',
};

function LegalGlassFilter() {
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

export function LegalPageShell({
  documentCode,
  eyebrow,
  title,
  introduction,
  sections,
}: LegalPageShellProps) {
  return (
    <div
      className={`marketing-home ${manrope.variable} ${manrope.className} relative min-h-svh overflow-x-clip bg-[#0b0c0a] text-[#f1f3ed]`}
      style={legalTheme}
    >
      <MarketingVideoBackground theme="dark" />
      <div
        className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(180deg,rgba(7,8,6,0.58),rgba(7,8,6,0.82))]"
        aria-hidden="true"
      />
      <LegalGlassFilter />

      <a href="#pravni-sadrzaj" className="skip-link">
        Preskoči na sadržaj
      </a>

      <header className="relative z-10 px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4">
          <Link
            href="/"
            className="liquid-glass focus-signal inline-flex min-h-12 items-center gap-3 rounded-full border border-white/15 px-4 text-sm font-semibold text-[#f1f3ed] transition-[border-color,color,transform] duration-200 hover:border-[#c6ff4a]/60 hover:text-[#c6ff4a] active:scale-[0.98]"
            style={glassSurface}
            aria-label="Nazad na ScanMe početnu stranicu"
          >
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
            <BrandMark className="size-6" priority />
            <span>ScanMe</span>
          </Link>

          <span className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-white/50 sm:block">
            {documentCode}
          </span>
        </div>
      </header>

      <main id="pravni-sadrzaj" className="relative z-10 px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="max-w-[850px]">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#c6ff4a]">
              <span className="size-2 rounded-[3px] bg-[#c6ff4a]" aria-hidden="true" />
              {eyebrow}
            </div>
            <h1
              className="mt-6 max-w-[14ch] text-4xl font-semibold leading-[0.95] tracking-[-0.055em] [text-wrap:balance] sm:text-6xl lg:text-7xl"
              style={displayType}
            >
              {title}
            </h1>
            <div className="mt-7 max-w-[68ch] text-base leading-8 text-white/70 sm:text-lg">
              {introduction}
            </div>
            <dl className="mt-8 grid max-w-[680px] grid-cols-1 gap-px overflow-hidden rounded-[20px] border border-white/12 bg-white/12 text-sm sm:grid-cols-2">
              <div className="bg-[#0c0e0b]/80 px-5 py-4">
                <dt className="text-xs uppercase tracking-[0.14em] text-white/45">Dokument</dt>
                <dd className="mt-1.5 font-semibold text-white/85">{documentCode}</dd>
              </div>
              <div className="bg-[#0c0e0b]/80 px-5 py-4">
                <dt className="text-xs uppercase tracking-[0.14em] text-white/45">Poslednja izmena</dt>
                <dd className="mt-1.5 font-semibold text-white/85">{lastUpdated}</dd>
              </div>
            </dl>
          </div>

          <aside
            className="mt-10 rounded-[24px] border border-[#c6ff4a]/35 bg-[#c6ff4a]/[0.065] p-5 sm:p-6"
            aria-label="Status pravnog dokumenta"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c6ff4a]">
              Nacrt za pravnu proveru
            </p>
            <p className="mt-2 max-w-[82ch] text-sm leading-6 text-white/72">
              Ovaj tekst je radni nacrt, nije pravni savet i mora ga pregledati kvalifikovano lice pre puštanja sajta u produkciju. Pre objave je potrebno uneti tačan identitet i kontakt rukovaoca odnosno pružaoca usluge.
            </p>
          </aside>

          <div className="mt-12 grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
            <nav
              className="liquid-glass rounded-[28px] border border-white/15 p-5 lg:sticky lg:top-6"
              style={glassSurface}
              aria-label="Sadržaj dokumenta"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
                Sadržaj
              </p>
              <ol className="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="focus-signal group flex min-h-11 items-start gap-3 rounded-[14px] px-3 py-2.5 text-sm leading-5 text-white/62 transition-colors hover:bg-white/[0.055] hover:text-white"
                    >
                      <span
                        className="mt-px shrink-0 font-medium text-[#c6ff4a]/65 transition-colors group-hover:text-[#c6ff4a]"
                        style={displayType}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{section.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <article
              className="liquid-glass overflow-hidden rounded-[32px] border border-white/15 px-5 sm:px-8 lg:px-11"
              style={glassSurface}
            >
              {sections.map((section, index) => (
                <section
                  id={section.id}
                  key={section.id}
                  className="grid gap-5 border-b border-white/10 py-9 last:border-b-0 sm:py-11 md:grid-cols-[52px_minmax(0,1fr)]"
                >
                  <span
                    className="text-sm font-medium text-[#c6ff4a]/70"
                    style={displayType}
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h2
                      className="text-2xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-3xl"
                      style={displayType}
                    >
                      {section.title}
                    </h2>
                    <div className="mt-5 max-w-[70ch] text-[15px] leading-7 text-white/68 sm:text-base sm:leading-8">
                      {section.content}
                    </div>
                  </div>
                </section>
              ))}
            </article>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 ScanMe. Informativni pravni nacrt.</span>
          <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Pravni dokumenti">
            <Link className="focus-signal transition-colors hover:text-[#c6ff4a]" href="/privatnost">
              Privatnost
            </Link>
            <Link className="focus-signal transition-colors hover:text-[#c6ff4a]" href="/uslovi-koriscenja">
              Uslovi korišćenja
            </Link>
            <Link className="focus-signal inline-flex items-center gap-1.5 transition-colors hover:text-[#c6ff4a]" href="/#ponuda">
              Kontakt
              <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
