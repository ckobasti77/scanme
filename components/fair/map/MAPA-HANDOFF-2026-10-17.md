# Topografska AMF mapa - koordinacija, 17.10.2026.

Radni checkout: scanme-amf-pasos, grana feature/amf-pasos-markice. Prihvacena vizuelna referenca je drugi topografski mockup, mockup-v4-topografska-2026-10-17.png. Ovaj rad ne menja pasose, pakete, bazu, event slugove ni dev server. Na naknadni izricit zahtev vlasnika da odmah omogucimo probu, zajednicki prekidac mape ukljucen je samo za NODE_ENV=development; produkcija ostaje iskljucena.

## Kratak rezultat

Implementiran je novi AMF vektorski prikaz sa izohipsama, stvarnim postojecim oznakama brendova, pretragom i spiskom. Posle pregleda vlasnika donji red Brend + Vozila i pregled modela su uklonjeni. Izbor otvara mali pop-up uz logo: pecati konkretnog brenda i sajt izlagaca. Ne zumira. Svi izlagaci ostaju dostupni, placanje menja samo heat tretman. Lokalna ruta i dugme Mapa rade; stvarni paid/active podatak i centralni recnik jos zahtevaju integraciju iz tacaka 1, 2 i 4 ispod. Prethodni prikaz drugih sajmova nije prepravljan.

## Korekcije posle pregleda na telefonu

- AUTO 1 je kraci naziv i ne prelazi preko severnih stepenica. Geely nema ponovljen naziv ispod logoa. Vespa koristi samo veliki izvorni tipografski znak, bez VESPA natpisa ispod.
- Moto brendovi su na odvojenim brdascima. Prosiren obod drzi Hondu unutar hale; dugme za ceo prikaz je levo dole da je ne zakloni na 360px telefonu.
- Odnos stranica crteza prati raspolozivi prostor, dok se logotipi i slova ne izoblicavaju. Nema praznog reda rezervisanog za selekciju. Hala zauzima preko 90% raspolozive sirine i visine na proveravanim telefonima.
- Ostaju tackice i kratko Guzva. Uklonjeni su Vece interesovanje i oba objasnjenja placanja/merenja, prema poslednjem izricitom zahtevu vlasnika. Heat pravila nisu menjana.
- Izbor ima isprekidani AMF narandzasti krug. Pop-up ostaje unutar ekrana, prati mapu pri pomeranju, zatvara se preko X, Escape ili praznog dela mape. Povratak fokusa ne skroluje stranicu.
- Sajt nije uslovljen placanjem. Pravi websiteUrl iz javnog ucitavaca ima prednost. Za 28 oznaka plana postoje referentni linkovi u lib/fair-map/websites.ts: organizatorova stranica https://sajamautomobila.com/ucesnici-2026/; Vespa, Aprilia i Piaggio koriste svoje zvanicne brend sajtove. Ne koriste se javascript niti .invalid/.test fixture linkovi. Nepoznatim dodatnim izlagacima se URL ne izmisli.
- Sponzorisana traka koristi postojece garage CSS stilove za fotografiju, naziv i segmente, prilagodjene AMF akcentu. Garage fajlovi nisu menjani. Rotacija ostaje postojeca objavljena map rotacija, bez novih API poziva/impresija. Akcija je Pronadji stand: ni traka ni pop-up nemaju link ka modelu ili direktno dodavanje u garazu.
- Ovo uklanja precice za modele iz AMF mape; nije nova serverska provera fizickog prisustva. Javne stranice modela i QR pravila nisu menjani.

## Integracija koju treba da uradi paralelni agent (izvan mog dozvoljenog opsega)

1. **Placena usluga u zajednickom ucitavacu:** trenutni fairPublic.getEventMap/FairPublicMapStand ne salje ni paket ni status usluge. Mapa cita aditivno heatEligible: boolean sa svakog standa/izlagaca, kroz postojeci MapSection -> buildFairMapView. Eksplicitni boolean ima prednost. Ako ga nema, podrzani su packageTier na izlagacu ili brands[].models[].packageTier; postojece getFairEntitlements(tier).modelAnalytics odredjuje placeni paket. Najmanje jedan placeni paket vazi za celog izlagaca, ne samo za jedan njegov stand. Nepoznato NE znaci placeno: bez pouzdanog podatka prikaz ostaje siv. Ne koristiti postojanje pasosa, logotip ili broj skenova kao zamenu za placenu uslugu. Prekidac usluge NE SME povlaciti ucesce/stand iz javnog kataloga. Prikaz preuzima promenu posle osvezavanja/nove navigacije, kao postojeci server-side katalog.
2. **Deljene lokacije:** postojece heat vrednosti su po mapLocationId i mesaju vise izlagaca. Novi prikaz prihvata opciono today/hour.participationLevels: [{ participationId, level }] u postojecem javnom heat odgovoru. Kad toga nema, lokacijski nivo se koristi samo ako nema poznatog neplacenog izlagaca na toj lokaciji; kod mesavine placenih/neplacenih, placeni ostaje bledo narandzast umesto da mu pripisemo komsijine skenove. Backend treba da ukljuci samo eligible izlagace i u agregaciju/normalizaciju. Bez kontakata ili sirovih brojki u javnom odgovoru.
3. **RESENO - lokalni ulaz na normalnom slugu:** na naknadni zahtev vlasnika lib/fair-contract.ts sada postavlja FAIR_PUBLIC_MAP_ENABLED = process.env.NODE_ENV === "development". Time isti postojeci prekidac vraca rutu, dugme pored pasosa i postojece map linkove, bez izmena njihovih komponenti. Produkcija i test okruzenje ostaju false. Zivi server u ovom checkout-u slusa port 3000: /sajam/auto-moto-fest-2026 vraca 200 bez preusmeravanja. Nije pokrenut/zaustavljen server niti uradjen build, deploy ili push.
4. **Recnik:** zbog zabrane preklapanja lib/i18n se ne menja. Privremena map-local tipizirana ekstenzija je amf-map-copy.ts, oslonjena na postojeci FairMapDict. Trenutni novi kljucevi za prenos u FairMapDict i sr/fair-map.ts: entranceShort, interestLabel, stampsShort, showStandShort. Pretraga se na AMF vise ne poziva na modele. Uklonjeni su vehiclesShort, heatServiceNote, heatServiceAria i noMeasurement. Posle integracije lokalni modul moze samo da re-exportuje centralni recnik. Ovo je izricito evidentirano odstupanje od centralnog i18n rasporeda, ne tiha promena zajednickog ugovora.
5. **Katalog:** staticki nazivi/graphic anchors su stvarni brendovi sa prihvacene organizatorske mape; ne stvaraju modele ili placene statuse. Zivi katalog dopunjava modele, ucesnike i markice. Veza brenda sa izlagacem mora biti potvrdjena imenom ili katalogom brendova; nije dovoljno da su na istoj lokaciji. Dodatni neplaceni izlagaci se ne filtriraju. Izlagaci bez potvrdene lokacije ostaju u spisku; ne izmisljati im polozaj. Sitne oznake Lotos, Vidovdan, Grawe i Raiffeisen ne uvode nove mapLocationIds u backend. Za deo moto brendova bez postojeceg vektorskog sredstva koristi se njihov citljiv naziv, bez izmisljanja znaka.

## Ponasanje

- Izbor brenda oznacava taj logo narandzastim krugom i otvara lokalni neblokirajuci pop-up sa sajtom i progresom pecata, bez automatskog zuma.
- Mapa ne otvara katalog/model stranice i ne dodaje vozila u garazu. Progress je samo citanje postojecih pecata; nema dodele klikom na mapu.
- Pretraga, spisak, tastatura, rucni pinch/pan i povratak na celu mapu. Izbor ne menja kameru.
- Izohipse rade stalno, bez prekidaca, vremenskih filtera, tehnickih objasnjenja metrike ili brojeva standova.
- Placeni: uvek blaga narandzasta, toplije uz dostupne skenove. Neplaceni: neutralna siva, i kada lokacija ima veliki heat nivo. Dostupnost na mapi nije uslovljena paketom.
- Markica se vezuje za konkretan brend/pasos, ne za celu deljenu lokaciju. Mapa ne dodeljuje pecate i ne belezi impresije.
- Sponzorisana traka prikazuje samo stvarnu postojecu rotaciju; bez komercijalnog izdvajanja Raiffeisena i bez izmisljenog sponzora kad rotacije nema.
- Samo Hala i Ulaz. Juzne stepenice su prav 2D simbol, severne nisu oznacene kao ulaz. Sve izlagacke povrsine su ravne.

## Provere i telefon

Proslo:

- npx.cmd tsc --noEmit --incremental false.
- Ciljani ESLint svih izmenjenih/novih TS/TSX/QA fajlova, bez gresaka i upozorenja.
- npm.cmd test: 270 test fajlova i 2.438 testova proslo; 2 fajla/2 testa preskocena. Postoje Vite/Node runtime upozorenja, bez pada testova.
- git diff --check za promene ovog rada.
- node components/fair/map/amf-topographic.browser.mjs: izolovana prava Edge provera stvarne map komponente, sa testnim API odgovorima, Next Link/Image shimovima i zadatim passport progresom. Ne pokrece HTTP/Next server, ne kontaktira bazu i NIJE dokaz da je ziva Next ruta ukljucena. 0 neocekivanih console/page gresaka; 0 POST zahteva u tom izolovanom testu. Zivi prikaz koristi postojeci read-only POST /api/fair/passport za napredak.

| Ekran | Sponzorska traka do y | Skrol/preliv |
| --- | --- | --- |
| 360x640 | 632 | Ne |
| 375x812 | 804 | Ne |
| 390x844 | 836 | Ne |
| 430x932 | 924 | Ne |
| 1280x900 | 892 | Ne |
| 844x390 | 382 | Ne |

Provereni su izbor bez promene kamere, pop-up i website link i kod neplacenog izlagaca, konkretan progres Audi 1/1 bez pripisivanja Volkswagen-u, odsustvo svih /model/ linkova na mapi ukljucujuci sponzora, granice/zaklanjanje AUTO 1 i Honde, popunjenost prostora hale, Escape/fokus, pretraga sa dijakriticima i bez rezultata, Spisak -> mali partner, Hala/Ulaz, pinch/fit i wheel/fit, reduced motion, tamna sistemska preferencija uz odobreni svetli AMF prikaz, greska heat-a/retry i nepoznata usluga bez lazne narandzaste. 390x844 provereno uz 4x sporiji CPU; nije fizicki telefon benchmark.

Snimci poslednje izolovane provere (privremeni QA artefakti): C:\Users\user\AppData\Local\Temp\scanme-amf-topography-WY2ZNo. Nisu produkcioni podaci niti screenshot zive Next rute. Ziva ruta je dodatno proverena na 390x844 i 1280x900: 200 bez preusmeravanja, bez preliva i page gresaka; stvarni Audi pasos 0/3 i website link rade. Provereni su i touch Audi/Raiffeisen, tacna narandzasta boja selekcije i Pronadji stand iz rotacije, bez model linka.

Browser pregled je otkrio i doveo do ispravke odsecenih sitnih naziva, sudaranja moto naziva i 1px vertikalnog preliva; mapa sada meri stvarnu visinu svog zaglavlja. UX provera je zadrzala 44px kontrole, fokus, alternativni Spisak, uvecane finger hit zone i uklanjanje automatskog zuma.

NISU pokretani npm run check, npm run build, next build, dev server, golden harness koji startuje server, deploy ili push. Port 3227 u trenutku provere nije slusao. Snapshot components/menu/__snapshots__/item-icon-tile.test.tsx.snap je nakon punog test paketa oznacen kao M, ali git diff --exit-code za njega je prazan (samo upozorenje za LF/CRLF); fajl nije stage-ovan niti rucno menjan u ovom radu.

### Proba na telefonu

Naknadna provera ukljucivanja: 16 ciljanih testova (public-access, fair-map-links, amf-topographic-map), TypeScript i ciljani ESLint prolaze. Pravi Edge na vec pokrenutom Next serveru: 390x844, status 200, data-amf-topographic postoji, bez vertikalnog/horizontalnog preliva i page gresaka. Klik Mapa iz garaze otvara novi prikaz. Snimak: C:\Users\user\AppData\Local\Temp\scanme-amf-live-1792230831309.png. Nisu korisceni fixture podaci za ovu proveru.

1. Odmah otvoriti http://localhost:3000/sajam/auto-moto-fest-2026 ili osveziti postojeci tab. Dugme Mapa je ponovo uz Pasose. Nepoznati paketi i dalje ostaju sivi do povezivanja podatka o usluzi; to ne blokira vizuelni pregled.
2. Telefon na istoj Wi-Fi mrezi otvara http://192.168.1.10:3000/sajam/auto-moto-fest-2026 (adresa racunara u trenutku provere). Nema novog testa/sluga ili DEV bannera u prikazu ove mape.
3. Izabrati Audi/Toyota, proveriti pop-up, sajt i pecate tog brenda; zatvoriti X ili klikom van njega. Prvi izbor ne sme da promeni zum. Probati sitni Lotos/Raiffeisen, veliki Vespa logo bez natpisa, pretragu, Spisak, pinch i fit. Sponzorisano -> Pronadji stand ne sme da otvori model.
4. Menjati placeno/aktivno preko koleginog alata, zatim osveziti mapu: svi izlagaci ostaju vidljivi; neplaceni je siv, placeni bez skenova bledo narandzast. Proveriti i mesovitu deljenu lokaciju.

Otvoreno za vlasnikov sledeci vizuelni pregled: gustina sitnih oznaka, velicina pop-upa i izgled sponzorisane trake na fizickom telefonu. Backend paid/active i centralni i18n ostaju odvojene gore evidentirane integracije.

Posto se uvodi samo novi map-specific renderer i opcioni heat ulaz, obavestenje za integraciju je ovaj izvestaj. FRONTEND-DELTA u docs/events nije kreiran jer je izvan izricito dozvoljenih putanja.
