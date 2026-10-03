# ADMIN-01 — widen-migrate-narrow plan

Autoritet: `docs/SCANME-ADMIN-V1-IMPLEMENTACIJA.md`, §0, §6–8, §10–12, §16–17, ADMIN-01 i §19. Ovo je plan za naredne taskove. ADMIN-01 ne registruje Convex funkcije, ne menja schemu, ne instalira komponentu i ne pokreće migraciju ni nad dev ni nad prod podacima.

## Izvršni ugovor i implementacione odluke

- `lib/admin-v1/catalog.ts`: kanonski ID-jevi, statusi, periodi, uloge, 7/15 prozori i privremeni format kodova.
- `lib/admin-v1/contracts.ts`: logički ugovori; `rules.ts`: čiste provere i projekcije. Ovo nisu Convex dokumenti, javni argumenti niti zamena za serversku autorizaciju.
- `EntityId<K>` razdvaja interne identitete po domenu. Budući adapter mapira stvarni `Id<"accounts">`, `Id<"businesses">` itd. Fixture ID-jevi nisu ID-jevi baze. Ljudski kod nikada nije foreign key niti izvor vlasništva.
- Interni V1 naziv je `scanme_review`; `google_review` i pricing alias `review` normalizuju se na ulaznoj granici. Legacy storage/resolver ostaje nepromenjen do svog migracionog taska. Venue/Memories nisu V1 katalog, ali postojeći domenski podaci ostaju sačuvani.
- Fizički SKU ID-jevi ostaju postojeći. `lib/scanme-pricing.ts` koristi isti `ProductType`; `lib/i18n/sr/admin-domain.ts` je jedini izvor kanonskih naziva, a `sr/offer.ts` ih preuzima. Nema promene cena ili konfiguracije proizvoda.
- Novac je ceo broj najmanjih jedinica, sa valutom. Postojeći `amountRsd`/`lineTotalRsd` su celi dinari: adapter eksplicitno množi sa 100. Bez FX konverzije i mešanja valuta u jednoj uplati/alokaciji.
- Vremena su UTC epoch ms, intervali `[start, end)`. Na `paidThrough` počinje grace; na `graceEndsAt` suspenzija. Warning je signal, ne status. Pomak sledećeg meseca/godine ostaje kalendarski, uz testove kraja meseca/prestupne godine u ADMIN-03. Datumski zadatak čuva dan i `Europe/Belgrade`; nije isto što i ponoć UTC.
- Snapshot-i su readonly vrednosti. Istorije su posebni append-only zapisi. Nizovi u fixture agregatima nisu predlog za neograničene nizove u jednom Convex dokumentu.
- `PhysicalProduct.destinationId` je jedna zajednička destinacija; kanali imaju odvojene tokene, enable/health stanje i analitiku. Budući storage koristi zasebne redove kanala i agregira ih u `PhysicalChannels`. Oba kanala odsutna nije validan fizički komad. `unchecked` nije zdrav/aktivan kanal.
- `DigitalQr` je ili samostalan QR ili istorijska SMQ veza ka fizičkom komadu/kanalu. U drugom slučaju ne čuva drugu aktuelnu destinaciju.
- Porudžbinske faze i format/padding koda su **PRIVREMENO**. Izbor šablona još nije odobrenje: proizvodnja zahteva `paid + approved`.
- Finansijsko izuzeće je eksplicitni `friend_waiver` za konkretne subscription targete, uz postojeći Prijatelj tag. Waiver nije uplata. Referral nema wallet; nagrada referencira popust i izabrane targete. Stanje `unconfigured` ne odobrava primenu popusta; `rewarded` zahteva konfigurisane uslove.
- `periodCoverage` prima već proverene, važeće alokacije; ne primenjuje novac, refund ili storno. To i idempotentnost su obaveze ADMIN-03. `canCancelService` kodifikuje samo zaključano pravilo otkaza; nije kompletan auth gate.

## Preflight za svaki budući migracioni task

1. Proveriti granu, HEAD, dirty status, `AGENTS.md`, relevantni task i `convex/_generated/ai/guidelines.md`. Raditi sekvencijalno na `codex/admin-v1`; bez paralelnih schema promena.
2. Identifikovati checkout, vlasnika localhost porta i tačan deployment iz lokalne konfiguracije. ADMIN-00 je zabeležio `dev:perfect-ant-98`; taj podatak treba ponovo proveriti pre bilo kakvog deploy-a. Ne ispisivati tajne.
3. Napraviti read-only inventar: broj i relacije zapisa, duplikati, account-less lokali, duplikati usluge po lokalu, identitet vlasnika, nedostajući periodi/cene i nepotpuni physical snapshot-i. Izvesti listu neodređenih redova sa ID-jem i razlogom.
4. Obezbediti snapshot podataka i proverljiv restore u izolovanom preview/test deploymentu pre produkcione promocije. Git checkpoint štiti kod, ne podatke. Produkcione radnje i brisanje/reset zahtevaju zasebno eksplicitno odobrenje; ovaj task ih ne odobrava.
5. Za netrivijalni backfill planirati `@convex-dev/migrations` sa cursor batch-evima, dry-run, resume i statusom. Komponenta nije instalirana ovim taskom; tačnu API/version sintaksu proveriti u tasku koji je uvodi.

## Mapa migracije prema stvarnom lokalnom kodu

| Zatečeno | Widen i mapiranje | Naredni task / uslov narrow faze |
|---|---|---|
| `accounts`: poslovni naziv, plan, billing status, `planValidUntil` | Sačuvati interne ID-jeve; dodati zasebne SMK, owner display, lifecycle, primary owner i default kontakt. `suspended/expired` se ne mapiraju u `archived`. | ADMIN-02; svaki nalog ima validne kontakte/vlasnika, svi lokali imaju nalog. |
| `businesses.accountId` opciono, uključuje `kind: celebration` | Dopuniti SML/lokalne reference za poslovne lokale. Account-less red mapirati kroz eksplicitnu odluku po izvornom ID-ju; nikada grupisati po istom imenu. Celebration/Venue/Memories tok ne prepisivati. | ADMIN-02; nema nerešenih poslovnih lokala, stari domenski tokovi i dalje prolaze. |
| `businessContacts`, `businessMemberships`, `businessInvitations` | Novi account kontakti/članstva i old→new mapa; `viewer` → `view_only` samo za ranije dozvoljene lokale. Ne podizati pravo otkaza/kupovine. Ne spajati ljude globalno samo po email-u. Kontakt `invited` čuva invitation state odvojeno od active/inactive. Očuvati token/veze pozivnica. | ADMIN-02; jedan primarni vlasnik, validan default i override, negativni ownership testovi. Nedostajućeg vlasnika ne izmišljati. |
| `serviceProfiles`, `dynamicLinks` | Sačuvati profile, slugove, alias-e i konfiguracije. Odvojiti activation, configuration, health i editing; Review mapirati na domenskoj granici. | ADMIN-02/03/15; unique venue+type, ista javna destinacija/analitika. |
| Jedan `accounts.planValidUntil`, billing sweep | Dodati nezavisne `subscriptions` i cycle evidenciju po Premium-u ili service instance. Account-wide datum nije dokaz da je svaka usluga plaćena. | ADMIN-03; svaki target/period ima dokaz ili nerešen migration red; novi sweep paginiran i idempotentan. |
| `payments.amountRsd`, `method: manual/provider`, `coversUntil`, optional order, void flags | Očuvati original i izvornu referencu; currency/minor-unit adapter, append-only adjustments i precizne alokacije. `manual` ne dokazuje bank transfer ili cash. Neodređen način ostaje `other` uz poreklo; neodređena alokacija ostaje eksplicitan neraspoređen iznos. Nedostajući storno razlog označiti kao legacy nedostajući podatak, ne fabrikovati ga. | ADMIN-03; novac i alokacije se usaglašavaju, bez retroaktivnog pomeranja tuđih ciklusa. |
| `orders.priceSnapshot`, `orderItems.physicalSelection: v.any()`, jedan `provisionedCardId` po liniji | Dekodirati `unknown` po stvarnom obliku; sačuvati originalne snapshot-e, bez novog pricing obračuna. Razdvojiti payment/design/fulfillment. `paid` ne dokazuje odobren dizajn ili QC. | ADMIN-11; nedostajući material/design/qty ide u migration problem, ne u `any` ili izmišljenu vrednost. |
| `cards`, `cardTargets`, `cardScanEvents`, `dailyCardMetrics` | Sačuvati `cardCode`, `/r/[cardCode]`, currentTarget i sve istorijske ID-jeve. Kartica sama nije dokaz fizičkog komada; bez dokaza ostaje digitalni kanal. Jedan stari kod po liniji ne klonirati kao da istorija identifikuje 50 komada. SMF/NFC vezivanje radi se eksplicitno. | ADMIN-12; isti resolver URL i stari scan totals; po komadu bar jedan kanal, jedna destinacija, jedinstveni SMF. |
| `adminAuditLog.action/detail` string | Zadržati legacy zapis uz izvorni ID; novi događaji koriste tipizovan action/detail i actor/reason. Neodređen legacy JSON ne prevoditi u izmišljenu radnju. | ADMIN-02…18; nema gubitka audit istorije/PII curenja. |
| Nema inbox/task/action/product read modela | Nove tabele i indeksi po domenu, bez backfill izmišljenih poruka/aktivnosti. | ADMIN-04/08/10/11/12; izvorni uzrok, ownership i bounded query provere. |

## 1. Widen

Dodati nove tabele/opciona polja, compatibility read adapter i mapu `(migrationVersion, sourceTable, sourceId) → targetId`. Kodovi se rezervišu uz indeksirani collision check u istoj transakciji; format se ne koristi za relacije. Novi write tok prvo postaje kompatibilan sa oba stanja, pa tek zatim počinje backfill.

Stare i nove forme ne smeju imati dva nezavisna autoritativna write puta. Gde je semantika ista, dual-write je u istoj mutaciji. Gde nije ista — naročito nezavisne pretplate prema starom jednom account ciklusu — **ne pokušavati gubitnički reverse projection**. Tamo migracioni marker bira jednog vlasnika upisa po nalogu; legacy billing mutation/sweep odbijaju već migriran nalog i upućuju na novi tok. Samo UI feature flag nije dovoljan.

Indeksi moraju pratiti query ugovor iz §11.2: kodovi, account+status, venue+type, target/subscription, payment/order, assignee+status+dueAt, channel/product i istorija+vreme. Velike indekse prvo staged backfill, zatim aktivirati; ne koristiti ih dok nisu spremni.

## 2. Migrate

Redosled: account/SMK → kontakti/firme/brendovi/grupe/članstva → venue/SML → service mapiranje → subscriptions i cene → payments/allocations → orders/lines → physical/channel/destination istorija → read modeli. Izvršava se kroz taskove iz §17, ne sve u ADMIN-02.

Svaki korak ima dry-run, bounded cursor batch, versioned checkpoint, source→target mapu i listu problema. Upis i checkpoint su atomski. Retry ne sme napraviti drugi kontakt, subscription, SMF ili alokaciju. Kod konkurentne izmene reread/version guard čuva noviji podatak. Novi redovi stvoreni tokom backfill-a već prolaze kompatibilni writer; završni reconciliation proverava i njih.

Nerešeni redovi ostaju očuvani u legacy formi i eksplicitnom izveštaju. Nijedna nepoznata cena, datum, identitet vlasnika, broj fizičkih komada, payment method ili waiver ne nastaje nagađanjem. U slučaju dvosmislenog poslovnog mapiranja task beleži konkretne ID-jeve/pitanje u `docs/tasks/BLOCKED.md`; ne briše test podatke da bi migracija prošla.

## 3. Verify i narrow

Pre narrow-a obavezno izvršiti M01–M09 iz `ADMIN-01-TEST-MATRICA.md` na izolovanom snapshotu. Ulazni kriterijumi: nula nerešenih mandatory mapiranja/orphan relacija, jedinstveni kodovi/targeti, isti sačuvani novac/istorija/URL-ovi, ownership negativni testovi i potpun snapshot decode. Zatim uključiti novi read tok uz reconciliation prema originalu.

Narrow tek kada sve stvarne podatke validiraju nova obavezna polja, nijedan writer/scheduler više ne piše legacy formu i relevantni task ima zelen izveštaj. Stara polja prvo deprecirati; brisanje istorije nije narrow strategija. Legacy admin UI se uklanja tek u ADMIN-20 posle vlasnikovog pregleda. Očuvati Links/Meni golden granice i Venue/Memories/ordering funkcije.

## Rollback i stop uslovi

- Pre novih semantički nespojivih upisa: vratiti compatibility čitač na legacy podatke, zaustaviti samo konkretan migration runner; novi opciono uvedeni podaci ostaju sačuvani.
- Posle nezavisnih subscription upisa: ne vratiti staru verziju koja bi izgubila cikluse. Pauzirati pogođene finansijske upise i nastaviti compatibility verzijom/forward fix-om; sačuvati sve nove uplate i mapiranja.
- Restore se prvo vežba na zasebnom deploymentu. Produkcioni restore nije automatski rollback: mora sačuvati/replay-ovati upise posle snapshota, sprečiti provider duplikate i dobiti posebno odobrenje.
- Odmah zaustaviti promociju ako reconciliation nije nula, resolver menja target/istoriju, nastaje podizanje pristupa ili se kodovi dupliraju. Ne nastavljati sa narrow-om da bi task izgledao završen.

Otvoreni ulazi za kasnije taskove ostaju iz §20: provider, stvarni troškovi, konkretni komercijalni/referral uslovi i završni format kodova. ADMIN-01 nije pronašao novu kontradikciju koja blokira ugovore.
