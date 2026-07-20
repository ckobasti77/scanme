import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, type LegalSection } from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Politika privatnosti | ScanMe",
  description:
    "Informacije o podacima koje ScanMe obrađuje kada pošaljete zahtev za ponudu i o vašim pravima.",
};

const officialRightsGuide =
  "https://staging.poverenik.rs/zastita-podataka/kako-da-ostvarite-svoja-prava/";

const sections: readonly LegalSection[] = [
  {
    id: "rukovalac-i-svrha",
    title: "Ko obrađuje podatke i zašto",
    content: (
      <div className="space-y-4">
        <p>
          Podatke obrađuje operater ScanMe veb-sajta kako bi primio vaš upit, razumeo potrebe biznisa, odgovorio preko kontakta koji ste ostavili i pripremio traženu informaciju ili ponudu. Slanje forme služi samo pokretanju razgovora i ne stvara ugovor niti obavezu kupovine.
        </p>
        <p>
          Podatke koje sami unesete obrađujemo radi postupanja po vašem zahtevu i, gde je primenljivo, preduzimanja koraka pre eventualnog poslovnog odnosa. Tehničku zaštitu forme i urednu evidenciju zahteva zasnivamo na legitimnom interesu da sajt radi bezbedno i pouzdano, uz poštovanje vaših prava i interesa.
        </p>
        <p>
          Tačan pravni naziv rukovaoca, kontakt i procenu pravnog osnova potrebno je potvrditi i uneti tokom pravne provere pre produkcije.
        </p>
      </div>
    ),
  },
  {
    id: "podaci-koje-prikupljamo",
    title: "Koje podatke prikupljamo",
    content: (
      <div className="space-y-4">
        <p>Kada pošaljete zahtev za ponudu, u Convex bazi čuvamo:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-[#c6ff4a]">
          <li>ime i prezime kontakt osobe;</li>
          <li>naziv i tip biznisa, a grad samo ako ga unesete;</li>
          <li>telefon i/ili imejl adresu;</li>
          <li>izabrano ScanMe interesovanje i poruku, ako je napišete;</li>
          <li>tehnički identifikator prijave, status zahteva i vreme nastanka zapisa.</li>
        </ul>
        <p>
          Polje za zaštitu od automatizovanog slanja i vreme započinjanja forme proveravaju se prilikom slanja, ali se ne upisuju u sačuvani lead zapis. Molimo vas da kroz slobodno polje poruke ne šaljete osetljive ili posebne vrste podataka koje nisu potrebne za upit.
        </p>
      </div>
    ),
  },
  {
    id: "lokalna-podesavanja",
    title: "Tema sajta i analitika",
    content: (
      <div className="space-y-4">
        <p>
          Izabrana svetla ili tamna tema čuva se samo u lokalnom skladištu vašeg pregledača pod ključem <code className="rounded bg-white/[0.07] px-1.5 py-0.5 text-sm text-[#c6ff4a]">scanme-marketing-theme</code>. Ova vrednost ne sadrži vaše ime ili kontakt i možete je obrisati kroz podešavanja pregledača.
        </p>
        <p>
          ScanMe trenutno ne koristi marketinšku analitiku, oglasne piksele niti profilisanje posetilaca. Ne donosimo odluke koje proizvode pravne ili slične značajne posledice isključivo automatizovanom obradom podataka iz forme.
        </p>
      </div>
    ),
  },
  {
    id: "cuvanje-i-pristup",
    title: "Gde se podaci čuvaju i ko im pristupa",
    content: (
      <div className="space-y-4">
        <p>
          Podaci iz forme čuvaju se preko Convex infrastrukture. Pristup treba da imaju samo ovlašćene osobe kojima je potreban radi obrade upita, kao i tehnički pružaoci usluga koji održavaju hosting i backend u granicama svojih ugovornih obaveza.
        </p>
        <p>
          Podatke ne prodajemo i ne koristimo ih za slanje marketinških poruka bez odgovarajućeg osnova. Tačnu listu obrađivača, lokacije obrade i eventualne međunarodne prenose potrebno je potvrditi u okviru pravne i infrastrukturne provere pre produkcije.
        </p>
      </div>
    ),
  },
  {
    id: "rok-cuvanja",
    title: "Koliko dugo čuvamo podatke",
    content: (
      <div className="space-y-4">
        <p>
          Podatke iz upita čuvamo samo dok su potrebni da odgovorimo, pripremimo ponudu i završimo komunikaciju pokrenutu vašim zahtevom. Posle toga ih brišemo ili anonimizujemo, osim kada je duže čuvanje potrebno radi ispunjenja zakonske obaveze ili postavljanja, ostvarivanja ili odbrane pravnog zahteva.
        </p>
        <p>
          Operativni rokovi i postupak brisanja moraju biti dokumentovani i potvrđeni pre produkcije, u skladu sa konačnom organizacijom poslovanja i obavezama rukovaoca.
        </p>
      </div>
    ),
  },
  {
    id: "vasa-prava",
    title: "Vaša prava",
    content: (
      <div className="space-y-4">
        <p>
          U skladu sa Zakonom o zaštiti podataka o ličnosti, i kada su za to ispunjeni uslovi, možete tražiti pristup svojim podacima, kopiju, ispravku ili dopunu, brisanje, ograničenje obrade i prenosivost. Možete uložiti i prigovor na obradu koja se zasniva na legitimnom interesu.
        </p>
        <p>
          Zahtev možete poslati preko <Link href="/#ponuda" className="focus-signal font-semibold text-[#c6ff4a] underline decoration-[#c6ff4a]/35 underline-offset-4 hover:decoration-[#c6ff4a]">forme za ponudu na početnoj stranici</Link> tako što ćete u poruci jasno navesti da je reč o zahtevu u vezi sa podacima o ličnosti. Možemo tražiti dodatne informacije samo kada su neophodne da potvrdimo vaš identitet.
        </p>
        <p>
          Ako smatrate da se vaši podaci obrađuju protivno zakonu, imate pravo da podnesete pritužbu Povereniku za informacije od javnog značaja i zaštitu podataka o ličnosti. Više informacija dostupno je u <a href={officialRightsGuide} target="_blank" rel="noreferrer" className="focus-signal font-semibold text-[#c6ff4a] underline decoration-[#c6ff4a]/35 underline-offset-4 hover:decoration-[#c6ff4a]">zvaničnom vodiču Poverenika</a>.
        </p>
      </div>
    ),
  },
  {
    id: "promene-politike",
    title: "Promene ove politike",
    content: (
      <div className="space-y-4">
        <p>
          Ovu politiku možemo izmeniti kada promenimo način rada sajta, podatke koje prikupljamo ili pravne obaveze. Nova verzija biće objavljena na ovoj stranici sa ažuriranim datumom poslednje izmene.
        </p>
        <p>
          Ako promena bitno utiče na način korišćenja već prikupljenih podataka, obezbedićemo odgovarajuće obaveštenje pre nego što novi način obrade počne da se primenjuje.
        </p>
      </div>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPageShell
      documentCode="PRIVATNOST / 01"
      eyebrow="Vaši podaci, jasno objašnjeni"
      title="Politika privatnosti"
      introduction={
        <p>
          Ovde objašnjavamo koje podatke ScanMe prima kada nam pošaljete upit, zašto ih koristimo i kako možete ostvariti svoja prava. Napisano je tako da najvažnije informacije pronađete bez pravnog žargona.
        </p>
      }
      sections={sections}
    />
  );
}
