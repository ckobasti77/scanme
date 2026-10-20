# Demo ponude — usklađivanje sa prihvaćenom mapom

Datum: 19.10.2026. Checkout: `scanme-amf-pasos`. Sve je lokalno, bez builda, restarta servera, stage/commit/push/deploy koraka.

## Šta je promenjeno

- Demo mape koristi isti `AmfTopographicMap` i `AmfTopographicCanvas` kao stvarna mapa, sa stvarnim nazivima, logotipima, rasporedom i javnim sajtovima izlagača. Nema zamene imenima „Demo 01…“ ili generičkim demo logoom. Osnova je postojeća javna AMF geometrija/anchor katalog; ne čitaju se privatni podaci izlagača. Posetioci i dalje ne pregledaju vozila kroz pop-up štanda.
- Demo toplota je nasumična: jedan štand raste po koraku, prethodni se gase; nema sinusnog talasa preko cele hale. Predvorje i mali prateći štandovi ne učestvuju. Ovo je ilustracija, ne kopija stvarnih plaćenih paketa ili stvarnih skenova. Reduced motion zaustavlja simulaciju. Stvarna heat pravila nisu menjana.
- Uklonjena je velika demo traka i gornji red sa kontrolom animacije. Oznaka je uz naziv događaja. Kratka oznaka simulacije i dugme sa pitanjem su uz legendu. Objašnjenje se zatvara ponovnim klikom, Escape-om ili dodirom van njega.
- Mapa i garaža koriste **istu** izvezenu `SponsoredStrip` komponentu, sa `inline`/`display` opcijama. Zadržana je animirana tamnoplava/narandžasta pozadina garaže; tačka koristi akcenat događaja. Dugmad ne zauzimaju praznu širinu i ne ulaze u vremensku liniju. Veći desktop `sizes` uklanja zamućivanje fotografije.
- Po novoj izričitoj instrukciji vlasnika, sponzorisana traka na pravoj mapi takođe sada nudi dodavanje u garažu i otvaranje modela. Time je zamenjena ranija odluka da mapa nema ove akcije. Ovo važi samo za serverovu sponzorisanu projekciju, ne za vozila svih besplatnih izlagača. `inline` režim ne beleži sponsored akcije; čuvanje je u postojećoj lokalnoj garaži. Garaža zadržava ranije dozvoljene metrike. Displej nema akcije.
- Demo rotacija koristi epoch 0, pa radi i pre stvarnog početka sajma. Popravljen je i prvi SSR/hydration prikaz zajedničke trake: početni model je deterministički, zatim se priključuje satu uređaja. Nema novih server polling zahteva.
- Demo pasoši: svi modeli su simulirano skenirani, ali zalepljeno je 0/3, 2/3 i 3/3. Prvi prima tri pojedinačna lepljenja; drugi poslednje; treći ima kompletan pečat. Nova verzija seed-a `offer-v2` menja samo stanje simulacije na tom uređaju, ne stvarne pasoše. Zalepljene markice se potom pamte lokalno.
- Na AMF koricama uklonjen je beli logo uz naziv brenda. Ostaju naziv i jedan ceo utisnuti znak unutar kože. Demo korice koriste tri sopstvena geometrijska znaka i prigušene bakarne, teal i plavičaste akcente; stvarni brendovi zadržavaju svoje oznake.

## Novi / promenjeni ugovori

- `SponsoredStrip` je sada izvoz iz `components/fair/garage/fair-garage.tsx`; `inline` prikaz deli postojeći model/garage store ugovor, bez novog API-ja.
- `SimulationView.version?` omogućava jednokratno postavljanje nove demo ponude. `FAIR_DEMO_STUCK` odvaja skenirano od zalepljenog.
- Novi typed dictionary ključevi su u `FairDemoDict` / `sr/fair-demo.ts`. Nema backend šeme, ID-jeva lokacija, paketa ili plaćanja koji se menjaju.
- Stari source guard sada dopušta tačan naziv read-only polja `sponsoredRotation` u wrapperu, ne gateway upis. Behavioral browser test blokira svaki demo API POST i pada ako ga vidi.

## Provere

- TypeScript bez emitovanja; ciljani ESLint; `harness:namespace`.
- Vitest: 181/181 test, 25 fajlova. Uključeni kompletna `lib/fair-map` provera, izolacija demo API-ja, 0/2/3 stanje pasoša, nepravilna simulacija i jedan utisnuti Audi znak.
- `node components/fair/map/amf-topographic.browser.mjs`: hala i ulaz na 360×640, 375×812, 390×844, 430×932, 1280×900, 844×390, bez skrola/grešaka/upisa. Stand pop-up nema pregled modela; sponsor ima novu traženu akciju.
- `node components/fair/map/amf-map-sponsor.browser.mjs`: traka se postepeno puni, menja model, resetuje sledeće segmente i nastavlja isti interval posle reload-a, na 375/1280 px i u reduced-motion režimu.
- `node components/fair/demo/fair-demo.browser.mjs`: stvarni postojeći server na 360×640, 390×844, 1280×900. Tri modela se rotiraju; novo vozilo se lokalno čuva; link otvara specifikacije; rade sajt izlagača, tooltip, ulaz bez heat-a, sva tri lepljenja prvog pasoša i poslednje drugog. Nula runtime/hydration grešaka i nula demo API POST zahteva. Snimci su u `output/playwright/amf-demo-review/`.
- `npm run check` nije pokretan jer uključuje zabranjeni paralelni Next build. Upozorenja o Next LCP slikama i Vite config loader-u nisu greške ovih tokova.

## Generisane kolor varijante

Korišćen je ugrađeni imagegen, sa pregledanom postojećom slikom kao edit target-om. Original ostaje nepromenjen.

- `public/fair/demo/vehicle-showroom-blue.png`
- `public/fair/demo/vehicle-showroom-copper.png`
- Izvor: `public/fair/demo/vehicle-showroom.webp`

Prompt za obe varijante (boja: `deep midnight blue metallic` / `warm copper metallic`):

> Use case: precise-object-edit. Input image 1 is the edit target. Create a product photo variant for a car app demo. Change ONLY the painted exterior bodywork of this exact car from pearl white to [color]. Keep the exact car identity, silhouette, wheel design, wheels, black roof, windows, interior, all geometry, camera viewpoint, lens, position, crop, aspect ratio, lighting and the entire showroom background unchanged. Natural automotive paint reflections should follow the new color. Do not add badges, text, people, graphics or objects. One image, no collage.

## Pregled na lokalu

- `http://localhost:3000/sajam/demo-auto-moto-fest-2026/mapa`
- `http://localhost:3000/sajam/demo-auto-moto-fest-2026/pasosi`
- `http://localhost:3000/sajam/demo-auto-moto-fest-2026/garaza`

Za ponavljanje početnih 0/2/3 stanja bez menjanja postojećeg testiranja koristiti privatni prozor. Ne briše se stvarna garaža niti stvarni pasoši.
