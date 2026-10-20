# AMF mapa — korekcije 19.10.2026.

- Originalne lokalne logo datoteke umesto tekstualnih zamena: Honda motocikli (krilo, ne automobilski znak), Piaggio, TVS, Motogrini i Aprilia. Izvori su u `brand-assets/SOURCES.md`. Nema ponovljenih naziva ispod tipografskih oznaka; Vespa i Geely su sačuvani.
- Mercedes je uvećan i centriran između Lotosa i Vidovdana. Dongfeng je blago podignut, Raiffeisen ostaje mali štand na njegovoj ivici uz južne stepenice, bez sudaranja natpisa.
- Monohromatski logo tretman uklapa bele pozadine u papir mape. Raspored, demo logo grana, paid/heat logika, pop-up i ostale prethodne izmene ostaju sačuvani.

## Provera

- Postojeći server: `http://localhost:3000/sajam/auto-moto-fest-2026`, checkout `scanme-amf-pasos`.
- Stvarna ruta proverena na 390×844 i 1280×900: svih pet novih logo slika učitano, nema scroll/overflow, Dongfeng/Raiffeisen natpisi razdvojeni, Piaggio pop-up i link rade, nema browser runtime grešaka.
- Izolovani Playwright test prolazi na 360×640, 375×812, 390×844, 430×932, 1280×900 i 844×390; uključuje pretragu, spisak, pečate, sajtove, izbor bez auto-zuma i pinch.
- `npx tsc --noEmit --incremental false`: prošao. Ciljani ESLint: prošao. Topography + AMF markup: 34/34 testa.
- Šira map provera: 146/147. Postojeći `lib/fair-map/map-guards.test.ts` odbija `setInterval` koji je ranije dodat u demo prikaz u `amf-topographic-map.tsx`; taj fajl i demo tajmer nisu menjani u ovoj korekciji.
- Nisu pokretani `npm run check`, build ili novi server; nisu menjani backend ni podaci. Nema push/deploy.

## Koordinacija

Izmene ovog prolaza su u canvas/CSS, map browser i markup testovima, topography koordinatama/testu i novom `brand-assets/` folderu. Zatečene paralelne izmene u istim fajlovima nisu odbačene ni komitovane; ništa nije stage-ovano.

## Naknadni prolaz: vremenska linija i ulaz / plato

Po vlasnikovoj označenoj mapi od 19.10.2026:

- `Ulaz` sada prikazuje 16 unutrašnjih štandova oko centralnih stepenica i pet izlagačkih mesta na otvorenom platou. Ne kopira organizatorovu sliku, brojeve ili kvadrature. Prikaz ostaje jedan mobilni ekran.
- Unutrašnji štandovi imaju neutralne ravne obrise, bez heat izohipsi, čak i kada izvorni katalog ima paid flag ili isti izlagač ima plaćenu uslugu na otvorenom. ScanMe / Enigma IT je na potvrđenom mestu iznad stepenica, sa ScanMe zelenom samo na svom štandu.
- Plato: AODES, Xtreme Motors, Auto Happy, SWM i Kia. Ponuda usluge nije plaćena usluga: narandžasta i heat zahtevaju postojeći pouzdani paid/package podatak; bez njega mesto ostaje sivo. Postojeća heat pravila hale nisu menjana.
- Svaki izbor i dalje otvara lokalni pop-up, bez auto-zuma i pregleda vozila. Sajtovi su dostupni i besplatnim izlagačima. Koriste se originalni logotipi i linkovi organizatora, uz prednost stvarnog URL-a iz kataloga. Makete na organizatorovoj stranici nema link; nije pripisan tuđi sajt.
- Sponzorski segment se sada postepeno puni linearnim Motion transformom do kraja stvarnog intervala rotacije. Sredina intervala, sledeći model, novi krug i reload prate isti epoch/interval, bez dodatnog API poziva ili React renderovanja po frejmu. Pri reduced-motion nema animiranog punjenja. Garage komponenta nije menjana.

### Dodatne provere

- TypeScript bez emitovanja i ciljani ESLint: prošli.
- Topography / AMF markup: 37/37 testova, uključujući plaćenog izlagača sa besplatnim unutrašnjim i plaćenim spoljnim mestom.
- `node components/fair/map/amf-topographic.browser.mjs`: oba dela mape na svih šest ranije navedenih dimenzija, bez skrolovanja, runtime grešaka i testnih POST zahteva. Provereni novi sajtovi, izbor i povratak u halu.
- `node components/fair/map/amf-map-sponsor.browser.mjs`: kontrolisani browser sat na 375 i 1280px, normalan i reduced-motion režim. Aktivno punjenje napreduje pre promene modela; prethodni segment se puni, budući se resetuje po novom krugu; reload nastavlja tačan interval.
- Stvarna lokalna ruta na 390×844 i 1280×900: svi logo fajlovi učitani, nema overflow/scroll, unutrašnji heat isključen; ScanMe/Goes/SWM/Kia pop-up sajtovi rade. Bela linija u istom slotu izmerena kako napreduje 0.103→0.174 i 0.249→0.320.

### Integraciona napomena

Nova dostavljena mapa prikazuje SWM na S6, ali zajednička postojeća geometrija nema taj `mapLocationId`. SWM je zato zaseban potvrđeni grafički anchor sa `locationId: null`, bez izmišljanja backend ID-ja. Za naknadno povezivanje stvarnog SWM paketa/heat-a potrebno je kroz zajednički map loader/geometriju dodati potvrđenu S6 lokaciju. Postojeći `ispred-*` ID-jevi, API, backend, centralni i18n i server procesi nisu menjani. Nove oznake koriste već postojeće prevedene nazive zona; nema novih UI rečenica. Novi izvozi/pravila su map-local (`AMF_ENTRANCE_ANCHORS`, `area`), ne backend ugovor. Ovaj map-local izveštaj je handoff zbog ranije izričite zabrane menjanja putanja izvan mape.

## Korekcija posle satelitske reference: stvarni prostorni odnosi

Ovaj prolaz zamenjuje prethodni shematski raspored ulaza. Plato više nije red ispod celog ulaza: svih pet spoljnih mesta je desno od otvora glavnog ulaza, kao na organizatorovom planu i prema vlasnikovoj potvrdi satelitskom slikom. AODES i Xtreme zadržavaju tačne izvorne poligone i dijagonalni međusobni položaj; Auto Happy, SWM i Kia prate donju grupu sa novije vlasnikove označene mape. Benni je desno od prolaza, ne na prolazu.

- `lib/fair-map/amf-entrance-plan.ts` sadrži map-local projekciju, obod ulaznog prostora, stepenice i grafičke poligone. Obe ose imaju isti faktor: ovaj deo mape više se ne rasteže prema obliku telefona. Hala i njen prihvaćeni raspored nisu menjani.
- Logotipi su svi prikazani celi sa `contain`, bez ranijeg `cover`. Okviri spoljnih logotipa ostaju unutar prikaza. Izohipse prate stvarne granice spoljnih štandova, dok unutrašnji ostaju bez heat-a. Dodatni kataloški ulazni izlagači koriste istu projekciju stvarnih koordinata, ne novu mrežu.
- TypeScript i ciljani ESLint prolaze; 42 ciljana testa, uključujući položaj platoa desno, slobodan otvor kod Benija, proporcije i postojeću heat logiku.
- Provera oba dela mape na šest veličina ekrana prolazi bez skrolovanja ili runtime grešaka; provereni dodiri po spoljnim logotipima otvaraju pravi štand i sajt. Stvarna lokalna ruta proverena na 390×844 i 1280×900: plato desno, Benni van otvora, celi učitani logotipi, sajtovi rade.
- Nema novih backend mapLocationIds, API/DB promena, builda, pokretanja servera, stage/commit-a ili push-a. Postojeće paralelne izmene ostaju sačuvane.

## Poslednja korekcija ulaza: položaj Parking servisa i čitljivost

- Po naknadnom razjašnjenju vlasnika, Parking servis je **ispod TON Niša i iznad Benija/Servoremonta**, ne pored TON-a niti u praznom desnom krilu. Obod ulaznog prostora ponovo je sužen pri vrhu i proširen dole, sa ravnim segmentima, umesto pravougaonika. Unutrašnji štandovi ostaju bez heat-a.
- Xtreme je spušten bliže Kiji. AODES i Xtreme su smanjeni, Kia i SWM razdvojeni, Auto Happy spolja ima širi prikaz. Logoi su centrirani na izohipsama; originalni fajlovi nisu menjani. SVG viewport uklanja prazne margine iz JPG prikaza. Uklonjeni su duplirani nazivi uz tipografske logoe; Makete je samo jedan tekst. ScanMe je u boji, prema novijoj instrukciji.
- `npx tsc --noEmit --incremental false`, ciljani ESLint i 47/47 testova prolaze. Izolovani browser test na šest dimenzija proverava i međusobni razmak svih spoljnih logoa, centriranje, izbor štanda i linkove; nema skrola, runtime grešaka ili testnih POST zahteva.
- Stvarna postojeća ruta proverena na 390×844 i 1280×900: učitani logoi, bez skrola ili browser grešaka; Parking servis otvara svoj sajt. Preostalo je samo Next upozorenje o eager/LCP učitavanju slika, van ovog rasporeda. Snimci: `output/amf-mapa/ulaz-polish-corrected-mobile.png` i `ulaz-polish-corrected-desktop.png`.
- Hala, paketi, backend i sponzorska rotacija nisu menjani u ovom prolazu. Nije pokretan `npm run check` jer uključuje zabranjeni paralelni build; korišćene su pojedinačne provere. Server nije restartovan, ništa nije stage-ovano, komitovano ili poslato.

### Blago uvećanje spoljne grupe

Po sledećoj instrukciji, spoljna grupa je uvećana 15% zajedno sa razmacima, izohipsama i logoima, oko donjeg desnog oslonca. Time se širi nagore i ulevo, bez preklapanja znakova ili pomeranja unutrašnjih štandova. Relativne površine i originalni organizatorovi poligoni ostaju sačuvani. TypeScript, ciljani ESLint, 48 testova i browser provera svih šest dimenzija prolaze; stvarna ruta proverena na telefonu i desktopu bez skrola i runtime grešaka. `npm run check`/build nisu pokretani zbog zajedničkog servera.

### Logoi hale i kompaktan, dosledan pop-up

- Audi, Dacia, Ford i Opel imaju veće vektorske znakove sa tesnim prikaznim granicama umesto praznog kvadratnog okvira. Originalne putanje logotipa, mesta štandova i obodi izohipsi ostaju isti.
- Zajednički pop-up za halu i ulaz je sada širok 220 px, standardno visok oko 96 px umesto oko 140 px. Naslov i X su u poravnatom zaglavlju; pečati i sajt su jednako široki/visoki elementi jednog reda sa zajedničkim stilom. X i sajt zadržavaju 44 px dodirne površine. Dugi nazivi i statusi smeju da se prelome, bez sečenja teksta.
- TypeScript, ciljani ESLint i 52/52 testa prolaze. Browser test na šest dimenzija proverava uvećane znakove, izostanak sudaranja sa nazivima, jednakost kartica, kompaktne dimenzije, dodirne površine i prelazak prstom Audi → Volkswagen → Audi bez prethodnog zatvaranja ili auto-zuma. Nema skrola, runtime grešaka ili testnih POST zahteva. Stvarna ruta pregledana na 390×844 i 1280×900; snimci su u `output/playwright/amf-hall-*.png`.
- Nema novih UI stringova, API/DB promena, pokretanja builda/servera, stage/commit/push-a. Paralelne promene demo prikaza u istom map fajlu ostaju sačuvane.

Naknadno je ispravljena vizuelna desna ivica X-a: vidljivi znak i ikonica spoljnog linka sada su 18×18 px i dele istu desnu ivicu/osu, dok 44×44 px dodirni okvir X-a ostaje poravnat sa ivicom kartice sajta. Stvarna mobilna ruta izmerena: oba znaka završavaju na x=337.25 px. Dodatne browser asercije proveravaju baš znakove, ne samo njihove kontejnere, na svih šest dimenzija; test i ciljani ESLint prolaze. Izmena je samo CSS i map-local QA.
