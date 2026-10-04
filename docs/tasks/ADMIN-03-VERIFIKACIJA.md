# ADMIN-03 — nezavisne pretplate i provider-neutral naplata

Datum: 11. septembar 2026. Grana: `codex/admin-v1`.
Početni HEAD: `1be96ef79dcf46aa27b761c70688a6b5f7285b8e`.
Jedina početna nepovezana stavka bila je untracked `output/pdf/scanme-menu-cenovnik-i-projekcija.pdf`; nije menjana niti uključena u commit.

## Autoritet i granice

Izvor je `docs/SCANME-ADMIN-V1-IMPLEMENTACIJA.md`: §0, ceo §7–8, §12, §15–17, ADMIN-03, ADMIN-01 ugovori/fixture-i/rules/migracioni plan/test matrica i ADMIN-02 authorization/migracioni adapteri. U trenutnoj verziji dokumenta ne postoje numerisani §5.2 i §10.5 navedeni u promptu: pročitani su ceo §5, §10 i relevantni §9.10 (Finansije/Prijatelj).

Pročitani su `AGENTS.md`, `convex/_generated/ai/guidelines.md`, schema, postojeći billing/checkout/orders/entitlement/plan/pricing tokovi i lokalna Next dokumentacija. Korišćene su dostupne convex, convex-expert, convex-migration-helper i convex-test smernice. Korisnikova zabrana deployment upisa ima prednost nad generičkom skill preporukom za deploy proveru.

ADMIN-03 dodaje backend temelj. Novi registrovani ulazi su **internal** i imaju `args` i `returns` validatore; nema novog klijentskog hook-a koji bi opravdao public API. Svi korisnički pokrenuti interni ulazi ipak proveravaju auth/ownership/capability. UI se ne menja. Finansije, računi/predračuni, profit agregacije, payment provider i ADMIN-04 nisu implementirani.

## Model i invariant-e

| Tabela / granica | Uloga |
|---|---|
| `accounts.billingModel` | Opciono `subscriptions_v1`; bira jednog vlasnika billing upisa. Stari plan i datum ostaju kao izvorna evidencija. |
| `subscriptions` | Jedan stabilan zapis po account Premium-u ili konkretnom `serviceProfileId`. Account/SML ownership je serverski proveren; veze se ne izvode iz SMK/SML koda. Period, kalendarsko sidro, renewal setup seam, otkaz, ručna suspenzija, grace override i izvedene lifecycle činjenice su zasebni podaci. |
| `subscriptionPeriods` | Jedan kupovni period sa start/end i trajnim snapshotom referentne/efektivne cene. `paidMinor` i `funded` su transakcijski održavana pokrivenost; originalna cena se ne prepisuje. |
| `payments.ledger` | Additive envelope sa celobrojnim minor units, valutom, stvarnom metodom, opcionim provider/event ID-jem, actorom, idempotency key-jem i payload fingerprintom. `amountRsd` i stari `method` ostaju kompatibilni prikazni/ingestion podaci; nova aritmetika ih ne koristi. |
| `paymentAllocations` | Append-only veza uplata → pretplata → tačan period, sa iznosom i snapshotom cene. Jedan upis može obuhvatiti do 50 izabranih perioda. Zbir alokacija plus eksplicitan neraspoređeni ostatak mora biti jednak uplati. |
| `paymentAdjustments` | Append-only potpuno storno/reversal sa iznosom, razlogom, actorom, vremenom i idempotency zaštitom. Originalna uplata i alokacije ostaju identične. |
| `paymentStates` | Mali mutable read fact `settled/reversed`, odvojen od finansijske istorije; indeks omogućava nalaženje prve uspešne nove uplate bez skeniranja cele istorije. |
| `priceAgreements` | Eksplicitan target, period, standard/founders/enterprise/individual osnova, reference/effective novac, validFrom/validUntil, actor/reason. `null` kraj označava dogovor bez isteka. |
| `discountRules` | Jedan eksplicitni target po redu; friend waiver, ručni discount/waiver ili referral discount; fixed/percentage/waiver i period važenja. Nema automatskog proširenja na druge usluge/proizvode. |
| `referrals` | Referrer/referred account, pending/qualified/rewarded/cancelled i qualifying payment. Nema wallet-a, automatski odabranog procenta niti izmišljene kampanje. |
| `subscriptionEvents` | Append-only poslovni audit: actor/action/account, konkretni predmet, vreme, obavezni razlog gde je potreban i before/after lifecycle činjenice. |

Novac se validira kao nenegativan safe integer. Primljena uplata mora biti pozitivna. V1 receipt writer prihvata RSD; odbija drugu valutu umesto implicitne konverzije u postojeći RSD prikaz. Procenti su integer basis points, obračun kroz BigInt sa eksplicitnim odsecanjem popusta na minor unit. Nema floating-point finansijskog sabiranja.

`purchasePeriod` priprema jedan tačno određen period. Delimično pokriven period ne aktivira mesečnu/godišnju uslugu. Više uplata može ga dopuniti; potpuno pokriven period aktivira se u istoj transakciji. Više unapred plaćenih perioda zadržava pun `paidThrough`. Indeks prve nepokrivene granice sprečava da se storno rupa preskoči, a kasniji samostalno plaćeni period ostaje sačuvan.

## Lifecycle i komercijalna pravila

- UTC intervali su `[start, end)`. Na `paidThrough` počinje grace, na `graceEndsAt` suspenzija. Warning je zaseban boolean, nikada status.
- Mesečno: warning 7 dana pre isteka i grace 7 dana. Godišnje: 15/15. Ista pravila važe za Premium.
- Kalendarsko sidro čuva 31. januar → kraj februara → 31. mart, kao i povratak 29. februara u prestupnoj godini. Godišnjice različitih usluga se ne poravnavaju.
- Plaćanje, cancellation, suspension i grace extension menjaju samo izabranu pretplatu. Immediate/end-of-period cancellation, ručna suspenzija, reaktivacija i produženje grace-a imaju razlog i audit. Retry ne ponavlja događaj.
- Sweep je internal, indeksiran po `nextTransitionAt`, u batch-evima od 50. Nastavci prazne backlog; zastareli/prerađeni redovi izlaze iz due indeksa. Cron definicija je na 15 minuta. Materijalizovane činjenice osvežava sweep; precizan boundary read prima `now` kao argument, bez clock čitanja u query-ju.
- Važeći eksplicitni zero-price/waiver obnavlja besplatne periode bez lažnog cash receipt-a. Downtime catch-up ostaje bounded. Istek popusta vraća naplativost po važećem dogovoru.
- Premium je jedna account pretplata i entitlement/badge činjenica za sve lokale i postojeće proizvode sa Premium mogućnostima. Starter nema plaćenu account pretplatu ni badge. Legacy account plan ne može ponovo da aktivira istekli Premium na migriranom nalogu. Uslužni datumi se ne menjaju zbog Premium-a.
- `Prijatelj` zahteva postojeći account tag i waiver za konkretan target. Sam tag ne daje besplatne usluge. Postojeći prodajni snapshoti se ne repriciraju retroaktivno.
- Referral se kvalifikuje posle prve stvarno evidentirane pozitivne nove uplate; reward zahteva eksplicitne uslove i izabrane targete. Retry daje iste discount ID-jeve. Storno kvalifikujuće uplate otkazuje referral za buduće primene, uz audit; već sačuvani prodajni snapshoti ostaju nepromenjeni.
- Founders može imati datum isteka ili važiti bez isteka; enterprise/individual su cenovni dogovori, nisu treći plan/badge. Najnoviji dogovor za target/period je autoritativan; istek traži eksplicitni naredni dogovor, ne oživljavanje neke stare posebne cene. Najnoviji discount za target je eksplicitan izbor, bez implicitnog slaganja popusta.
- Nova naplata ne hardkoduje 1.490 RSD. Referentni i dogovoreni iznos ulaze kao podaci. Stari pricing engine/golden iznosi nisu menjani.

## Authorization, istorija i idempotency

ADMIN-02 `requireClientAccountAccess/Capability` i `requireClientVenueAccess/Capability` proveravaju aktivno članstvo, nalog i odabrane lokale. `full_access` može otkazati. `canBuyServices`/`canBuyPremium` dozvoljavaju pripremu odgovarajuće kupovine/plaćanja, bez prava na otkaz. Klijent ne može sam potvrditi da je novac primljen: receipt i storno su admin-only. Ne postoji provider endpoint koji bi zaobišao ovaj gate.

Uplata, sve alokacije, period coverage, lifecycle, audit i referral kvalifikacija menjaju se u jednoj Convex transakciji. Indeksirani idempotency key + canonical payload fingerprint vraćaju prethodni rezultat ili odbijaju izmenjen payload. Provider/event par ima dodatnu zaštitu. Period je jedinstven po subscription/start, target po account/target, a referral po referred account. Konkurentni receipt/retry testovi dokazuju da nema duplog novca.

Storno oduzima tačne originalne alokacije iz coverage-a, bez brisanja ili prepisivanja istorije. Drugi periodi/uplate ostaju sačuvani. Novi history query je paginiran; legacy payment list odbija migrirani nalog da ne bi prikazao reversal kao važeću uplatu po starim void flag-ovima.

## Widen i migracioni dokaz

`subscriptionMigrations.adoptAccount` je eksplicitan, admin-authorized single-account batch sa dry-run-om, concurrency guardom (`expectedUpdatedAt`), idempotentnim migration event-om i kompletnim mapiranjem aktivnih V1 service targeta. Granica je 50 lokala/profila/targeta po kontrolisanom batch-u; veći legacy nalozi zahtevaju zasebnu cursor/component migraciju pre njihovog cutover-a.

Svaki plaćeni početni period zahteva eksplicitan start/end/cenu i evidence tekst; inače je `unpaid`. Zajednički account datum i `profile.status=active` nisu dokaz plaćenih usluga. Premium/Starter odluka je obavezna. Izvorni payments i account billing polja ostaju netaknuti. Read-only legacy adapter prikazuje minor iznos, neodređen način kao `other`, neraspoređeni ostatak i unresolved oznake za alokaciju/način/storno razlog. Ne proizvodi lažne alokacije, duple receipt-e ili retroaktivne referral nagrade.

Legacy payment/date/order/checkout writeri i stari scheduled checkout odbijaju `subscriptions_v1` nalog. Legacy sweep koristi indeks koji takve naloge isključuje pre batch-a, pa nema starvation petlje. Nijedan narrow, reset ili migracioni upis na stvarnoj bazi nije izvršen.

## Dodati testovi

Svi su u `convex/subscriptions.test.ts`, sa `convex-test` in-memory bazom i kontrolisanim vremenom. Ukupno **39 slučajeva**, uključujući parametrizovane varijante:

| Oblast | Slučajevi |
|---|---|
| Glavni scenario | Četiri lokala, tri mesečne A, tri godišnje na četvrtom; neplaćeni četvrti ne menja prva tri. |
| ADMIN-01 I02 | 38.000 uplata: 12.000 mesečno + 6.000 godišnje + 15.000 Premium + 5.000 ostatak; potom 18.000 dopuna samo godišnje usluge. |
| Objedinjena uplata | Svih sedam targeta u jednoj uplati, sedam nezavisnih datuma. |
| Godišnjice | 15. februar i 15. septembar ostaju nezavisni. |
| Više unapred plaćenih perioda | Pun paidThrough, reversal rupa, kasniji zasebno plaćeni period i dalje važi. |
| Receipt retry | Konkurentni isti key; isti rezultat/jedna uplata; izmenjeni payload i provider duplikat odbijeni. |
| Konkurentne dopune | Dve polovine atomski pune period; loša druga alokacija rollback-uje ceo receipt. |
| Neispravan novac (5) | NaN, Infinity, negativan, razlomljen i unsafe integer iznos. |
| Balance i ownership | Pogrešan zbir, valuta, tuđ period, duplikat i over-allocation pišu nula uplata. |
| Storno | Obavezan razlog, retry, originalna uplata/alokacije/snapshot identični, drugi receipt očuvan, dvostruki storno odbijen. |
| Dozvole | Manager/finance sa grants mogu prepare; viewer/neprijavljen/neaktivni član/tuđ nalog/tuđ lokal ne mogu; Premium zahteva poseban grant; kupovina ne daje otkaz ili pravo receipt-a. |
| Besplatni periodi | Waiver catch-up preko više meseci bez cash receipt-a; posle isteka ponovo naplativo. |
| Prijatelj | Samo odabrana usluga i Premium besplatni; druga usluga ostaje naplativa; tuđ tag odbijen. |
| Agreement snapshot (3) | Founders, enterprise i individual; retry; nova cena ne menja stari snapshot. |
| Istek/procenti | Founders expiry zahteva novu cenu; integer basis-point rounding. |
| Referral | Nema reward pre uplate; qualified bez automatske kampanje; eksplicitni reward jednom; storno gasi buduću nagradu uz očuvan snapshot. |
| Referral negativni | Self referral, tuđ target i prazni reward targeti odbijeni; naknadna registracija koristi postojeći potvrđeni receipt. |
| Nova pretplata | Purchase grant, unique target, idempotency konflikt, nedostajuća cena, neplaćeno ostaje inactive, duplikat perioda i rupa u datumima. |
| Migracija | Dry-run bez upisa, nedostajući aktivni target, stale account, retry, originalna uplata/account datum sačuvani, unknown method/allocation/reversal reason prijavljeni. |
| Starter | Eksplicitni Starter bez Premium reda/badge-a; unpaid migracija ne daje pristup plaćenom periodu. |
| Legacy zaštita | Manual/provider payment, datum i checkout odbijaju migrirani nalog; stari sweep i payment i dalje rade za legacy nalog. |
| Boundary (3) | Mesečna usluga, godišnja usluga, mesečni Premium: ms pre/na warning, expiry i grace granici. |
| Godišnji Premium | Iste tačne 15/15 granice. |
| Kalendarski pomaci (4) | 31. januar u običnoj/prestupnoj godini; 29. februar + godina; prelaz decembar/januar. |
| Sidro | Povratak na 31. mart i na 29. februar. |
| Premium entitlements | Sva četiri lokala i Menu/Venue/Memories; otkaz Premium-a vraća basic/no badge bez izmene šest uslužnih zapisa. |
| Kontrole | Cancel-at-end, idempotency audita, manual suspend/reactivate, grace produženje i prazan razlog. |
| Batch | 110 dodatnih stvarnih subscription targeta; 50 po batch-u, scheduled nastavci, tačne suspenzije i no-op retry. |

## Provere

```powershell
npm.cmd test -- convex/subscriptions.test.ts convex/adminV1.test.ts convex/billing.test.ts convex/checkout.test.ts convex/purchaseLifecycle.test.ts convex/orders.test.ts convex/accountEntitlements.test.ts convex/entitlements.test.ts convex/menuEntitlements.test.ts convex/venue.test.ts lib/admin-v1/contracts.test.ts lib/pricing/engine.test.ts lib/pricing/golden.test.ts
npx.cmd tsc --noEmit -p convex/tsconfig.json
npm.cmd run check
git diff --check
```

- Ciljani/regresioni testovi: **214/214**, 13 fajlova; ADMIN-03: **39/39**.
- Convex TypeScript: **PASS**.
- `npm run check`: **PASS** — lint, Next production build, namespace gate i Links golden harness **177 × 2 viewporta**.
- `git diff --check`: **PASS**.
- Lint ima samo dva ranije dokumentovana upozorenja: `components/admin/venue-admin.tsx` unused `useMemo` i `convex/purchaseLifecycle.test.ts` unused `price`. Vitest ispisuje postojeću Vite configLoader napomenu.
- Prvi build je otkrio BigInt literal neusaglašen sa aplikacionim TS targetom; ispravljen je u `BigInt(10_000)` bez promene obračuna.
- Nema promenjenog UI-ja za ručni desktop/mobile QA; golden harness nije predstavljen kao autentifikovani vizuelni pregled novog admina.

## Fajlovi

Novi: `convex/lib/subscriptionValidators.ts`, `convex/lib/subscriptions.ts`, `convex/subscriptions.ts`, `convex/subscriptionPayments.ts`, `convex/subscriptionPricing.ts`, `convex/subscriptionMigrations.ts`, `convex/subscriptions.test.ts`, ovaj izveštaj.

Promenjeni: `convex/schema.ts`, `convex/_generated/api.d.ts` (lokalni type-only module registry, bez codegen/deploy komande), `convex/billing.ts`, `convex/checkout.ts`, `convex/orders.ts`, `convex/crons.ts`, `convex/lib/entitlements.ts`.

## Otvoreni poslovni ulazi i završne granice

- Payment provider i stvarni automatic-payment adapter nisu izabrani.
- Konačan cenovnik/Premium cena, founders trajanje i pojedinačni enterprise/individual ugovori ostaju eksplicitni podaci za kasniji task.
- Referral iznos/procenat/trajanje i detalji finalne kampanje ostaju otvoreni; ništa od toga nije pretpostavljeno.
- Production/live migration zahteva proverenu evidenciju po targetu i zasebno odobren izvršni korak. Neodređeni legacy receipt-i ostaju očuvani sa unresolved oznakama.
- UI i odgovarajući public wrapper-i pripadaju narednim taskovima koji zaista imaju klijentske pozive. Nije uveden privremeni drugi admin UI.

`perfect-ant-98` je samo identifikovan iz lokalne konfiguracije. Nije pokrenut migrate, seed, reset, deploy, convex dev, codegen sa deployment pristupom niti druga promena deployment podataka. **ADMIN-04 nije započet. Ništa nije pushovano.**
