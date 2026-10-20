# AMF: ulaz, ravnomerna demo toplota i mirno lepljenje markica

## Obim

Rad je u postojećem checkout-u `scanme-amf-pasos`, na postojećem lokalnom serveru. Zajedničke AMF komponente važe za stvarni događaj i demo; demo simulacija ostaje isključivo demo. Nema izmena paketa, plaćanja, API-ja, backend ugovora ili baze. Paralelne izmene nisu resetovane, stage-ovane ili prepisane.

## Izmene

- Ulaz hale ima dužu narandžastu strelicu i veći naziv, odvojene od zida. Prikazni okvir ima prostor za celu oznaku bez skrola. Veća strelica i naziv su i na ulaznom prikazu; raspored štandova nije menjan. Skeleton prati isti okvir.
- Demo toplota koristi nasumično izmešan redosled bez ponavljanja unutar kruga. Svaki uključeni štand dobija identičan sinusni puls od 14 sekundi: sedam sekundi zagrevanja i sedam hlađenja. Počeci su pomereni 1,8 sekundi, pa se nekoliko različitih faza preklapa. Redosled se ponavlja bez prekida na spoju kruga, sa jednakim vrhom, trajanjem i ukupnom toplotom za svaki štand. Pri novom otvaranju dobija se novi redosled. Pauzira kada je tab skriven i ne animira pri reduced-motion podešavanju.
- Unutrašnji štandovi ulaznog prostora ostaju van toplote; stvarno merenje nije zamenjeno simulacijom.
- „Sakupljeno“ u postojećem typed dictionary ključu zamenjeno je sa „Popunjen pasoš“.
- Zajednički `StampPassport` sada ima jedan stalan naziv modela i rezervisani prostor za status. Uklonjene su dve konkurentske kopije naziva, animacija visine i pomeranje teksta. Menja se samo status blagim opacity prelazom. Markica, žig i završni pečat ostaju animirani.
- Nema automatskog centriranja reda pri dodiru niti skrola na vrh pri završetku; nema potresanja celog papira. Eksplicitni link sa `focus` parametrom i dalje dovodi traženi model u vidokrug. Flight/dim animacije i impact timer se čiste pri prekidu.

## Provere

- `npx tsc --noEmit`: prolazi.
- Ciljani ESLint za izmenjene TS/TSX i browser QA fajlove: prolazi.
- `npm run harness:namespace`: prolazi.
- Vitest: 183 testa / 25 fajlova prolaze (`lib/fair-map`, demo katalog/API izolacija, passport tickets/visit store, map markup i passport cover). Novi heat testovi proveravaju jednaku zastupljenost i ukupnu toplotu, spor prelaz, preklapanje i spoj ciklusa, kao i prazan/kratak spisak.
- `node components/fair/map/amf-topographic.browser.mjs`: šest dimenzija, uključujući landscape i usporeni CPU. Hala/ulaz, položaji, pop-up i odvojena vidljiva strelica prolaze bez skrola, runtime grešaka ili POST zahteva.
- `node components/fair/demo/fair-demo.browser.mjs`: postojeća lokalna aplikacija na 360×640, 390×844, 1280×900. Test meri položaj naziva, visinu reda i scroll tokom lepljenja; ostaju stabilni, bez zamene DOM čvora naslova. Prolaze sva tri lepljenja prvog i poslednje drugog pasoša, save/open sponsora, sva tri modela u rotaciji, sajtovi i tooltip.
- U mobilnom demo browser testu uzorkovano je 90 simuliranih sekundi stvarnog heat hook-a: svaki vidljivi uključeni štand dostigne toplu i hladnu fazu, bez naglih skokova. Dodatno sva tri lepljenja prolaze sa `prefers-reduced-motion: reduce`, bez letećih markica. Nula runtime grešaka i nula demo API POST zahteva.
- Pregledani mobilni snimci hale, ulaza i pasoša. Demo snimci su u `output/playwright/amf-demo-review/`; izolovani map test ispisuje svoju privremenu izlaznu fasciklu.

`npm run check` nije pokrenut jer uključuje Next build, zabranjen tokom rada deljenog servera. Server nije pokretan/restartovan, nije rađen deploy, commit ili push. Vite config-loader upozorenje ostaje postojeće upozorenje, ne pad testova.

## Ručni pregled

- `http://localhost:3000/sajam/demo-auto-moto-fest-2026/mapa`
- `http://localhost:3000/sajam/demo-auto-moto-fest-2026/pasosi`
- `http://localhost:3000/sajam/auto-moto-fest-2026/mapa`

Za ponovno početno demo lepljenje koristiti privatni prozor: postojeće zalepljene markice i stvarni pasoši namerno nisu obrisani.
