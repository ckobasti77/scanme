import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Coffee,
  Music2,
  Palette,
  Printer,
  QrCode,
  Route,
  Scissors,
  Store,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HeroIntro } from "@/components/hero-intro";
import { HeroMedia } from "@/components/hero-media";
import { LeadForm } from "@/components/lead-form";
import { PricingPlans } from "@/components/pricing-plans";
import { Reveal } from "@/components/reveal";
import { ScanStory } from "@/components/scan-story";
import { SiteNav, Wordmark } from "@/components/site-nav";
import { SiteScrollMotion } from "@/components/site-scroll-motion";
import { ComingSoon } from "@/components/coming-soon";
import { EcosystemProductDeck } from "@/components/ecosystem-product-deck";
import { BackToTop } from "@/components/back-to-top";
import { hasPreviewAccess } from "@/lib/preview-access";
import { readContactMessage } from "@/lib/offer-contact";

const reviewBenefits = [
  { icon: Palette, title: "Dizajn", body: "Izaberi dizajn ili to prepusti nama" },
  { icon: Printer, title: "Izrada", body: "Priprema, štampa i dostava proizvoda" },
  { icon: QrCode, title: "Dinamički QR", body: "Mi povezujemo i održavamo link" },
  { icon: BarChart3, title: "Statistika", body: "Promet linka u realnom vremenu" },
];

const faqItems = [
  {
    question: "Da li QR kod mora ponovo da se štampa ako promenim link?",
    answer: "Ne. Odštampani QR vodi na stabilnu ScanMe adresu. Odredište iza nje može da se promeni bez nove štampe.",
  },
  {
    question: "Da li je NFC obavezan?",
    answer: "Nije. QR kod je standardni deo ponude i radi sa kamerom telefona. NFC je opcionalan premium dodatak za odabrane predmete.",
  },
  {
    question: "Da li ScanMe radi dizajn i štampu?",
    answer: "Da. Dogovaramo format, pripremamo dizajn i QR odredište, a zatim pripremamo ili organizujemo fizičku izradu i isporuku.",
  },
  {
    question: "Šta mogu da vidim u statistici?",
    answer: "Možete da vidite broj skeniranja i odlaznih preusmerenja. ScanMe ne tvrdi da može da dokaže koji je pojedinačni sken postao Google recenzija.",
  },
  {
    question: "Da li mi je potreban postojeći sajt?",
    answer: "Ne. ScanMe Review može direktno da vodi na vašu Google stranicu za ostavljanje recenzije. Za druge potrebe kasnije je planiran ScanMe Page.",
  },
  {
    question: "Koliko traje izrada?",
    answer: "Rok zavisi od formata, obima dizajna i načina fizičke izrade. Nakon kratkog dogovora dobićete realan rok pre početka rada.",
  },
];

const footerLinks = [
  { href: "#kako-radi", label: "Kako radi" },
  { href: "#scanme-review", label: "ScanMe Review" },
  // { href: "#trajni-qr", label: "Trajan QR" },
  { href: "#za-koga", label: "Za koga" },
  { href: "#faq", label: "FAQ" },
  { href: "#cenovnik", label: "Cenovnik" },
  { href: "/#ponuda", label: "Kontakt" },
  // { href: "#ekosistem", label: "Ekosistem" },
] as const;

const footerProducts = [
  { name: "ScanMe Review", status: "Dostupno" },
  { name: "ScanMe Page", status: "Uskoro" },
  { name: "ScanMe Venue", status: "Uskoro" },
  { name: "ScanMe Memories", status: "Uskoro" },
  { name: "ScanMe Loyalty", status: "Uskoro" },
] as const;

export default async function Home({ searchParams }: PageProps<"/">) {
  if (!(await hasPreviewAccess())) return <ComingSoon />;

  // Ako je korisnik došao iz toka ponude (Enterprise CTA ili /ponuda/pregled), query
  // nosi kontekst; ovde ga čitamo u čitljiv predlog poruke za kontakt formu.
  const resolvedParams = await searchParams;
  const contactParams = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string") contactParams.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) contactParams.set(key, value[0]);
  }
  const initialMessage = readContactMessage(contactParams) ?? "";

  const hasVideo = existsSync(path.join(process.cwd(), "public", "videos", "scanme-hero.mp4"));
  const hasPoster = existsSync(
    path.join(process.cwd(), "public", "images", "scanme-hero-poster.webp"),
  );

  return (
    <>
      <a href="#glavni-sadrzaj" className="skip-link">Pređi na glavni sadržaj</a>
      <SiteNav />
      <div className="landing-scan-layer" aria-hidden="true" />
      <SiteScrollMotion>
        <div className="landing-atmosphere" data-text-reveal-root>
        <main id="glavni-sadrzaj">
        <section id="pocetak" data-reveal="off" className="hero-scan-depth relative min-h-[100dvh] overflow-hidden border-b border-foreground/10">
          <HeroMedia hasVideo={hasVideo} hasPoster={hasPoster} />
          <HeroIntro />
        </section>

        <ScanStory />

        <section id="scanme-review" className="section-shell py-24 sm:py-32 lg:py-40">
          <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-16">
            <div data-reveal-group>
              <h2 className="max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Od dizajna do rezultata
              </h2>
              <p className="mt-6 max-w-[52ch] leading-7 text-foreground/64">
                Pripremamo, izrađujemo i održavamo kompletan ScanMe sistem. Vi dobijate gotov proizvod i jasan uvid u rezultate.
              </p>
              <Link href="/#ponuda" className="button-primary focus-signal mt-8">Zatraži ponudu</Link>
            </div>

            <Reveal>
              <div data-parallax-root className="w-full lg:max-w-[42rem] lg:justify-self-end">
                <div data-parallax="6" className="relative aspect-[16/9] overflow-hidden border border-foreground/12">
                  <Image
                    src="/images/scanme-review-sticker-example.webp"
                    alt="ScanMe Review nalepnica spremna za korišćenje u lokalu"
                    fill
                    sizes="(max-width: 1024px) 100vw, 48vw"
                    className="object-cover"
                  />
                </div>
              </div>
            </Reveal>
          </div>

          <div data-reveal-group className="mt-16 grid border-y border-foreground/14 lg:mt-20 lg:grid-cols-4">
            {reviewBenefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <article
                  key={benefit.title}
                  className="min-h-36 border-b border-foreground/14 py-6 last:border-b-0 lg:min-h-44 lg:border-b-0 lg:border-l lg:px-7 lg:py-7 lg:first:border-l-0 lg:first:pl-0 lg:last:pr-0"
                >
                  <Icon aria-hidden="true" className="accent-icon" strokeWidth={1.5} />
                  <h3 className="mt-7 text-lg font-semibold tracking-[-0.03em]">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/58">{benefit.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="trajni-qr" className="landing-soft-section border-y border-foreground/10 py-20 sm:py-24 lg:py-28">
          <div className="section-shell grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] lg:items-start lg:gap-20 xl:gap-28">
            <div data-reveal-group>
              <h2 className="max-w-[19ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Štampa ostaje. Odredište se menja.
              </h2>
              <p className="mt-6 max-w-[60ch] leading-7 text-foreground/62">
                ScanMe kod ostaje otporan na promene Google Review linka usled ažuriranja ili izmene podataka. Mi ažuriramo odredište, a vaš gost i dalje stiže na pravo mesto.
              </p>
            </div>
            <div data-reveal-group className="border-y border-foreground/14 lg:mt-2">
              <article className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4 border-b border-foreground/14 py-6 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-5 sm:py-7">
                <QrCode aria-hidden="true" className="accent-icon mt-0.5" strokeWidth={1.6} />
                <div>
                  <h3 className="text-xl font-semibold tracking-[-0.035em]">Isti QR</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/58">Jednom odštampan kod ostaje validan.</p>
                </div>
              </article>
              <article className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4 py-6 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-5 sm:py-7">
                <Route aria-hidden="true" className="accent-icon mt-0.5" strokeWidth={1.6} />
                <div>
                  <h3 className="text-xl font-semibold tracking-[-0.035em]">Novo odredište</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/58">Link menjamo bez nove štampe.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="za-koga" className="landing-soft-section border-y border-foreground/10 py-24 sm:py-32">
          <div className="section-shell grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div data-reveal-group>
              <h2 className="max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl">Za biznise koji žele rezultat, ne još jedan alat.</h2>
              <p className="mt-6 max-w-[48ch] leading-7 text-foreground/62">ScanMe preuzima tehnički deo, jer znamo da vođenje biznisa već traži dovoljno vašeg vremena. Ne morate da učite nove alate ni da razmišljate o podešavanjima. Javite nam se, a mi preuzimamo sve ostalo.</p>
            </div>
            <div data-reveal-group className="grid gap-3 sm:grid-cols-2 sm:gap-5">
              {[
                { icon: Coffee, label: "Kafići i restorani" },
                { icon: Music2, label: "Barovi i klubovi" },
                { icon: Scissors, label: "Frizerski i kozmetički saloni" },
                { icon: CalendarDays, label: "Prostori za događaje" },
                { icon: Store, label: "Lokalne prodavnice" },
                { icon: BriefcaseBusiness, label: "Uslužni biznisi" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="grid min-h-20 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-4 border-l border-foreground/20 px-5 py-4 sm:block sm:min-h-28 sm:p-5">
                  <Icon aria-hidden="true" className="accent-icon" strokeWidth={1.5} />
                  <p className="text-base font-semibold tracking-[-0.03em] sm:mt-6 sm:text-lg">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="section-shell py-24 sm:py-32 lg:py-40">
          <h2 data-reveal-item className="max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">Praktična pitanja pre odluke.</h2>
          <Accordion data-reveal-item type="single" collapsible className="mt-14 max-w-4xl">
            {faqItems.map((item) => (
              <AccordionItem key={item.question} value={item.question} className="border-foreground/14">
                <AccordionTrigger className="min-h-16 py-5 text-base leading-6 hover:no-underline sm:text-lg">{item.question}</AccordionTrigger>
                <AccordionContent className="max-w-[68ch] pb-6 leading-7 text-foreground/62">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section id="cenovnik" className="section-shell py-24 sm:py-32 lg:py-40">
          <PricingPlans />
        </section>

        <section id="ponuda" className="landing-soft-section border-y border-foreground/10 py-24 sm:py-32 lg:py-40">
          <div className="section-shell grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-24">
            <div data-reveal-group>
              <p className="accent-label text-sm font-medium">ScanMe Review ponuda</p>
              <h2 className="mt-5 max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">Recite nam šta želite da postavite.</h2>
              <p className="mt-6 max-w-[48ch] leading-7 text-foreground/62">Pošaljite osnovne podatke. Zatim dogovaramo format, dizajn, količinu i realan rok izrade.</p>
            </div>
            <div data-reveal-item>
              <LeadForm initialMessage={initialMessage} />
            </div>
          </div>
        </section>

        <section id="ekosistem" className="section-shell py-24 sm:py-32 lg:py-36">
          <div data-reveal-group>
            <p className="accent-label text-sm font-medium">ScanMe ekosistem</p>
            <h2 className="mt-5 text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Review je početak.
            </h2>
            <p className="mt-7 max-w-[78ch] leading-7 text-foreground/62">
              Danas pomažemo da lakše dođete do Google recenzija. Sutra isti jednostavan sken povezuje ponude, rezervacije, uspomene i još mnogo toga. Mi postavljamo i održavamo sve iza tog skena, tako da vi ne morate da povezujete različite alate niti da se bavite tehničkim podešavanjima.
            </p>
          </div>

          <EcosystemProductDeck />

          <div data-reveal-group className="mt-9 sm:flex sm:items-center sm:justify-between sm:gap-8">
            <p className="font-medium tracking-[-0.02em]">Prepoznajete rešenje za svoj biznis?</p>
            <Link href="/#ponuda" className="button-primary focus-signal mt-4 sm:mt-0">Javite nam se</Link>
          </div>
        </section>

        <section className="border-t border-foreground/10 bg-primary py-20 text-primary-foreground sm:py-28">
          <div data-reveal-group className="section-shell">
            <h2 className="max-w-[14ch] text-4xl font-semibold leading-[0.95] tracking-[-0.06em] sm:text-5xl lg:text-7xl">Jedan sken. Više mogućnosti.</h2>
          </div>
        </section>
        </main>

        <footer id="kontakt" className="landing-footer border-t border-foreground/10">
          <div className="section-shell py-16 sm:py-20 lg:py-24">
            <div
              data-reveal-group
              data-reveal-start="96"
              className="grid gap-x-12 gap-y-14 md:grid-cols-2 xl:grid-cols-[minmax(18rem,1.45fr)_0.72fr_1.05fr_1.3fr] xl:gap-x-16"
            >
              <div className="max-w-[31rem]">
                <a href="#pocetak" className="focus-signal inline-flex min-h-11 items-center" aria-label="ScanMe, povratak na početak">
                  <Wordmark />
                </a>
                <p className="mt-7 max-w-[36ch] text-base leading-7 text-foreground/58">
                  Fizički predmet postaje jasan digitalni put, bez dodatne aplikacije i bez tehničkog tereta za vaš tim.
                </p>
                <Link href="/#ponuda" className="button-secondary focus-signal mt-8">
                  Zatraži ponudu
                  <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
                </Link>
              </div>

              <nav aria-label="Sadržaj footera">
                <h2 className="text-sm font-semibold tracking-[-0.02em]">Sadržaj</h2>
                <ul className="mt-5 grid">
                  {footerLinks.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="focus-signal inline-flex min-h-11 items-center text-sm text-foreground/58 transition-colors duration-200 hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              <div>
                <h2 className="text-sm font-semibold tracking-[-0.02em]">Proizvodi</h2>
                <ul className="mt-5 grid">
                  {footerProducts.map((product) => (
                    <li
                      key={product.name}
                      className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 text-sm"
                    >
                      <span className="text-foreground/58">{product.name}</span>
                      <span className="text-xs font-semibold text-primary">{product.status}</span>
                    </li>
                  ))}
                </ul>
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
                  <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                    <dt className="text-foreground/58">Instagram</dt>
                    <dd className="text-xs font-semibold text-primary">Uskoro</dd>
                  </div>
                  <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                    <dt className="text-foreground/58">Facebook</dt>
                    <dd className="text-xs font-semibold text-primary">Uskoro</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="mt-14 border-t border-foreground/10 pt-7 text-sm text-foreground/48 sm:mt-16">
              <p>© 2026 ScanMe. Sva prava zadržana.</p>
            </div>
          </div>
        </footer>
        </div>
      </SiteScrollMotion>
      <BackToTop />
    </>
  );
}
