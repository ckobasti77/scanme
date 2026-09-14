# ADMIN-12 — kanonski proizvodi i pristupni kanali

Status: implementacija i lokalna provera. Ovaj runbook nije izvršen nad deploymentom.
ADMIN-13 nije započet. Nema finalnog Proizvodi/QR UI-ja niti navigacionih promena.

## Izvori i granica odgovornosti

- `docs/SCANME-ADMIN-V1-IMPLEMENTACIJA.md`, ADMIN-12 i zaključana pravila QR/NFC, destinacija i isporuke.
- `lib/admin-v1/contracts.ts`, `rules.ts`, `contracts.test.ts`: ADMIN-01 domenski ugovori.
- `docs/tasks/ADMIN-11-MIGRACIJA.md`: payment/design → provisioning, print job → prijem → QC.
- Postojeći ADMIN-02 authorization, ADMIN-04 `actionItems`/audit i javni `cards` resolver.

ADMIN-12 ne menja cene, billing provajdera, subscription cikluse, service-level metrike, POS, NFC hardverski protokol ili email integraciju. Billing i dostupnost same aplikacije ostaju u postojećim servisnim funkcijama; kanal proverava vlasništvo, status izvora, QC, health i validnost destinacije.

## Kanonski identitet i modeli

| Model | Odgovornost |
| --- | --- |
| `physicalProducts` | Jedan zapis po fizičkoj jedinici, jedinstven SMF/sufiks, account/lokal, order/line/request/ordinal, kanonski product type, immutable ADMIN-11 design/config snapshot, usluge, QC, print-job i delivery veze, actor/vreme. Materijal i proizvodni izbori ostaju u tipizovanom snapshotu konfiguratora. |
| `accessSubjects` | Jedan trenutni `cardTargets` ID i jedna trenutna pozicija. Fizički QR/NFC dele ovaj subject. |
| `accessChannels` | Nezavisni QR/NFC: javni kod, card ID, stanje, redirect flag, health, konkretan razlog, prethodno validno stanje, zaseban brojač i audit istorija. |
| `digitalQrCodes` | Stabilan SMQ, QR kanal, originalni subject, opcioni legacy card i veza ka SMF-u. |
| `accessDestinationHistory` | Append-only veza prethodnog i novog targeta sa actorom, vremenom i razlogom. |
| `productPlacements` | Vremenski intervali pozicija. Prethodni interval dobija `endedAt` tačno jednom; novi ima novi ID. |
| `accessChannelEvents` | Promene stanja, health-a, redirecta, razloga i actor/vreme. |
| `accessMetricTotals` | Brojači po subject-u, intervalu pozicije i kanalu; bez prepisivanja istorijskih događaja. |
| `accessCommands` | Jedinstven ključ + stabilan fingerprint + rezultat; neuspešan provisioning pamti razlog i dopušta isti payload ponovo. |
| `accessMigrationIssues` | Konflikt originalnog card ID-ja i stvarno vreme razrešenja. |
| `productInventory` | Indeksirana projekcija fizičkih proizvoda za listanje bez dodatnog query-ja po redu. |

`cards` ostaje jedini registar javnih `/r/` kodova. SMF/SMQ su identifikacioni tekstovi, nisu dodatni QR tokeni. SMF i SMQ koriste postojeći generator čitljivog koda sa indeksiranom proverom jedinstvenosti i najviše osam pokušaja. SMF proverava i ranije `orderSmfReferences` rezervacije.

## Provisioning i proizvodnja

1. Koristiti stvarni ADMIN-11 `orderProvisioningRequests` zapis. ADMIN-11 ga stvara tek kada izvorne payment/design činjenice dozvole proizvodnju.
2. Pozvati `api.adminProducts.provision` sa account/lokal/request ID-jevima, `expectedOffset`, nepraznim skupom `channels`, opcionom destinacijom i stabilnim `key`.
3. Rezultat je `{ productIds, problemReason? }`. `problemReason` znači da nijedna nova jedinica iz tog pokušaja nije sačuvana. Operativni neuspeh ostavlja canonical action item; authorization/payload greške se odbijaju kao greške zahteva.
4. Jedan poziv stvara najviše 50 jedinica. Za N=50 rezultat ima tačno 50 ID-jeva. Za N>50 nastaviti od `createdCount` sa novim ključem sledećeg chunk-a. Nemoj menjati kanale/destinaciju između chunk-ova: request pamti configuration fingerprint.
5. Ponovni poziv istog uspešnog ključa vraća iste ID-jeve. Drugačiji payload istog ključa se odbija, uključujući ključ prethodno neuspešnog pokušaja. Uspešan replay starog chunk-a ne zatvara kasniji provisioning problem.
6. Unit creation radi u Convex mutation podtransakciji. Kod kolizije ili stvarnog provisioning blockera rollback uklanja i delimično napravljene jedinice/reference/kanale, a spoljašnja transakcija pamti problem i action item. Ispravljen ponovni pokušaj zatvara problem.
7. `smfAssignedCount`, stvarne `orderSmfReferences`, request `createdCount` i order event menjaju se zajedno. `state` requesta prelazi u `in_progress` ili `fulfilled`; legacy `pending_admin_12` ostaje prihvatljiv za stare redove.
8. Custom dizajn zahteva konkretan odobren snapshot odgovarajuće revizije. Print job odbija snapshot različit od snapshot-a fizičke jedinice. Remake koristi stvarne jedinice iz neuspešnog QC zapisa.

QC identifikuje stvarne `physicalProductIds`. Za parcijalnu kontrolu eksplicitni ID-jevi su obavezni; izbor svih raspoloživih jedinica može biti izveden iz stvarnih print-job referenci. `verifiedChannelKinds` označava koji QR/NFC kanali su zaista provereni. Pass bez tog podatka ne pretvara `unverified` kanal u healthy. Broken/manual problem zahteva razrešenje.

QC signal dobija `processedAt`, broj aktivnih/problematičnih kanala i `state: applied | problem`. Stari neobrađeni signal ostaje `pending_admin_12`; ovaj zadatak ga ne izvršava nad deploymentom. Signal je zapis ishoda QC-a u tom trenutku, dok je sadašnji status u kanalima.

Isporuka rezerviše konkretne jedinice u `deliveryLines.physicalProductIds` i `physicalProducts.deliveryId`. Jedan delivery batch je najviše 100 jedinica ukupno. Izbor je moguće zadati eksplicitno; bez njega server uzima prvi indeksirani skup nerezervisanih QC-passed jedinica, a ne preskače problematične jedinice nagađanjem. Kreiranje i polazak proveravaju da svaki postojeći kanal zaista sme da radi redirect. Draft ne može rezervisati istu jedinicu dvaput. Stari draft bez pouzdanog mapiranja jedinica ne može krenuti: vraća `access_legacy_delivery_mapping_required`.

## Destinacije, kanali i statusi

Nove destinacije primaju tipizovane reference: do tri service profile ID-ja istog lokala ili ID postojećeg validiranog `dynamicLinks` zapisa. Ne postoji proizvoljan URL argument u canonical retarget API-ju.

- Jedna usluga: direktna usluga, uključujući Menu rutu.
- Links + druge usluge: Links je zajednička destinacija.
- Review + Menu: postojeći generički splitter sa dve stavke, bez ugnježdenih splittera.
- Dinamički URL: bezbedan URL snapshot postojećeg linka. Promena izvornog URL-a zahteva auditan retarget; ne menja neprimetno štampani proizvod.

`bulkRetarget` prihvata ukupno najviše 50 izabranih product/channel ID-jeva. Sve stavke i cilj se validiraju pre upisa, subject-i se deduplikuju, a promena svih destinacija i istorije je jedna transakcija. Biranje QR-a fizičkog proizvoda menja zajedničku destinaciju tog proizvoda, uključujući njegov NFC i povezane SMQ identitete.

| Stanje/projekcija | Izvor |
| --- | --- |
| green / active | Kanal postoji, health healthy, QC prošao ako je fizički, cilj i mapping validni, redirect uključen. |
| orange / inactive | Isti validni uslovi, redirect isključen. |
| red / problem | Konkretan mapping, health, QC, ručni ili destination blocker. |
| gray | Kanal tog tipa ne postoji. Nema fiktivnog channel zapisa. |

Stanja su nezavisna po kanalu. Kod više QR identiteta povezanih na isti proizvod projekcija tipa koristi red ako neki ima problem, inače green ako neki radi, inače orange. Limit je osam kanala po subject-u; dodatni QR identiteti služe očuvanju ranije distribuiranih SMQ tokena.

Ručno postavljen problem čuva razlog. Povratak zahteva resolution note i validaciju izvornog uzroka; ako je zabeleženo prethodno validno stanje, vraća se upravo ono. Zaseban naredni zahtev može promeniti active/inactive.

`refreshChannels` ponovo proverava do 50 izabranih kanala u jednom account/lokal opsegu. Ne zahteva sken i ne pravi duplu istoriju/audit kada su činjenice nepromenjene. Koristiti ga nakon promene izvora van ADMIN-12 pre operativnog pregleda. Lista je materijalizovana server projekcija poslednje obrade, ne live fan-out nad svim servisima. Resolver i polazak isporuke nezavisno validiraju izvore u trenutku zahteva. Nije dodat background cron.

## SMQ povezivanje, pozicije i analitika

`createDigital` stvara samostalan SMQ bez fizičke jedinice. `linkDigital` proverava isti account/lokal i zadržava SMQ, card ID, javni kod, originalni subject, targete i scan događaje. Od trenutka povezivanja kanal koristi subject/destinaciju fizičkog proizvoda. Ne kopira se stari target ili istorija na novi proizvod.

`getDigital` vraća i originalni i trenutni subject. Istorija originalne destinacije ostaje dostupna preko `destinationHistory` i `legacyTargets`. Originalne scan/daily metrike ostaju dostupne preko istog card/channel identiteta.

`changePlacement` zatvara stari interval i otvara novi. Novi `cardScanEvents` pamte destination ID, subject/channel, opcioni SMF/SMQ i placement ID koji su važili pri skenu. Retarget/pomeranje/povezivanje ne prepisuje te ID-jeve. Ponovljeni `requestId` ne duplira događaje ili brojače; bot događaji ne uvećavaju brojače.

Klijentski `clientPlacementHistory` daje paginirane ID-jeve, nazive i vremenske granice intervala, bez internog admin actor/reason sadržaja. `placementMetrics` koristi isti postojeći venue access gate. Bez placement ID-ja vraća trenutni interval; sa konkretnim prethodnim ID-jem vraća taj interval. Prethodni digitalni skenovi i legacy događaji bez poznate pozicije ne postaju metrike nove fizičke pozicije. Channel lifetime totals/daily history imaju širi vremenski obuhvat i ne treba ih prikazivati kao metriku trenutne pozicije.

## Bezbedan legacy rollout — plan, nije izvršen

1. Posebno odobriti budući deployment i svaku stvarnu migraciju. Ovaj commit nije takvo odobrenje. Pre toga obezbediti backup i rehearsal van produkcije.
2. Postaviti aditivnu šemu i compatibility resolver zajedno. Ne uklanjati stare modele/polja, kodove, targete ili metrike. ADMIN-02 account/lokal ownership mora biti pouzdan.
3. Kao autentifikovani admin koristiti **internal** `adminAccessMigrations.migrateLegacyCards` sa `{ dryRun: true, paginationOpts: { numItems: 25, cursor: null } }`. CLI bez odgovarajućeg admin identiteta se ispravno odbija; ne dodavati actor ID kao zamenu za identitet.
4. Sačuvati svaki rezultat i nastaviti sa vraćenim `continueCursor` sve do `isDone`. Cursor je neproziran, ne menjati ga ručno. Izveštaj sadrži `sourceCardId`, `status: ready | mapped | blocked`, razlog i postojeće channel/SMQ ID-jeve kada postoje.
5. Dry-run ne pravi ni issue/action/audit zapise. Ne alocira SMQ; proverava postojeće kodove, ownership i mapiranje. Stvarna nova SMQ kolizija proverava se pri alokaciji u write koraku.
6. `legacy_ownership_missing`, `legacy_code_invalid`, `legacy_code_collision`, `legacy_mapping_conflict` i `legacy_smq_collision` su eksplicitni konflikti. Proveriti izvorne podatke; ne izmišljati lokal, fizičku jedinicu, vlasnika ili zamenski javni kod.
7. Tek nakon zasebnog odobrenja isti bounded prolaz izvršiti sa `dryRun: false`. Svaka stranica je transakcija; nema samostalnog scheduling-a narednih stranica. Blokirani card ostaje legacy i dobija stabilan migration action/issue. Neočekivana greška prekida celu stranicu.
8. Card bez pouzdanog fizičkog dokaza postaje digitalni QR/SMQ. `cards.accessChannelId` povezuje originalni card; ne pravi se nov card niti menja originalni token. Originalni `currentTargetId` postaje subject-ov početni target. Stari targeti, scan događaji i daily redovi se referenciraju, ne kopiraju.
9. Proveriti: svaki mapirani card pokazuje na baš jedan odgovarajući kanal; channel.cardId/kod/ownership su isti; digital.originalSubjectId postoji; nema novih `physicalProducts` iz ove migracije; originalni code/target/event/daily sadržaji i brojevi redova očuvani su, osim normalnih novih skenova tokom rada.
10. Ponoviti prolaz od `cursor: null` za kasne upise i ispravljene konflikte. Mapirani redovi ne proizvode duplikate. Issue se zatvara tek nakon stvarne korekcije; nepromenjeni konflikti ne prave nove audit/action događaje.
11. Uporediti reprezentativne postojeće `/r/` kodove pre/posle adaptera, uključujući splitter, neaktivan card i postojeće hop rute. Neaktivan legacy card ostaje neaktivan; canonical reaktivacija validira novi state i ne zahteva prepisivanje starog card.status polja.

## Compatibility i povratak

Nemigrirani card koristi originalni resolver put. Mapirani card koristi isti `api.cards.resolveAndRecord` i isti `/r/[cardCode]` URL, sa canonical resolution adapterom. Splitter view, memories hop i ordering hop koriste istu proveru.

Stari `cards`/`cardsAdmin` retarget i disable writer-i za mapirane zapise vraćaju `access_use_canonical_writer`; koristiti ADMIN-12 mutacije. Time se sprečava divergentna destinacija. Stari UI nije novi Proizvodi/QR editor i ne treba ga koristiti za mapirane zapise.

Rollback posle canonical retargeta nije samo vraćanje starog koda: originalni `cards.currentTargetId` namerno ostaje istorijski izvor. Zaustaviti sledeće migracione stranice i zadržati adapter; eventualni povratak planirati uz odobrenu migraciju koja očuva najnovije destinacije i kanale. Ne brisati nove identitete, targete ili istoriju i ne resetovati deployment. Stare print/QC/delivery reference bez dokaza o stvarnoj jedinici zahtevaju zasebno pregledano mapiranje; adapter kartica ne izmišlja taj dokaz.

## Bounded read ugovor za sledeću fazu

- `listVenues`: postojeća ADMIN-04 indeksirana imena/kontakti/SMK/SML; legacy product/channel count se ne predstavlja kao broj kanonskih SMF jedinica.
- `listInventory`: scope account/lokal, SMF/sufiks/tip/pozicija/kod tekst, state/type filter, SMF ili position sort sa smerom. Kompozitni indeksi za kombinovane filtere.
- `listChannels`: globalna tehnička pretraga SMQ/SMF/tokena, digital/physical binding, stanje; bez search termina sort po updatedAt.
- Tekstualna pretraga koristi Convex search relevance; parametar direction/sort se odnosi na listanje bez tekstualne pretrage.
- Sve stranice: 1–50 redova, cursor, do 250 skeniranih redova i 1 MB. Detail/history/placement reads su takođe ograničeni. Prazna stranica uz `isDone: false` nije kraj: sačuvati cursor.
- Nema `.collect()` u novim ADMIN-12 modulima, niti hydration query-ja po redu inventory/venue/channel liste. Bounded write validacija namerno proverava pojedinačne izabrane entitete.
- Typed ugovor su Convex `args`/`returns` validatori i generisani API tipovi. ADMIN-13 mora obraditi provisioning `problemReason`, cursor, legacy mapping greške, nepoznatu istorijsku atribuciju i odvojene state/health činjenice.

Detaljni lokalni dokazi: `ADMIN-12-VERIFIKACIJA.md`.
