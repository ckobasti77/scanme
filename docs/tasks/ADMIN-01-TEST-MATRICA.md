# ADMIN-01 — test matrica i fixture ugovor

Izvor: `docs/SCANME-ADMIN-V1-IMPLEMENTACIJA.md` §6–12 i ADMIN-01. Testovi domena su u `lib/admin-v1/contracts.test.ts`, fixture-i u `lib/admin-v1/fixtures.ts`. Ne rade seed, ne koriste živu bazu i ne dokazuju završetak narednih ADMIN taskova.

## Pokretanje

```powershell
npm.cmd test -- lib/admin-v1/contracts.test.ts lib/offer-contact.test.ts lib/i18n/i18n.test.ts
npx.cmd tsc --noEmit -p lib/admin-v1/tsconfig.json
npm.cmd run check
```

Vitest pokreće runtime testove, ciljani `tsc` proverava i negativne `@ts-expect-error` primere. `npm run check` ima zaseban postojeći ugovor: ESLint → Next build → namespace gate → Links golden harness. Test matrica se ne proglašava zelenom samo zato što build prolazi.

## Deterministički fixture-i

Svi datumi i iznosi su sintetički. `AS_OF` je 2026-09-10 10:00 UTC. Novac je u najmanjim jedinicama; brojevi ispod **nisu ScanMe cenovnik**. Glavni scenario sadrži jedan SMK i četiri SML; zaseban referral učesnik je u `referrerAccount/referrerContact/referrerMember`.

| Target | Period | Plaćeno do | Stanje na AS_OF | Nova alokacija |
|---|---|---|---|---|
| Lokal 1 / Links (usluga A) | mesečni | 2026-09-20 | active | nema |
| Lokal 2 / Links (A) | mesečni | 2026-09-07 | grace | 12.000 od 12.000, 07.09–07.10 |
| Lokal 3 / Links (A) | mesečni | 2026-08-31 | suspended | nema |
| Lokal 4 / Links | godišnji | 2027-02-02 | active | nema |
| Lokal 4 / Review | godišnji | 2026-09-03 | grace | 6.000 od 24.000, 03.09.2026–03.09.2027 |
| Lokal 4 / Meni | godišnji | 2026-08-10 | suspended | nema |
| Nalog / Premium | mesečni | 2026-09-12 | active + warning | 15.000 od 15.000, 12.09–12.10 |

`partialPayment` = 38.000; alokacije = 33.000; eksplicitan neraspoređeni ostatak = 5.000. Fixture razdvaja dosadašnje stanje ciklusa i novi novčani događaj: ne pretvara samu prisutnost uplate u automatsko produženje. ADMIN-03 atomskim writer-om primenjuje samo potpuno finansiran period; parcijalni godišnji iznos ne sme aktivirati celu godinu niti izmeniti Meni/Premium/druge lokale.

Komercijalni dodatci: tri kontakta, dve firme, dva brenda, dve grupe, pet članova/četiri uloge, jedan primary owner i još jedan full-access član. `friendWaiver` izuzima samo Lokal 1/Links i Premium; `individualPrice` menja samo Lokal 3/Links u odvojenoj varijanti. Referral prikazuje pending/qualified i izabrani target popusta sa još neodređenim uslovima. Novčani wallet ne postoji.

`orderLines` ima 50 nalepnica + 2 jednodelna stalka; `physicalProducts` ima 52 jedinstvena SMF-a. To je fixture posle uplate/odobrenja/QC, dok testovi zasebno proveravaju gate za ranije faze. `channelScenarios` su alternativna stanja jednog komada, ne dodatni komadi istog inventara. `adjustments[0]` je odvojena storno varijanta za parcijalnu uplatu; ne primenjuje se istovremeno u osnovnom scenariju uplate. `adjustments[1]` je refundacija jednog komada porudžbine.

## Izvršeno u ADMIN-01

| ID / suite u test fajlu | Zaključani use case | Dokaz i negativna granica | Spec |
|---|---|---|---|
| C01 catalog and identifiers | Jedan naziv po proizvodu/usluzi; SMK/SML/SMF/SMQ/SMP odvojeni od relacija | Katalog i ponuda imaju iste nazive/SKU skup; Review alias-i se normalizuju; legacy ne-V1 tipovi se ne prihvataju; promena ljudskog koda ne menja account vezu. | §6, §7.2, §7.5 |
| C02 account hierarchy and access contracts | Jedan klijent iznad lokala, firme/brendovi/grupe/kontakti, default/override, četiri uloge | Validne fixture relacije; jedan primary owner i više full-access; default se čita iz kontakta; tuđ nalog/kontakt odbijen; kupovina ne daje otkaz; ograničeni/neaktivni član odbijen. Arhiva čuva ID; brand propagation je eksplicitan izbor. | §7.1–2, §8.6, §12.1 |
| C03 independent subscription cycles | Tri mesečne A + tri godišnje na četvrtom lokalu, Premium na nalogu | Sedam različitih datuma; selective active/grace/suspended; tačne 7/15 warning i grace granice uključujući Premium; warning nije status; otkaz na kraju perioda; ručni grace override samo jednog targeta. Activation/config/health/editing ostaju odvojeni. | §7.2–3, §8.1 |
| C04 payments, prices, waivers and referral | Jedna uplata pokriva neke periode, parcijalni iznos, ostatak, neplaćanje drugih | Target+period coverage: funded/partial/unpaid; nema primene na drugi period; prevelika/nedovoljna alokacija, duplikati, pogrešna uplata i valuta se otkrivaju. Order alokacije odvojene; storno/refund čuvaju original. | §7.3, §15.1 |
| C04 | Prijatelj, individualna/founders/enterprise cena i referral | Samo izabrani targeti imaju waiver; tag sam ne čini sve besplatnim; snapshot se ne menja sa novim dogovorom; founders lifetime/until su oba izraživa; referral tek posle pozitivne ne-stornirane uplate odgovarajućeg naloga. Bez zaključanog procenta/trajanja. | §7.3, §9.10 |
| C05 production, QR/NFC and history | Avans + odobren dizajn, više linija/komada, štamparija → ScanMe → QC/aktivacija → isporuka | Kombinacije payment/design; SMF gate odbija svaki nepotpun uslov; 52 individualna komada sa line/design/material vezama; dva paketa; kurir plaća klijent kuriru, lično bez naplate; dispatch gate odbija nepotpun prijem/QC/aktivaciju. | §7.4–5, §8.5 |
| C05 | QR/NFC active/inactive/problem/absent, jedna destinacija | Zasebno stanje dva kanala; tip odbija oba odsutna; nedostajuća destinacija je problem; tri usluge koriste Links, Review+Meni generički razdelnik; odbijeni prazni/duplirani/cross-venue targeti. | §7.5, §8.2 |
| C05 | SMQ → SMF i istorija destinacije/pozicije/analitike | SMQ i channel ID ostaju u vezi; SMF primarni support identitet; prethodni target sačuvan; trenutno 3 QR + 2 NFC, ukupno sa starom pozicijom 17; nema pripisivanja starih skenova novoj poziciji. | §6, §7.5 |
| C06 communication, tasks, audit and type exclusions | Klijentski zadatak, kontakt i predmet, datum ili instant, odlaganje sa razlogom | Tipizovani objekti/assignee/due; source-fact action item umesto slepog zatvaranja; test obaveznog razloga po audit katalogu. | §7.6, §8.4, §10 |
| C06 | Chat receipt privatnost i raw email | Inbound nema receipt; outbound izričito admin-only; shared mailbox ne izmišlja autora; raw signature/disclaimer ostaje uz odvojen preview/attachment metadata. | §7.6, §9.4 |
| C06 | Audit, bez poslovnih `any` prečica | Strukturisan detail, actor/object/time; obavezni razlozi; nema login/device/session akcija; compile-time zabrane pogrešnog ID-ja, praznih kanala, Premium na lokalu, profit filtera po usluzi i opaque audit string-a. | §9.10–11, §12 |

## Obavezni kasniji integracioni testovi — nisu izvršeni ovim taskom

Ovi testovi zahtevaju schema/writer/provider/UI koji ADMIN-01 namerno ne implementira. Njihov status je **PLAN**, ne PASS.

| ID | Naredni task | Scenario i očekivani rezultat |
|---|---|---|
| I01 | ADMIN-02 | Convex authz: neprijavljen/non-admin, tuđ SMK/SML/contact/object, ograničeni lokali i sve role/capability kombinacije; primary-owner transfer atomski; archive/unarchive čuva istoriju; default kontakt u realnom read modelu; brand apply all/selected/none bez tihih promena. |
| I02 | ADMIN-03 | Primeni `partialPayment`: samo puni Lokal 2/Links i Premium periodi napreduju; Review 6.000 ostaje delimično pokriven; preostali lokali/usluge identični. Druga uplata od 18.000 dovršava samo Review godinu. Jedna objedinjena uplata može pokriti svih sedam targeta bez poravnanja njihovih datuma. |
| I03 | ADMIN-03 | Ponovljen provider event/manual idempotency key ne duplira novac/cikluse; concurrent payments i retry su atomski; overpayment je eksplicitan ostatak. Storno/refund kompenzuju precizne alokacije, ne brišu istoriju i ne poništavaju nepovezan period. Currency/sum/ownership validacija je serverska. |
| I04 | ADMIN-03/04 | Kalendarski mesečni/godišnji pomak: 31. januar, februar, 29. februar, prelaz godine; nezavisni warning/grace cron batch-evi, resumable/idempotent; ručni override sa actor/reason, cancel-at-end i manual suspension/reactivation, Premium entitlement na svim lokalima. |
| I05 | ADMIN-03/14/16 | Friend waiver izuzima samo izabrane targete iz prihod/projekcije; proizvod ostaje naplativ. Referral reward tek posle kvalifikacije i konfigurisanih uslova; bez wallet-a i duplih nagrada. Promene dogovora ne menjaju prodajne snapshot-e. |
| I06 | ADMIN-04/17/18 | Jedan stabilan ID uzroka za Dashboard, Klijente i Tim; prioritet §10.2; resolve menja uzrok; deferral traži razlog i vraća stavku po isteku; paginirani search po svim kodovima/email/telefon/naziv. |
| I07 | ADMIN-08/09 | Svi kanali i statusi razgovora; reply ponovo otvara completed; waiting_client → completed; shared Inbox/Profile podaci; admin-only sent/delivered/read se ne vraća klijentu; raw email/attachments kontrolisani. Real inbound/unread/threading tek uz izabran provider u ADMIN-09. |
| I08 | ADMIN-10 | Jedan assignee i opcioni učesnici; svi task statusi; kašnjenje izvedeno; datum-only po Europe/Belgrade i DST granicama; odlaganja append-only i ponovno pojavljivanje; Tim nema employee tracking. |
| I09 | ADMIN-11/12 | Avans pre/posle custom dizajna; nema SMF/proizvodnje pre oba uslova; retry fan-out 50 komada ne duplira kodove; više lokala u porudžbini i više paketa; prijem/QC/aktivacija pa lično/kurir; failed QC i refund auditi. |
| I10 | ADMIN-12/13 | Atomski QR+NFC retarget, validacija service ownership/destination URL, immutable card target history; postojeći `/r` token ne menja se; SMQ vezivanje bez gubitka istorije; placement analytics attribution; bulk status/retarget/selection/risky-action reason. |
| I11 | ADMIN-14 | Godišnja uplata ulazi cela u mesec prijema, bez podele na 12. Naplaćeno po stvarnom novcu, Očekivano po postojećim ciklusima bez novih klijenata; fizički profit oduzima izradu/refund, SaaS poznat hosting/backend, Premium nema dodatni rashod; nepoznat trošak nije nula; profit nema filter po pojedinačnoj usluzi. |
| I12 | ADMIN-19/20 | 500 lokala/10.000 proizvoda: server filter/sort, stabilan cursor, tačni brojači bez N+1/collect-all; browser desktop/mobile kritični tokovi, focus/contrast/reduced motion/overflow, realni loading/empty/error states; owner pregled pre cutover-a. |

## Migraciona test matrica

| ID | Ulaz / failure injection | Prolazni uslov pre narrow-a |
|---|---|---|
| M01 | Snapshot stare scheme, clean i dirty/read-write okruženje | Snapshot se uspešno obnavlja u izolovanom deploymentu; izvorni row counts/ID-jevi/cash/reference totals zabeleženi; nema produkcionog upisa. |
| M02 | Stari i novi zapisi istovremeno | Widen validira oba formata; compatibility writer i reader ne gube noviji podatak; legacy billing odbija već migriran nalog. |
| M03 | Prekid batch-a/OCC posle dela rada, retry dvaput, novi red tokom backfill-a | Cursor/resume nastavlja; source→target mapa jedinstvena; nema duplih kontakata/SMF/pretplata/alokacija; late writes uključeni u reconciliation. |
| M04 | Account-less lokal, isti naziv, shared email, nedostajući primary owner | Nema spajanja po imenu/email-u niti povećanja prava; problem sa ID-jem ostaje eksplicitan; mandatory unresolved count mora biti 0 pre narrow-a. |
| M05 | Account-wide billing datum, nepotpun payment method/alokacija, invalid physicalSelection | Nema fabrikovanih ciklusa, cena ili fizičkih komada; original sačuvan; decoded ili eksplicitno unresolved; naplata = važeće alokacije + ostatak uz posebna storna/refundacije. |
| M06 | Legacy kod/slug, 1 card za 50 komada, stare target i scan istorije | Postojeći resolver i alias-i rade identično; nema 50 kopija iste scan istorije; immutable ID/cash/scan totals ostaju isti. |
| M07 | Novo članstvo/role, cross-account ID, bulk request | Svi server authz negativni testovi odbijaju pristup; `viewer` backfill nije `full_access`; nema oslanjanja na UI sakrivanje. |
| M08 | 500 lokala/10.000 komada, staged indeksi, promene dok se lista paginira | Upiti bounded i indeksirani, bez skrivenog take(200); cursor/count/filter tačni; staged indeks se ne koristi pre aktivacije. |
| M09 | Rollback pre i posle novih subscription upisa | Compatibility rollback čuva nove semantike; restore sa replay planom čuva post-snapshot uplate; nema starog account sweep-a nad novim ciklusima; tek zatim zasebno odobrena promocija/narrow. |

Migracioni redosled, compatibility writer granica i rollback ograničenja detaljno su u `ADMIN-01-MIGRACIJA.md`.
