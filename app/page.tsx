import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import {
  BarChart3,
  Check,
  MapPin,
  Palette,
  Printer,
  QrCode,
  Radio,
  RefreshCw,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HeroIntro } from "@/components/hero-intro";
import { HeroMedia } from "@/components/hero-media";
import { LeadForm } from "@/components/lead-form";
import { Reveal } from "@/components/reveal";
import { ScanStory } from "@/components/scan-story";
import { SiteNav, Wordmark } from "@/components/site-nav";

const reviewBenefits = [
  { icon: Palette, title: "Dizajn za vaš biznis", body: "Logo je opcionalan, a izgled može biti prilagođen ili izabran iz proverenog predloška." },
  { icon: QrCode, title: "Dinamički ScanMe QR", body: "Stabilna adresa ostaje ista i kada promenite Google odredište." },
  { icon: Printer, title: "Priprema fizičkog proizvoda", body: "Pripremamo štampu za nalepnicu, karticu za sto ili premium stalak." },
  { icon: BarChart3, title: "Osnovna statistika", body: "Vidite broj skeniranja i odlaznih preusmerenja, bez identifikovanja osobe." },
  { icon: RefreshCw, title: "Promena bez nove štampe", body: "Odredište ažuriramo iza postojećeg koda kada se poslovna potreba promeni." },
  { icon: Radio, title: "NFC kao premium dodatak", body: "QR je standard. NFC može biti ugrađen u odabrani premium predmet." },
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

export default function Home() {
  const hasVideo = existsSync(path.join(process.cwd(), "public", "videos", "scanme-hero.mp4"));
  const hasPoster = existsSync(
    path.join(process.cwd(), "public", "images", "scanme-hero-poster.webp"),
  );

  return (
    <>
      <a href="#glavni-sadrzaj" className="skip-link">Pređi na glavni sadržaj</a>
      <SiteNav />
      <main id="glavni-sadrzaj">
        <section id="pocetak" className="relative min-h-[100dvh] overflow-hidden border-b border-white/10">
          <HeroMedia hasVideo={hasVideo} hasPoster={hasPoster} />
          <HeroIntro />
        </section>

        <ScanStory />

        <section id="resenja" className="section-shell py-24 sm:py-32 lg:py-40">
          <div className="grid gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:items-start lg:gap-20">
            <div>
              <p className="text-sm font-medium text-[#c6ff4a]">ScanMe Review. Prvo dostupno rešenje.</p>
              <h2 className="mt-5 max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Lakši put do Google recenzije, dok je gost još tu.
              </h2>
              <p className="mt-6 max-w-[58ch] leading-7 text-white/64">
                Dobijate dizajn, dinamički QR, pripremu štampe, fizički format i održavanje digitalnog odredišta. Ne morate da sklapate sistem sami.
              </p>
              <a href="#ponuda" className="button-primary focus-signal mt-8">Zatraži ponudu</a>
            </div>

            <div className="grid gap-5 sm:grid-cols-[1.25fr_0.75fr] sm:items-end">
              <Reveal>
                <figure>
                  <div className="relative aspect-[3/2] overflow-hidden border border-white/12">
                    <Image
                      src="/images/scanme-review-sticker-example.webp"
                      alt="Primer ScanMe Review nalepnice pored terminala na kasi"
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 62vw, 38vw"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="mt-3 text-xs text-white/48">Primer postavljanja nalepnice. Nije prikazan stvarni klijent.</figcaption>
                </figure>
              </Reveal>
              <Reveal delay={0.08}>
                <figure>
                  <div className="relative aspect-[4/5] overflow-hidden border border-white/12">
                    <Image
                      src="/images/scanme-review-premium-example.webp"
                      alt="Primer premium ScanMe Review stalka od drveta i akrila"
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 35vw, 24vw"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="mt-3 text-xs text-white/48">Primer premium formata sa opcionim NFC dodatkom.</figcaption>
                </figure>
              </Reveal>
            </div>
          </div>

          <div className="mt-24 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:mt-32 lg:grid-cols-3">
            {reviewBenefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <article key={benefit.title} className="border-t border-white/16 pt-5">
                  <Icon aria-hidden="true" className="size-5 text-[#c6ff4a]" strokeWidth={1.5} />
                  <h3 className="mt-8 text-lg font-semibold tracking-[-0.03em]">{benefit.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{benefit.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#10110e] py-24 sm:py-32 lg:py-40">
          <div className="section-shell">
            <h2 className="max-w-[15ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Štampa ostaje. Odredište se menja.
            </h2>
            <p className="mt-6 max-w-[62ch] leading-7 text-white/62">
              ScanMe kod ne vodi direktno na nasumičan link. Vodi kroz kontrolisanu adresu koja beleži preusmerenje i šalje gosta dalje.
            </p>
            <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {[
                ["Isti QR", "Odštampani kod ostaje na svom mestu."],
                ["Novo odredište", "Link može da se ažurira bez nove štampe."],
                ["Broj skeniranja", "Merimo ulaz i odlazno preusmerenje."],
                ["Više formata", "Jedna postavka može da podrži više fizičkih predmeta."],
              ].map(([title, body]) => (
                <article key={title} className="border-l border-[#c6ff4a] pl-5">
                  <h3 className="text-xl font-semibold tracking-[-0.035em]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section-shell py-24 sm:py-32 lg:py-40">
          <p className="text-sm font-medium text-[#c6ff4a]">ScanMe ekosistem</p>
          <h2 className="mt-5 max-w-[15ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
            Review prvo. Ostala rešenja dolaze redom.
          </h2>
          <div className="mt-16 grid gap-12">
            <article className="max-w-4xl border-t border-white/16 pt-6 md:grid md:grid-cols-[0.7fr_1.3fr] md:gap-12">
              <div>
                <p className="text-sm text-[#c6ff4a]">Sledeći proizvod</p>
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">ScanMe Page</h3>
              </div>
              <p className="mt-5 leading-7 text-white/62 md:mt-0">Kontrolisana mini-stranica za ponude, usluge, cene, lokaciju i direktne kontakte. Jednostavno uređivanje bez slobodnog lomljenja dizajna.</p>
            </article>
            <article className="max-w-4xl border-t border-white/16 pt-6 md:ml-[12%] md:grid md:grid-cols-[0.7fr_1.3fr] md:gap-12">
              <div>
                <p className="text-sm text-white/50">Planirana specijalizacija</p>
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">ScanMe Venue</h3>
              </div>
              <p className="mt-5 leading-7 text-white/62 md:mt-0">Verzija za kafiće, restorane, barove i klubove sa događajima, ponudama i vezom ka postojećem kanalu za rezervacije.</p>
            </article>
            <article className="max-w-4xl border-t border-white/16 pt-6 md:ml-[24%] md:grid md:grid-cols-[0.7fr_1.3fr] md:gap-12">
              <div>
                <p className="text-sm text-white/50">Kasnija ekspanzija</p>
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">ScanMe Memories</h3>
              </div>
              <p className="mt-5 leading-7 text-white/62 md:mt-0">Privatni album za događaje sa gostujućim fotografijama, moderacijom, preuzimanjem i jasno definisanim periodom čuvanja.</p>
            </article>
          </div>
        </section>

        <section id="za-koga" className="border-y border-white/10 bg-[#10110e] py-24 sm:py-32">
          <div className="section-shell grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <h2 className="max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl">Za biznise koji žele rezultat, ne još jedan alat.</h2>
              <p className="mt-6 max-w-[48ch] leading-7 text-white/62">ScanMe preuzima tehnički i fizički deo, od ideje do predmeta koji možete da postavite u lokalu.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {["Kafići i restorani", "Frizerski i kozmetički saloni", "Lokalne prodavnice", "Klubovi i prostori za događaje", "Uslužni biznisi"].map((item, index) => (
                <div key={item} className={`min-h-28 border-l border-white/20 p-5 ${index === 0 ? "border-[#c6ff4a] sm:col-span-2" : ""}`}>
                  <MapPin aria-hidden="true" className="size-5 text-[#c6ff4a]" strokeWidth={1.5} />
                  <p className="mt-6 text-lg font-semibold tracking-[-0.03em]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section-shell py-24 sm:py-32 lg:py-40">
          <h2 className="max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">Od zahteva do gotovog proizvoda.</h2>
          <ol className="mt-16 grid gap-x-10 gap-y-12 md:grid-cols-2">
            {[
              ["Kažete nam šta vam treba", "Kratko definišemo cilj, lokaciju i format koji ima smisla za vaš biznis."],
              ["Pripremamo dizajn i QR odredište", "Povezujemo fizički izgled sa stabilnim i bezbednim dinamičkim linkom."],
              ["Dobijate spreman fizički proizvod", "Pripremamo ili organizujemo štampu i dogovaramo isporuku."],
              ["ScanMe održava digitalni deo", "Pratimo skeniranja i menjamo odredište kada se dogovorena potreba promeni."],
            ].map(([title, body]) => (
              <li key={title} className="border-t border-white/16 pt-6">
                <Check aria-hidden="true" className="size-5 text-[#c6ff4a]" strokeWidth={1.5} />
                <h3 className="mt-8 text-xl font-semibold tracking-[-0.035em]">{title}</h3>
                <p className="mt-3 max-w-[48ch] text-sm leading-6 text-white/58">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="ponuda" className="border-y border-white/10 bg-[#10110e] py-24 sm:py-32 lg:py-40">
          <div className="section-shell grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-24">
            <div>
              <p className="text-sm font-medium text-[#c6ff4a]">ScanMe Review ponuda</p>
              <h2 className="mt-5 max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">Recite nam šta želite da postavite.</h2>
              <p className="mt-6 max-w-[48ch] leading-7 text-white/62">Pošaljite osnovne podatke. Zatim dogovaramo format, dizajn, količinu i realan rok izrade.</p>
            </div>
            <LeadForm />
          </div>
        </section>

        <section id="faq" className="section-shell py-24 sm:py-32 lg:py-40">
          <h2 className="max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">Praktična pitanja pre odluke.</h2>
          <Accordion type="single" collapsible className="mt-14 max-w-4xl">
            {faqItems.map((item) => (
              <AccordionItem key={item.question} value={item.question} className="border-white/14">
                <AccordionTrigger className="min-h-16 py-5 text-base leading-6 hover:no-underline sm:text-lg">{item.question}</AccordionTrigger>
                <AccordionContent className="max-w-[68ch] pb-6 leading-7 text-white/62">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="border-t border-white/10 bg-[#c6ff4a] py-20 text-[#0b0c0a] sm:py-28">
          <div className="section-shell">
            <h2 className="max-w-[14ch] text-4xl font-semibold leading-[0.95] tracking-[-0.06em] sm:text-5xl lg:text-7xl">Postavite lakši put do sledeće akcije.</h2>
            <a href="#ponuda" className="focus-signal mt-8 inline-flex min-h-12 items-center border border-[#0b0c0a] px-5 text-sm font-semibold transition-transform duration-200 active:scale-[0.98]">Zatraži ponudu</a>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-10">
        <div className="section-shell flex flex-col gap-6 text-sm text-white/54 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark />
          <p>Fizičko postaje digitalno.</p>
        </div>
      </footer>
    </>
  );
}
