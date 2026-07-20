import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  MapPin,
  Palette,
  Printer,
  QrCode,
  RefreshCw,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HowItWorks } from "@/components/how-it-works";
import { LeadForm } from "@/components/lead-form";
import { MarketingExperience } from "@/components/marketing-experience";
import { MarketingFloatingActions } from "@/components/marketing-floating-actions";
import { Reveal } from "@/components/reveal";
import { Wordmark } from "@/components/site-nav";
import { isServiceId } from "@/lib/marketing-services";

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ScanMe | Jedan gost. Mnogo novih.",
  description:
    "ScanMe pretvara fizičke predmete u korisne digitalne akcije za lokalne biznise.",
  openGraph: {
    title: "ScanMe | Jedan gost. Mnogo novih.",
    description:
      "Jednostavan sken povezuje gosta sa recenzijom, ponudom, uspomenom ili sledećom korisnom akcijom.",
    type: "website",
    locale: "sr_RS",
    siteName: "ScanMe",
  },
};

const resultCards = [
  {
    icon: Palette,
    title: "Dizajn",
    body: "Izaberite dizajn ili to prepustite nama.",
  },
  {
    icon: Printer,
    title: "Izrada",
    body: "Priprema, štampa i dostava proizvoda.",
  },
  {
    icon: QrCode,
    title: "Dinamički QR",
    body: "Mi povezujemo i održavamo link.",
  },
  {
    icon: BarChart3,
    title: "Statistika",
    body: "Promet linka u realnom vremenu.",
  },
] as const;

const audiences = [
  "Kafići i restorani",
  "Barovi i klubovi",
  "Frizerski i kozmetički saloni",
  "Prostori za događaje",
  "Lokalne prodavnice",
  "Uslužni biznisi",
] as const;

const processSteps = [
  [
    "Kažete nam šta vam treba",
    "Kratko definišemo cilj, lokaciju i format koji ima smisla za vaš biznis.",
  ],
  [
    "Pripremamo dizajn i QR odredište",
    "Povezujemo fizički izgled sa stabilnim i bezbednim dinamičkim linkom.",
  ],
  [
    "Dobijate spreman fizički proizvod",
    "Pripremamo ili organizujemo štampu i dogovaramo isporuku.",
  ],
  [
    "ScanMe održava digitalni deo",
    "Pratimo skeniranja i menjamo odredište kada se dogovorena potreba promeni.",
  ],
] as const;

const faqItems = [
  {
    question: "Da li QR kod mora ponovo da se štampa ako promenim link?",
    answer:
      "Ne. Odštampani QR vodi na stabilnu ScanMe adresu. Odredište iza nje može da se promeni bez nove štampe.",
  },
  {
    question: "Da li je NFC obavezan?",
    answer:
      "Nije. QR kod je standardni deo ponude i radi sa kamerom telefona. NFC je opcionalan premium dodatak za odabrane predmete.",
  },
  {
    question: "Da li ScanMe radi dizajn i štampu?",
    answer:
      "Da. Dogovaramo format, pripremamo dizajn i QR odredište, a zatim pripremamo ili organizujemo fizičku izradu i isporuku.",
  },
  {
    question: "Šta mogu da vidim u statistici?",
    answer:
      "Možete da vidite broj skeniranja i odlaznih preusmerenja. ScanMe ne tvrdi da može da dokaže koji je pojedinačni sken postao Google recenzija.",
  },
  {
    question: "Da li mi je potreban postojeći sajt?",
    answer:
      "Ne. ScanMe može direktno da vodi na izabrano odredište, dok Venue, Memories i Loyalty pokrivaju druge trenutke gosta.",
  },
  {
    question: "Koliko traje izrada?",
    answer:
      "Rok zavisi od formata, obima dizajna i načina fizičke izrade. Nakon kratkog dogovora dobićete realan rok pre početka rada.",
  },
] as const;

const footerSections = [
  { href: "/#kako-radi", label: "Kako radi" },
  { href: "/#resenja", label: "Rešenja" },
  { href: "/#za-koga", label: "Za koga" },
  { href: "/#proces", label: "Proces" },
  { href: "/#faq", label: "FAQ" },
] as const;

const footerProducts = ["Reviews", "Page", "Venue", "Memories", "Loyalty"] as const;
const footerContacts = ["Telefon", "Email", "Instagram", "X", "Facebook"] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const requestedService = (await searchParams).service;
  const initialService = isServiceId(requestedService) ? requestedService : "reviews";

  return (
    <div className={`marketing-home ${manrope.variable} ${manrope.className}`}>
      <a href="#glavni-sadrzaj" className="skip-link">
        Pređi na glavni sadržaj
      </a>

      <MarketingExperience
        initialService={initialService}
        portalFontClassName={manrope.className}
      >
        <HowItWorks />

        <section
          id="resenja"
          className="marketing-section section-shell border-t border-white/10 py-24 sm:py-32 lg:py-40"
        >
          <div className="grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:items-start lg:gap-20">
            <div>
              <p className="marketing-data text-sm font-medium text-[#c6ff4a]">
                Kompletan ScanMe sistem
              </p>
              <h2 className="mt-5 max-w-[13ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Od dizajna do rezultata.
              </h2>
              <p className="mt-6 max-w-[58ch] leading-7 text-white/64">
                Pripremamo, izrađujemo i održavamo kompletan ScanMe sistem. Vi dobijate
                gotov proizvod i jasan uvid u rezultate.
              </p>
              <a href="#ponuda" className="button-primary focus-signal mt-8">
                Zatraži ponudu
                <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
              </a>
            </div>

            <Reveal>
              <figure>
                <div className="marketing-media liquid-glass relative aspect-[3/2] overflow-hidden rounded-[34px] border border-white/12 sm:rounded-[42px]">
                  <Image
                    src="/images/scanme-review-sticker-example.webp"
                    alt="ScanMe nalepnica spremna za korišćenje u lokalu"
                    fill
                    sizes="(max-width: 1024px) 100vw, 54vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="marketing-data mt-3 text-xs text-white/48">
                  Fizički predmet, stabilna adresa i odredište koje može da se menja.
                </figcaption>
              </figure>
            </Reveal>
          </div>

          <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:mt-28 lg:grid-cols-4">
            {resultCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <Reveal
                  as="article"
                  key={card.title}
                  delay={index * 0.055}
                  className="marketing-card liquid-glass min-h-52 rounded-[28px] border border-white/10 p-6 sm:p-7"
                >
                  <span className="marketing-icon-wrap inline-flex size-11 items-center justify-center rounded-2xl border border-[#c6ff4a]/20 bg-[#c6ff4a]/[0.07]">
                    <Icon
                      aria-hidden="true"
                      className="size-5 text-[#c6ff4a]"
                      strokeWidth={1.5}
                    />
                  </span>
                  <h3 className="mt-8 text-xl font-semibold tracking-[-0.035em]">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{card.body}</p>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="marketing-section border-t border-white/10 py-24 sm:py-32 lg:py-40">
          <div className="section-shell grid gap-14 lg:grid-cols-[0.78fr_1.22fr] lg:items-end lg:gap-20">
            <div>
              <p className="marketing-data text-sm font-medium text-[#c6ff4a]">
                Stabilan fizički sloj
              </p>
              <h2 className="mt-5 max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Štampa ostaje. Odredište se menja.
              </h2>
              <p className="mt-6 max-w-[62ch] leading-7 text-white/62">
                ScanMe kod ostaje otporan na promene Google Review linka usled ažuriranja
                ili izmene podataka. Mi ažuriramo odredište, a vaš gost i dalje stiže na
                pravo mesto.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Isti QR", "Jednom odštampan kod ostaje validan.", QrCode],
                ["Novo odredište", "Link menjamo bez nove štampe.", RefreshCw],
              ].map(([title, body, Icon], index) => (
                <Reveal
                  as="article"
                  key={String(title)}
                  delay={index * 0.07}
                  className="marketing-card marketing-signal-card liquid-glass min-h-56 rounded-[30px] border border-white/10 p-7"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-6 text-[#c6ff4a]"
                    strokeWidth={1.45}
                  />
                  <h3 className="mt-14 text-2xl font-semibold tracking-[-0.04em]">
                    {String(title)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{String(body)}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section
          id="za-koga"
          className="marketing-section border-t border-white/10 py-24 sm:py-32 lg:py-40"
        >
          <div className="section-shell grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
            <div>
              <h2 className="max-w-[13ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Za biznise koji žele rezultat, ne još jedan alat.
              </h2>
              <p className="mt-6 max-w-[54ch] leading-7 text-white/62">
                ScanMe preuzima tehnički deo, jer znamo da vođenje biznisa već traži
                dovoljno vašeg vremena. Ne morate da učite nove alate ni da razmišljate o
                podešavanjima. Javite nam se, a mi preuzimamo sve ostalo.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {audiences.map((item, index) => (
                <Reveal
                  as="article"
                  key={item}
                  delay={index * 0.05}
                  className="marketing-card liquid-glass min-h-40 rounded-[26px] border border-white/10 p-5 sm:p-6"
                >
                  <span className="inline-flex size-10 items-center justify-center rounded-2xl border border-[#c6ff4a]/20 bg-[#c6ff4a]/[0.07]">
                    <MapPin
                      aria-hidden="true"
                      className="size-5 text-[#c6ff4a]"
                      strokeWidth={1.5}
                    />
                  </span>
                  <h3 className="mt-7 text-lg font-semibold tracking-[-0.03em]">{item}</h3>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section
          id="proces"
          className="marketing-section section-shell border-t border-white/10 py-24 sm:py-32 lg:py-40"
        >
          <p className="marketing-data text-sm font-medium text-[#c6ff4a]">
            Jasno od početka do kraja
          </p>
          <h2 className="mt-5 max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
            Od zahteva do gotovog proizvoda.
          </h2>
          <ol className="mt-16 grid gap-4 md:grid-cols-2">
            {processSteps.map(([title, body], index) => (
              <Reveal
                as="li"
                key={title}
                delay={index * 0.06}
                className="marketing-card liquid-glass min-h-56 rounded-[28px] border border-white/10 p-6 sm:p-7"
              >
                <div className="flex items-center justify-between gap-6">
                  <span className="marketing-step-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="inline-flex size-11 items-center justify-center rounded-full border border-[#c6ff4a]/24 bg-[#c6ff4a]/[0.07]">
                    <Check
                      aria-hidden="true"
                      className="size-5 text-[#c6ff4a]"
                      strokeWidth={1.5}
                    />
                  </span>
                </div>
                <h3 className="mt-12 text-xl font-semibold tracking-[-0.035em]">{title}</h3>
                <p className="mt-3 max-w-[48ch] text-sm leading-6 text-white/58">{body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section
          id="ponuda"
          className="marketing-section border-t border-white/10 py-24 sm:py-32 lg:py-40"
        >
          <div className="section-shell grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-24">
            <div>
              <p className="marketing-data text-sm font-medium text-[#c6ff4a]">
                ScanMe Review ponuda
              </p>
              <h2 className="mt-5 max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Recite nam šta želite da postavite.
              </h2>
              <p className="mt-6 max-w-[48ch] leading-7 text-white/62">
                Pošaljite osnovne podatke. Zatim dogovaramo format, dizajn, količinu i
                realan rok izrade.
              </p>
            </div>
            <div className="marketing-form-panel liquid-glass rounded-[34px] border border-white/10 p-5 sm:p-8 lg:rounded-[40px] lg:p-10">
              <LeadForm />
            </div>
          </div>
        </section>

        <section
          id="faq"
          className="marketing-section section-shell border-t border-white/10 py-24 sm:py-32 lg:py-40"
        >
          <p className="marketing-data text-sm font-medium text-[#c6ff4a]">Pre odluke</p>
          <h2 className="mt-5 max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
            Praktična pitanja pre odluke.
          </h2>
          <Accordion type="single" collapsible className="mt-14 grid max-w-4xl gap-3">
            {faqItems.map((item) => (
              <AccordionItem
                key={item.question}
                value={item.question}
                className="marketing-faq-item liquid-glass overflow-hidden rounded-[24px] border border-white/10 px-5 last:border-b sm:px-6"
              >
                <AccordionTrigger className="min-h-18 py-5 text-left text-base leading-6 hover:no-underline sm:text-lg">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="max-w-[68ch] pb-6 leading-7 text-white/62">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="marketing-section border-y border-white/10 py-20 sm:py-28">
          <div className="section-shell">
            <div className="liquid-glass marketing-final-cta rounded-[34px] border border-white/10 px-6 py-10 sm:rounded-[42px] sm:px-10 sm:py-14 lg:flex lg:items-end lg:justify-between lg:gap-16">
              <h2 className="max-w-[14ch] text-4xl font-semibold leading-[0.95] tracking-[-0.06em] sm:text-5xl lg:text-7xl">
                Postavite lakši put do sledeće akcije.
              </h2>
              <a href="#ponuda" className="button-primary focus-signal mt-8 lg:mt-0">
                Zatraži ponudu
                <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
              </a>
            </div>
          </div>
        </section>
      </MarketingExperience>

      <footer className="marketing-footer relative z-[2] py-8 sm:py-12">
        <div className="section-shell">
          <div className="liquid-glass rounded-[34px] border border-white/10 p-6 sm:rounded-[42px] sm:p-10 lg:p-12">
            <div className="grid gap-12 border-b border-white/10 pb-12 lg:grid-cols-[1.35fr_0.65fr_0.65fr_0.75fr] lg:gap-10">
              <div>
                <Wordmark />
                <p className="mt-6 max-w-[42ch] leading-7 text-white/58">
                  Fizički predmet postaje jasan digitalni put — bez dodatne aplikacije i
                  bez tehničkog tereta za vaš tim.
                </p>
                <a
                  href="#ponuda"
                  className="marketing-footer-cta button-secondary focus-signal mt-8"
                >
                  Razgovarajmo
                  <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </a>
              </div>

              <nav aria-label="Sadržaj stranice">
                <h2 className="text-base font-semibold">Sadržaj</h2>
                <ul className="mt-5 grid gap-3 text-sm text-white/58">
                  {footerSections.map((item) => (
                    <li key={item.href}>
                      <Link className="focus-signal footer-link" href={item.href}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <div>
                <h2 className="text-base font-semibold">Proizvodi</h2>
                <ul className="mt-5 grid gap-3 text-sm text-white/58">
                  {footerProducts.map((item) => (
                    <li key={item}>ScanMe {item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="text-base font-semibold">Kontakt</h2>
                <ul className="mt-5 grid gap-3 text-sm text-white/58">
                  {footerContacts.map((item) => (
                    <li key={item} className="flex items-center justify-between gap-3">
                      <span>{item}</span>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[#c6ff4a]/70">
                        uskoro
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-col gap-5 pt-7 text-xs text-white/48 sm:flex-row sm:items-center sm:justify-between">
              <p>© 2026 ScanMe. Sva prava zadržana.</p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <Link className="focus-signal footer-link" href="/privatnost">
                  Privatnost
                </Link>
                <Link className="focus-signal footer-link" href="/uslovi-koriscenja">
                  Uslovi korišćenja
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>

      <MarketingFloatingActions />
    </div>
  );
}
