import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, type LegalSection } from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Uslovi korišćenja | ScanMe",
  description:
    "Uslovi korišćenja ScanMe prezentacije, informacija o uslugama i forme za zahtev za ponudu.",
};

const sections: readonly LegalSection[] = [
  {
    id: "predmet-uslova",
    title: "Na šta se ovi uslovi odnose",
    content: (
      <div className="space-y-4">
        <p>
          Ovi uslovi uređuju korišćenje javne ScanMe veb-prezentacije, njenih informativnih sadržaja i forme za zahtev za ponudu. Ne zamenjuju poseban dogovor kojim se za konkretnog klijenta utvrđuju usluga, cena, rokovi, podrška i druge obaveze.
        </p>
        <p>
          Korišćenjem sajta prihvatate da ga nećete koristiti protivno zakonu ili ovim pravilima. Ako se ne slažete sa ovim uslovima, nemojte koristiti interaktivne funkcije sajta.
        </p>
      </div>
    ),
  },
  {
    id: "informativna-ponuda",
    title: "Informacije o ScanMe rešenjima",
    content: (
      <div className="space-y-4">
        <p>
          Opisi QR rešenja, funkcionalnosti, primeri rezultata i ostali sadržaj na sajtu služe opštem informisanju. Nastojimo da budu jasni i tačni, ali oni sami po sebi nisu obavezujuća ponuda, garancija određenog rezultata niti potpuna specifikacija usluge.
        </p>
        <p>
          Konačan obim rada zavisi od potreba biznisa, izabranog proizvoda, materijala, odredišta QR koda i naknadno usaglašenih tehničkih i komercijalnih uslova.
        </p>
      </div>
    ),
  },
  {
    id: "zahtev-za-ponudu",
    title: "Zahtev za ponudu nije ugovor",
    content: (
      <div className="space-y-4">
        <p>
          Slanjem forme tražite da vas kontaktiramo i, po potrebi, pripremimo dodatne informacije ili ponudu. Samo slanje ne predstavlja narudžbinu, prihvatanje cene, zaključenje ugovora niti obavezu bilo koje strane da nastavi saradnju.
        </p>
        <p>
          Poslovni odnos nastaje tek kada strane naknadno usaglase bitne uslove i prihvate ih na odgovarajući način. Molimo vas da u formi ostavite tačne podatke potrebne za odgovor i da ne šaljete poverljive, nezakonite ili tuđe podatke bez odgovarajućeg osnova.
        </p>
      </div>
    ),
  },
  {
    id: "dozvoljena-upotreba",
    title: "Dozvoljena upotreba sajta",
    content: (
      <div className="space-y-4">
        <p>Sajt možete koristiti radi upoznavanja sa ScanMe rešenjima i slanja stvarnog poslovnog upita. Nije dozvoljeno:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-[#c6ff4a]">
          <li>ometati rad sajta, zaobilaziti bezbednosne mere ili pokušavati neovlašćen pristup;</li>
          <li>slati zlonameran kod, automatizovane neželjene prijave ili lažne podatke;</li>
          <li>koristiti sajt za nezakonit sadržaj ili povredu prava drugih lica;</li>
          <li>predstavljati se kao drugo lice ili ostavljati tuđe kontakt podatke bez ovlašćenja.</li>
        </ul>
        <p>Možemo ograničiti pristup kada je to razumno potrebno radi bezbednosti, stabilnosti ili sprečavanja zloupotrebe.</p>
      </div>
    ),
  },
  {
    id: "intelektualna-svojina",
    title: "Intelektualna svojina",
    content: (
      <div className="space-y-4">
        <p>
          ScanMe naziv, vizuelni identitet, tekstovi, dizajn, ilustracije, animacije, softver i drugi originalni elementi sajta zaštićeni su primenljivim propisima i pripadaju svojim nosiocima prava. Dozvoljeno je uobičajeno pregledanje sajta za lične ili interne poslovne potrebe.
        </p>
        <p>
          Nije dozvoljeno kopiranje, objavljivanje, prodaja, prerada ili komercijalna upotreba tih elemenata bez prethodne dozvole nosioca prava. Nazivi, logotipi i servisi trećih lica ostaju vlasništvo njihovih nosilaca i njihovo pominjanje ne znači partnerstvo ili odobrenje, osim kada je to izričito navedeno.
        </p>
      </div>
    ),
  },
  {
    id: "dostupnost-i-trece-strane",
    title: "Dostupnost i servisi trećih strana",
    content: (
      <div className="space-y-4">
        <p>
          Nastojimo da prezentacija bude dostupna i bezbedna, ali ne možemo garantovati neprekidan rad bez greške. Sajt možemo privremeno ograničiti radi održavanja, bezbednosne intervencije ili izmene sadržaja.
        </p>
        <p>
          Pojedina ScanMe rešenja mogu voditi ka servisima trećih strana, kao što su platforme za recenzije, rezervacije ili društvene mreže. Njihova dostupnost, sadržaj i obrada podataka uređeni su pravilima tih servisa, nad kojima ScanMe nema potpunu kontrolu. Posebne obaveze održavanja aktivnog QR rešenja utvrđuju se dogovorom sa klijentom.
        </p>
      </div>
    ),
  },
  {
    id: "ogranicenje-odgovornosti",
    title: "Odgovornost",
    content: (
      <div className="space-y-4">
        <p>
          U granicama dozvoljenim zakonom, ne odgovaramo za poslovne odluke donete isključivo na osnovu opštih informacija sa prezentacije, niti za prekide i promene servisa trećih strana koje ne kontrolišemo. Konkretne garancije i odgovornost za ugovorenu ScanMe uslugu utvrđuju se posebnim dogovorom.
        </p>
        <p>
          Ništa u ovim uslovima ne isključuje niti ograničava odgovornost koju nije dozvoljeno isključiti po prinudnim propisima, niti umanjuje prava koja vam obavezno pripadaju po zakonu.
        </p>
      </div>
    ),
  },
  {
    id: "privatnost-promene-pravo",
    title: "Privatnost, izmene i primenljivo pravo",
    content: (
      <div className="space-y-4">
        <p>
          Na obradu podataka iz forme primenjuje se naša <Link href="/privatnost" className="focus-signal font-semibold text-[#c6ff4a] underline decoration-[#c6ff4a]/35 underline-offset-4 hover:decoration-[#c6ff4a]">Politika privatnosti</Link>. Ove uslove možemo menjati kada se promene funkcije sajta, način pružanja informacija ili pravne obaveze; važeća verzija i datum izmene uvek će biti objavljeni na ovoj stranici.
        </p>
        <p>
          Na korišćenje prezentacije primenjuju se propisi Republike Srbije, kada su primenljivi. Obavezna pravila o zaštiti potrošača i druga prava koja se ne mogu ugovorom isključiti ostaju netaknuta. Tačan identitet pružaoca usluge i kontakt za pravna pitanja moraju biti dopunjeni pre produkcije.
        </p>
      </div>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPageShell
      documentCode="USLOVI / 01"
      eyebrow="Pravila korišćenja ScanMe prezentacije"
      title="Uslovi korišćenja"
      introduction={
        <p>
          Ovi uslovi objašnjavaju šta možete očekivati od javnog ScanMe sajta i šta znači kada pošaljete zahtev za ponudu. Kratko: sajt informiše, a konkretna saradnja se dogovara odvojeno.
        </p>
      }
      sections={sections}
    />
  );
}
