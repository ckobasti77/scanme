# Prijava: kontakt, odloženi redovi i validacija — 19. oktobar 2026.

Radna fascikla: `scanme-amf-pasos`. Nastavak prethodnog `FRONTEND-DELTA-2026-10-19-PRIJAVA.md`; sledeće izmene zamenjuju tamo opisano dodavanje pri prvom znaku i obavezan telefon.

- Prvo Vaš kontakt, zatim Vozila za ScanMe. Firma i ime/prezime su obavezni. Dovoljan je ispravan telefon ili email; prihvataju se i oba.
- Model se ažurira tokom kucanja bez dodavanja/uklanjanja redova. Tek blur modela ili izbor paketa potvrđuje kraj uređivanja i prikazuje najviše jedan naredni prazan red. Novi red se otvara Framer Motion animacijom visine/prozirnosti od 300 ms; reduced motion odmah prikazuje red. Fokus ostaje na kontroli koju je korisnik izabrao.
- Marka/model nema placeholder sa konkretnim brendom. Model i paket imaju običnu obaveznu zvezdicu. Polje i paket imaju jednaku visinu i poravnate gornje ivice na desktopu; na telefonu idu vertikalno.
- `noValidate` uklanja engleske native tooltip-ove. Provera pre slanja prikazuje srpske poruke uz polja, povezuje ih aria-describedby i fokusira prvu grešku. Prvi model i njegov paket su obavezni; potpuno prazan poslednji red ostaje poziv za nastavak i ne šalje se. Svaki delimično popunjen red mora imati oba podatka.
- Sve nove poruke prolaze kroz FairExhibitorRegistrationDict. Backend endpoint i JSON vehicles ugovor ostaju isti; nema izmena convex izvora/deploy-a ili stvarnih prijava.

## Provera

- 8 ciljanih testova prolazi, uključujući postojeći endpoint u memorijskoj test bazi za kontakt samo telefonom, samo emailom i sa oba.
- Izolovani browser test stvarnog React obrasca sa zamenjenim mrežnim adapterom prolazi na 360×640, 390×844, 430×932, 844×390 i 1280×900: srpske greške, kontakt alternative, redovi tek nakon blur, poravnanje, nezavisni paketi, uklanjanje, pending/error/retry/success, bez overflow-a/runtime grešaka. Dodatno je izmerena stvarna animacija pri standardnom motion podešavanju.
- TypeScript, lint (dva ranije postojeća upozorenja), produkcijski build i namespace provera prolaze. Standardni golden harness pokušava da pokrene drugi Next dev u istoj fascikli pored vlasnikovog servera. Neizmenjeni golden komparator sa privremenom zamenom pokretanja servera ponovo koristi port 3000 i prolazi 177 slučajeva × 2 veličine ekrana, bez promena goldena/izvornog harness-a.
- Pregledač kroz CUA je isključen u Work podešavanjima; nije rađena ručna kontrola stvarne lokalne stranice. Snimci izolovane browser provere su u `output/playwright/amf-registration-corrections/`.

Pregled: http://localhost:3000/sajam/auto-moto-fest-2026/prijava
Postojeći server na 3000 je zadržan; nema commit/push/deploy-a ni izmena ponude/PDF-a.

## Dosledna animacija uklanjanja

Klik na X sada koristi isti prelaz od 300 ms pri zatvaranju reda: visina i prozirnost padaju na nulu, a preostali redovi prirodno popunjavaju prostor. AnimatePresence pokriva i automatsko uklanjanje viška praznih redova. Red koji izlazi odmah postaje inert/aria-hidden, pa se ne može kliknuti ili fokusirati dok animacija traje. Fokus se prebacuje na susedni red bez automatskog skoka skrola. Reduced motion preskače animaciju kao i pri dodavanju.

Izolovana browser provera dopunjena je merenjem stvarne izlazne animacije (red ostaje u DOM-u i postepeno se smanjuje pre uklanjanja), isključivanja interakcije i očuvanja fokusa. Prolazi i postojećih pet veličina ekrana.
