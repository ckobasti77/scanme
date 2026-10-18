# Blokirane odluke i pitanja za vlasnika

Ovde se upisuju odluke koje traže vlasnika, sa brojem taska. Task nastavlja sa
ostatkom posla i ne pogađa.

---

## TASK-28 — motor u marketing i ponudu, gašenje SAAS_PRICING

### 1. Privremena semantika tirova na marketing/ponuda površini (za potvrdu)

`SAAS_PRICING` je ugašen. Stari model je imao **dve usluge × dva tira po usluzi**
(`review`/`links` × `starter`/`premium`), gde je svaki tir imao svoju cenu.
Novi motor (`lib/pricing`) nema tir po usluzi — usluga ima **jednu** cenu
(Osa A), a plan (`basic`/`premium`/`enterprise`) je **nalog-nivo** (Osa B).

Da bih ugasio `SAAS_PRICING` a da ne prepravljam ceo tok (to je zadatak 7–8 iz
§4), preslikao sam postojeća dva plaćena tira na osu plana:

- `starter` → plan **basic** (besplatan plan; cena = samo cena usluge)
- `premium` → plan **premium** (cena usluge + linija Premium plana)

Sve cene sada dolaze iz motora (`saasFirstTermPrice` u `lib/scanme-pricing.ts`,
koji zove `price()` iz `lib/pricing`). Marketing „Od" cene, konfigurator i
pregled čitaju isti motor — jedan izvor cene.

**Pitanje za vlasnika:** ovo je *privremeno* preslikavanje dok se ne izgrade
koraci 7–8 (Basic/Premium kolone, četvorokoračni tok). Kopija na karticama i
dalje kaže „Starter/Premium" po usluzi; semantika je sada „nalog plan". Kada
dođu zadaci 7–8, potvrditi da se marketing stranica u potpunosti prebacuje na
model „pet usluga (Osa A) + plan (Osa B)" i da se `PublicTierId`
(`starter`/`premium`) povuče iz UI-ja (ostaje samo radi parsiranja starih
v1–v4 offer URL-ova). Ništa nije zakucano — brojevi su placeholderi u
`lib/pricing/constants.ts`.

### 2. „−17%" bedž na godišnjem tumblu (`components/pricing-plans.tsx`)

Bedž „−17%" pored „Godišnje" je zakucan marketinški procenat, nije cena, pa ga
motor ne računa. Ostavljen je netaknut (van opsega zadatka 2). Kada se cene
popune, proveriti da li stvarna godišnja ušteda po motoru odgovara tom broju,
ili ga zameniti izračunatom vrednošću.

### 3. RFC-002 dokument je bio van stabla

`docs/architecture/RFC-002-pricing-and-purchase.md` nije postojao ni na
`feat/venue-memories` ni na `claude/rfc-002-pricing-purchase-9c065c` — živeo je
samo kao *neispraćen* fajl u worktree-u `rfc-002-pricing-purchase-9c065c`
(deliverable TASK-26 nije bio komitovan). Uneo sam ga u stablo u ovom komitu jer
ga svi naredni zadaci (29–39) referenciraju. Ako postoji novija verzija kod
vlasnika, prepisati.

### 4. `harness:check` pada zbog baga u Node-u v24.8.0 (BLOKIRA `npm run check`)

**Ovo NIJE greška u kodu ovog zadatka i NIJE drift goldena.** `npm run check`
prolazi kroz `lint`, `build`, `harness:namespace` i sve testove
(`vitest`: 540 prošlo, uključujući cenovnu zlatnu tabelu), ali `harness:check`
ne može da se izvrši: dev server se **nativно** ruši čim aplikacija napravi
prvi odlazni TLS poziv tokom SSR-a:

```
next-server (v16.2.12): X509_STORE *NewRootCertStore(void) at src\crypto\crypto_context.cc:914
Assertion failed: (1) == (X509_STORE_add_cert(store, cert))
```

Uzrok: `proxy.ts` (Convex Auth middleware) zove `convexAuth.isAuthenticated()`
na svakoj ruti, što preko `undici` fetch-a otvara HTTPS ka Convex deploy-u.
Node v24.8.0 se ruši u `NewRootCertStore` (bundled root-cert store) — poznat
bag u toj verziji Node-a. Deterministički se reprodukuje na svakom pokretanju.

**Provereno da nije moje:** ništa što sam dirao (`lib/pricing`,
`lib/scanme-pricing`) ne uvozi se na render putanji goldena (dev galerija /
`components/scanme-links`), a `harness:namespace` prolazi — moje izmene ne mogu
da promene ScanMe Links goldene. TASK-27 nikad nije uspeo da pokrene
`harness:check` (port 3199 zauzet), pa je ovo prvi put da se bag uopšte vidi.

**Šta sam probao (bez uspeha, bez trajnih izmena):** `--use-system-ca` i dalje
ruši (Node svejedno gradi bundled store); `--use-openssl-ca` bi ugasio
proveru sertifikata na Windows-u (bezbednosna izmena — nisam je radio).

**Odluka za vlasnika (jedno od):**
1. Pokrenuti pod Node LTS-om (v22 ili v20) gde bag ne postoji — najčistije.
2. Nadograditi Node na zakrpljenu v24.x kad izađe.
3. Prihvatiti da `harness:check` ostaje van dohvata na ovoj mašini i pokretati
   goldene u CI-ju sa ispravnim Node-om.

Do te odluke, `harness:check` (a time i `npm run check` u celini) ostaje crven
iz čisto sredinskih razloga; sve ostalo u lancu provere je zeleno.

---

## TASK-29 — accounts + getEntitlement korak 3

### 1. KORAK 0: `nvm` ne postoji na mašini — harness ostaje sredinski blokiran

`node -v` = **v24.8.0** (ista verzija kao u TASK-28 §4). Pokušano `nvm use 22`
/ `nvm install 22`: komanda `nvm` **ne postoji** na ovoj mašini (nema je na
PATH-u), pa prebacivanje na Node 22 nije izvodljivo bez instalacije novog
alata — što je odluka vlasnika, ne ovog taska.

Posledica: `harness:check` se i dalje deterministički ruši u
`NewRootCertStore` (vidi TASK-28 §4) i prijavljuje se kao **sredinski
blokiran, ne kao pad koda**. Sve ostale provere (lint, build,
`harness:namespace`, ceo vitest) moraju biti — i jesu — zelene; stanje po
pokretanju zabeleženo u izveštaju taska.

Opcije za vlasnika ostaju iste kao u TASK-28 §4 (Node LTS, zakrpljeni v24.x,
ili goldeni u CI-ju); dodatna najjeftinija: instalirati nvm-windows pa
`nvm install 22`.

---

## TASK-30 — Enterprise provizioniranje + grupisanje u adminu

### 1. TASK-29 (accounts spine) uvučen u `feat/venue-memories` fast-forward-om

Zadatak 4 iz §4 (ovaj task) direktno stoji na zadatku 3 (`accounts` tabela,
`businesses.accountId`, `getEntitlement` korak 3, `ACCOUNT_PLAN_TIER`) koji je
isporučen kao **TASK-29**. TASK-29 je bio komitovan na grani
`claude/accounts-getentitlement-step3-cd95cf` (`6b59b25`), čiji je roditelj
tačno vrh `feat/venue-memories` (`21878c2`) — dakle čist fast-forward, bez
mogućnosti konflikta. Da bi ovaj task landirao na jednoj grani (a ne opet u
worktree-u koji vlasnik ručno spaja), **fast-forward-ovao sam
`feat/venue-memories` na `6b59b25` pre početka rada**, pa TASK-30 komit sedi na
vrhu. Ništa nije prepisano; branch pointer je samo pomeren da uključi već
komitovan TASK-29. Ako vlasnik ima drugačiju nameru za redosled spajanja
TASK-29, javiti — ali bez TASK-29 ovaj task nema na čemu da stoji.

### 2. Admin tabela/sidebar UI je zadatak 12/13, namerno izostavljen ovde

Isporučen je **upit** `admin.customers` (novi, `convex/admin.ts`) koji grupiše
lokale po `accountId`: Enterprise nalog sa >1 lokala vraća se kao JEDAN red
(`kind:"enterprise"`, `locations[]`), solo nalog i legacy biznis bez naloga kao
pun-širina red (`kind:"solo"`). To je tačno oblik koji „jedan red koji se širi u
lokale / bez sidebara za solo" traži. Sama React tabela sa kolonama, sortiranje
po obnovi, četiri izvedena statusa (uklj. „plaćeno ali nikad podešeno") i
`adminAuditLog` su **zadatak 12**, a per-lokal sidebar **zadatak 13** (§4). Ovaj
task ih ne dira; `admin.listBusinesses` (Google Review ekran) ostaje netaknut.

### 3. `harness:check` i dalje sredinski blokiran (isti Node v24.8.0 bag)

Potvrđeno pri pokretanju ovog taska: `harness:check` se deterministički ruši u
`NewRootCertStore` (`X509_STORE_add_cert` assertion), identično TASK-28 §4 i
TASK-29 §1. **Nije pad koda ovog taska.** Sve ostale provere zelene: `lint`
(0 grešaka), `build` (prolazi), `harness:namespace` (prolazi), ceo `vitest`
(559 prošlo / 1 preskočen, uključujući 11 novih testova ovog taska). Opcije za
vlasnika iste kao gore.

---

## TASK-32 — naplata: uplate, ciklusi, statusi, ručni upis

### 1. Grace period = 14 dana (REŠENO u TASK-35)

Posle datuma sledeće naplate klijent ima grace period (`GRACE_DAYS`,
`convex/lib/billingCycle.ts`) pre nego što dnevni cron prevede nalog u
`expired` (i time mu `getEntitlement` korak 3 prestane da rešava plan-tir).
Pokriva kašnjenje naloga za prenos. Broj je konstanta u kodu — promena je
deploy, ne migracija. **Vlasnik potvrdio: 14 dana** (TASK-35, bilo 7 od
TASK-32). Testovi u `convex/billing.test.ts` referenciraju `GRACE_DAYS`
simbolički pa nisu zahtevali izmenu.

### 2. `accounts.planValidUntil` = datum sledeće naplate CELOG računa

RFC-002 A.1 je taj datum vezao za „PLAN pretplatu" (usluge idu kroz orders).
U ručnom svetu prvih pedeset klijenata nalog dobija **jedan zbirni račun**
(plan + usluge zajedno), pa je `planValidUntil` prenamenjen u „plaćeno do /
sledeća naplata" za ceo nalog — jedan datum koji admin održava uplatama
(komentar u schema.ts ažuriran). Odvojeni ciklusi po usluzi ili mešoviti
periodi u istom nalogu (mesečno + godišnje) se NE prate automatski: tada
admin unosi `coversUntil` eksplicitno pri uplati, ili `setNextBillingAt`.
**Vlasnik potvrđuje** da je jedan datum po nalogu dovoljan za prvih 50.

### 3. Definicija „plaćeno ali nikad podešeno" (za potvrdu)

Status se izvodi kad nalog ima bar jednu **aktivnu** uslugu a **nijedna**
od aktivnih usluga nema sadržaj (Links: nema objavljene konfiguracije;
Review: nema odredišnog linka; Venue: nijedan događaj; Memories: nijedan
prostor). Klijent koji je podesio jednu od dve usluge NIJE u ovom statusu
(angažovan je) — rupe po usluzi se ipak vraćaju u `unconfiguredServices`
za bedževe u tabeli. **Vlasnik potvrđuje** ovo tumačenje („ništa podešeno"
naspram „bar jedna nepodešena").

### 4. Storno uplate NE pomera ciklus automatski

`billing.voidPayment` obeležava pogrešan unos (istorija je append-only,
brisanja nema), ali namerno ne prepočinjava `planValidUntil` — ponovno
izvođenje datuma iz istorije je mesto gde nastaju greške ispravki. Admin
posle storna postavlja datum eksplicitno (`billing.setNextBillingAt`); obe
radnje pišu audit trag.

### 5. `harness:check` i dalje sredinski blokiran (isti Node v24.8.0 bag)

Dev server harnessa se nativno ruši pri prvom odlaznom TLS pozivu (isti
`NewRootCertStore` bag; Playwright zato vidi `ERR_CONNECTION_REFUSED` na
3199). **Nije pad koda ovog taska.** Zeleno: `lint` (0 grešaka), `build`,
`harness:namespace`, ceo `vitest` (588 prošlo / 1 preskočen, uključujući
23 nova testa ovog taska). Opcije za vlasnika iste kao u TASK-28 §4.

---

## TASK-34 — korak 1 toka kupovine (izbor usluga, živi prikaz, korpa)

### 1. Meni: kada i kako se prodaje? (RFC-002 §5 Q4 — potvrda semantike)

Meni je u motoru prvorazredna usluga (Osa A) ali **proizvod još ne postoji**
(RFC-002 §2.0 uslov 7). U koraku 1 sam ga po najkonzervativnijoj varijanti
prikazao ali **onemogućio za dodavanje**:

- kartica „Meni" nosi bedž **USKORO** i dugme „Dodaj" je disabled;
- živi prikaz za Meni je iskren „uskoro" panel (nema lažne stranice);
- kombo kartice koje sadrže Meni — **Lokal** (Links + Meni) i **Kompletan
  ScanMe** (svih pet) — prikazane su u istoj listi ali su takođe **USKORO**
  (ne mogu se dodati dok Meni ne krene). **Događaj** (Venue + Memories) je
  potpuno živ.

Ovo je namerno „ne prodaj vazduh" ponašanje (RFC-002 rizik #8). **Vlasnik
odlučuje** (RFC-002 §5 Q4): da li Meni ostaje skriven iz prodajnog skupa dok
se ne izgradi, ili se prodaje kao izričita **pretprodaja**. Ako je pretprodaja,
`UNAVAILABLE_SERVICES` u `components/purchase/service-catalog.ts` se isprazni i
Lokal/Kompletan automatski postaju živi (motor ih već ceni). Nijedan broj se ne
menja — samo kapija dostupnosti.

Posledica za „štediš još": nudge namerno **preskače** Meni (`bestNudge(..., {
exclude })`), pa RFC-ov primer „Dodaj Meni i štediš još 900" trenutno predlaže
sledeću *dostupnu* uslugu umesto Menija. Kada Meni postane dostupan, ukloniti ga
iz `exclude` i primer iz RFC-a se vraća doslovno.

### 2. Freeze ScanMe Links — potvrda da NIJE dirnut

Živi prikaz prave javne stranice svake usluge (uključujući ScanMe Links) je
**strogo read-only**: renderuje se postojeći javni šablon kroz svoj postojeći
`view` prop sa fixture podacima (isti obrazac kao `app/dev/template-gallery` i
`app/dev/venue-preview`). **Nijedan postojeći šablon nije izmenjen i nijedan nije
dobio nov prop.** Ovo je tačno slučaj iz RFC-002 §6 reda 1 („čitanje nije dodir")
i §2.3 („No service template gains a new prop for the preview"). Ništa za
vlasnika ovde — beleži se da je granica poštovana. Splitter kroz Links stranicu
(§2.4, jedini *željeni* dodir) i dalje čeka vlasnika (postojeći §3 RFC-a), nije
deo ovog taska.

### 3. `harness:check` i dalje sredinski blokiran (isti Node v24.8.0 bag)

Isti `NewRootCertStore` pad kao u TASK-28 §4 / TASK-32 §5 — dev server harnessa
padne na prvom odlaznom TLS pozivu. **Nije pad koda ovog taska.** Zeleno:
`lint` (0 grešaka), `build`, `harness:namespace`, ceo `vitest` (622 prošlo /
1 preskočen, uključujući 10 novih testova ovog taska). Korak 1 dodatno ručno
proveren u produkcijskom `next start` (dev server zaklanja `/kupovina`, vidi
[[dev-server-slug-shadow]]): prekidač preliva svaku cenu, korpa = motor,
prikaz je inertan (pointer-events:none), mobilni se slaže bez bočnog prelivanja.

---

## TASK-35 — korak 2 toka kupovine (Basic vs Premium + Enterprise upit)

### 1. `harness:check` i dalje sredinski blokiran (isti Node v24.8.0 bag)

Isti `NewRootCertStore` pad kao u TASK-28 §4 / TASK-32 §5 / TASK-34 §3 (ovaj put
tek pošto je u ovom worktree-u napravljen `node_modules/next` junction +
kopiran `.env.local` po uputstvu iz [[harness-check-in-worktree]] — pre toga
`harness:check` nije mogao ni da podigne dev server u ovom worktree-u). **Nije
pad koda ovog taska.** Zeleno: `lint` (0 grešaka), `build`, `harness:namespace`,
ceo `vitest` (632 prošlo / 1 preskočen, uključujući 10 novih testova ovog
taska: `step-plan-model.test.ts`).

### 2. Korak 2 ručno proveren u produkcijskom `next start` — jedan nalaz, ispravljen

Isti razlog kao TASK-34 §3 ([[dev-server-slug-shadow]]): `/kupovina` proveren
kroz `next start` (dodat `scanme-start` unos u `.claude/launch.json`, port
3010), ne kroz `next dev`. Dodatno, u ovom headless browser pane-u
`requestAnimationFrame` je potpuno ugašen dok je pane sakriven (izmereno: 0
otkucaja u 2s) — Framer Motion-ov `AnimatePresence` prelaz između koraka
(rAF-pogonjen) se zato nikad ne završava kad se ide klikom kroz tok, pa je
korak 2 proveravan direktnim (hard) navigacijama na URL sa `step=2` već u
upitu, gde nema prethodnog koraka za "exit" animaciju. Ovo je artefakt test
okruženja, ne bag proizvoda (transition traje 0.2s, u pravom vidljivom
tabu radi normalno).

Jedan STVARAN nalaz iz te provere, **ispravljen u ovom tasku**: Premium
kolona je na mobilnoj širini (375px) prelivala stranicu za ~52px — cena-razlika
(`+990 RSD mesečno na trenutnih 2.390 RSD`) je flex dete bez `min-width: 0`
u `.columnHead`, pa je podrazumevano flex ponašanje sprečavalo prelamanje
teksta (isti obrazac kao [[client-panel-grid-track-gotcha]]). Popravljeno
dodavanjem `min-width: 0` na `.delta` u `step-plan.module.css`; provereno
ponovo na 375px — nema više bočnog prelivanja, ni na `<html>` ni na fiksnom
headeru (koji je prelivanje "nasledio" preko 100vw računanja).

Provereno na 1280px i 375px: Basic/Premium kolone preko cele širine iste
ljuske (ne nova stranica), Basic prikazuje spisak sa "Uključeno, ne plaćaš
ništa.", Premium prikazuje "Sve iz Basic-a" pa grupe PO USLUZI (VENUE,
MEMORIES — samo za usluge iz korpe, prazne grupe se ne prikazuju, npr. sam
Links ne prikazuje nijednu grupu), pa uvek poslednju, negrupisanu stavku "Sve
buduće usluge automatski na Premium-u." Cena Premium-a je uvek razlika
("+990 RSD mesečno na trenutnih X RSD"), nikad podeljena po broju usluga.
Prebacivanje Basic↔Premium (isti korak, bez animacije) menja dugme i ukupan
iznos u traci odmah. Enterprise red vodi na `/?upit=enterprise#ponuda`
(postojeći kontakt cilj), nikad u korak 3.

---

## TASK-36 — korak 3 toka kupovine (fizički proizvodi + vezivanje po stavci)

### 1. Kuriranje šablona kartice po usluzi (za potvrdu vlasnika)

RFC-002 §2.3 fiksira **pravilo** — „usluga određuje koji su šabloni dostupni,
pa dolazi pre dizajna" — ali **ne** i tačan skup šablona po usluzi; to je
proizvodna odluka koje nema ni u §5 (otvorena pitanja). Da bi ponašanje
„vrati na podrazumevani šablon nove usluge" bilo stvarno i proverivo, uveo sam
**privremenu, vlasniku-podesivu** mapu `SERVICE_CARD_TEMPLATES` u
`components/purchase/step-products-model.ts`:

```
links:    Šablon 1–5
venue:    Šablon 2–4
memories: Šablon 3–5
menu:     Šablon 1–2   (usluga se još ne prodaje)
review:   Basic, Šablon 1, Šablon 5
```

Jedina **činjenica iz koda** koju mapa poštuje: „basic" kartica pripada samo
Review-u (postojeći `components/offer-configurator.tsx`, red ~1092). Ostali
skupovi su smišljeni tako da se preklapaju (pa rebind ume i da **sačuva**
kompatibilan dizajn i da **resetuje** nekompatibilan), ali koje tačno od pet
generičkih šablona ide uz koju uslugu — **vlasnik potvrđuje ili menja**. Motor
cena se ne dira; ovo je čisto kuriranje izgleda. Kada vlasnik da konačne
skupove, izmena je jedan objekat u tom fajlu (deploy, ne migracija).

Podrazumevani šablon usluge = prvi u njenom nizu. Sveže dodata stavka se rađa
sa validnim dizajnom za svoje (tiho) vezivanje, pa nikad ne krene sa šablonom
koji njena usluga ne nudi.

### 2. Jedna stavka = jedan `productId` (nasleđeno iz postojećeg modela)

Vezivanje je osobina **stavke** (RFC §2.3), a stavka u postojećem modelu korpe
je jedinstvena po `productId` (`parseV3Items` deduplikuje). Zato je vezivanje
mapirano po `productId` (`PurchaseSelection.bindings`), a jedna vrsta proizvoda
vezana za **više** usluga vodi na razdelnik (tekst je tu; razdelnik je TASK-37).
Ako vlasnik želi „10 Review nalepnica + 10 Memories nalepnica" kao **dve
zasebne stavke iste vrste**, to je promena modela korpe (stavka po ključu, ne
po `productId`) izvan opsega ovog taska — javljam da odluka postoji.

### 3. Logo upload namerno izostavljen iz koraka 3

Legacy konfigurator (`/ponuda`) ima Convex-vezan logo upload. Korak 3 novog
toka ga **ne** uključuje: task ga ne traži, a uvlačenje Convex mutacija
(`offerLogoUploads`) u novu ljusku širi opseg i spregu bez potrebe. Split-total
i sve cene i dalje rade bez njega. Ako logo treba i u novom toku, to je zaseban,
mali dodatak (isti `offerLogoUploads` reserve/commit obrazac).

### 4. Rani reset dizajna pri uklanjanju usluge u koraku 1 (rubni slučaj)

Reset dizajna + vidljiv razlog se okida na **eksplicitnu** promenu vezivanja u
kontroli (glavni put iz taska). Ako korisnik u koraku 1 ukloni uslugu za koju je
neka kartica bila vezana, `boundServicesOf` pri čitanju tiho prevezuje na prvu
kupljenu uslugu; ako je time zatečeni šablon postao nevažeći, birač dizajna ga
prosto ne označava (bez tihe izmene sačuvane vrednosti). Konačnu rekonsilijaciju
takvog zatečenog dizajna radi checkout (TASK-38/korak 4). Nije rupa u naplati —
cena i dalje dolazi iz motora; samo dizajn stavke može biti „neoznačen" dok ga
korisnik ne dodirne.

### 5. `harness:check` i dalje sredinski blokiran (isti Node v24.8.0 bag)

Isti `NewRootCertStore` pad kao u TASK-28 §4 / TASK-32 §5 / TASK-34 §3 /
TASK-35 §1. **Nije pad koda ovog taska.** Zeleno: `lint` (0 grešaka), `build`
(prolazi, `/kupovina` se kompajlira), `harness:namespace`, ceo `vitest`
(653 prošlo / 1 preskočen, uključujući 13 novih testova modela
`step-products-model.test.ts` + 6 novih slučajeva codeca za `bind`). Opcije za
vlasnika iste kao gore.

### 6. Korak 3 ručno proveren u produkcijskom `next start`

Isti razlog kao TASK-34 §3 / TASK-35 §2 ([[dev-server-slug-shadow]]):
`/kupovina?…&step=3` proveren kroz `next start` (port 3010), ne kroz `next dev`.
Potvrđeno na desktopu i 375px: kontrola „Za koju uslugu?" je **prva** u desnom
sidebaru, iznad Orijentacije, izdvojena i sa bedžom „obavezno"; kod **jedne**
kupljene usluge kontrola se **ne prikazuje** a stavka je tiho vezana (birač
dizajna tada nudi samo šablone te usluge — npr. za Review: Basic, Šablon 1,
Šablon 5); rebind na uslugu čiji dizajn ne postoji **resetuje na podrazumevani
šablon i ispisuje jedan red zašto** (preview se odmah menja); vezivanje za više
usluga ispisuje red o razdelniku; oznaka gore desno je **sažetak** cele
porudžbine („3 usluge · Basic · godišnje"), bez strelice, i klik otvara korpu
(read-only); ukupan iznos i dalje razdvaja dve vrste novca
(„… RSD godišnje  + … RSD jednokratno"). Matrice cena fizičkih proizvoda
netaknute. Mobilni se slaže vertikalno bez bočnog prelivanja.

## TASK-43 — Venue Premium: rezervacije sa zonama, blokovi, više događaja, analitika

### 1. Jedan zahtev = jedna jedinica zone (za potvrdu)

Zona ima `capacity` u JEDINICAMA („Sto za dvoje — 8 komada", „Separe — 3",
„Bar — 10 mesta") i jedan zahtev drži tačno JEDNU jedinicu dok je na čekanju
(2h meko) ili potvrđen. `partySize` je informacija za vlasnika, ne broj
sedišta — grupa od 4 za barom troši 1 „mesto", ne 4. Ovo je najjednostavnije
odbranjivo pravilo (sto za dvoje zauzima jedan sto bez obzira da li dođu 1 ili
2 osobe); ako vlasnik želi da bar broji po osobi, to je izmena u
`convex/venueReservations.ts` (zoneUnitsUsed) + kopiji editora.

### 2. Pretpostavka +381 za WhatsApp/Viber linkove

Pripremljena poruka otvara `wa.me`/`viber://chat` sa brojem gosta; lokalni
broj koji počinje nulom dobija prefiks 381 (proizvod je sr-only). Ako se
pojave gosti sa stranim lokalnim brojevima, treba pravi telefonski parser.

### 3. Ponašanje pri padu plana (downgrade)

Objavljena stranica se degradira NA ČITANJU: premium blokovi prestaju da se
renderuju čim entitlement padne na basic (bez ponovnog objavljivanja, bajtovi
ne napuštaju server). Draft koji sadrži premium blokove ostaje sačuvan, ali
svaki save/publish odbija dok se blok ne ukloni ili plan ne vrati — podaci se
ne brišu tiho. Ako vlasnik želi „tihi filter" umesto odbijanja na save,
izmena je u assertBlocksAllowedByPlan (convex/venue.ts).

## TASK-37 — razdelnik: jedna kartica, više usluga

### 1. Rupa POSLE kreiranja kartice: Links editor može naknadno da doda /m/ link (odluka vlasnika)

Kartica ka Links stranici BEZ Memories linka legitimno prolazi pri kreiranju
(provera u `assertLinksPageCannotReachMemories`, convex/cards.ts, gleda draft
I published odredišta). Ali Links EDITOR je deo zamrznutog proizvoda: vlasnik
Links naloga može SUTRA da doda `/m/…` odredište na tu istu stranicu i ništa
ga ne proverava — gost koji tako stigne u Memories nastaje bez `cardId` i
kvota po stolu tiho curi. Zatvaranje rupe znači dodati simetričnu proveru u
mutacije Links odredišta („da li neka aktivna kartica pokazuje na ovaj
profil?"), što DIRA zamrznuti ScanMe Links (§6 ledger) — **na vlasnikovoj
odluci**. Do tada: provera pri kreiranju kartice je glasna i pokriva trenutak
prodaje (checkout, TASK-38); naknadna izmena Links stranice je poznata,
zabeležena rupa.

### 2. `harness:check` i dalje sredinski blokiran (isti Node v24.8.0 bag)

Isti `NewRootCertStore` pad kao u TASK-28 §4 / TASK-32 §5 / TASK-34 §3 /
TASK-35 §1 / TASK-36 §5. **Nije pad koda ovog taska.** Zeleno: `lint`,
`build`, `harness:namespace`, ceo `vitest` (uključujući 5 novih testova
razdelnika u `convex/cards.test.ts`).

## TASK-38 — korak 4: checkout i provizioniranje

### 1. Self-serve onboarding (auth + izbor lokala) — nije u obimu ovog taska

Backend `convex/checkout.ts` je gotov i testiran: `checkout` piše porudžbinu +
snimak cene, obezbeđuje nalog i plan, aktivira `serviceProfiles` po lokalu i
provizionira razdelnike — a nivo se izvodi iz plana naloga (getEntitlement
korak 3), bez ijednog entitlement reda. Ali `checkout` traži `businessId`
lokala i prijavljenog korisnika sa pristupom (`requireBusinessAccess`,
netaknut). Javna `/kupovina` stranica NEMA ni prijavu ni izabran lokal —
onboarding koji novom kupcu pravi prvi lokal i članstvo je zaseban sloj koji
RFC-002 svesno odlaže („once onboarding creates the buyer's membership",
convex/orders.ts). Zato je **korak-4 UI prezentacioni**: pregled porudžbine +
ekran „šta si kupio / gde da podesiš / prva naplata"; dugme „Zaključi" ne zove
`checkout` uživo. Kad onboarding/izbor lokala legne, dugme zove `api.checkout.
checkout` bez promene na backendu. **Na vlasnikovoj/produktovoj odluci:** da li
je javni tok samonaplativ (kupac se prijavi i bira lokal u toku) ili ostaje
„pošalji upit → tim ručno aktivira" (ručni tok je i inače glavni, TASK-32).

### 2. Razdelnik sa Memories na checkout-u — namerno suženo

Fizička stavka vezana za više usluga provizionira karticu-razdelnik (TASK-37).
Suženje na checkout-u:
- **Links + Memories** u istom vezivanju se **odbija glasno, ovde** (poruka
  `cardLinksMemoriesBlocked`) — to je Memories kroz Links-stranicu-razdelnik,
  trajno blokiran put (§2.4/§6).
- **Memories bez Links-a** (npr. Događaj = Venue + Memories): dugme za Memories
  na razdelniku traži pravi `memoriesSpaces` prostor, koji na checkout-u još ne
  postoji (pravi se u Memories host toku). Zato se takva kartica **ne pravi na
  checkout-u** — vezivanje se zabeleži (`orderItems.boundServices`), a vlasnik
  dodaje Memories dugme kasnije preko `cards.createCard` kad prostor postoji.
  Model razdelnika sa Memories dugmetom je i dalje otvoreno pitanje (§5 Q8,
  „Next implementer of task 11"). Razdelnik BEZ Memories-a (Links+Venue,
  Review+Venue, …) se pravi odmah.

### 3. Nadogradnja plana na postojećem nalogu (ponovljena kupovina)

Ako lokal već pripada nalogu, `checkout` koristi TAJ nalog kao izvor istine za
plan (Axis B) i ne menja mu plan iz koraka 2. Prva kupovina (nov lokal → nov
solo nalog) uzima izabrani plan i radi ispravno. Nadogradnja plana kroz
checkout na već postojećem nalogu (basic → premium) je zaseban tok — nije u
obimu ovog taska.

### 4. `harness:check` i dalje sredinski blokiran (isti Node v24.8.0 bag)

Isti `NewRootCertStore` pad kao TASK-28 §4 / TASK-32 §5 / TASK-34 §3 / TASK-35
§1 / TASK-36 §5 / TASK-37 §2. **Nije pad koda ovog taska.** Zeleno: `lint`,
`build` (typecheck celog app-a), `harness:namespace`, ceo `vitest` (696
prošlo, uključujući 10 novih testova u `convex/checkout.test.ts` i 5 u
`components/purchase/step-checkout-model.test.ts`).

## TASK-44 — tok kupovine: izgled offer konfiguratora

### 1. KORAK 0 — „shadow" /kupovina u `next dev` je zapravo Node X509 pad (REŠENO delimično)

Provereno na licu mesta: **nema prave rute-shadow.** Statička ruta `/kupovina`
uvek pobeđuje dinamičku `app/[slug]` (i u dev i u prod), i `GET /kupovina` vraća
`200`. Ono što je TASK-34 §3 zabeležio kao „dev zaklanja /kupovina" je u stvari
isti Node v24.8.0 `NewRootCertStore` pad (TASK-28 §4): convex-auth middleware
(`proxy.ts`) na SVAKI *matched* zahtev zove `handleAuthenticationInRequest`
(osvežavanje tokena → odlazni TLS ka Convex-u), a Node se tu deterministički
ruši pri prvom TLS-u na hladnom serveru — pa dev server padne dok obrađuje prvi
zahtev.

**Ispravka u ovom tasku:** `/kupovina` i `/ponuda` su izuzete iz middleware
matchera (`proxy.ts`). To su čisto javne prodajne stranice bez ijedne
server-side auth kapije (prijava klijenta je client-side, `useConvexAuth`), pa
middleware na njima ništa i ne radi — samo je pravio TLS koji ruši Node. Posle
izmene `GET /kupovina` vraća `200` bez pada iz middleware-a (potvrđeno u logu:
`GET /kupovina 200`). **Ovo je jedina KORAK 0 izmena van CSS/UI-ja.**

**Ostaje vlasniku:** rezidualni pad može doći sa DRUGE rute koju browser
prefetch-uje posle učitavanja (npr. `/`), jer i dalje ide kroz middleware. To je
isti sredinski Node bug — puna stabilnost `next dev` traži Node LTS (v22/v20),
što je već zabeležena odluka (TASK-28 §4 / TASK-29 §1). Na Node LTS-u nema pada i
`/kupovina` radi u običnom `npm run dev` bez ijedne dalje izmene.

### 2. „Logo" stavka u koraku 3 — namerno izostavljena (za potvrdu vlasnika)

Opis KORAKA 3 nabraja desni akordeon kao „(Orijentacija, Dimenzije, Dizajn,
Logo)". Logo je **izostavljen**, u skladu sa postojećom odlukom TASK-36 §3:
korak 3 ne uvlači Convex logo upload (`offerLogoUploads`) da ne bi širio spregu i
opseg. Ovo je „ISKLJUČIVO vizuelni task, ponašanje se ne menja" — dodavanje
funkcionalnog logoa je NOVO ponašanje + backend sprega. Akordeon vizuelno i dalje
liči na /ponuda (iste lens-ikonice, isto staklo, iste kontrole izbora — bukvalno
iste `ConfigurationOptions`/`AccordionLabel` komponente sa /ponuda). **Vlasnik
odlučuje:** dodati funkcionalni Logo i u korak 3 (isti reserve/commit obrazac kao
/ponuda) ili ga ostaviti samo u /ponuda toku.

### 3. `harness:check` i dalje sredinski blokiran (isti Node v24.8.0 bag)

Isti `NewRootCertStore` pad kao gore. **Nije pad koda ovog taska.** Zeleno:
`lint`, `build` (typecheck celog app-a, `/kupovina` i `/ponuda` se kompajliraju),
`harness:namespace`, ceo `vitest`. Ovaj task ne dira nijedan pure model
(`*-model.ts`, `lib/pricing`, `lib/offer-url`) niti ijedan test — samo TSX/CSS
izgled + deljene primitive (`app/offer-surface.css`) + kopiju (`purchase.ts`).

---

## TASK-41 — admin podstranice po lokalu, sidebar lokala, Page→Meni (§2.6, §4 z.13)

### 1. „Provera na serveru" u okruženju gde autentifikovan SSR Convex pada

Zahtev: podstranica neaktivne usluge se ponaša „kao da ne postoji", i provera
je na **serveru, ne u UI**. U ovom kodu admin autorizacija je **dvoslojna**:
`proxy.ts` middleware traži samo *prijavljen* nalog (redirect na `/admin/login`),
a admin **ulogu** proverava client-side `AdminGuard` preko `api.admin.me`. Nijedan
SSR poziv ka Convex-u ne nosi auth token (`convexAuthNextjsToken` se nigde ne
koristi) — a baš taj put (autentifikovan odlazni TLS tokom SSR-a) je ono što ruši
Node v24.8.0 (`NewRootCertStore`).

**Odluka (implementirano):** kapija je **server-autoritativna** kroz Convex upit
`admin.location` koji ide kroz `requireAdmin` i **ne vraća sadržaj** za lokal koji
ne postoji/arhiviran je, niti dozvoljava podstranicu za uslugu koja nije `active`.
Klijentski ekran na tu presudu poziva `notFound()` (Next not-found granica).
Suština: **server odlučuje o postojanju i uskraćuje podatke**; klijent ne može da
otkrije ono što server nije poslao — nema bool-a u UI-ju koji „otključava"
neaktivnu uslugu. Ovo je jedini način bez pada na ovom Node-u i poštuje postojeći
(client-gated) admin obrazac.

**Ostaje vlasniku/infra:** kad se Node podigne na LTS (v22/v20) — već zabeležena
odluka (TASK-28 §4) — tanka server strana (`app/admin/customers/[businessId]/...`)
može dodatno da uradi `fetchQuery(admin.location, …, { token })` + `notFound()`
čisto u SSR-u, bez ijedne izmene upita. Do tada je gornji obrazac ispravan i
bezbedan.

### 2. Podstranice su Links / Review / Venue / Meni — Memories namerno izostavljen

Cilj eksplicitno nabraja četiri podstranice po lokalu: **Links, Review, Venue,
Meni**. `scanme_memories` je usluga po **proslavi/događaju** (svojom `/admin/memories`
konzolom i host panelom), ne standardna podstranica lokala, pa **nema** svoju
podstranicu ovde čak i kad je aktivna na lokalu. Njen status i dalje vidi tabela
korisnika (TASK-40). **Vlasnik potvrđuje** da Memories ostaje van ovog seta
podstranica.

### 3. Meni zastavica (`lib/flags.ts: MENU_EXISTS`) — jedan prekidač

Meni još **ne postoji** kao proizvod (nema `scanme_menu` u `serviceTypeValidator`,
nema stranice/editora). Napravljena je samo **kuka za preimenovanje**: `MENU_EXISTS`
(sada `false`) u `lib/flags.ts`. Dok je `false`, oznaka u admin navigaciji ostaje
„ScanMe Page", a Meni podstranica po lokalu se ne prikazuje (i onako ne bi bila
`active` jer nema `scanme_menu` profila). Kad Meni bude proizvod: (a) flipni
`MENU_EXISTS = true` i (b) dodaj `scanme_menu` u `serviceTypeValidator`. Prodajni
tok (`/kupovina`, `/ponuda`) i njegov „Meni USKORO" se **ne diraju** ovim taskom.

### 4. `harness:check` i dalje sredinski blokiran (Node v24.8.0)

Isti `NewRootCertStore` pad. **Nije pad koda ovog taska.** Zeleno: `lint`,
`build`, `harness:namespace`, ceo `vitest` (uklj. novi convex-test za
`admin.location`: gating neaktivne usluge, enterprise grupisanje, non-admin
odbijen).

---

## TASK-42 — QA toka kupovine, presuda i deploy

### 1. Node X509 bag ZAOBIĐEN — goldeni provereni PRVI PUT; Node LTS i dalje pravi fix

`nvm`/`fnm`/`volta` ne postoje na mašini (Node 22 nedostupan bez instalacije
novog alata — i dalje vlasnikova odluka). Ali nađena je bezbedna
zaobilaznica za `NewRootCertStore` pad (TASK-28 §4):

```
NODE_OPTIONS="--use-openssl-ca"
SSL_CERT_FILE="C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt"
```

Node tada NE gradi bundled root store (mesto assertion pada) nego verifikuje
TLS prema Mozilla CA bundle-u koji Git for Windows već nosi — verifikacija
sertifikata ostaje UKLJUČENA, nije bezbednosna degradacija (za razliku od
golog `--use-openssl-ca` bez CA fajla, koji je TASK-28 s pravom odbio).

Sa tim env varovima u ovom tasku je prošlo:
- **`npm run check` CEO — uključujući `harness:check`: „177 cases × 2
  viewports match the goldens byte-for-byte"** — goldeni provereni prvi put
  otkad je RFC-002 niz počeo; zamrznuti ScanMe Links render je netaknut;
- **`npx convex deploy`** (CLI se bez zaobilaznice ruši identično kao
  harness — potvrđeno na `npx convex env list --prod`).

Bez env varova pad je i dalje deterministički, pa `npm run dev` i običan
`npm run check` ostaju crveni. Trajni fix ostaje Node LTS (v22/v20) —
vlasnikova odluka; do tada zaobilaznicu koristiti za harness i deploy.

Usput otkriveno i popravljeno: `npx convex deploy` typecheck-uje i
`convex/**/*.test.ts` (nikada ranije nije stigao dotle zbog TLS pada) i pada
na poznatoj convex-test typing gotchi u zdravim testovima — test fajlovi su
izuzeti iz `convex/tsconfig.json` (funkcije zadržavaju pun typecheck; testove
izvršava vitest).

### 2. Tastaturna potvrda toka na pravom browseru (1 minut, vlasnik/QA)

QA browser pane ne ume NATIVNU tastaturnu aktivaciju dugmeta (Enter/Space na
fokusiranom `<button>` ne klikće — provereno na theme switchu), pa je
end-to-end tastaturni prolaz kroz `/kupovina` verifikovan analizom koda + je
jedini nađeni blokator popravljen (`step-services.tsx`, guard na
`event.target`). Ručna potvrda: Tab do „Dodaj: Venue" → Enter → … → „Plati" →
Enter, na pravom browseru — stavka 3 smoke liste u
`docs/qa/PURCHASE-READINESS.md`.

### 3. Nalazi koji NE blokiraju deploy — zapisani i rangirani

Pristupačnost: `docs/qa/purchase-accessibility.md` (5 kontrastnih padova
svetle teme, fokus na karticama, `inert` na preview, dialog korpe, fokus
posle „Plati"). Rizici prve prave naplate: rang-lista u
`docs/qa/PURCHASE-READINESS.md` — vrh liste je ljudski korak (neupisana
uplata → grace → sweep tiho gasi premium), ne kod.

---

## TASK-54 — dayparts (auto-prebacivanje po zoni lokala) + živa reaktivnost

### 1. Placeholder granice dayparts-a (§5 Q3 / RFC-003 pitanja §3)

TASK-54 traži konkretne granice da bi radio (i za testove). Uzete su razumne
**placeholder** vrednosti, jasno označene komentarom, u
`lib/menu-dayparts.ts` → `DEFAULT_DAYPART_WINDOWS` (minuti od ponoći, zona
lokala):

- doručak **07:00–11:00** (420–660)
- ručak **11:00–17:00** (660–1020)
- večera **17:00–24:00** (1020–1440)

Ovo su placeholderi — **granice su vlasnikova odluka** (isti nalaz kao RFC-003
pitanja §3 gore i RFC §5 Q3). Kada vlasnik da granice, promeniti tu jednu
konstantu (i seme/testove koji je uvoze). **Odloženo, čeka odluku vlasnika.**

### 2. Zona lokala je zakucana na Europe/Belgrade

RFC §2.5 kaže „u vremenskoj zoni lokala", ali **nema polja zone po lokalu** —
cela platforma koristi konstantu `Europe/Belgrade` (`lib/belgrade-time.ts`), pa
je „zona lokala" u praksi ta konstanta. To zadovoljava kriterijum „lokal koji
NIJE u UTC zoni" (Beograd je CET/CEST). Ako lokali u drugoj zoni ikad zatrebaju,
dodati polje zone i proslediti ga `belgradeMinuteOfDay`/resolveru. **Za svest
vlasnika.**

### 3. Poverenje u sat uređaja gosta

Po vlasnikovoj odluci, trenutni daypart se na klijentu računa iz UTC trenutka
**uređaja gosta**, tumačenog u zoni lokala (ne iz zone uređaja). SSR prvi paint
koristi tačno serversko vreme; klijent koriguje tek posle hidratacije. Loše
podešen sat gosta može između granica da prikaže pogrešan daypart — svojstveno
klijentskom preračunu koji je uslov za živo prebacivanje na granici; **override
je pošten izlaz** za realni slučaj („doručak do podneva danas"). **Za svest
vlasnika.**

### 4. Živi „nema više" preko ponovne objave sa nesačuvanim izmenama

`setItemAvailable` preslikava zastavicu u nacrt (da je sledeća objava ne vrati,
BLOCKED TASK-51 §2b) **samo kada nacrt nema nesačuvanih izmena** (nacrt ==
objavljeno; korelacija po poziciji je tada tačna). Ako nacrt ima izmene u toku,
patchuje se **samo objavljeni red** — nacrt se ne dira (ne kvari se rad u toku),
pa ponovna objava tih izmena vraća dostupnost iz nacrta. Pitanje: treba li živi
„nema više" da preživi i ponovnu objavu koja nosi **nepovezane** nesačuvane
izmene? Konzervativni podrazumevani izbor je: **ne kvariti nacrt**. **Vlasnik /
proizvod.**

## TASK-63 — card-aware hop za poručivanje (identitet stola)

### 1. Rupa POSLE kreiranja kartice: Links editor može naknadno da doda /o/ link (odluka vlasnika)

Isto nasleđe kao TASK-37 §1, sada za poručivanje. Kartica ka Links stranici BEZ
`/o/` odredišta legitimno prolazi pri kreiranju (nova provera
`assertLinksPageCannotReachOrdering` u convex/cards.ts gleda draft I published
odredišta). Ali Links EDITOR je deo zamrznutog proizvoda: vlasnik Links naloga
može SUTRA da doda `/o/…` odredište na tu istu stranicu i ništa ga ne proverava
— gost koji tako stigne u poručivanje nastao bi bez `cardId` i porudžbina ne bi
imala sto. Zatvaranje rupe znači dodati simetričnu proveru u mutacije Links
odredišta, što DIRA zamrznuti ScanMe Links (§6 ledger) — **na vlasnikovoj
odluci**, i RFC-004 §6 to već tako klasifikuje. Do tada: provera pri kreiranju
kartice je glasna; naknadna izmena Links stranice je poznata, zabeležena rupa.
Danas nije ni iskoristiva — stranica `/o/[code]` još ne postoji (TASK-66) i nema
mint na učitavanju; rupa postaje latentna tek kad TASK-66 doda gostinsku
stranicu. **Odloženo, čeka odluku vlasnika.**

**Dopuna iz TASK-71 (terminalni flip, `ORDERING_EXISTS = true`):** uslov iz
prethodnog pasusa se menja. `/o/[code]` više NIJE hipotetička stranica — od
ovog taska radi u produkciji (aktivacija je zapravo bila živa još od TASK-63,
ORDERING_EXISTS je samo dokumentovao to; videti TASK-71 izveštaj). Rupa
opisana gore prestaje da bude latentna i postaje ŽIVA: vlasnik Links naloga
može od sada stvarno da doda `/o/…` odredište na zamrznutu Links stranicu i
niko to neće proveriti, a gost koji tako stigne u poručivanje nastaje bez
`cardId`. Dispozicija se ne menja — zatvaranje i dalje dira zamrznuti ScanMe
Links proizvod (§6 ledger) i ostaje **na vlasnikovoj odluci**; ovo je samo
ažuriranje činjeničnog stanja, ne nova odluka. **Odloženo, čeka odluku
vlasnika.**

### 2. Svi ostali putevi kartica→poručivanje su zatvoreni u kodu

Za razliku od §1, preostala četiri puta su zatvorena bez vlasnika: direktna
`table_ordering` kartica i razdelnik-dugme oba prolaze kroz hop
`/r/[cardCode]/o?venue=<code>` → `resolveTableOrdering` → `mintOrderingGuest`
(jedini mint-poziv, uvek sa `cardId`); goli `/o/[code]` link ne pogađa nijedan
mint; Links-stranica-razdelnik se odbija PRI kreiranju. Dokazano sa pet
convex-testova u `convex/cards.test.ts`.

### 3. Gejtovi zeleni — nema sredinskog blokatora

Za razliku od ranijih taskova (Node v24.8.0 X509 pad), `npm run check` prolazi u
celosti na Node v22.23.2: `lint`, `build`, `harness:namespace`, i `harness:check`
(177×2 bajt-identično). Freeze gejt `git diff --stat components/scanme-links
lib/scanme-links*` je prazan. Ceo `vitest` zelen (835 prošlo, 1 preskočen).

---

## TASK-64 — konfiguracija poručivanja, lista stavki i gejt sposobnosti (RFC-004 §2.12, §2.13, §4)

### 1. Tir sposobnosti za poručivanje (RFC-004 §5 Q1, otvoreno pitanje za vlasnika)

Odluka o tiru poručivanja još uvek nije doneta od strane vlasnika (RFC-004 §5 Q1).
U TASK-64 uzet je **PREMIUM** kao privremeni konzervativni placeholder:
- `basic`: `{ ordering: false }`
- `premium`: `{ ordering: true }`
- Nedostajuća/nedodeljena vrednost preko `venueOrderingEnabled(limits)` garantovano pada na `false` (pad na Basic — nikad besplatno poklanjanje plaćene sposobnosti).

Ukoliko vlasnik odluči da je poručivanje dostupno i na Basic tiru, ili da je zasebna stavka/SKU, definicija se menja isključivo u kodu u `convex/lib/plans.ts` bez migracije baze podataka. **Odloženo, čeka odluku vlasnika.**

### 2. Dva gejta, ne jedan: sposobnost naspram prekidača lokala

Strogo razdvojena dva nivoa odlučivanja:
- **Sposobnost (entitlement):** `venueOrderingEnabled(limits)` određuje PRAVO na korišćenje (javni upit `publicOrderingState` vraća `{ status: "locked", planKey }` na Basic tiru ili kad sposobnost nije dodeljena, isto kao `venueAnalytics.eventMetrics`).
- **Prekidači po lokalu:** `orderingConfig.enabled` i `orderingConfig.callWaiterEnabled` određuju da li lokal koristi poručivanje i da li nudi dugme za poziv konobara. Vlasnik na Premium tiru može držati poručivanje isključenim (`enabled: false`) dok priprema stavke, ili ponuditi samo dugme za poziv konobara (`callWaiterEnabled: true`, `enabled: false`).

### 3. Cene su informativne i živo polje `available`

- U skladu sa RFC-004 §2.3 (e-fiskalizacija), cene u `orderingItems.priceRsd` su isključivo informativne: nigde se ne sabiraju, nema ukupnog iznosa, nema korpe i nema plaćanja u aplikaciji. Sve naplate i fiskalni računi izdaju se na fiskalnom uređaju.
- Polje `available` je ŽIVO: mutacija `setItemAvailable` direktno menja flag u bazi, što kroz Convex reaktivne pretplate stiže na sve otvorene telefone u sekundi bez osvežavanja stranice.

### 4. Zaštita pristupa

- Vlasnička površina i sve mutacije konfiguracije i stavki zaštićene su kroz `requireBusinessAccess`.
- `convex/lib/access.ts` i `convex/lib/entitlements.ts` ostali su **potpuno netaknuti**.

---

## RFC-003 — ScanMe Meni (pitanja za vlasnika)

Iz `docs/architecture/RFC-003-scanme-menu.md` §5. Dokument je *samo dokument* —
nijedan od ovih odgovora nije potreban da bi se pisali taskovi TASK-47…TASK-61;
oni čekaju vlasnika pre nego što se dotični task izvede. RFC svuda predlaže
podrazumevanu vrednost sa oznakom „vlasnik može da veta".

### 1. Mapiranje i cena Basic/Premium Menija

Predlog (RFC §2.7): `ACCOUNT_PLAN_TIER.scanme_menu = { basic→basic,
premium→premium, enterprise→premium }` — Premium Meni (fotografije, video u
listu, animacije, Istaknuto) se otključava nalogovim Premium planom. Cenovni
konstant Menija drži motor iz RFC-002. **Potvrditi mapiranje i dati broj.**
**Vlasnik.**

### 2. Konačan set od ~20 domaćih ikonica

Predlog seme (RFC §2.4): rakija, domaća kafa, burek, pljeskavica, ćevapi,
kajmak, ajvar i srodne. Ikonice su inline SVG (ostaje na Convex-u, budžet prvog
paint-a). **Potvrditi i dopuniti listu do ~20.** **Vlasnik / proizvod.**

### 3. Podrazumevani prozori dayparts-a

Predlog (RFC §2.5): prozori u vremenskoj zoni lokala za doručak/ručak/večeru,
uz ručni override koji tuče sat. Granice (minute) su placeholder. **Dati
podrazumevane granice.** **Vlasnik.**

### 4. Podrazumevani presetovi varijanti

Standardni setovi varijanti za seme (RFC §2.3): 0.3 l / 0.5 l, čaša / flaša,
mala / velika, uobičajeni dodaci. **Vlasnik / proizvod.**

### 5. Cena naknadnih izmena koje mi radimo

Prvi unos menija je besplatan i u roku od dva radna dana; svaka naknadna izmena
koju mi izvedemo na zahtev vlasnika se dodatno naplaćuje (RFC §2.9). **Odrediti
naknadu/model.** **Vlasnik.**

### 6. Da li se Meni prodaje kao pretplata pre nego što se `MENU_EXISTS` flipne

Ili se krije iz prodajnog seta dok ne izađe (nasleđuje RFC-002 §5 Q4)?
**Vlasnik / proizvod.**

### 7. PDF/Excel izvoz — publika i šablon

Da li je izvoz stavki (RFC §2.9) klijentu na samouslugu ili je interni
operativni alat admina; brendirani šablon ili običan? **Vlasnik.**

---

## RFC-004 — Poručivanje i panel konobara (pitanja za vlasnika)

Iz `docs/architecture/RFC-004-ordering-waiter-panel.md` §5. Dokument je *samo
dokument* — nijedan od ovih odgovora nije potreban da bi se pisali taskovi
TASK-62…TASK-71; oni čekaju vlasnika pre nego što se dotični task izvede. RFC
svuda predlaže podrazumevanu vrednost sa odbačenom alternativom. Pet pitanja
delegiranih RFC-u (tekući račun, deljenje stola, spam, alarm panela, kuhinja)
su **odlučena u §2** i NISU ovde — ovde su samo prave vlasnikove nepoznanice.

### 1. Cena / tir sposobnosti poručivanja

Predlog (RFC §2.12): poručivanje + panel je **Venue sposobnost** kroz
`getEntitlement(ctx, businessId, "scanme_venue")` + nov helper
`venueOrderingEnabled(limits)` (obrazac `venueAnalyticsEnabled`, default off),
**bez izmene `convex/lib/access.ts`**. Da li je Basic ili Premium Venue, ili
sopstvena cenovna linija? **Potvrditi mapiranje i dati broj.** **Vlasnik.**

### 2. Prodaje li se samo Venue-lokalima ili samostalno?

Poručivanje jaše `scanme_venue` (§2.12). Potvrditi da je samo za lokale koji
imaju Venue, ili navesti samostalnu prodaju (što bi vratilo odluku o
service-type-u — RFC je odbio nov `scanme_ordering` tip). **Vlasnik / proizvod.**

### 3. Overdue prozor i tačna gostova akcija na njemu

Podrazumevano **7 minuta** (§2.8, `orderingConfig.overdueMinutes`); porudžbina
se NIKAD tiho ne otkazuje. Potvrditi broj i tačnu akciju koja se nudi gostu na
7 min (ponovno „zvoni" panel / prikaži telefon lokala / withdraw). **Vlasnik.**

### 4. PIN politika

Jedan PIN po lokalu ili PIN po konobaru; dužina PIN-a; učestalost rotacije
(§2.7). PIN je pogodnost, ne bezbednosna granica — prava granica je fizički
tablet pored kase. **Vlasnik.**

### 5. Heartbeat interval i stale prag

Predlog: otkucaj svakih ~15 s, `stale` na ~60 s (§2.6). Ovo određuje koliko
brzo mrtav/uspavan tablet obara poručivanje u „nije dostupno" (uzrok A jednog
onemogućenog stanja). **Potvrditi brojeve.** **Vlasnik / infra.**

### 6. Lista za poručivanje u v1

`orderingItems` je **odvojen od Menija** (§2.13; `MENU_EXISTS` ostaje `false`) —
kratka vlasnikova lista sa živim `available`, cene informativne (nema plaćanja,
§2.3). Da li v1 želi kuriranu kratku listu, slobodan tekst, ili oba; i da li se
informativne cene prikazuju? **Vlasnik / proizvod.**

### 7. Lista razloga za poziv konobara

Predlog seme (§2.1): Račun / Voda / Pomoć / Ostalo. Dugme za poziv je
**apsolutno opciono po lokalu** (`orderingConfig.callWaiterEnabled`, uslov 7).
**Potvrditi i dopuniti listu razloga.** **Vlasnik.**

### 8. Prikaz oznake stola u panelu

Konobar mora da vidi „Sto N", ne `cardId`. Da li štampane kartice već nose
ljudsku labelu stola koju panel prikazuje, ili treba dodati polje/mapiranje
`cardId → oznaka stola` (§2.4, §2.7)? **Vlasnik / sledeći implementer.**

### 9. Kuhinjski displej

RFC je **odlučio: kuhinja ne dobija ništa u v1** (§2.11) — konobar je jedina
uloga i jedina tačka prihvatanja; KDS je kandidat za RFC-005. Potvrditi da
nijedan lokal ne traži kuhinjski tiket odmah. **Vlasnik.**

---

## TASK-47 — katalog šeme za Meni (RFC-003 §2.13)

Urađeno: 6 novih tabela (`menus`, `menuGroups`, `menuItems`, `itemVariants`,
`itemPairings`, `menuDayparts`) + `cardTargetKind` +`"menu"`. Zeleno: `npm run
check` (lint 0 grešaka, build/tsc, `harness:namespace`, `harness:check` — 177 ×
2 goldena bajt-identično) i ceo vitest (712 prošlo, 1 preskočen, 0 palo, uklj.
novi `convex/menuSchema.test.ts`). Node v22.23.2 LTS — X509 pad se ne javlja,
TLS zaobilaznica nije bila potrebna. Dva pitanja/odluke za vlasnika:

### 1. `serviceTypeValidator` +`"scanme_menu"` — ODLOŽENO (protivrečnost u RFC-u)

`§2.13 M.7`, `§2.14` (red za `schema.ts`) i `§4` (kriterijum TASK-47) svi traže
da se `scanme_menu` doda u `serviceTypeValidator` **u ovom tasku**. Ali `§3
Rizik #8` kaže suprotno: „serviceTypeValidator **ostaje bez** scanme_menu do
TASK-61". Build dokazuje da Rizik #8 (i `§2.14` „`access.ts` — no change") ima
pravo: dodavanje `scanme_menu` **nije aditivno** — puca `tsc` na šest totalnih
`Record<ServiceType, …>` mapa:

- `convex/lib/access.ts:141` `SERVICE_PRODUCT_NAMES` — **`§2.14` izričito kaže
  „no change"; vlasnik je tražio da se `access.ts` NE dira**;
- `components/admin/customers-admin.tsx:59` `SERVICE_LABEL` — UI + nov i18n ključ
  (izvan opsega „nikakav UI"; i18n je TASK-57);
- `convex/checkout.ts:108` `SPLITTER_BUTTON_LABEL` — kod-konstanta;
- `convex/lib/orderSnapshot.ts:173` `PRICING_SERVICE_BY_SERVICE_TYPE` — traži
  **novo `menu → pricing-service` preslikavanje** (RFC-002 motor, nije odluka
  ovog taska);
- `convex/orders.ts:83` `SLUG_SUFFIX` — kod-konstanta;
- `convex/lib/plans.ts` — bezbedno (ključevi izvedeni iz `PLAN_LIMITS`, ne iz
  cele unije).

**Odluka (potvrđena od korisnika, dva puta):** `scanme_menu` se NE dodaje u
`serviceTypeValidator` u TASK-47 — odloženo, tačno kako `§3 Rizik #8` i `§2.14`
propisuju. Komentar stoji na mestu izmene u `convex/schema.ts`. **Za vlasnika:**
uskladiti RFC-003 — `§2.13 M.7` / `§2.14` / `§4 TASK-47` su u grešci naspram
`§3 Rizik #8`. Kada `scanme_menu` uđe u uniju (kandidat: TASK-55 limiti + TASK-57
i18n, a aktivacija TASK-61), zajedno s njim moraju leći svih šest mesta iznad,
uključujući `menu → pricing-service` odluku i i18n ključ za labelu usluge.

### 2. `cardTargets.kind` +`"menu"` — dodato, ali NIJE „samo šema"

`cardTargets.kind` referiše deljenu uniju `cardTargetKind`, pa `"menu"` teče i u
`cardScanEvents.targetKind` (namerno — ne smeju da se razmimoiđu). `§2.13 M.8`
implicira „samo šema", ali `Doc<"cardTargets">["kind"]` napaja tipove u
`convex/cards.ts` (dve iscrpne `switch` grane bez `default`), pa se build ne
kompajlira bez dodira `cards.ts`. **Najkonzervativnije rešenje (bez ponašanja,
bez izmene ijednog testa):**

- `SplitterItemSpec.kind` isključuje `"menu"` (`Exclude<…, "splitter" | "menu">`)
  — dugme splitera ne može biti meni; poklapa se s `cardSplitterItem` validatorom
  (§2.13 NE dodaje `menu` u `cardSplitterItem`);
- `validateTargetSpec` odbija `kind === "menu"` na vrhu (meni nije vezljiv cilj);
- `resolveAndRecord` vraća `{ kind: "invalid" }` za `menu`.

`TASK-56` (§2.8) menja ova mesta pravim vezivanjem + `302 /{slug}/meni`. Nijedan
postojeći test za `cards` se nije menjao niti pukao. **Za vlasnika / TASK-56:**
zabeleženo da `menu` već postoji u uniji kao skladištiv-ali-inertan cilj; TASK-56
zamenjuje stubove, ne dodaje uniju ponovo.

---

## TASK-51 — fork editora Menija (RFC-003 §4)

Urađeno: Venue editor forkovan u nove fajlove na novoj ruti
`app/[slug]/meni/editor` (`components/menu/editor/**`, registry pet oblika +
renderi u `components/menu/blocks/**`, `components/menu/menu-template.tsx`),
Convex `convex/menu.ts` (editorBySlug, createMenu, saveDraft, publishDraft,
generateEditorUploadUrl) sa istim draft/published + `expectedDraftRevision`
OCC obrascem kao Venue, zaseban modul mapiranja `lib/menu-rows.ts` sa
round-trip testom u oba smera, i18n površine `menu-editor` + seme `menu`.
Deljeno (bez „venue“ u imenu): `components/admin/use-editor-history.ts`,
design-engine, `lib/scanme-links-design.ts` (pozadinski union), `requireBusinessAccess`
iz `access.ts` (samo poziv). Freeze gejt prazan; ruta nigde nije linkovana.
Odluke za vlasnika (konzervativna opcija uzeta, ništa nije potvrđeno):

### 1. Čuvar editora i `menus.serviceProfileId` — do TASK-61

RFC-003 §1.c propisuje `requireServiceEditorAccess(profile, ["scanme_menu"])`,
ali `scanme_menu` NIJE u `serviceTypeValidator` (odloženo, TASK-47 §1), pa taj
poziv ne prolazi `tsc` i ne postoji `scanme_menu` profil koji bi se proveravao.
**Uzeto:** čuvar je postojeći, proizvod-agnostični `requireBusinessAccess`
(admin ili aktivno članstvo lokala) — `access.ts` netaknut. Posledica: nema
`clientEditingEnabled` prekidača za Meni dok profil ne postoji. Iz istog razloga
`menus.serviceProfileId` je olabavljen u `v.optional(...)` (aditivno, tabela
prazna; TASK-47 test i dalje prolazi) — editor pravi meni vezan samo za lokal.
**Za TASK-61:** zategnuti čuvar na `requireServiceEditorAccess(..., ["scanme_menu"])`
i vezati/proveriti `serviceProfileId` (backfill ili ponovo obavezno polje).

### 2. Ugovor draft/published: nacrt inline na `menus`, objavljeno u 6 tabela

§2.13 daje `menus` bez nacrta, a §2.13 tabele bez pojma nacrta; editor traži
autosave + OCC „kao Venue“. **Uzeto (Venue ogledalo):** NACRT je inline model
(`lib/menu-blocks.ts`) na `menus.draftModel/draftDesign` + `draftRevision/
publishedRevision/hasUnpublishedChanges` (sve opcionalno, aditivno); OBJAVLJENO
je šest §2.13 tabela koje `publishDraft` piše kroz `lib/menu-rows.ts`
zamenom svih redova menija (brisanje + upis) i `menus.design/status/
daypartOverride/publishedAt`. Posledice: (a) `_id` redova se menjaju pri svakoj
objavi — stabilni id-jevi bi tražili kolonu (npr. `key`) na §2.13 tabelama, što
je odluka vlasnika; (b) TASK-54 „živi“ prekidač `available` mora da patchuje i
objavljeni red i nacrt, inače ga sledeća objava pregazi.

### 3. Veličina objave naspram plafona zapisa po mutaciji

Grupe i stavke su neograničene (§2.7), a objava upisuje sve redove menija u
jednoj mutaciji. Convex ima plafon dokumenata/bajtova po transakciji; jako
veliki meni (hiljade stavki sa varijantama) bi udario u njega. Namerno NIJE
uveden veštački limit (protivrečio bi §2.7). **Za vlasnika:** dozvoliti
segmentiranu objavu (scheduler kontinuacije, kao Memories export) kad se
pojavi potreba, ili prihvatiti praktični plafon i zabeležiti ga u perf docs.

### 4. `harness:namespace` nema `--menu-` granu (zapažanje)

Gejt proverava samo `--links-` u `components/venue/**` i `--venue-` u
`components/scanme-links/**`; `components/menu/**` nije pokriven. Render test
`components/menu/menu-render.test.tsx` proverava da izlaz nema `--venue-`/
`--links-` tokena, ali gejt sam nije proširen (nije u opsegu; jedan red u
`harness/namespace-gate.mjs` ako vlasnik želi).

### 5. i18n: `menu-editor` površina + seme `menu` površine

AGENTS.md traži da svaki novi string ide kroz rečnik, a RFC §2.11 dodeljuje
`menu`/`menu-admin` površine TASK-57. **Uzeto:** nova `menu-editor` površina
(analogija `venue-editor`, ceo editor), plus `menu` površina sa samo šest
ključeva koje renderi oblika izgovaraju („Još {count}“, „Nema više“, format
cene, footer, prazan meni, aria za varijante). TASK-57 proširuje `menu`, ne
pravi je iznova.

### 6. Pozadina „media“ nije ponuđena u editoru

`menus` nema polje za medij stranice (§2.13), pa kategorija „slika ili video“
pozadine nema gde da se sačuva. Editor je NE nudi (pet kategorija); šablon
media kategoriju crta bojom stranice. Ako vlasnik želi medijsku pozadinu
Menija, treba kolona na `menus` (Premium, §2.7) — nije dodata.

---

## TASK-56 — vezivanje kartice i razrešavanje na meni (RFC-003 §2.8 & §4)

Zadatak realizovan bez protivrečnosti i bez otvorenih pitanja za vlasnika.
- `validateBaseTargetSpec` prihvata `kind: "menu"` bez spoljne reference (analogno `venue`);
- `validateTargetSpec` uklonio privremeni čuvar koji je odbijao `menu` pri kreiranju;
- `ResolveOutcome` proširen varijantom `{ kind: "menu"; businessSlug: string }`;
- `resolveAndRecord` razrešava `menu` na `business.slug` (ili `"invalid"` ako lokal ne postoji);
- `app/r/[cardCode]/route.ts` radi 302 preusmerenje na `/{businessSlug}/meni`;
- `SplitterItemSpec` i `cardSplitterItem` validator ostaju bez `menu` (§2.13 M.8);
- Nijedan postojeći test se nije menjao; novi test pokriva kreiranje, razrešavanje, idempotenciju na `requestId` i odbijanje `menu` kao dugmeta splitera;
- Hirurški komit: promene za TASK-53 (item bottom-sheet) zatečene u radnom stablu su očuvane i nisu uvučene u ovaj komit, kako bi istorija ostala čista i strogo vezana za TASK-56.

---

## TASK-57 — i18n površine `menu` i `menu-admin` (RFC-003 §2.11 & §4)

Urađeno:
- **POSAO 1:** `harness/namespace-gate.mjs` proširen tako da skenira `components/menu/**` na `--venue-` i `--links-` tokene; gejt uredno prolazi pre i posle izmena (42 fajla skenirana za oba tokena).
- **POSAO 2:** U `docs/architecture/RFC-003-scanme-menu.md` §3 dodat Rizik 10 (`setItemAvailable` poništava se ponovnom objavom sa nesačuvanim izmenama); red TASK-58 u §4 dopunjen obavezom da reši ovaj konflikt.
- **POSAO 3 (glavni):**
  - Proširena postojeća `menu` površina (`lib/i18n/types.ts` `MenuDict`, `lib/i18n/sr/menu.ts`) sa početnih 13 na 23 ključa (dodati metaTitle, metaDescription, notFoundTitle, notFoundBody, emptyGroup, variantsTitle, inquiryAction, inquiryAria, inquirySuccess, inquiryError).
  - Napravljena nova `menu-admin` površina (`MenuAdminDict`, `lib/i18n/sr/menu-admin.ts`, registrovana u `lib/i18n/index.ts` pod ključem `"menu-admin"`) sa 37 tipizovanih ključeva za admin konzolu Menija, migracione faze po SLA-u (primljeno → u izradi → na potvrdi → objavljeno), akcije aktivacije/deaktivacije, PDF i Excel izvoz, i upozorenje na prepisivanje statusa.
  - Sav tekst je srpski, **isključivo ekavica** (bez ijekavice).
  - U `app/[slug]/meni/page.tsx` metadata koristi `menuSr` kroz `fmt` (`metaTitle` i `metaDescription`).
  - Provereno namernim uklanjanjem ključa `moreItems` da `tsc` / `npm run check` deterministički pada (`TS1360` / `TS2741`), nakon čega je ključ vraćen.
  - Pokriveno novim testom u `lib/i18n/i18n.test.ts`.

### Pitanje za vlasnika (TASK-58 izbor)

U vezi sa Rizikom 10 i TASK-58 iz RFC-003: odlučiti koji pristup je poželjniji za slučaj kada konobar označi „nema više" a vlasnik ima nesačuvane izmene u editoru:
1. Objava nikada ne gazi polje `available` (čuva se živo stanje iz objavljenih redova);
2. Editor vidno upozorava na nepoklapanje dostupnosti i traži eksplicitnu potvrdu pre objave.
Oba rešenja su evidentirana u RFC-003 §3 i prepuštena TASK-58. **Odloženo, čeka odluku vlasnika.**

---

## TASK-55 — entitlements za Meni (RFC-003 §2.7 & §4)

Urađeno:
- Proverena zatečena prepreka iz TASK-47: `serviceTypeValidator` ne sadrži `"scanme_menu"` jer je `ServiceType` iscrpna unija nad kojom postoji 6 totalnih `Record<ServiceType, ...>` mapa u kodu.
- Potvrđeno tipskim sistemom: dodavanje `"scanme_menu"` u `PLAN_LIMITS` menja `PlanProduct = keyof typeof PLAN_LIMITS`, što dovodi do pada `tsc` u `convex/lib/entitlements.ts` (linije 48 i 58) jer `q.eq("product", product)` zahteva da `product` pripada `Doc<"entitlements">["product"]` (što je `ServiceType`).
- Zato su definisane samostalne konstante i tipovi u `convex/lib/plans.ts`:
  - `MenuLimits` interfejs (`photos`, `videoInSheet`, `animations`, `featuredGroup`, `maxGroups: null`, `maxItemsPerGroup: null`);
  - `MENU_BASIC_LIMITS` (sve na `false`, neograničene grupe/stavke);
  - `MENU_PREMIUM_LIMITS` (sve na `true`, neograničene grupe/stavke);
  - `MENU_PLAN_LIMITS` katalog (`basic` i `premium`);
  - `MENU_ACCOUNT_PLAN_TIER` preslikavanje (`basic → basic`, `premium → premium`, `enterprise → premium`);
  - Gejt helperi: `menuPhotosEnabled`, `menuVideoEnabled`, `menuFeaturedEnabled` (svi vraćaju `false` za `null`/`undefined`/Basic).
- U `convex/menu.ts`:
  - Dodat `getMenuEntitlement(ctx, businessId)` koji razrešava Meni entitlement preko nalog-nivo plana (Osa B, korak 3 iz RFC-002 §2.2.3). Ukoliko lokal nema nalog ili entitlement, vraća `null` koji gejt helperi podrazumevano tretiraju kao Basic.
  - U `publicMenuBySlug` (javni upit): na Basic tiru (ili kad nema entitlementa), polja `photoStorageId`, `videoStorageId` i izvedeni signed URL-ovi u `blockImageUrls` **izostavljaju se na serveru** (nikada sakrivanje kroz CSS).
- Čuvar editora (`loadMenuForEditor`) ostaje proizvod-agnostični `requireBusinessAccess` do TASK-61.
- `convex/lib/access.ts` i `convex/lib/entitlements.ts` ostali netaknuti.
- Pokriveno sa 18 novih testova u `convex/menuEntitlements.test.ts` koji testiraju celu matricu `{nema entitlement, basic, premium, enterprise} × {photos on/off}`, serversko izostavljanje polja i rad čuvara editora. Svi postojeći testovi prolaze bajt-identično.

### Zabeleženo za TASK-61 (terminalno povezivanje)

Da bi `scanme_menu` mogao da se razrešava direktno kroz `getEntitlement(ctx, businessId, "scanme_menu")` i kroz tabelu `entitlements`, TASK-61 mora zajedno:
1. Dodati `"scanme_menu"` u `serviceTypeValidator` (`convex/schema.ts`);
2. Povezati svih šest `Record<ServiceType, ...>` mapa u kodu:
   - `convex/lib/access.ts:141` `SERVICE_PRODUCT_NAMES`
   - `components/admin/customers-admin.tsx:59` `SERVICE_LABEL` (+ nov i18n ključ)
   - `convex/checkout.ts:108` `SPLITTER_BUTTON_LABEL`
   - `convex/lib/orderSnapshot.ts:173` `PRICING_SERVICE_BY_SERVICE_TYPE` (odluka o menu → pricing-service mapiranju)
   - `convex/orders.ts:83` `SLUG_SUFFIX`
   - `convex/lib/plans.ts` (uvezati `MENU_PLAN_LIMITS` u `PLAN_LIMITS.scanme_menu` i `MENU_ACCOUNT_PLAN_TIER` u `ACCOUNT_PLAN_TIER.scanme_menu`);
3. Preusmeriti `getMenuEntitlement` (ili pozive u `convex/menu.ts`) na `getEntitlement(ctx, businessId, "scanme_menu")`.

---

## TASK-62 — katalog šeme za poručivanje (RFC-004 §2.16 & §2.17)

Urađeno:
1. **7 novih tabela u `convex/schema.ts`** tačno po §2.16 (prazne, aditivne):
   - `orderingConfig`: indeksi `by_businessId`, `by_code`;
   - `orderingItems`: indeks `by_businessId_and_order`;
   - `orderingGuests`: indeksi `by_code_and_guestKey`, `by_cardId`;
   - `staffPins`: indeks `by_businessId`;
   - `orderingShifts`: indeks `by_businessId_and_status`;
   - `serviceRequests`: indeksi `by_shiftId_and_status`, `by_cardId_and_createdAt`, `by_businessId_and_createdAt`;
   - `serviceRequestItems`: indeks `by_requestId`.
2. **`cardTargetKind` proširen sa `"table_ordering"`** (RFC-004 §2.14, §2.16 O.8; deli se sa `cardScanEvents.targetKind`).
3. **`cardSplitterItem.kind` proširen sa `"table_ordering"`** (RFC-004 §2.14, §2.16 O.9). Za razliku od Menija koji nije dugme splitera, poručivanje JESTE dugme splitera.
4. **Stroga inertnost u `convex/cards.ts`**:
   - `validateTargetSpec` odbija `spec.kind === "table_ordering"` sa `dict.cardTargetInvalid`;
   - `validateTargetSpec` odbija splitter stavku sa `item.kind === "table_ordering"` sa `dict.cardTargetInvalid`;
   - `validateBaseTargetSpec` odbija `"table_ordering"`;
   - `resolveAndRecord` vraća `{ kind: "invalid" }` za `"table_ordering"`;
   - `getSplitterView` ignoriše (`continue`) stavku `"table_ordering"`.
   Sve grane nose komentar koji imenuje TASK-63 kao task koji ih zamenjuje pravim povezivanjem.
5. **Novi test `convex/orderingSchema.test.ts`**:
   - Round-trip upis i čitanje za svih 7 novih tabela;
   - Potvrda da postojeće tabele validiraju nepromenjeno;
   - Potvrda inertnosti: odbijanje direktnog cilja, odbijanje splitter stavke i razrešavanje u `invalid`.
6. **Netaknuto**:
   - `serviceTypeValidator` — NEMA `"scanme_ordering"` (RFC-004 §2.12; poručivanje jaše `scanme_venue`);
   - `convex/lib/access.ts`, `convex/lib/entitlements.ts`, `convex/lib/plans.ts` — bez izmena;
   - `lib/flags.ts` — `ORDERING_EXISTS` se NE dodaje (ostaje za terminalni TASK-71);
   - Nijedan Venue, Links ni Menu fajl; zamrznuti ScanMe Links put netaknut.
7. **Verifikacija**:
   - `npm run check` zelen (lint 0 grešaka, build/tsc, `harness:namespace`, `harness:check` 177×2 goldena bajt-identično);
   - Celokupan vitest prolazi (830 testova prošlo, 0 palo);
   - Freeze gejt `git diff --stat components/scanme-links lib/scanme-links*` potpuno prazan.

### Za vlasnika / TASK-63:
- Šema i validator unije su spremni za TASK-63 (kard-svesni hop `/r/[cardCode]/o` + `resolveTableOrdering` + `mintOrderingGuest`).
- Pitanja iz RFC-004 §5 (cene/tiri, overdue prozor, PIN politika, heartbeat/stale pragovi, razlozi za poziv) čekaju odluke vlasnika pre kasnijih taskova (TASK-64..TASK-70).

---

## TASK-65 — smena, PIN i otkucaj tableta (RFC-004 §2.6, §2.7)

Urađeno: `convex/orderingShifts.ts` (openShift / closeShift / heartbeat /
pauseOrdering / resumeOrdering + interni `markShiftStale` i cron
`sweepStaleShifts`), aditivni indeks `orderingShifts.by_status_and_lastHeartbeatAt`,
cron „sweep stale ordering shifts", test `convex/orderingShifts.test.ts`.
Materijalizovan `stale` (runAt flip + cron rezerva; nijedan upit ne čita zidni
sat). PIN: PBKDF2-SHA256 sa soli, poređenje konstantnog vremena (XOR-fold po uzoru
na `convex/memoriesPipeline.ts`), mamac-derivacija krije postojanje PIN-a. Nosilac
smene: 256-bit, u bazi se čuva samo njegov SHA-256 hash.

Sledeće su uzete kao PRIVREMENI konzervativni placeholderi u kodu; menjaju se
isključivo u kodu, bez migracije baze:

### 1. Heartbeat interval i stale prag (RFC-004 §5 Q5, otvoreno pitanje za vlasnika)
`STALE_MS = 60_000` (~60 s tišine ⇒ tablet je mrtav, uzrok A), uz klijentski
otkucaj ~15 s (klijent je TASK-68, server drži samo `STALE_MS`). Backstop cron
interval `{ minutes: 1 }`, vezan za `STALE_MS`. Ovo su brojevi iz predloga §5 Q5
(već digestovano iznad: „otkucaj svakih ~15 s, stale na ~60 s") — čekaju potvrdu.
**Odloženo, čeka odluku vlasnika.**

### 2. PIN politika (RFC-004 §5 Q4, otvoreno pitanje za vlasnika)
RFC NE fiksira dužinu PIN-a; uzeto kao placeholder: 4–6 cifara, jedan ili više
PIN-ova po lokalu, bez politike rotacije. `PBKDF2_ITERATIONS = 100_000`. Serverski
„pepper" (env tajna) NIJE uveden namerno — nema nove operativne zavisnosti koja bi
u petak uveče oborila `openShift` na produkciji ako se zaboravi da se postavi;
može se dodati kasnije ako vlasnik traži jaču zaštitu od curenja baze. Provizija
PIN-a (vlasnički UI/mutacija za postavljanje/rotaciju) NIJE u TASK-65 — RFC-004 §4
kaže da je PIN politika vlasnikov unos, ne ovaj task; izvezen je `hashPin()` koji
testovi i kasniji vlasnički task (§2.12) koriste da upišu `staffPins.pinHash`.
**Odloženo, čeka odluku vlasnika.**

### 3. Rate-limiting na openShift
Namerno nije dodat (RFC-004 rizik #6: PIN je pogodnost, prava granica je fizički
tablet pored kase). Moguće buduće ojačanje ako se pokaže potreba.
**Odloženo, čeka odluku vlasnika.**

### Netaknuto / verifikacija:
- `convex/lib/access.ts`, `convex/lib/entitlements.ts`, `convex/lib/plans.ts` — bez
  izmena (samo pozivi izvezenih `getEntitlement` / `venueOrderingEnabled` /
  `normalizeCode`);
- `lib/flags.ts` `ORDERING_EXISTS` netaknut (TASK-71); nijedan Links/Venue/Menu
  fajl; zamrznuti ScanMe Links put netaknut;
- Bez UI panela (TASK-68), bez gostove akcije (TASK-66), bez živog statusa (TASK-67)
  — ovaj task NE dodaje nijedan `query`, pa nijedan upit ne može čitati zidni sat po
  konstrukciji;
- `npm run check` zelen (lint 0 grešaka; build/tsc; `harness:namespace`;
  `harness:check` 177×2 goldena bajt-identično); ceo vitest 860 prošlo (1 preskočen);
  nova serija `orderingShifts.test.ts` 14/14; freeze gejt
  `git diff --stat components/scanme-links lib/scanme-links*` i `harness/goldens`
  potpuno prazni.




## TASK-66 — dve akcije gosta: poziv konobaru i porudžbina (RFC-004 §2.1, §2.6, §2.9)

Isporučeno: `convex/orderingRequests.ts` (`callWaiter`, `submitOrder`), dependency-free
`convex/lib/orderingErrors.ts` (mašinski kodovi), dve kofe u `convex/lib/rateLimits.ts`
(`orderSubmit` po gostu, `callWaiter` po `cardId`), jedan boolean `acceptingRequests` na
`ordering.publicOrderingState`, dva izvezena predikata u `convex/orderingShifts.ts`
(`shiftIsAvailable` bez sata za upit, `shiftIsAvailableAt` sa satom za mutaciju),
gostova površina `app/o/[code]` + `components/ordering/**`, i18n površina `ordering`,
seed za QA `convex/orderingDevSeed.ts`, testovi `convex/orderingRequests.test.ts` (27/27).

### 1. Kontradikcija u §2.6: dugme „Pozovi konobara" u onemogućenom stanju
§2.6 kaže da onemogućeno stanje „i dalje nudi dugme za poziv konobara **ili** običan
red teksta". Prva varijanta se NE MOŽE ispoštovati: `serviceRequests.shiftId` nije
opcion, a §2.7 rutira svaki zahtev otvorenoj smeni — bez otvorene smene poziv se ne
može ni upisati, a sa zastarelom smenom bi zvonio na mrtvom tabletu, što je tačno
praznina zbog koje §2.6 i postoji (rizik #2). **Uzeta je konzervativna, u samom RFC-u
ponuđena druga varijanta:** obe akcije dele JEDNU kapiju, a onemogućeno stanje
prikazuje mirnu poruku + red teksta „pozovite konobara rukom". Ako vlasnik želi da
poziv radi i kad porudžbina ne radi, to traži šemsku izmenu (`shiftId` opcion ili
zaseban put rutiranja) i preispitivanje §2.7. **Odloženo, čeka odluku vlasnika.**

### 2. `orderingConfig.enabled = false` i istekao entitlement kao uzroci
RFC §2.6 nabraja samo uzrok A (zastareo otkucaj) i uzrok B (nema smene / pauza).
Konfiguracioni prekidač lokala i istekla pretplata (§2.12) tretirani su kao uzrok B i
prikazuju ISTU mirnu poruku — gost ne sme da vidi platežno stanje lokala. Serverski se
svi uzroci dižu kao jedan kod `request/unavailable`. Ako vlasnik želi drugačiju poruku
za „lokal uopšte ne radi poručivanje", to je zaseban tekst. **Odloženo.**

### 3. Brojevi kofa za ograničenje (RFC-004 §5 nema brojeve)
PRIVREMENI konzervativni placeholderi, menjaju se samo u kodu:
`orderSubmit` = token bucket rate 5/min, capacity 3, ključ = `orderingGuests._id`;
`callWaiter` = rate 3/min, capacity 3, ključ = `cards._id` (STO, ne gost). Aritmetika je
zapisana uz same unose u `convex/lib/rateLimits.ts`. **Čeka potvrdu vlasnika.**

### 4. Zaobilaženje `orderSubmit` ponovnim skeniranjem
Ograničenje porudžbine je po gostu, pa ponovno skeniranje kartice kuje novog gosta i
resetuje kofu; §2.9 to izričito prihvata i oslanja se na per-IP kofe na hopu
(`tableOrderingHop` / `orderGuestCreate`, 300/min). Poziv konobaru NIJE ranjiv jer je
ključan po `cardId`. Nije dodat per-`cardId` plafon za porudžbine da se ne izmišlja
pravilo van RFC-a. **Zabeleženo, nije promenjeno.**

### 5. Granice unosa — odbijanje, ne tiho sečenje
`MAX_LINES = 30`, `MAX_QTY = 99`, `MAX_NOTE_CHARS = 280`, zabranjene duplirane stavke u
jednoj porudžbini. Sve se ODBIJA vidljivom porukom umesto da se tiho skrati ili spoji:
pogrešna količina je pogrešan poslužavnik. RFC ne fiksira nijedan od ovih brojeva.
**Placeholderi, čekaju vlasnika.**

### 6. Bez deduplikacije porudžbina
Namerno: §2.4 kaže da je svaki zahtev nezavisan (sto legitimno naručuje istu turu dvaput),
pa bi gutanje „iste" druge porudžbine bilo gori tihi otkaz od očiglednog duplikata.
Dvostruki dodir se sprečava u klijentu (dugme se onemogući dok mutacija traje).

### Netaknuto / verifikacija:
- `convex/lib/access.ts`, `convex/lib/entitlements.ts`, `convex/lib/plans.ts` i
  `convex/schema.ts` — BEZ izmena (samo pozivi izvezenih funkcija; nijedna nova tabela
  ni indeks); `lib/flags.ts` netaknut (TASK-71);
- `overdue` se upisuje kao `false` i NIŠTA se ne zakazuje — `markOverdue` i živi status
  Poslato → Prihvaćeno → Stiže su TASK-67 (napomena stoji na mestu upisa);
- nijedan upit ne čita zidni sat: `publicOrderingState` čita samo materijalizovane
  boolean-e; sat se čita isključivo u mutaciji, kao pojas preko nesletelog `runAt` flipa;
- QA u pregledaču kroz PRAVI hop (`/r/<cardCode>/o?venue=<code>`): porudžbina i poziv
  upisani sa `cardId` + `guestId` + `shiftId`; pauza (uzrok B) i zastareo otkucaj
  (uzrok A) daju BAJT-ISTU poruku gostu, uživo, bez osvežavanja; 0 grešaka u konzoli;
- `npm run check` zelen; `convex/orderingRequests.test.ts` 27/27.

---

## TASK-67 — živi status gosta i rok od 7 minuta (RFC-004 §2.5, §2.6, §2.8)

Isporučeno: `convex/orderingStatus.ts` (`markOverdue` + cron `sweepOverdueRequests`,
upit `myRequests`, gostov `withdrawRequest`, panel prelazi `acceptRequest` /
`markEnroute` / `completeRequest`), materijalizovan rok `serviceRequests.overdueAt`
+ dva indeksa (`by_guestId_and_createdAt`, `by_status_and_overdueAt`), zakazivanje
`runAt` na mestu upisa u `orderingRequests.insertRequest`, cron unos u `crons.ts`,
`components/ordering/request-status-list.tsx` + SSR u `app/o/[code]/page.tsx`,
i18n dopuna `ordering` površine, testovi `convex/orderingStatus.test.ts` (18/18).

### 1. Tačna gostova akcija na roku (RFC-004 §5 Q3, otvoreno pitanje za vlasnika)
RFC nudi tri: ponovno „zvonjenje" panela, telefon lokala, i withdraw. Uzeta je
**samo withdraw** — konzervativan izbor, jer je jedina od tri koja ne izmišlja
ništa van RFC-a: status `withdrawn` već postoji u šemi (TASK-62), akcija je
gostova i eksplicitna, i radi baš kad panel ćuti.
- **Ponovno zvonjenje** traži novo polje (`escalatedAt`/`urgent`), svoju kofu za
  ograničenje i semantiku u panelu koji još ne postoji (TASK-68). Nije rađeno.
- **Telefon lokala** nema gde da se upiše — `orderingConfig` nema polje za
  telefon, a `businesses` nema telefon uopšte. Dodavanje polja + vlasnički UI je
  posao van ovog taska i pravo vlasnikovo pitanje („koji broj, i da li uopšte").
**Odloženo, čeka odluku vlasnika.**

### 2. Prozor gostove liste statusa je ograničen na 12 zahteva
`myRequests` vraća najnovijih `GUEST_REQUEST_WINDOW = 12` zahteva tog gosta
(obrazac `WALL_WINDOW`: pretplata ne sme da raste sa istorijom). Gost koji u
jednoj sesiji pošalje više od 12 zahteva ne vidi najstarije. **Ništa se ne
otkazuje** — red ostaje, konobar ga i dalje vidi u panelu. Broj je placeholder;
per-gost kofa je 5/min sa kapacitetom 3, pa je 12 daleko iznad realne sesije.

### 3. Ponovno skeniranje kartice gubi pogled na tekući zahtev (nasleđeno)
`cards.resolveTableOrdering` kuje **novog** gosta pri svakom skeniranju (TASK-63,
TASK-66 §4). Zato gost koji ponovo skenira karticu dok čeka porudžbinu dobija nov
bearer i **prazan** spisak statusa — njegov raniji zahtev i dalje postoji i i
dalje stoji kod konobara, ali ga taj telefon više ne vidi (pa ne može ni da ga
otkaže). §2.5 traži pogled po nosiocu, tako da ovo nije greška ovog taska.
Zatvaranje rupe znači ili da hop ne kuje kad već postoji važeći kolačić za taj
`code` (izmena u TASK-63 ruti), ili pogled po `cardId` (što bi prekršilo §2.5).
**Zabeleženo, nije menjano — čeka odluku vlasnika.**

### 4. Panel prelazi su implementirani ovde, a ne u TASK-68
RFC §2.7 ih nabraja kao panel akcije (TASK-68), ali §4 kriterijum za TASK-67
glasi „promena statusa na panelu stiže do drugog otvorenog klijenta". Dokazati to
`db.patch`-om umesto pravom mutacijom bio bi lažan dokaz, pa su tri mutacije
napisane ovde; TASK-68 na njih samo kači dugmad i ne dodaje serversku logiku.

### 5. Autorizacija prelaza ide po `businessId`, ne po `shiftId`
Zahtev nosi smenu kojoj je rutiran, ali smena se zatvara. Panel koji je zatvorio
smenu u 23:00 i otvorio novu ne bi mogao da dodirne zahteve zaostale iz prethodne
— stajali bi na čekanju, nedodirljivi, zauvek. Bearer i dalje dokazuje da pozivalac
drži otvorenu smenu **tog lokala**. Test: „smena koja se zatvorila i ponovo
otvorila i dalje može da prihvati zaostale zahteve".

### 6. `overdueAt` je opciono polje (nasleđeni redovi)
Redovi upisani pre TASK-67 (dev QA iz TASK-66) nemaju `overdueAt`. U Convex
indeksu odsutna vrednost sortira **ispod** svakog broja, pa bi goli
`.lte("overdueAt", now)` te redove označio kao `overdue` na prvom otkucaju crona;
donja granica `.gte("overdueAt", 1)` ih isključuje. Provereno i na pravim
podacima dev deploymenta (dva zaostala reda, `flagged: 0`) i testom kome je
oduzeta donja granica (test pada).

### Netaknuto / verifikacija:
- `convex/lib/access.ts`, `lib/plans.ts`, `lib/entitlements.ts`, `lib/flags.ts` —
  BEZ izmena; `orderingShifts.ts` dobija samo dva `export` ključa nad postojećim
  privatnim helperima (`loadOpenShiftByCode`, `requireBearer`);
- **`markOverdue` fizički ne može da otkaže zahtev** — ne dira `status` ni u
  jednoj grani (§2.8, izričita odluka vlasnika); isto važi za cron;
- nijedan upit ne čita zidni sat. Dokazano negativnim testom: kad se sistemski
  sat pomeri 21 min unapred a zakazani flip se NE pokrene, `myRequests` i dalje
  vraća `overdue: false`. Test je proveren tako što je upit privremeno prepravljen
  da računa rok iz `Date.now()` — test pada, dakle ima zube;
- QA u pregledaču kroz PRAVI hop na 390px i 1280px: Poslato → Prihvaćeno → Stiže
  stiglo do otvorenog klijenta bez ijednog osvežavanja (prelazi vođeni iz CLI-ja,
  dakle iz drugog klijenta); rok je pretvorio karticu u akcionu karticu uživo dok
  je status ostao „Poslato"; withdraw je prošao; spisak statusa je ostao vidljiv i
  kada je smena otišla u `stale` i akcije se skupile u jedno mirno stanje; 0
  grešaka u konzoli;
- `npm run check` zelen (177×2 goldena bajt-identična); `npx vitest run` 905/905.

---

## TASK-68 — panel konobara na `/panel/[venueCode]` (RFC-004 §2.7, §2.10)

Isporučeno: `convex/orderingPanel.ts` (jedan upit `panelView`, čuvan shift bearerom,
red čekanja ograničen `PANEL_WINDOW = 60` PO aktivnom statusu preko novog indeksa
`serviceRequests.by_businessId_and_status_and_createdAt`), `lib/ordering-shift-cookie.ts`
+ `components/ordering/panel-identity-server.ts` (HttpOnly HMAC kolačić, `Path=/panel/<code>`),
`app/panel/[venueCode]/session/route.ts` (POST PIN → `openShift` → kolačić; DELETE briše),
`app/panel/[venueCode]/page.tsx` + `components/ordering/panel/waiter-panel.tsx`,
`lib/ordering-panel-queue.ts` (grupisanje po stolu, zakasneli na vrh),
`lib/ordering-panel-alert.ts` (zvuk + vibracija), i18n površina `ordering-panel`,
testovi `convex/orderingPanel.test.ts` (8) i `lib/ordering-panel-queue.test.ts` (7).
Nijedna mutacija iz TASK-65/66/67 nije menjana — panel ih samo zove.

### 1. Trajanje shift kolačića: 24 h (placeholder)
`SHIFT_COOKIE_MAX_AGE_SECONDS = 86400`. RFC ne fiksira broj; smena je radni dan. Menja se
samo u `lib/ordering-shift-cookie.ts`. **Odloženo, čeka odluku vlasnika.**

### 2. Otkucaj svakih 15 s (RFC-004 §5 Q5)
`HEARTBEAT_MS = 15_000` u `waiter-panel.tsx` — četiri otkucaja po `STALE_MS` (60 s), plus
jedan odmah kad tab ponovo postane vidljiv. Brojevi su predlog RFC-a, ne odluka.
**Odloženo, čeka odluku vlasnika.**

### 3. Nema ograničenja pokušaja PIN-a (RFC-004 §5 Q4)
Ruta prijave nema kofu; jedini kočnik je PBKDF2 sa 100k iteracija po pokušaju (TASK-65).
RFC §2.7 kaže da PIN nije bezbednosna granica (granica je fizički tablet), pa nije
izmišljena kofa van RFC-a. Ako vlasnik želi, dodaje se per-IP kofa u
`convex/lib/rateLimits.ts` i poziv u `openShift`. **Zabeleženo, čeka odluku vlasnika.**

### 4. Prozor reda: 60 po statusu
`PANEL_WINDOW = 60` za svaki od `sent` / `accepted` / `enroute` posebno (obrazac `WALL_WINDOW`).
Zahtev ispada iz prikaza tek kad u ISTOM statusu ima 60 novijih — `completed` redovi ne
računaju se u prozor (zato novi indeks; test „completed rows cannot hide a pending one").
Ništa se ne otkazuje ispadanjem iz prozora. **Placeholder broj, čeka vlasnika.**

### 5. Zvuk posle ponovnog učitavanja traži jedan dodir
Pretraživač pušta zvuk tek posle gesta (§2.10). Prijava PIN-om je taj gest; tablet koji
se učita iz kolačića bez PIN-a dobija baner „Uključi zvuk" sa jednim dugmetom. Nema
zaobilaska bez gesta. **Zabeleženo (ponašanje pretraživača, nije greška).**

### 6. Drugi unos PIN-a na drugom uređaju odjavljuje prvi
`openShift` (TASK-65) pri „adopt" ponovo kuje bearer, pa prvi tablet dobija
`invalid_bearer` iz pretplate i pada na PIN sa porukom „Smena je preuzeta na drugom
uređaju". Dva tableta istovremeno na smeni nisu podržana; to je posledica §2.7
„jedna otvorena smena po lokalu" i nije menjano ovde. Ako vlasnik želi dva uređaja,
to je izmena TASK-65 (više bearera po smeni). **Odloženo, čeka odluku vlasnika.**

### 7. Formulacija stale bedža za osoblje
Panel je jedino mesto koje imenuje uzrok A (§2.6): „Tablet nije javio otkucaj —
poručivanje je zaustavljeno". Tekst je u `lib/i18n/sr/ordering-panel.ts` i ne sme na
gostovu površinu. **Čeka potvrdu formulacije.**

### 8. Nasleđeno: Convex CLI na ovoj mašini cilja pogrešan deployment
`npx convex run/data/dashboard` iz OBA repoa (scanme-mvp i beautybymasha) rešava se na
`good-swordfish-571` iako `.env.local` kaže `dev:expert-pelican-136`; `--deployment
expert-pelican-136` prolazi samo uz `CONVEX_DEPLOY_KEY=""`. Sam `npx convex dev` u
scanme-mvp gura na ispravan `expert-pelican-136` (provereno HTTP pozivom `panelView`).
Ništa nije menjano u konfiguraciji CLI-ja; QA komande su išle sa eksplicitnim
`--deployment`. **Vlasnik da proveri `npx convex deployment select` stanje.**

### Netaknuto / verifikacija:
- `convex/lib/access.ts`, `entitlements.ts`, `plans.ts`, `lib/flags.ts` (`ORDERING_EXISTS`),
  `orderingShifts.ts`, `orderingRequests.ts`, `orderingStatus.ts`, `proxy.ts`,
  `components/scanme-links`, `lib/scanme-links*` — BEZ izmena;
- nijedan upit ne čita zidni sat: `panelView` vraća materijalizovane `overdue`/`stale`;
  redosled u `lib/ordering-panel-queue.ts` je čista funkcija nad `createdAt` + `overdue`;
- QA u pregledaču (localhost:3000, dev deployment `expert-pelican-136`, seed
  `orderingDevSeed:seed`): prijava PIN-om (POST 200 + Set-Cookie), ponovno učitavanje
  zadržava smenu, porudžbina + poziv sa Sto 7 kroz pravi hop stigli u panel UŽIVO dok je
  tab bio u pozadini, Prihvati → Stiže → Završeno praćeni na gostovom tabu bez
  osvežavanja, zakasneli Sto 12 skočio na vrh sa „Kasni", pauza/nastavak vidljivi gostu
  uživo, zatvaranje smene (dvokoračno) → PIN + gost nedostupan; 1280 px dve kolone,
  375 px jedna kolona, svako dugme 48 px, bez horizontalnog skrola, 0 grešaka u konzoli.

## TASK-60c — grananje objave menija u nastavke (generacijski model)

### 1. Inline (atomični) flip umesto zasebnog ZAKAZANOG flipa — konzervativna varijanta

Vlasnikov korak 3 kaže „kad je upis gotov, JEDNA mala mutacija flipuje
`menus.publishedGeneration`". Implementirano je kao **inline atomični flip**:
`publishDraft` upisuje generaciju N+1 I flipuje `publishedGeneration` u **istoj**
transakciji (upis 1000 stavki = ~3021 dokumenata, daleko ispod limita 16000 —
dokazano „fresh" u TASK-60), pa objava ostaje **sinhrona** (isti return
`{publishedAt, publishedRevision}`; nema talasanja na editor caller ni na
postojeće testove). Atomičnost „gost ne vidi pola" garantuje Convex snapshot
izolacija jednog commita, a generacijski filter na čitanju sprečava mešanje N i
N+1 dok stari redovi koegzistiraju. **Vlasnik je u plan-sesiji potvrdio izbor A
(inline flip)** na direktno postavljeno pitanje.

Zaseban ASINHRONI flip (odvojen commit) je nužan tek kada i **UPIS** mora da se
seče u nastavke — meniji preko ~5000 stavki, gde `documentsWritten` (16000) veže.
To ide zajedno sa grananjem upisa, van kriterijuma ovog taska (1000 stavki).
**Uslov reversala:** kad TASK-58 počne da uvozi menije > ~5000 stavki, uvesti
batch-upis + zaseban async flip (i tada testovi koji objave-pa-čitaju traže
`finishAllScheduledFunctions`).

### 2. Pomereni plafon: JAVNI UPIT sada veže na ~2000 stavki (za svest vlasnika)

Generacijski model diže plafon **objave** sa ~800 (stari republish delete) na
~5000 stavki (`documentsWritten`). ALI javni upit `collectPublishedRows` i dalje
radi 2 upita po stavci (`itemVariants` + `itemPairings`, jer te tabele nemaju
`menuId` — dohvataju se po `itemId` roditelja) → ~2003 upita na 1000 stavki i
prelazi 4096 oko **~2045 stavki**. Za kriterijum od 1000 i objava i čitanje
prolaze. To je **pre-postojeći** problem javnog upita (nije uveden ovim taskom),
van opsega („NE ULAZI: javnog rendera"). **Odloženo, za svest vlasnika:** TASK-58
ne sme da uvozi menije > ~2000 stavki dok se i čitanje ne izbatchuje (npr. dodati
`menuId`+`publishGeneration` na `itemVariants`/`itemPairings` sa svojim indeksom,
pa učitavati po generaciji bez fan-outa) — zaseban naredni task.

### 3. Doslovan izlaz gejtova (tačka 4 preambule)

Node v22.23.2 (bez X509 zaobilaznice). Sve tri provere zelene:

```
npm run check            -> EXIT 0
  harness:namespace passed — no cross-namespace tokens found
  harness:check passed — 177 cases × 2 viewports match the goldens byte-for-byte

git diff --stat components/scanme-links lib/scanme-links*   -> (prazno)
git diff --stat convex/lib/access.ts convex/lib/entitlements.ts lib/flags.ts -> (prazno)

npx vitest run           -> 930 passed | 1 skipped (91 files)
  (uklj. 5 novih u convex/menuPublishGeneration.test.ts)
```

Perf re-merenje na pravom deploymentu (`expert-pelican-136`, URL pinovan): fresh
i republish upis 1000 stavki oba `databaseQueries.used = 19` (stari republish:
2030 na 400, 3536 na 700, >4096 pad na 850+); čišćenje 11 batch-eva,
maxQueriesPerBatch=1020, 0 siročadi. Brojevi u
`docs/perf/menu-publish-ceiling.md` ispod starih.

**Napomena o CLI-ju:** `npx convex dev --once` je (kao u [[convex-cli-wrong-deployment]])
prepisao `NEXT_PUBLIC_CONVEX_URL` u `.env.local` na `good-swordfish-571`; vraćeno
iz bekapa. Perf `npx convex run` je pokrenut sa `--url ...expert-pelican-136` +
`CONVEX_DEPLOY_KEY=""` i NIJE dirnuo `.env.local` (sha1 nepromenjen).


---

## TASK-58 — admin podstranica Menija, unos u ime klijenta, migracija, PDF/Excel izvoz (RFC-003 §2.9, §3 Rizik 10, §4)

### 1. Q5 — cena naknadnih izmena koje radimo mi (RFC-003 §5)

Prva migracija je besplatna (faze `received → in_progress → review → published`
i rok od 2 radna dana su vidljivi na podstranici, svaka adminova mutacija ima
`adminAuditLog` red, pa trag „ko je šta i kad promenio" postoji). Naplata
kasnijih izmena NIJE modelovana — ni cenovna linija u `lib/pricing`, ni
oznaka „plaćena izmena" na audit redu. **Odloženo, čeka odluku vlasnika** (model
i iznos); kad stigne, audit red `publish_menu` sa `via: "admin"` je prirodno
mesto za oznaku naplate.

### 2. Q7 — izvoz: publika i šablon (RFC-003 §5)

Izvoz je isporučen KONZERVATIVNO kao **interni alat**: `requireAdmin` u
`convex/menuExport.ts` (`exportSource` unutar akcije), običan šablon (Helvetica,
bez brenda), izvor je **nacrt** (jedno čitanje dokumenta, bez fan-outa po
stavci; nacrt je ono što unosimo i što klijent pregleda). U kodu je označen
kao PLACEHOLDER. Klijentski self-serve izvoz iz panela i brendirani šablon
čekaju odgovor. **Odloženo, čeka odluku vlasnika.**

### 3. Granica od ~2000 stavki — sprovedena samo na adminovom uvozu

`MENU_MAX_ITEMS = 2000` (`lib/menu-export/rows.ts`) se proverava u
`menuAdmin.importDraft` PRE ikakvog upisa (jasna poruka adminu sa brojem i
granicom, test `convex/menuAdmin.test.ts`) i u `assertExportSize` oba pisača.
Vlasnički `saveDraft`/`publishDraft` NISU ograničeni (RFC §2.7 obećava
neograničene stavke) — vlasnik koji sam napravi > ~2045 stavki i dalje ruši
JAVNI upit (`collectPublishedRows`, 2 upita po stavci, docs/perf/menu-publish-ceiling.md).
Pravi lek nije ograničenje nego batch čitanje: `menuId` + `publishGeneration`
na `itemVariants`/`itemPairings` sa indeksom, pa učitavanje cele generacije bez
fan-outa. Po nalogu taska nije rešavano ovde. **Odloženo, čeka odluku vlasnika**
(zaseban task; do tada granica važi samo za uvoz).

### 4. Izbor rešenja za Rizik 10 („nema više" vs. objava sa nesačuvanim izmenama)

Izabrano: **server detektuje konflikt pri objavi, editor pita** (RFC-003 §3
Rizik 10 ažuriran). Odbačena alternativa „objava nikad ne gazi `available`":
editor ima pravi prekidač dostupnosti (`menu-editor-group-panels.tsx`), pa bi
pod „živo uvek pobeđuje" vlasnik iz editora nikad ne mogao da vrati stavku u
ponudu (zaglavljeno stanje), a zastareli autosave iz browsera (`true`) je po
vrednosti nerazlučiv od namernog uključivanja — samo čovek može da presudi.
Adminova objava u ime klijenta uvek zadržava živo „nema više". Ako vlasnik
ipak želi model bez dijaloga, `publishFromDraft` prima `onAvailabilityConflict`
pa je promena podrazumevanog ponašanja jedna linija. **Za svest vlasnika.**

### 5. `setItemAvailable` sa zastarelim id-jem generacije (pre-postojeća rupa)

Ako konobarov klijent drži `menuItems._id` iz generacije N, a u međuvremenu je
objavljena N+1, `setItemAvailable` patchuje mrtav red (uskoro obrisan
čišćenjem) i prebacivanje se tiho gubi. Nije uvedeno ovim taskom, nije dirano
(„NE ULAZI: izmena editora ili javnog rendera"; `setItemAvailable` ostavljen
hirurški netaknut). Lek: kad `item.publishGeneration !== menu.publishedGeneration`,
naći živi red po `key` i patchovati njega. **Odloženo, za sledeći task.**

### 6. Adminove izmene kroz zajednički editor: autosave se ne beleži

Admin prolazi `requireBusinessAccess` i može da uređuje meni u vlasničkom
editoru (`/{slug}/meni/editor`). Tamo `saveDraft` (autosave na 720 ms) NE
piše audit red — stotine redova po sesiji bi bile šum. Beleži se samo
događaj koji stiže do gosta: `publishDraft` sa admin akterom piše jedan red
`publish_menu` (`via: "editor"`). Sve mutacije u `convex/menuAdmin.ts` pišu
tačno jedan red. **Za svest vlasnika.**

### 7. PDF: standardni fontovi, samo latinica

PDF koristi neugrađene Helvetica/Helvetica-Bold uz WinAnsi + `/Differences`
za Ć ć Č č Đ đ (Š š Ž ž su u WinAnsi). Ćirilica ili drugo nelatinično pismo
ispisuje se kao „?". Ugrađivanje fonta (TTF subset, ~300 KB po rezu) je
naredni korak ako zatreba. **Za svest vlasnika.**

### 8. Podstranica se proverava kroz /dev/menu-admin-preview

`subpageActive("menu")` ostaje `false` do TASK-61, pa
`/admin/customers/<id>/menu` i dalje vraća 404 (provereno u browseru). Slučaj
`menu` u `SubpageBody` postoji i renderuje `MenuAdminSubpage`; do flipa se
otvara kroz `/dev/menu-admin-preview?businessId=…` (dev-only, `notFound()` u
produkciji, prava Convex sesija admina). TASK-61 samo ukloni `return false`.

---

## TASK-61 — terminalni flip Menija (RFC-003 §4)

### 1. `menus.serviceProfileId` ostaje `optional` — zatezanje na obavezno je ODLOŽENO

RFC-003 §4 (kriterijum TASK-61) traži: „backfills serviceProfileId onto existing
menus rows and, if that is possible without breaking existing rows, tightens
menus.serviceProfileId from optional back to required." Odluka: **polje ostaje
`v.optional`** u ovom komitu, uz isporučen idempotentan backfill
(`menuAdmin.backfillMenuProfiles`, internalMutation), a grantMenu od sada svakoj
novoj/postojećoj menu-instanci prikači aktivan `scanme_menu` profil.

**Zašto ne zatežem sada:** zatezanje polja iz optional u obavezno je u Convex-u
inherentno **dvofazni deploy** — `convex deploy` validira novu šemu PRE nego što
ijedna mutacija (uklj. backfill) može da se izvrši, pa bi deploy sa obaveznim
poljem odbio svaki postojeći `menus` red bez `serviceProfileId` (na dev
deploymentu ih ima od TASK-58/60 perf semena). Bezbedan redosled je: (1) deploy
sa poljem još `optional` + backfill, (2) `npx convex run menuAdmin:backfillMenuProfiles`
na prod, (3) tek onda zaseban deploy koji zateže polje na obavezno. Isti obrazac
kao „backfill specified-not-run" iz TASK-29. Čuvar editora je otporan (razrešava
profil i preko `serviceProfiles.by_businessId_and_type`), pa optional NE ostavlja
funkcionalnu rupu. **Za vlasnika:** posle potvrđenog prod-backfilla, zatezanje je
jednolinijska izmena (`v.id("serviceProfiles")` bez `v.optional`) + deploy.

### 2. Meni u `/kupovina` prodajnom skupu i dalje „USKORO" — netaknut

`scanme_menu → "menu"` je dodat u `PRICING_SERVICE_BY_SERVICE_TYPE` (motor ionako
ceni „menu"), ali to NE čini Meni prodavim kroz checkout: `convex/checkout.ts`
drži sopstveni 4-člani `serviceTypeValidator` (bez menija), a prodajna kapija u
`components/purchase/**` (`UNAVAILABLE_SERVICES`, „USKORO" bedž) je i dalje
vlasnikova odluka iz [[rfc-002-pricing-purchase]] / BLOCKED TASK-34 §1. Ovaj task
je NE dira.

### 3. Pre-postojeći pad admin podstranice `[service]` — POPRAVLJENO u TASK-61

Ruta `app/admin/customers/[businessId]/[service]/page.tsx` (server komponenta)
je pucala i u dev-u i u prod build-u sa `SUBPAGE_ORDER.includes is not a
function`: `isSubpageKey` je uvozio `SUBPAGE_ORDER` (const) iz `"use client"`
modula `location-admin.tsx`, što Next 16 pri uvozu u Server Component pretvara u
klijentsku referencu (proxy, ne niz). **Pre-postojeće, nije regresija ovog
taska:** identično je pucalo i za `…/venue` / `…/links` / `…/review` (koje
TASK-61 ne dira) — TASK-41 je isporučio rutu ali je QA radio kroz `/dev` fixture,
nikad kroz pravu `[service]` rutu (tada je i X509 pad Node-a v24 skrivao problem).

Pošto ovo direktno blokira kriterijum TASK-61 („lokal sa aktivnom scanme_menu
uslugom **renderuje** svoju Meni podstranicu"), **popravljeno je minimalnim,
bez-logičkim izdvajanjem**: `SUBPAGE_ORDER` + `SubpageKey` premešteni u novi
ne-`"use client"` modul `components/admin/subpage-keys.ts`; server ruta i
`location-admin.tsx` uvoze odatle (`location-admin` ih re-eksportuje radi
kompatibilnosti). Nijedna logika nije promenjena. Posle popravke sve četiri
podstranice (uklj. Meni) renderuju kroz pravu rutu — provereno u browseru
(prod `next start`, admin sesija).

## TASK-72 — admin UI za kreiranje i vezivanje kartica

### 1. Nema NOVIH odluka za vlasnika; nasleđene rupe nepromenjene
Task je bio potpuno izvodljiv nad postojećim (validiranim) backendom. Jedine
povezane otvorene odluke su **nasleđene** i ostaju netaknute: Links editor može
naknadno dodati `/m/` (TASK-37 §1) ili `/o/` (TASK-63 §1) na zamrznutu Links
stranicu — nova kartica ih GLASNO odbija pri kreiranju (dokazano), ali naknadna
izmena Links stranice nije pokrivena (dira zamrznuti proizvod). Bez promene.

### 2. `convex/cards.ts` — samo dva `export` (bez izmene logike, odobreno u ovom zadatku)
Da bi nove `requireAdmin` mutacije u `convex/cardsAdmin.ts` pokretale ISTU
validaciju (uključujući Links→Memories/poručivanje gejtove) bez dupliranja,
`validateTargetSpec` i `cardTargetSpecValidator` su dobili `export` — **nijedan
red logike nije menjan** (presedan već izvezenog `mintSpaceCards`). Ovu opciju je
vlasnik izabrao u ovom zadatku (naspram `ctx.runMutation` varijante). Nije
blokada — beleška radi jasnoće granice „samo čitaš i zoveš".

### 3. Browser QA: `/r/<kod>` vraća dev-server 500 (Jest worker), sredinski
Skeniranje kartice kroz `/r/<kod>` na dev serveru vraća Next „Jest worker
encountered child process exceptions" 500 — pad radničkog procesa dev servera na
toj (NETAKNUTOJ, TASK-14) ruti, ne u kodu ovog zadatka (cardsAdmin ga ne uvozi;
`cards.ts` izmena je samo `export`). Rezolucija skeniranja po vrsti je pokrivena
`convex/cards.test.ts`. Živa redirekcija nije mogla da se vizuelno potvrdi na dev
serveru; ostalo QA (kreiranje, grupno 20×, QR/link, prevezivanje, odbijanje) jeste.

### 4. Browser dokaz odbijanja: `cardUrlUnsafe` (ne Links→Memories)
QA lokal („Menu perf accent") nema Links stranicu sa `/m/` odredištem, pa je u
pregledaču demonstrirano čitljivo odbijanje preko nebezbednog URL-a: poruka
korisniku „Spoljašnja adresa mora biti javna https:// adresa." (dialog ostaje
otvoren, kartica se NE pravi). Tačno Links→Memories odbijanje
(„Memories iza Links razdelnika nije podržan… dva obrasca") deterministički je
dokazano testom `convex/cardsAdmin.test.ts` (assertuje i da audit red NIJE upisan).

---

## SAJAM v2 — B0 (ugovor i šema)

B0 je završen u granicama ugovora. Sporni delovi nisu rešavani pretpostavkom: odloženo, čeka odluku vlasnika. Detalji su u `docs/events/sajam-automobila-2026/FAIR-BACKEND-CONTRACT.md` §9 i `jovan-status/C0.md` §4.

### 1. HANDOFF §17 naspram runnera
HANDOFF traži Aleksin pregled B0 pre B1, a lanac nastavlja bez čekanja (`cekajOdobrenjeB0: false`). To je Jovanova odluka kao vlasnika backend-a, **nije Aleksino odobrenje**. Aleksa B0 pregleda naknadno, preko patch-a.

### 2. Odstupanja šeme od HANDOFF §5
Svako odstupanje ima zapisan razlog.
- **`fairSponsoredEvents.surface`** je samo `"garage"` (JOVAN-DELTA §2 zabranjuje map/display write).
- **`fairEmailDeliveries.leadId`** je opciono, jer `daily_report` i `exhibitor_delivery` nemaju lead.
- **`fairAudienceQuestions.externalKey?`** i indeks `by_eventId_and_externalKey` služe idempotentnom importu.
- **`fairSurveys.title`** je opciono, jer CSV nema naslov.
- **Placeholder vrednosti** za statuse `fairStands`/`fairSurveys` i dizajn `fairPassportConfigs`/`fairPassportEligibleModels`, jer HANDOFF ne zadaje vrednosti ni polja.

### 3. Dokumenti međusobno (odloženo, čeka odluku vlasnika)
- **Specifikacije**: CSV `04-specifications.csv` nema grupu ni `is_highlight`, a JOVAN-DELTA §3 ih traži.
- **Opis modela, `shortLabel` i ikonica**: EDS §9 i Kodeksov fixture ih imaju; HANDOFF i CSV nemaju.
- **„Završni izveštaj“ i agregat za organizatora iz PDF v10** nemaju model u `fairReportRuns` (`eventDayId` i `participationId` su obavezni).
- **„View“ stranice modela** (HANDOFF §5.2) nema tabelu i nije metrika u MASTER §12.
- **MASTER §17** kaže da je EVENT-DESIGN-SYSTEM „draft“, a dokument kaže „zaključan za prvi slice“. Važi li to i za mapu?
- **Poddomen `sajam.scanme.rs`** (Jovan) naspram zaključanog glavnog domena (MASTER §5/§14).

### 4. Kodeksov frontend (nije Jovanov opseg, prijavljeno)
- **`components/fair/model-actions-checkpoint.tsx:225–228`**: probna vožnja traži datum, što zabranjuju MASTER §4, §8 i §16.
- **Isti fajl**: `Zainteresovan sam` traži email **i** telefon, a MASTER §8 traži ime i bar jedan kontakt.
- **`app/sajam/**`** nema zaštitu u produkciji i statički generiše fixture stranicu sa izmišljenim specifikacijama.

### 5. Za B1
- `convex/lib/accessOperations.ts` (`applyDestination`, jedini pisac `accessDestinationHistory`) nije na B1 listi dozvoljenih fajlova.
- Mapiranje `brand/account/business_external_key` na postojeće zapise je otvoreno, jer `brands`/`accounts`/`businesses` nemaju `externalKey`.

---

## SAJAM v2 — B1 (katalog, import, paketi i QR dodela)

B1 je završen u granicama uputstva. Sporni delovi su rešeni najkonzervativnijim lako promenljivim seam-om i čekaju odluku vlasnika: odloženo, čeka odluku vlasnika. Detalji su u `FAIR-BACKEND-CONTRACT.md` §9 (tačke 16–21) i `jovan-status/B1.md`.

### 1. HANDOFF §17
B1 je rađen pre Aleksinog pregleda B0. To je Jovanova odluka u runneru, **nije Aleksino odobrenje**. Ako Aleksa promeni ugovor, to ide u zaseban korektivni korak.

### 2. `mapLocationId` jedinstvenost: B1 uputstvo naspram R0 nalaza 1
B1 uputstvo traži da seam `validateMapLocationIds` proverava „neprazno i jedinstveno po eventu“. R0 (nalaz 1) predlaže samo upozorenje, jer HANDOFF §5.1/§8 ne zabranjuje deljenu lokaciju. Primenjeno je uputstvo koraka (hard error `FAIR_MAP_LOCATION_TAKEN` među ne-povučenim štandovima). Ako Aleksa potvrdi da je deljeni štand legitiman, menja se samo provera u `convex/lib/fairCatalog.ts`.

### 3. Pisac brendova
Aplikacija nije imala mutaciju koja pravi red u `brands`. Bez nje `event_only` izlagač ne može dobiti brend, pa import pada sa `FAIR_LINK_NOT_FOUND`. Dodat je `fairAdmin.ensureBrand` (ista `brands` tabela, prazni logo/boje). Otvoreno: da li brend treba da nastaje u redovnom klijentskom toku.

### 4. Release QR-a i `accessDestinationHistory`
`accessDestinationHistory.targetId` je obavezan i ne postoji „prazna“ destinacija. Zato release ne piše novi target. Prekidač je `fairQrAssignments.status`: `destinationProblem` vraća `destination_fair_unassigned`, a kanal se u istoj transakciji prebacuje u `problem`. Ponovna dodela piše novi immutable target i red istorije.

### 5. Fajlovi van B1 liste
- `convex/lib/adminReadModelEngine.ts`: projekcija `clientSegment` u read modele (2 reda, samo kad je postavljen).
- `convex/lib/accessOperations.ts` **nije menjan**. Fair dodela ponavlja njegov `applyDestination` tok preko izvezenih helpera (`channelsFor`, `syncChannel`, `refreshInventory`) u `convex/lib/fairQr.ts`.

---

## SAJAM v2 — B1A (admin tab „Događaji“)

Tab je urađen. Sporni deo je rešen najkonzervativnijom vizuelnom izmenom i čeka odluku vlasnika: odloženo, čeka odluku vlasnika. Detalji su u `docs/events/sajam-automobila-2026/jovan-status/B1A.md` §6.

### 1. Deveti glavni tab i desktop navigacija na 1280–1535 px
B1A traži da ostali tabovi rade isto kao pre. Deveti tab ne staje u desktop navigaciju na 1280 px. Merenje pokazuje da ni postojećih 8 tabova nije stalo (645 px u ćeliji od 597 px). Zato je u `components/admin/admin-shell.tsx` navigacija kompaktnija samo u opsegu `xl`–`2xl` (manji padding i font stavki, manji razmak u zaglavlju). Od 1536 px izgled je identičan, a linkovi, redosled i ponašanje su nepromenjeni. Otvoreno: da li je ovo prihvatljivo i gde tab treba da stoji (sada posle „Usluge“).

### 2. Dev preview van liste fajlova
Lanac nema admin sesiju i ne unosi lozinke, pa je za proveru očima dodata `app/dev/admin-events-preview/page.tsx`, po obrascu postojećih `app/dev/admin-*-preview` ruta. U produkciji vraća `notFound()`.

## SAJAM v2 — B2 (anonimni identitet i skenovi)

Kod, testovi, ugovor i DEV dokaz su urađeni (`docs/events/sajam-automobila-2026/jovan-status/B2.md`). Stavka o okruženju (§1) je rešena; ostale stavke su otvorena pitanja za vlasnika.

### 1. Okruženje i vitest timeout — REŠENO (Jovan, 3. 10. 2026. 22:25)
U pokušajima a1 i a2 mašina je radila na bateriji i bila je deljena sa noćnim lancem drugog projekta. Hladan start prvog testa u svakom Convex test fajlu tada je trajao 5,2–11 s, pa su obični `npx vitest run fair` i `npm test` padali samo na podrazumevanom timeout-u od 5 s. Nijedna asercija nije pala.

Jovanova odluka (`scripts/tasks/logs/sajam-v2/B2-pad-a2.md`, `_ZAJEDNICKO.md` §5): runner pušta testove sa `--testTimeout=30000 --hookTimeout=60000`, ne čeka se struja. Sa tim komandama (pokušaj a3, 22:25):
- `npx vitest run fair` → 12 fajlova, 113/113;
- `npm test` → 2 pala / 1354 prošlo, i to samo postojeći `adminProducts` 10k perf i `memoriesHost` iz B1A polaznog stanja.

Testovi, timeout-i u kodu i vitest konfiguracija nisu menjani. Nisu dirana sistemska podešavanja napajanja ni tuđi procesi.

### 2. Tajna `FAIR_VISITOR_HASH_SECRET`
Pravu vrednost (32+ nasumičnih znakova) postavljaju Jovan i Aleksa u Next okruženje (Vercel/`.env.local`); Convex je ne treba. Bez nje produkcija ne upisuje fair skenove, a QR preusmerenje radi. DEV koristi označen DEV-ONLY ključ.

### 3. Domen cookie-ja
`FAIR_COOKIE_DOMAIN` je samo seam i ostaje prazan (host-only, glavni domen). Poddomen `sajam.scanme.rs` nije implementiran: MASTER i V2 zaključavaju glavni domen; odluka je Aleksina (`FAIR-BACKEND-CONTRACT.md` §13.7).

### 4. Definicije koje čekaju potvrdu (`FAIR-BACKEND-CONTRACT.md` §9.24–§9.28)
Jedinstveni sken štanda = zbir jedinstvenih parova posetilac+model; unique po danu = dan prvog skena; admin sken ne daje pečat pasoša; objavljen model u `draft` događaju je dostupan preko `/r`; generički `cardResolve` (300/min po IP-u) ostaje ispred fair grane do testa opterećenja (B7). „View“ stranice modela se ne beleži (§9.8).

## SAJAM v2 — M1 (javna mapa)

Mapa je urađena (`docs/events/sajam-automobila-2026/jovan-status/M1.md`). Ništa nije zaustavljeno; ovo su konflikti i odluke za komandni centar.

### 1. Token `event.scanmeStand` ne postoji u `app/sajam/fair-event.css`
EDS §5.1 definiše `event.scanmeStand` (`#C6FF4A`), ali Kodeksov `fair-event.css` nema `--fair-*` pandan. Mapa koristi vrednost iz EDS-a kao lokalnu promenljivu `--fair-map-scanme`, postavljenu isključivo na ScanMe lokaciju. Predlog: Kodeks dodaje `--fair-scanme-stand` u token sloj, pa mapa prelazi na njega.

### 2. ScanMe štand se još ne prikazuje
Položaj ScanMe štanda nije na mapama organizatora (M0, otvoreno pitanje 1), pa mapa prikazuje samo lokaciju potvrđenu kod organizatora. Placeholder iz M0 se javno ne crta. Kada Aleksa potvrdi položaj, menja se samo `placement` u `lib/fair-map/*.ts`.

### 3. Stranica modela još radi nad fixture-om
`app/sajam/[eventSlug]/model/[modelSlug]` (Kodeks, F3) čita samo Audi fixture. Linkovi sa mape na prave/TEST modele zato trenutno vode na „Model nije pronađen“ dok F3 ne pređe na `fairPublic.getModelBySlug`.

## SAJAM v2 — B7 (brisanje PII, authz, performanse, integracioni seed)

Kod, testovi, ugovor (§23–§26) i DEV dokaz su urađeni (`docs/events/sajam-automobila-2026/jovan-status/B7.md`). Ništa nije zaustavljeno. Ovo su odluke za Aleksu i Jovana, sve konzervativno ostavljene dok se ne odluči.

### 1. Podaci izlagača i brisanje 16. 11. (MASTER §13 naspram klijentskih podataka)
MASTER §13 traži brisanje „email … i drugih podataka koji mogu identifikovati lice“. Purge briše sve podatke posetilaca i ceo outbox (i `daily_report` isporuke). Ne briše adresu i napomenu izlagača (`fairParticipations.reportRecipientEmail`, `leadDeliveryNote`) ni `fairReportRuns.recipient`, jer su to podaci klijenta. Brisanje je nepovratno, pa je ostavljeno za odluku. Ako treba, dodaje se jedna kategorija koja briše samo ta polja (`FAIR-BACKEND-CONTRACT.md` §9.61).

### 2. Lokalne kopije PII
Preuzete CSV/XLSX kontakte na računarima tima backend ne vidi. Potrebna je ručna čeklista 16. 11. za Aleksu, Jovana i Teodoru (§9.62).

### 3. Ručni test 8. 10. zavisi od frontenda i hosta
- Stranica modela (Kodeks F3) za TEST modele vraća 404, iako `/r/<kod>` vodi na tačnu putanju (postojeći M1 konflikt 3).
- Telefonima treba HTTPS host vezan za DEV Convex, sa `FAIR_VISITOR_HASH_SECRET`; deploy ne radi agent (§9.68).

### 4. Integritet metrika (authz nalaz)
Javne visitor mutacije prihvataju svaki ispravan hash, pa direktni pozivi Convex-a mimo gateway-a mogu da napumpaju glasove, ocene i skenove. PII ne curi. Predlog je zajednička tajna gateway → Convex; to traži env promenljive i izmenu `cards.ts`/`app/r`, što je van B7 opsega (§9.65).

### 5. NAT hale
Generički `cardResolve` je 300 skenova odjednom pa 5/s po IP adresi (testirano). Ako hala ima javni Wi-Fi, vrh preko toga dobija stranicu nevažeće kartice (§9.66).

## SAJAM v2 — RF i IZ (završni pregled i izveštaj, stanje 4. 10. 2026.)

Presuda završnog pregleda je **TREBA DORADA PRE INTEGRACIONOG TESTA** (`scripts/tasks/logs/sajam-v2/RF-IZVESTAJ.md`). Sažetak za vlasnike je u `docs/events/sajam-automobila-2026/jovan-status/IZVESTAJ.md`. Ništa nije rešavano pretpostavkom; sve čeka odluku vlasnika.

### Stanje ranijih odeljaka
- **B2 §1 (timeout):** rešeno.
- **B0 §1, B1 §1, B1A** (rad pre Aleksinog pregleda B0 i navigacija): i dalje otvoreno. Čeka naknadno Aleksino odobrenje.
- **B7 §4 (integritet metrika):** rešeno u K1 (`422224c`, `jovan-status/K1.md`).
- **B7 §3 (F3 i HTTPS host):** i dalje blokira ručni test 8. 10.
- Ostale stavke B0–B7 važe kako su upisane.

### 1. Korektivni korak pre 8. 10. — REŠENO u K1–K4 (dopuna IZK, 4. 10.)
Urađeno: K1 `422224c`, K2 `3f549bf`, K3 `638fd67`, K4 `b0c83f2`. Presuda RK je SPREMNO ZA INTEGRACIONI TEST (`scripts/tasks/logs/sajam-v2/RK-IZVESTAJ.md`). Za istoriju, prvobitni opis:
- **1:** tajna gateway → Convex i limit novih identiteta po IP hash-u;
- **2:** displej osvežava rotaciju i rezultat glasanja (`app/sajam/[eventSlug]/_mapa/map-section.tsx` čita samo jednom);
- **3:** tvrdi prekidač za leadove i poseban prekidač za follow-up;
- **4:** ručna izrada izveštaja pre kraja dana blokira automatski dnevni izveštaj (`convex/fairReports.ts:431-444`).

Nalazi 1 i 3 traže nove env promenljive, koje agent ne postavlja.

### 2. Purge bez ručnog odobrenja (MASTER §13)
Cron sam pokreće pravo brisanje 16. 11. u 00:00, a MASTER kaže „nakon odobrenog pokretanja“. Aleksa bira: automatski ili uz admin odobrenje. Posle purge-a broj leadova i odgovori ankete u novim izradama izveštaja su 0 (RF nalaz 5).

## SAJAM v2 — K1 (tajna gateway Next → Convex, RF nalaz 1)

Kod, testovi i ugovor (§27) su urađeni (`docs/events/sajam-automobila-2026/jovan-status/K1.md`). Ništa nije zaustavljeno. RF nalaz 1 i B7 §4 su rešeni u kodu. Ostaje jedan produkcijski preduslov i dve odluke; ništa od toga agent ne radi sam.

### 1. Produkcijski preduslov: `FAIR_GATEWAY_SECRET` pre deploya
Aleksa ili Jovan postavljaju novu vrednost (32+ nasumičnih znakova, različitu od DEV) u Convex prod env i u Vercel prod env, i to **pre** deploya ovog koda. Bez nje su svi fair skenovi i interakcije ugašeni (fail closed), a QR redirect radi. Čeklista je u ugovoru §27.6. DEV (`expert-pelican-136` i `.env.local`) je runner već podesio; sken na :3100 je potvrdio da se vrednosti poklapaju.

### 2. Veličina limita novih identiteta po IP-u (odluka uz §9.66)
`fairVisitorCreate` je 300 odjednom, pa 120/min po IP HMAC-u. Računica (oko 100 novih uređaja u minuti na vrhu, cela prostorija iza jednog NAT-a odjednom) je procena bez stvarnih brojeva posetilaca. Ako hala ima javni Wi-Fi ili očekivana poseta znatno premašuje 10.000 dnevno, broj treba potvrditi ili povećati. Menja se jedan red u `convex/lib/rateLimits.ts`.

### 3. Ključ IP HMAC-a je `FAIR_VISITOR_HASH_SECRET`
Rotacija te tajne menja i ključ IP bucket-a, pored već poznatog resetovanja jedinstvenih posetilaca (RF nalaz 6). To je prihvatljivo, jer stanje bucket-a traje samo minute.

## SAJAM v2 — IZK (stanje posle korekcija K1–K4, 4. 10. 2026.)

RF nalazi 1–4 su rešeni. Izvori: `jovan-status/K1.md`–`K4.md` i `scripts/tasks/logs/sajam-v2/RK-IZVESTAJ.md`; čeklista env promenljivih je u `jovan-status/IZVESTAJ.md` §0. Agent ne postavlja nijednu vrednost.

### 1. I dalje blokira test 8. 10. (van lanca)
- Kodeks F3: stranica modela još čita fixture, pa posle QR-a vraća 404 (B7 §3).
- HTTPS host vezan za DEV mora imati `FAIR_VISITOR_HASH_SECRET` **i** `FAIR_GATEWAY_SECRET` (istu vrednost kao Convex DEV). Convex DEV tajnu je runner već postavio.

### 2. Otvorena pitanja iz K koraka (čekaju Aleksu ili Jovana)
- **K1:** veličina `fairVisitorCreate` (300 odjednom, 120/min po IP-u) uz Wi-Fi hale (§9.66). Produkcijski `FAIR_GATEWAY_SECRET` se postavlja pre deploya (ugovor §27.6).
- **K2:** error boundary za displej ako upit rotacije baci grešku (K2 §7.1).
- **K3:** ko i kada uključuje `FAIR_LEADS_ENABLED`/`FAIR_FOLLOWUP_ENABLED` (ugovor §28.4). Otvoreno je i:
  - da li `skipped` posle gašenja treba da bude konačan;
  - sadržaj zapisa pravnog odobrenja;
  - provera da tekst imenuje ScanMe;
  - vidljivost stanja prekidača u adminu (K3 §7).
- **K4:** šta sa run-om napravljenim pre zatvaranja dana koji je postojao pre K4 (§9.70). Ponoć ili radno vreme hale (§9.54).
- **RF nalazi 5–17:** neizmenjeni, uključujući 12 i 13. Do ispravke: displeji uvek sa `?prikaz=ekran`, a test telefoni ne smeju biti prijavljeni kao admin.

## SAJAM v2 — A4 (QR inventar: dodela u većem broju)

- **Konflikt:** `ADMIN-UX-ZAHTEVI.md` §5 kaže da se u dodeli u većem broju model zadaje kao „`externalKey` ili naziv“, a uputstvo koraka A4 kaže „`externalKey` ili ID“.
- **Šta je urađeno:** implementirano je uže pravilo iz uputstva koraka (`externalKey` ili Convex ID modela). Prepoznavanje po nazivu nije urađeno: naziv nije jedinstven (isti model kod dva izlagača, varijante), a pogrešno poklapanje bi poslalo nalepnicu na pogrešan auto.
- **Pitanje za Aleksu/Jovana:** da li treba i prepoznavanje po nazivu (npr. samo kad je naziv + varijanta jedinstven u događaju, a inače greška „naziv nije jednoznačan“)? Deferred, awaiting owner decision.

## SAJAM v2 — A7 (automatski pasoš brenda)

- **Konflikt (uslov):** `ADMIN-UX-ZAHTEVI.md` §6 i uputstvo A7 kažu „najmanje 2 objavljena modela, svi najmanje Starter“; MASTER §11 kaže „najmanje dva izložena modela i svi imaju najmanje Starter“ i „svi relevantni modeli brenda uključeni/validni za pasoš“; kod od B3 (ugovor §9.31) traži da su svi izloženi (ne-povučeni) modeli objavljeni, kandidati (`passport_eligible`) i Starter+.
- **Šta je urađeno:** automatski pasoš koristi strože B3 pravilo (preporuka A0 R2a), sada u jednoj funkciji `fairBrandPassportProblems` sa razlogom u adminu. Primer razlike: brend sa 2 objavljena Starter modela i trećim modelom u nacrtu nema pasoš dok se i treći ne objavi („1 od 3 modela nije objavljeno.“).
- **Odluka za Aleksin pregled:** automatski pasoš sa sakrivanjem je razlika prema dosadašnjem ručnom pravilu (ADMIN-UX §12.2); ugovor §33.1.
- **Pitanje za Aleksu/Jovana:** da li model u nacrtu (ili model sa `passport_eligible=no`) treba da blokira pasoš celog brenda, ili samo da ostane van skupa (§9.31)? Promena je jedno pravilo u `lib/fair-entitlements.ts`. Deferred, awaiting owner decision.

## ADMIN UX — stanje posle lanca A1–A10, Z1, Z2 i pregleda RA (6. 10. 2026.)

Presuda RA: **TREBA DORADA**. Izvori: `scripts/tasks/logs/sajam-v2/RA-IZVESTAJ.md` i `docs/events/sajam-automobila-2026/jovan-status/IZVESTAJ-ADMIN-UX.md`. Kod nije menjan posle RA.

- **Pre uključivanja Pošte (`ZOHO_MAIL_CLIENT_ENABLED`):** `registerMailUpload` (`convex/adminMail.ts:803-846`) prihvata bilo koji `_storage` id, pa admin može da obriše ili pošalje tuđe fajlove. Treba rezervacija uploada i provera svežine fajla. Do ispravke Pošta ostaje isključena.
- **Follow-up:** par se traži među prvih 500 leadova izlagača (`convex/lib/fairLeadActivity.ts:40-46`); opt-out na novijem leadu para se tada ne vidi. Predlog: indeks po normalizovanom emailu.
- **QR lista:** filteri samo nad učitanih 100 kodova (`components/admin/events/sections/qr-section.tsx:25-31`).
- **Odluke za Aleksu** (ADMIN-UX §12): automatska sponzorisana lista, automatski pasoš sa sakrivanjem, follow-up po izlagaču, aktivnost uz lead, lična Zoho sanduča, PII izvoz u Leadovima; plus promene prikaza V1 ekrana (`A1.md` §7). Deferred, awaiting owner decision.
- **Podešavanja koja runner ne radi:** Zoho EU klijent i Convex env Pošte; `FAIR_LEADS_ENABLED` i `FAIR_FOLLOWUP_ENABLED` pre otvaranja sajma; pravna provera saglasnosti pre aktivacije.

## SAJAM v2 — N6 (stranica automobila i forme, 8. 10. 2026.)

- **Konflikt (okruženje):** uputstvo N6 i runnerova lista dozvoljenih putanja (`SajamRun.ps1`, `$AllowNmodel`) dozvoljavaju `lib/fair-client/**`, ali Claude podešavanja runnera (`scripts/sajam/claude-settings.json`, `Edit(./lib/fair-client/**)` u `deny`) to i dalje zabranjuju, pa je upis odbijen. Agent zabranu nije zaobilazio.
- **Šta je urađeno:** čist adapter projekcije i logika forme su u `components/fair/model-view.ts` i `components/fair/lead-form-model.ts` (dozvoljena putanja), sa testovima u `components/fair/*.test.ts(x)`. Zato je u `vitest.config.ts` dodat `components/fair/**/*.test.{ts,tsx}` (jedini fajl van opsega, `jovan-status/N6.md` §5).
- **Za Jovana:** ako adapter treba da bude u `lib/fair-client/`, ukloniti `Edit(./lib/fair-client/**)` iz `scripts/sajam/claude-settings.json` za korake koji ga smeju menjati i premestiti dva fajla (uvoz se menja samo u `app/sajam/[eventSlug]/model/[modelSlug]/page.tsx` i `components/fair/*`). Deferred, awaiting owner decision.
- **Otvoreno (proizvod):** ocena i Glas publike su sakriveni na pravim modelima (rade samo na DEV fixture-u, sa polovinama zvezdica i localStorage glasovima); `direct_view` se ne šalje jer ne postoji QR entry marker koji bi QR ulaz razlikovao od direktnog. Povezivanje je sledeći korak (F5/F6, G20).

## NOĆNI LANAC 8. 10. — RN: TREBA DORADA (stanje posle IZN)

Izvori: `scripts/tasks/logs/sajam-v2/RN-IZVESTAJ.md`, `docs/events/sajam-automobila-2026/jovan-status/IZVESTAJ-NOC-2026-10-08.md`. Commitovi N1–N6: `b8d518b` … `1278638`. Gejtovi runnera su zeleni. IZN kod ne menja, pa je sve ispod otvoreno.

- **Pre produkcijskog deploya (dorada koda):**
  - fotografija pravog modela ide kroz `next/image` bez `unoptimized`, a dozvoljen host je samo `*.convex.cloud` (`components/fair/fair-model-page.tsx:225-233`);
  - kod duplikata leada forma navodi novu adresu za potvrdu (`components/fair/lead-form.tsx:154`);
  - `replaceModelSticker` nema proveru očekivane nalepnice automobila (`convex/lib/fairQr.ts:531-535`);
  - `getEventMap` prikazuje učešća u nacrtu (`convex/fairPublic.ts:302,320`);
  - ScanMe zelena zavisi od zauzetosti štanda 14, a hover je gazi (`fair-map-canvas.tsx:363-369`, `fair-event-map.module.css:545`).
- **Podaci na produkciji (Aleksa):**
  - `linkEventQrInventory`, `importSiteExhibitors` i `placeSiteExhibitors` za produkcijski događaj;
  - provera da nema `FAIR_MAP_LOCATION_INVALID` (uklonjene lokacije S1–S5, 20/21/22, 12/13/15);
  - `venueName`; TEST događaji nisu vezani za SA26 inventar.
- **Leadovi:** zatvoreni dok saglasnost nije stručno proverena (`FAIR_LEADS_ENABLED`, `FAIR_EMAIL_REPLY_TO`). Deferred, awaiting owner decision.

## SAJAM v2 — P3 (stranica modela na pravom API-ju, anketa, deljeni kontakt blok; 8. 10. 2026.)

### 1. Tekst saglasnosti čeka stručnu pravnu proveru (MASTER §19 P0)
Lead tokovi (`Zainteresovan sam`, `Probna vožnja`, opcioni kontakt u anketi) prikazuju tekst saglasnosti sa servera (`getLeadForm`) i šalju samo uz `Prihvatam`. Konačan tekst još nije pravno proveren. Za DEV proveru treba u TEST događaju (`test-elektromobilnost-2026`) aktivirati tekst koji počinje sa „TEST – nije pravni tekst“. To se radi kroz admin „Događaji“ i traži admin prijavu; stanje 8. 10.: još nije unet. Taj tekst nije pravni i ne sme na PROD. Pravi događaj `elektromobilnost-2026` nema aktivnu saglasnost, pa njegovi obrasci prikazuju „Trenutno nedostupno“ dok se tekst ne odobri.

### 2. Pravni naziv izlagača
Saglasnost imenuje izlagača preko `businesses.name`. Posebno polje za pravni naziv ne postoji (`JOVAN-DELTA-2026-10-08.md` §6). Ako pravna provera traži pravni naziv, potrebno je backend polje. Do tada se prikazuje naziv klijenta.

### 3. Upozorenje pri zatvaranju sheet-a sa unetim podacima
EVENT-DESIGN-SYSTEM §6 kaže da se sheet sa nepotvrđenim unosom ne zatvara bez upozorenja. Lead sheet-ovi to ne rade, isto kao prototip. Čeka se odluka da li je potrebno.

## SYNC 8. 10. — RD: SPREMNO ZA DEPLOY, D2 nije rađen (stanje posle IZD)

Izveštaj: `docs/events/sajam-automobila-2026/jovan-status/IZVESTAJ-SYNC-2026-10-08.md`.

- **Uslovi deploya:**
  - Convex pre Vercel-a, zbog novih argumenata `at` i `expectedModelStickerCode`;
  - migracija paketa: dry-run, pa stvarno;
  - reset pre-event podataka pre 00:00, ako ga Aleksa odobri.
- **Otvoreni nalazi RD (D2 nije radio):**
  - zona dodira na velikim štandovima (`lib/fair-map/touch.ts`);
  - izmena pitanja posle „Otvori sada“ (`convex/fairInteractionsAdmin.ts:126`);
  - „Poveži“ zavisi od redosleda deploya (`lib/admin-v1/qr-link.ts:172`).
- **Čeka odluku:**
  - pravni tekst saglasnosti (P3 §1);
  - pasoš i spoljni URL fotografije;
  - javni naziv na mapi.

## SPOJ I MAPA 9. 10. — AUTO1.com posle uklanjanja zone „Zadnji deo“

Vlasnik (Jovan, u četu 9. 10.): „Zadnji deo“ ne postoji; postoje samo Hala i Ispred hale. Zona je uklonjena sa mape (grana `codex/jovan-spoj-aleksa-2026-10-09`).

- **Na DEV-u (`expert-pelican-136`)** AUTO1.com ima aktivno učešće i aktivan štand sa `mapLocationId: "zadnji-deo"`. Podaci nisu dirani: AUTO1 se sada vidi u spisku izlagača (Usluge i grad) sa „Tačno mesto još nije na mapi organizatora“, a na mapi ga nema.
- **Otvoreno:** gde u hali tačno stoji AUTO1 (štand na mapi hale) ili da li ga treba skloniti sa sajma. Do odluke ostaje bez mesta.
- **Backend:** vrednost `zadnji-deo` je i dalje dozvoljena u `fairMapZoneId` (Convex validator) i `FAIR_MAP_ZONE_IDS`, jer je sačuvana u podacima. Uklanjanje traži čišćenje podataka i Convex deploy (Aleksa).

## SAJAM SUPER 9. 10. — dva odstupanja od Garaže/Pasoša (REŠENO istog dana po briefu Koraka 2)

> **Rešeno:** Jovanov brief za Korak 2 traži „ista dugmad“ i „zajedničke delove (zaglavlje, meni)“ kao u Garaži i Pasošima.
>
> - „Sačuvaj u garažu“ je sada crno, kao „Pogledaj“. Ponašanje je isto.
> - Glas publike ima standardno sajamsko zaglavlje. Red „nazad + GLAS PUBLIKE / model“ ostaje isti i nalazi se ispod zaglavlja, kao na detalju pasoša.
>
> Ako vlasnik želi staro stanje, svaka stavka se vraća jednim pravilom ili jednom linijom. Opis ispod je stanje pre rešenja.

Nezavisni pregled doslednosti (Korak 2, `jovan-status/SAJAM-SUPER-2026-10-09.md`) prijavio je dva mesta koja nisu ista kao referenca. Vlasnikove saglasnosti nema, pa je izabrana konzervativna opcija: obe stvari ostaju kakve su bile. Izgled im je usklađen samo tamo gde se ne menja ni dizajnerska odluka ni sadržaj. **Deferred, awaiting owner decision.**

### 1. Boja dugmeta „Sačuvaj u garažu“ na stranici modela

- **Sada:** plava boja akcenta, kao u Aleksinom dizajnu model page v2. Uglovi `md` 12, ivica 1 px i senka 2 već su kao u garaži.
- **Pitanje:** da li dugme treba da bude crno (`--fair-ink`), kao „Pogledaj“ u garaži?
  - Garaža ima oba primarna stila: crno dugme-alat („Pogledaj“) i dugme u boji akcenta („Otvori mapu sajma“ u praznoj garaži).
  - `FAIR-DESIGN-DNA.md` §9 vodi glavnu radnju u boji akcenta, a alat u crnoj.
- **Izmena:** jedno pravilo u `app/sajam/fair-event.css` (`.fair-save-dock`, pozadina i ivica). Ponašanje se ne menja.

### 2. Zaglavlje toka Glasa publike

- **Sada:** strelica nazad i centrirano „GLAS PUBLIKE / model“, bez lockup-a i menija sajma. Pozadina, linija preko cele širine i dugme nazad (`md`) usklađeni su sa zaglavljem sajma.
- **Pitanje:** da li Glas publike dobija standardno sajamsko zaglavlje (lockup i Mapa · Pasoši · Garaža), sa strelicom nazad u sadržaju, kao na detalju pasoša?
- **Zašto nije urađeno:** to menja strukturu i navigaciju toka. Korak 2 kaže da se ponašanje i sadržaj ne menjaju.

## ADMIN v2 X1 (12. 10. 2026.) — korak je završen, ali ga provera cilja ne propušta (REŠENO 12. 10. 2026.)

> **Dopuna** (napomena runnera u `scripts/tasks/logs/admin-v2/X3-pad-a3.md`, 12. 10. u 18 h): provera cilja je isključena u celom lancu; konačni sudija je runner. Prijavu na pravi `/admin` niko ne traži od koraka.

> **Rešeno:** uslov cilja koraka je ispravljen (napomena runnera u `scripts/tasks/logs/admin-v2/X1-pad-a3.md`). Prijava na pravi `/admin` nije deo cilja i nije potrebna: čuvar (`AdminGuard`) se dokazuje testom i proverom bez prijave, što je urađeno (`docs/admin/v2/X1.md`, odeljak 10). Korak X1 je potvrđen. Opis ispod je stanje pre rešenja.

Kod, testovi, snimci, recept i beleška koraka X1 su završeni i gejtovi su čisti (`docs/admin/v2/X1.md`). Lanac je ipak stajao na X1 u tri pokušaja. **Deferred, awaiting owner decision.**

- **Šta se dešava:** provera cilja sesije (Stop hook) za stavku „AdminGuard štiti isto kao pre“ traži pregled pravog `/admin` sa stvarnom prijavom. Lanac to ne sme (`scripts/admin-v2/pravila.md`: „ne prijavljuješ se i ne unosiš lozinke“), a naloga ni sesije u okruženju nema. Zato se sesija nije završavala redom `KORAK X1 GOTOVO` i runner je dobijao praznu poslednju poruku (`scripts/tasks/logs/admin-v2/X1-pad-a1.md`, `X1-pad-a2.md`).
- **Šta je dokazano bez prijave:** `docs/admin/v2/X1.md`, odeljak 10 (isti čuvar i izvor, isti ishod za svaki odgovor upita `admin.me`, ista pokrivenost 30 stranica, četiri stanja čuvara u pregledaču).
- **Odluka za vlasnika:** ili se prijavi na DEV-u, prođi Dashboard → Klijenti → Događaji → Modeli i prihvati X1 ručno, pa pusti lanac od X2; ili u uslovu cilja koraka precizira da se čuvar dokazuje testovima i pregledom bez prijave.

## ADMIN v2 X2 (12. 10. 2026.) — korak je završen, ali ga provera cilja ne propušta (REŠENO 12. 10. 2026.)

> **Rešeno u popravci a2** (`scripts/tasks/logs/admin-v2/X2-pad-a1.md`, `docs/admin/v2/X2.md`, odeljak 11). Uslov popravke od koraka traži `tsc`, testove, lint i `git diff --check`; `harness:check` i snimke runner pušta sam. Pošta je u popravci preseljena u sidebar: tu odluku je doneo korak, sa moći odluke koju je vlasnik dao lancu, a ne vlasnik lično; pretraga Pošte je ostala jedan poziv Zoho-u po pretrazi (piše se na Enter). „Isti rezultati kao pre“ su dokazani jednakošću argumenata upita. Opis ispod je stanje pre rešenja.

Kod, testovi, snimci, recept i beleška koraka X2 su završeni, a gejtovi koje korak sme da pusti su čisti (`docs/admin/v2/X2.md`, odeljak 7). Provera cilja sesije (Stop hook) je ipak odbila kraj koraka više puta zaredom, poslednja tri puta zbog istih stavki koje korak ne sme ili ne može da ispuni. **Deferred, awaiting owner decision.**

1. **Traži da korak sam pusti `harness:check` i Convex gejt i uporedi ih sa početnim stanjem.** Pravila lanca to zabranjuju: „Ne pokrećeš drugi `next dev` ni `harness:check` (pušta ga runner, sa sopstvenim dev serverom)“ i „`npx convex dev --once` pokrećeš samo kad si dodao ili promenio Convex funkcije“. Uslov cilja koraka navodi samo `tsc`, testove, lint i `git diff --check`.
   - *Dokazano bez pokretanja:* `convex/**` i `harness/**` nisu menjani; `npx tsc --noEmit -p convex/tsconfig.json` je čist; stranica koju harness crta (`/dev/template-gallery`) uvozi 26 fajlova repoa i nijedan nije izmenjen u koraku (`tmp/admin-v2-rad/x2/harness-ulazi.mjs`). Runner će `harness:check` pustiti sam, jer korak menja `lib/i18n/types.ts` (samo tipovi), a Convex gejt neće, jer korak ne menja `convex/*`.
2. **Pošta (`/admin/posta`) i dalje ima foldere, „Sve / Nepročitane“ i pretragu u ekranu.** Provera to čita kao „lista sa filter blokom“. `tmp/admin-v2-2026-10-11/ZADATAK.md` §3 („Šta ide gde“) ne navodi Poštu, plan kaže „Pošta: u X2 samo okvir i zaglavlje“ (`docs/admin/v2/X0-PLAN.md`, odluka 7), a uslov cilja nabraja deset stranica bez nje. Selidba bi promenila i ponašanje: pretraga Pošte ide Zoho-u na dugme „Traži“, a pretraga u sidebaru piše posle 250 ms.
3. **„Filtriranje daje iste rezultate kao pre“ traži pokrenut stari UI.** Za to treba drugi `next dev` ili `git checkout`, a oba su zabranjena. Umesto toga je kod filtera isečen doslovno iz HEAD-a i izvršen uporedo sa novim putem za svaku kombinaciju filtera (37.926 kombinacija, 0 razlika u argumentima upita; `tmp/admin-v2-rad/x2/pre-posle.mjs`, tabela u `docs/admin/v2/X2.md`, odeljak 7). Dve namerne razlike su opisane u odlukama 20 i 21 iste beleške.

**Odluka za vlasnika:**
- prihvatiti X2 na osnovu gejtova runnera (on pušta `harness:check`) i beleške, ili u uslovu cilja precizirati da `harness:check` i Convex gejt pušta runner, a da se „isti rezultati“ dokazuju jednakošću argumenata upita;
- reći da li Pošta treba da pređe u sidebar (i da li njena pretraga sme da ide Zoho-u bez dugmeta); ako da, to je poseban korak.

### Posle popravke a2: provera cilja sesije i dalje ne propušta korak (REŠENO 12. 10. 2026.)

> **Rešeno** (napomena runnera u `scripts/tasks/logs/admin-v2/X3-pad-a3.md`, 12. 10. u 18 h): provera cilja je isključena u celom lancu. `harness:check` i Convex gejt pušta runner posle koraka, a potvrdu runnera i pregled sa prijavom niko ne traži od koraka. Opis ispod je stanje pre rešenja.

Popravka je završena i gejtovi koje korak sme da pusti su čisti (`docs/admin/v2/X2.md`, odeljci 7 i 11). Provera cilja sesije (Stop hook) je i u popravci odbila kraj tri puta zaredom, svaki put zbog iste tri stavke koje korak ne može da ispuni. **Deferred, awaiting owner decision.**

1. **Traži potvrdu runnera u transkriptu.** Runner radi tek kad se sesija završi, pa njegove potvrde u transkriptu ne može biti.
2. **Traži pregled pravog `/admin`, i Pošte sa Zoho nalogom.** Pravila lanca i sam uslov cilja to zabranjuju („Prijava na pravi /admin je zabranjena i nije deo cilja“).
3. **Traži da korak sam pusti `harness:check` i Convex gejt.** Pravila lanca to zabranjuju; `convex/**` nije menjan.

Šta je urađeno umesto toga, bez kršenja pravila (sve u `docs/admin/v2/X2.md`, odeljak 7): stari UI iz HEAD-a i novi UI upoređeni u pregledaču (preview: 164 izbora, isti redovi; prave stranice sa zamenom za Convex: 218 izbora, 0 različitih argumenata upita); poređenje sa `harness/goldens` samo za čitanje (177 × 2, 0 razlika); provere koje runner radi posle koraka ponovljene samo za čitanje (0 problema).

Korak se zato završava redom „KORAK X2 GOTOVO“: razlozi iz `scripts/tasks/logs/admin-v2/X2-pad-a1.md` su rešeni, a presuda ostaje na gejtovima runnera. **Predlog za vlasnika:** u tekstu provere cilja reći da se potvrda runnera, pregled sa prijavom i `harness:check` / Convex gejt ne traže od koraka.

## ADMIN v2 X3 (12. 10. 2026.) — korak je završen, ali ga provera cilja ne propušta (REŠENO 12. 10. 2026.)

> **Rešeno** (napomena runnera u `scripts/tasks/logs/admin-v2/X3-pad-a3.md`, 12. 10. u 18 h): zastoj nije bio u radu koraka. Provera cilja je isključena u celom lancu; konačni sudija je runner, koji posle koraka sam pušta build, tsc, testove, lint, namespace, `harness:check`, Convex push i snimke. Korak se završava redom „KORAK X3 GOTOVO“. Opis ispod je stanje pre rešenja.

> **Konačno rešeno u petom pokušaju** (`scripts/tasks/logs/admin-v2/X3-pad-a4.md`, 12. 10. u 19:05): nova sesija bez provere cilja; `harness:check` preuzima runner. Sve oznake „Deferred, awaiting owner decision“ i predlozi za vlasnika u ovom unosu i njegovim pododeljcima su istorija, ne otvorena pitanja.

> **Popravka a2** (`scripts/tasks/logs/admin-v2/X3-pad-a1.md`): fajl navodi samo dva razloga, oba o poslednjem redu poruke (nema reda „KORAK X3 GOTOVO“; korak sam kaže da nije gotov). Gejtove runner u tom pokušaju nije puštao. Uslov popravke od koraka traži `tsc`, testove, lint i `git diff --check`; `harness:check` i snimke runner pušta sam posle koraka. Provera cilja je i u popravci odbila kraj (pododeljak na kraju unosa), pa se popravka završava redom „KORAK X3 NIJE GOTOVO“. Predlog za vlasnika na kraju unosa ostaje otvoren. Opis ispod je stanje posle prvog pokušaja.

Kod, testovi, snimci i beleška koraka X3 su završeni, a gejtovi koje korak sme da pusti su čisti (`docs/admin/v2/X3.md`, odeljak 10). Provera cilja sesije (Stop hook) je odbila kraj koraka više puta zaredom, poslednja tri puta zbog iste dve stavke koje korak ne sme ili ne može da ispuni. **Deferred, awaiting owner decision.**

1. **Traži da korak sam pusti `harness:check`**, jer `STANJE.md` navodi `harness=strict`, a korak menja `app/globals.css`. Pravila lanca to zabranjuju: „Ne pokrećeš drugi `next dev` ni `harness:check` (pušta ga runner, sa sopstvenim dev serverom)“. `harness/run.mjs` diže `next dev` na portu 3199, a runner pre svojih gejtova gasi dev server (`Stop-RepoDev`). Uslov cilja koraka navodi samo `tsc`, testove, lint i `git diff --check`.
   - *Urađeno umesto toga, samo čitanjem:* isto poređenje sa `harness/goldens`, serijalizatorom i logikom iz `harness/run.mjs`, nad dev serverom koji runner drži na 3170 (`output/playwright/admin-v2/X3/harness-ekvivalent.mjs`): 177 slučajeva × 2 viewporta, 0 razlika. `npm run harness:namespace` prolazi. Diff `app/globals.css` je 63 dodata reda (`--admin-chart/seq/medal` i komentari, unutar `.admin-v1` blokova) i 0 obrisanih; `harness/**` nije menjan.
2. **Traži sadržaj početnog izlaza tsc-a.** `scripts/tasks/logs/admin-v2/baseline-gate-tsc.log` je prazan, jer tsc bez grešaka ne ispisuje ništa. `STANJE.md` kaže `tsc=strict`, `runner.log` „tsc: ok (exit 0)“, a `state.json` za tsc `Code 0, Count 0`.
   - *Urađeno umesto toga:* tsc nad kopijom izvornih fajlova vraćenom na osnovu lanca `fa6656f3` (samo `git show`, kopija u `tmp/`, obrisana posle provere): exit 0, 0 redova `error TS`, 2.779 fajlova. Sadašnji `npx tsc --noEmit`: exit 0, 0 grešaka.

Provera je ranije tražila i isečak Analitike na Pregledu (tačka 6 uputstva), koji je plan X0 rasporedio u X4. To je urađeno u X3 (`docs/admin/v2/X3.md`, odluka 24), pa nije otvoreno.

Provera je iste dve stavke odbila i posle ovog unosa, pa se prvi pokušaj završava redom „KORAK X3 NIJE GOTOVO“, po odredbi cilja o nemogućem cilju. Rad na koraku je završen; nedostaje samo ono što korak ne sme (`harness:check`) ili što ne postoji (sadržaj praznog loga). Presuda ostaje na gejtovima runnera (on pušta `harness:check`). **Predlog za vlasnika:** u tekstu provere cilja reći da `harness:check` pušta runner i da je prazan početni log tsc-a uredan ishod.

### X3, posle popravke a2: provera cilja sesije i dalje ne propušta korak (REŠENO 12. 10. 2026.)

Oba razloga iz `scripts/tasks/logs/admin-v2/X3-pad-a1.md` su o poslednjem redu poruke i na njih kod ne utiče. Gejtovi iz uslova popravke su čisti: `tsc` exit 0, testovi 315 fajlova i 3151 test, lint sa ista dva upozorenja kao na početku, `git diff --check` čist. Provera cilja sesije (Stop hook) je i u popravci odbila kraj, iz istog razloga kao u prvom pokušaju. **Deferred, awaiting owner decision.**

- **Traži da korak sam pusti `harness:check`**, jer `STANJE.md` navodi `harness=strict`. Pravila lanca to zabranjuju, a uslov popravke navodi samo `tsc`, testove, lint i `git diff --check`. Poređenje sa goldenima samo čitanjem (177 × 2, 0 razlika) provera ne prihvata kao gejt.
- **Traži zapisan početni izlaz tsc-a.** Ne postoji, jer tsc bez grešaka ne ispisuje ništa.

Isti razlog je u popravci pao više od tri puta, pa se popravka po pravilu lanca završava redom „KORAK X3 NIJE GOTOVO“. Rad je u radnom stablu i čeka odluku vlasnika: ili da prihvati X3 na osnovu gejtova runnera, ili da u tekstu provere cilja kaže da `harness:check` pušta runner.

**Gde je korak izašao iz slova pravila** (ovo nije deo rešenja iznad; ostaje kao obaveštenje vlasniku):
- `output/playwright/admin-v2/X3/harness-ekvivalent.mjs` otvara `/dev/template-gallery?harness=1`, rutu van spiska ruta koje korak sme da otvara u pregledaču, i ponavlja proveru gejta koji je koraku zabranjen. Ništa nije pisao, ali njegov rezultat ne treba čitati kao gejt.
- Jednom je pokrenut `git ls-files --others --exclude-standard` (samo čitanje), a dozvoljene su samo `status`, `diff`, `log` i `show`.
- Pokrenut je `npx convex function-spec` (samo čitanje, DEV); pravila ga ne zabranjuju, ali imenuju samo `convex dev --once`.
- U popravci je isti završni red „KORAK X3 GOTOVO“ poslat više puta iako ga je provera odbijala, umesto da se posle trećeg odbijanja završi redom NIJE GOTOVO. To je ispravljeno ovim unosom.

### X3, četvrti pokušaj: provera cilja je u sesiji i dalje aktivna (REŠENO 12. 10. 2026.)

> **Rešeno** (napomena runnera u `scripts/tasks/logs/admin-v2/X3-pad-a4.md`, 12. 10. u 19:05): uzrok je potvrđen, provera cilja iz pokušaja a2 je ostala zapamćena u staroj sesiji. Peti pokušaj je nova sesija bez provere cilja; sudija je samo runner, koji posle koraka sam pušta build, tsc, testove, lint, namespace, `harness:check`, Convex push na DEV i snimke. Korak nije puštao `harness:check` i završava se redom „KORAK X3 GOTOVO“ (`docs/admin/v2/X3.md`, odeljak 14). Od vlasnika se ovde više ništa ne čeka. Opis ispod je stanje pre rešenja.

Napomena runnera u `scripts/tasks/logs/admin-v2/X3-pad-a3.md` kaže da je provera cilja isključena u celom lancu. U sesiji koraka X3 to nije tačno: Stop hook iz prethodnog pokušaja (uslov sa `X3-pad-a2.md`) je ostao aktivan i odbija kraj iz istog razloga (traži `harness:check` od koraka). Oznake „REŠENO“ iznad važe za lanac, ne za ovu sesiju. **Deferred, awaiting owner decision.**

- Urađeno po napomeni: unosi X1, X2 i X3 označeni, `tsc`, testovi i lint ponovljeni i čisti.
- Red „KORAK X3 GOTOVO“ je u ovom pokušaju poslat sedam puta i svaki put odbijen. To je isto ponavljanje koje je već jednom ispravljeno, pa se pokušaj završava redom „KORAK X3 NIJE GOTOVO“.
- Šta treba: `/goal clear` u ovoj sesiji ili nova sesija za X3. Korak ne sme i ne može sam da ugasi proveru.

## ADMIN v2 X4 (12. 10. 2026.) — dev server lanca ugašen usred koraka (REŠENO 12. 10. 2026.)

> **Rešeno** (napomena runnera u `scripts/tasks/logs/admin-v2/X4-pad-a1.md`, 12. 10. u 21:00): prekid nije bio do koraka. Runner sada sam ponovo podiže dev server na 3170 ako padne, a `.env.local` proverava samo po `CONVEX_DEPLOYMENT`. Korak je u popravci nastavljen tamo gde je stao i sve provere u pregledaču su ponovljene na 3170.

Šta se desilo, redom:
- Oko 55. minuta koraka Playwright provere su dobile `ERR_CONNECTION_REFUSED` na `http://localhost:3170`. Tri provere porta u razmaku od nekoliko minuta (20:39, 20:41, 20:43): niko ne sluša.
- Log dev servera (`scripts/tasks/logs/admin-v2/dev-server.log`) se završava uredno, bez greške: server nije pao zbog koda, ugašen je spolja.
- U istom prozoru je van lanca u ovom repou pokrenut `npx convex dev` (režim praćenja) i `npm run dev` bez porta (`next dev` na 3000). Korak ih nije pokrenuo, nije ih dirao i nije pokretao svoj server: STANJE.md je govorio da server drži runner, a dva `next dev` u istom folderu pišu u isti `.next`.
- Posledica 1: jedno pokretanje `npx tsc --noEmit` je vratilo 8 sintaksnih grešaka u generisanom `.next/dev/types/routes.d.ts`, jer ga je drugi `next dev` baš tada prepisivao. Ponovljeno pokretanje je čisto (exit 0). U izvornom kodu grešaka nije bilo.
- Posledica 2: runner je promenu `.env.local` (prepisao ga je spoljni `convex dev`) pročitao kao prekršaj i prekinuo pokušaj. Korak nije čitao ni menjao `.env*`.
- Dok je ta ručna sesija trajala, korak nije puštao `npm run build` (pisao bi u `.next` pored živog tuđeg dev servera). U popravci, kad je na 3000 više niko nije slušao, build je pušten kao dodatna provera i prolazi (exit 0, 53/53 stranice); `next-env.d.ts`, koji build sam prepiše, vraćen je na sadržaj iz HEAD-a.

Šta ostaje kao rizik za sledeće korake: ako neko ručno radi u ovom folderu dok lanac traje, runner pre svojih gejtova gasi svaki `next dev` ovog repoa i pušta build, pa se dve sesije sudaraju. Predlog za vlasnika: dok lanac radi, ručni rad voditi u drugom klonu repoa. **Deferred, awaiting owner decision** (o tome kako se ubuduće razdvajaju ručni rad i lanac).

Gde je korak izašao iz slova pravila: jedan složeni Bash poziv je odbijen jer se završavao sa `git stash list` (pravila dozvoljavaju samo `status`, `diff`, `log` i `show`); ništa nije stavljeno u stash niti promenjeno, a deo poziva koji je bio potreban je ponovljen bez git-a. Pri čitanju spiska procesa ispisane su i komandne linije alata koji nisu deo ovog repoa; njihov sadržaj nije prenet ni u jedan fajl.

## ADMIN v3 V4 (13. 10. 2026.) — dev server lanca se sam restartuje i posle toga ne zna rute

Nije do koda koraka; zaobiđeno, korak je završen. **Deferred, awaiting owner decision** (o tome da li runner treba da prati i ovo stanje).

Šta se desilo, redom:
- Dev server koji drži runner (`next dev -p 3170`, Turbopack) se tokom koraka tri puta sam restartovao: u logu (`scripts/tasks/logs/admin-v2/dev-server.log`) stoji „Server is approaching the used memory threshold, restarting...“ (oko 08:59, 09:29 i 10:36). Okidač je bio rad skripte kadrova i alata za snimke (mnogo učitavanja stranica zaredom).
- Posle prvog restarta rute su radile čim su se ponovo prevele (učitavanja su do tada isticala na 30 s).
- Posle drugog restarta server je na `/` vraćao 200, a na `/admin/login` i na svaku `/dev/admin-*-preview` rutu **404** (provereno tri puta: 09:31, 09:33, 09:36). Generisani fajlovi `.next/dev/types/routes.d.ts` i `validator.ts` su ostali presečeni na pola reda, pa je i `npx tsc --noEmit` u tom prozoru vraćao sintaksne greške samo u tim generisanim fajlovima.
- Korak nije pokretao drugi `next dev`, nije gasio procese i nije dirao `.next`.

Kako je zaobiđeno:
- Sitna izmena jednog fajla rute koraka (`app/dev/admin-igra-preview/page.tsx`, komentar) naterala je server da ponovo izgradi tabelu ruta i prepiše generisane tipove; rute su se vratile, a `tsc` je opet čist (exit 0).
- Skripta kadrova koraka (`output/playwright/admin-v3/V4/kadrovi.mjs`) sada svako učitavanje pokušava do pet puta sa pauzom.

Rizik za sledeće korake: runner proverava samo da server odgovara. Server u ovom stanju odgovara (200 na `/`), pa ga runner ne podiže ponovo, a snimci `/dev/admin-*-preview` bi dobili 404. Predlog za vlasnika: da runner pre snimaka proveri status jedne preview rute, a ne samo `/`.

## SCANME MENU V1 — K02 (17. 10. 2026.) — pravila temelja koja traže potvrdu vlasnika

Korak je završen; kod radi po konzervativnom izboru iz zagrade. **Deferred, awaiting owner decision** za svaku stavku.

1. **Legacy članstvo → Menu uloga.** Član lokala sa nemigriranim nalogom (`businessMemberships`, danas pun pristup uređivanju) dobija ulogu Menadžer. (Izbor: Menadžer, da ne izgubi pristup koji već ima, ali bez promene režima.)
2. **`finance` i `view_only` članovi naloga.** (Izbor: bez pristupa Menu usluzi; master §10.6 ne predviđa ulogu samo za čitanje.)
3. **Eksplicitna Menu uloga van naloga.** Red u `menuMembers` daje pristup i korisniku koji nije član naloga (npr. spoljni Urednik); važi jača od izvedene i eksplicitne uloge. (Izbor: da; pozivnice gradi K28 i one nikad ne prave `businessMemberships`.)
4. **Jedna aktivna Menu usluga po lokalu u V1.** (Izbor: da; druga nezavisna usluga je zasebna pretplata ili Enterprise, master §3.2.)
5. **Podrazumevana stranica i QR.** „Kompletan meni" sme da se obriše ili arhivira kad postoji druga aktivna stranica; oznaka podrazumevane prelazi na prvu sledeću. Brisanje **i arhiviranje** stranice sa aktivnom QR vezom su odbijeni. (Master §3.2 izričito pominje samo brisanje; arhiviranje je dodato konzervativno, jer bi QR vodio na stranicu koju gost ne vidi.)
6. **Slug stranice se ne menja pri preimenovanju.** (Izbor: stabilan link; odštampani QR kodovi i linkovi ostaju ispravni.)
7. **Isti artikal u više sekcija iste stranice.** (Izbor: dozvoljeno, najviše jednom po sekciji; master §5.1 „u više sekcija".)
8. **Režim pri prvom otvaranju.** Kad usluga nastane iz klijentskog panela, režim je uvek Ugostiteljstvo (jedini V1 režim); izbor režima ima samo ScanMe admin (`menuServices.adminProvision`), a menja ga samo `menuServices.adminSetMode`.

## SCANME MENU V1 — K03 (17. 10. 2026.) — cene paketa i Room service pravila koja traže potvrdu vlasnika

**BLOKADA (cene).** Nove cene ScanMe Menu (1.490 / 14.900 RSD) i paketa Menu + ScanMe Links (1.990 / 19.900 RSD) iz master §2.2.1 **nisu** upisane u `DEFAULT_PRICING_CONSTANTS` (`lib/pricing/constants.ts`), a `golden.json` nije regenerisan. **Deferred, awaiting owner decision.** Premium nalog je već 990 / 9.990 RSD.

- **Zašto:** sa tim cenama i nepromenjenim paketom „Kompletan" (3.790 / 37.990) podskup {Links, Venue, Memories, Menu} košta 4.179 mesečno i 41.997 godišnje, više od cele korpe. Motor zato baca invarijantu 4 („dodavanje usluge snižava cenu") za obe uniformne korpe sa svih pet usluga (6 od 726 golden slučajeva). `npm run pricing:golden` tada ne može da prođe, a kupovina pet usluga bi bila odbijena. Prompt K03 zabranjuje promenu bilo koje druge cene, a cena paketa „Kompletan" je poslovna odluka.
- **Dokaz:** `lib/pricing/menu-launch-proposal.test.ts` gradi kandidat-konstante (DEFAULT ostaje netaknut) i proverava:
  - tačno tih 6 korpi pada, ostalih 720 prolazi;
  - granica: Kompletan mora biti **najmanje 4.179 mesečno i 41.997 godišnje**;
  - iznad **4.424 mesečno i 44.492 godišnje** (cena pet usluga bez paketa) Kompletan se nikad ne primenjuje;
  - kandidat **4.290 / 42.900** prolazi svih 726 korpi; Menu sam je 1.490 / 14.900, Links + Menu je paket „lokal" 1.990 / 19.900;
  - korpe bez Menu-a (240) ostaju bajt-identične; promenilo bi se 486 golden slučajeva (sve korpe sa Menu-om).
- **Odluka vlasnika:** cena paketa „Kompletan" u opsegu [4.179, 4.424] mesečno i [41.997, 44.492] godišnje (ili drugačiji paket).
- **Primena posle odluke (jedan commit):**
  1. u `lib/pricing/constants.ts` postaviti `menu` na 1490 / 14900, `lokal` na 1990 / 19900 i `kompletan` na izabranu cenu, pa ažurirati komentar iznad paketa „kompletan" (opis pojasa);
  2. pokrenuti `npm run pricing:golden`;
  3. namerno ažurirati testove koji fiksiraju stare iznose. Proba u K03 (konstante privremeno postavljene na kandidat 4.290 / 42.900, pa vraćene; `git diff` prazan) je pokazala da pada samo 5 testova u 3 fajla: `lib/pricing/engine.test.ts` („merdevine rastu ka jeftinijoj usluzi", „paket se bira kad je najjeftiniji, i pokriva sve svoje usluge"), `lib/pricing/golden.test.ts` (dva testa, rešava ih korak 2) i test „domet promene" u `menu-launch-proposal.test.ts`, koji poredi kandidat sa DEFAULT-om (posle primene kandidat postaje DEFAULT, pa se fajl prepisuje kao test novih cena). `convex/priceParity.test.ts` i `components/purchase/step-plan-model.test.ts` u toj probi prolaze.
- **PDV:** prikaz sa ili bez PDV-a nije menjan (P9, master §2.1 i §2.2.1: potvrda knjigovođe pre javnog cenovnika).

**Room service i jezici** — kod radi po konzervativnom izboru iz zagrade:

1. **Gubitak Premium-a.** Room service ostaje uključen dok ga neko ne isključi; isključivanje nikad ne traži Premium; sadržaj RS-a se ne briše; izmene RS sadržaja traže Premium. Objavljena verzija se ne menja; isključenje Premium sadržaja pri sledećoj objavi radi K05 (K01 OTV 5).
2. **„Ceo meni" u Room service-u.** Jednokratno kopiranje vidljivih sekcija i artikala „Kompletnog menija"; kasnije izmene glavnog menija se ne preslikavaju same, a panel vidi koliko artikala nije u RS-u (K01 OTV 6).
3. **Artikal je u Room service-u najviše jednom** (jedna ručna RS cena po artiklu).
4. **Markup za „izabrane" artikle.** Novi RS artikal nije izabran; markup dobija tek kad ga klijent označi. Dodaci nemaju markup (K01 OTV 20).
5. **Naknada 0 RSD** znači „bez naknade". Naknada se dodaje jednom na celu porudžbinu, nikad po artiklu.
6. **Ručna RS cena po varijanti** dolazi sa varijantama u K04; obračun po ceni je isti.
7. **Dva jezika u Standardu** uključuju izvorni srpski (srpski + jedan prevod). Nalog koji izgubi Premium može da ukloni ili preuredi jezike, ali ne i da doda nov dok je iznad limita. Spisak jezika za prevod je radni (`lib/menu/languages.ts`, 27 ISO kodova).
8. **Pravo na izmenu.** Uključivanje RS-a je `Funkcionalnosti` (Vlasnik, Menadžer). Sadržaj, kategorije i cene RS-a su sadržaj ponude, pa ih menja i Urednik. Jezike menjaju Vlasnik i Menadžer (Podešavanja).

## SCANME MENU V1 — K04 (17. 10. 2026.) — pravila modela artikla koja traže potvrdu vlasnika

Nijedna stavka ne blokira kod: run je izabrao konzervativnu opciju u zagradi i kod radi po njoj. Vlasnik potvrđuje ili menja.

1. **Spisak oznaka** (`lib/menu/tags.ts`): Vegansko, Vegetarijansko, Ljuto, Preporuka, Novo, Specijalitet kuće, Domaće. Zatvoren spisak, bez slobodnih oznaka. Namerno **nema** „Bez glutena" ni „Bez laktoze", jer bi to bila tvrdnja o bezbednosti mimo sistema alergena (master §7.3).
2. **Nazivi 14 kategorija alergena** (`lib/i18n/sr/menu-domen.ts`) prate Prilog II EU uredbe 1169/2011, koji preuzima srpski pravilnik o deklarisanju. Pravna provera naziva ide zajedno sa proverom radnog teksta upozorenja (master §7.3, P9).
3. **Alergeni bez podatka.** Ako su obe liste prazne, zapis se briše i artikal je „nepoznato", nikad „ne sadrži ništa". `Drugo` traži kratak opis. Isključivanje alergena za meni ništa ne briše. Uključuje ih svako ko uređuje ponudu (i Urednik), a promena ide kroz `Objavi`.
4. **Akcija.** Akcijska cena je ceo dinar, najmanje 1 i niža od regularne. Procenat je ceo broj od 1 do 99. Akcija sa unetom cenom ne može uz varijante; procenat važi i za cene varijanti. Premium se traži samo dok je zakazana akcija uključena; isključena akcija sa datumima i ručna akcija rade na Standardu.
5. **„Preporuka" postoji dvaput:** kao oznaka i kao natpis akcije (master §5.5 i §7.6). Artikal sa oba prikazuje jedan natpis (K13/K14).
6. **Povezane grupe dodataka.** Grupa koja više nije ni na jednom artiklu ostaje sačuvana i nudi se u izboru „postojeća grupa"; briše se samo izričitim brisanjem. Dodavanje varijante ili grupe sam uključuje prekidač „Varijante" ili „Dodaci" za taj artikal.
7. **Kombo.** Sastavni artikal mora biti običan artikal (bez komboa u kombou), svaki najviše jednom, sa količinom od 1 do 20. Upozorenje „proveri cenu komboa" nastaje i kad se promeni cena varijante sastavnog artikla ili kad se sastavni artikal obriše. Upozorenje se ne briše samo od sebe: klijent bira „Zadrži cenu" ili unosi novu cenu.
8. **Validacija za objavu.** Greške su samo tri pravila iz master §5.5 (naziv, sekcija, cena ili varijanta sa cenom). Proveravaju se samo artikli koje gost vidi: sakriven nepotpun artikal ne blokira objavu ostatka menija, a artikal bez ijednog prikaza daje samo upozorenje. Room service kategorija važi kao sekcija.

## SCANME MENU V1 — K05 (17. 10. 2026.) — pravila objave i verzija koja traže potvrdu vlasnika

Nijedna stavka ne blokira kod: run je izabrao konzervativnu opciju i kod radi po njoj. Vlasnik potvrđuje ili menja.

1. **Room service posle uključivanja.** Prekidač važi odmah, ali sadržaj Room service-a ulazi u javni meni tek objavom dok je prekidač uključen (tada se i proverava). Uključen posle objave → gost ga vidi posle sledećeg `Objavi` (objava radi i bez izmene nacrta, jer se menja ono što gost dobija); isključen → nestaje odmah. Alternativa: objavljivati Room service uvek, pa bi uključivanje odmah pokazalo i neproveren sadržaj.
2. **Zakazana akcija bez Premium-a se ne objavljuje.** Gost vidi regularnu cenu (nikad akciju koja bi tada trajala stalno). Upozorenje `promo_schedule_premium` to već najavljuje.
3. **Ponovna objava bez izmena se odbija** (`no_changes`), da ne troši jedno od 20 mesta u istoriji. Izuzetak: nacrt je isti, ali bi gost dobio drugačiji meni (uključen Room service, izgubljen Premium) — tada objava prolazi.
4. **Sekcija bez ijednog prikazanog artikla se ne prikazuje gostu** (prazan naslov sekcije izgleda kao greška).
5. **Vraćanje verzije i QR stranice.** Stranica sa aktivnom QR vezom koje u verziji nema (ili je u verziji arhivirana) ostaje u nacrtu kakva jeste, sa sekcijama, prikazima i artiklima koje prikazuje, i prijavljuje se korisniku. Ako njen slug u verziji pripada drugoj stranici, zadržana stranica dobija novi slug (QR radi po ključu stranice, ali ručno deljen link sa starim slugom bi vodio na stranicu iz verzije).
6. **Ko vraća verziju:** isto kao ko objavljuje (Vlasnik, Menadžer, Urednik), po matrici `menu.publish`.
7. **Brisanje artikla i „Privremeno nedostupno".** Obrisan artikal ostaje u živoj verziji do objave, pa njegova oznaka nedostupnosti ostaje do objave (K04 ju je brisao odmah, pa bi gost do objave video artikal kao dostupan).
8. **Upozorenje o prevodu** je jedno po jeziku (broj tekstova bez potvrđenog prevoda i prvih 20), ne po artiklu; AI predlog se ne računa kao prevod.
9. **Izgled bez podešavanja:** paleta i fontovi „default" (renderer bira podrazumevano, nikad ScanMe crno-zelenu), layout `Tok`, bez pretrage, filtera i EUR prekidača. Premium pravila izgleda (dodatni layouti, smanjen brending) dodaje K17.

## SCANME MENU V1 — K06 (17. 10. 2026.) — pravila migracije starog menija koja traže potvrdu vlasnika

Nijedna stavka ne blokira kod: run je izabrao konzervativnu opciju i kod radi po njoj. Migracija NIJE puštana ni na jednom deploymentu. Vlasnik potvrđuje ili menja.

1. **Delovi dana se ne prenose** (K01 OTV 11). Grupa vezana za doručak, ručak ili večeru postaje stalno vidljiva sekcija; izveštaj je navodi kao „nemapirano". Isto važi za „Ide uz", video i oblik grupe (Lista, Galerija, Traka…). Alternativa: zadržati delove dana kao novu funkciju novog modela (nije u masteru V1).
2. **Duplikati se ne spajaju sami.** Dve stare stavke istog imena ostaju dva artikla; izveštaj ih navodi (sa istom ili različitom cenom), a operater odlučuje i spaja ih u editoru (master §6.2, korak 3).
3. **Prelom teksta u opisu.** Novi model (K02) sažima prelome redova i višestruke razmake, pa opis „Sa lukom i⏎kajmakom" postaje „Sa lukom i kajmakom". Migracija to radi po istom pravilu i prijavljuje svaki takav tekst. Ako opisi treba da čuvaju prelom reda, to je izmena pravila teksta za ceo novi model.
4. **Stari artikli dobijaju ikonicu** (`mediaMode: "icon"`, ključ iz starog tipa proizvoda), jer je stari javni meni uvek prikazivao ikonicu; nov artikal u editoru i dalje počinje bez medija. Stara fotografija se čuva i čeka obradu slika (K15); do tada se prikazuje ikonica.
5. **„Nema više" iz žive verzije pobeđuje.** Ako nacrt starog menija kaže „dostupno", a javni meni „nema više", artikal se prebacuje kao privremeno nedostupan.
6. **Prelazak (gašenje starog editora za taj lokal)** je dozvoljen tek kad je migracija završena i novi meni objavljen; do tada osoblje mora moći da označi „nema više" na starom meniju koji gosti još vide.
7. **Povratak gosta na stari meni posle K13.** Do K13 javna ruta i dalje prikazuje stari meni i posle objave novog. Kad K13 prebaci rutu na novi model, rollback „vrati goste na stari meni" traži operaterski prekidač (npr. da ruta poštuje i stanje migracije). Treba odluka: da li takav prekidač postoji i ko sme da ga koristi (predlog: samo ScanMe admin).
8. **Interni uvoz ide samo u nacrt bez artikala**, nikad ne objavljuje; ponovni uvoz traži da operater prvo ukloni prethodni (interni `purgeMigratedService`).
9. **`npm run harness:check` povremeno pada odmah posle build-a** (runner posle K04 i posle K06). Kod nije uzrok: ista provera je posle K06 prošla 3 puta, i sama i redosledom runnera (build pa harness). Uzrok je trka na startu dev servera:
   - `next dev` (`setup-dev-bundler.js`) proglašava server spremnim već na prvom `aggregated` događaju Watchpack-a (`aggregateTimeout: 5` ms). Pod jakim opterećenjem diska, odmah posle `next build` i 6.000 testova, spisak ruta iz `app/` tada je nepotpun (K04: nema `/dev/template-gallery`) ili prazan (K06: čak i `/` je 404).
   - `harness/run.mjs` `waitForServer` prihvata bilo koji odgovor, pa i 404. Posle 404 ne ponavlja `page.goto`, nego čeka `[data-case-id]` 240 s i pada.
   - Predlog popravke (traži „može", jer `harness/**` je van obima runa): `waitForServer` da čeka da `CORPUS_URL` odgovori sa 200, ili da `renderCorpus` ponovi `page.goto` dok korpus ne odgovori sa 200, u istom ukupnom roku. Zlatni snimci i provera bajt po bajt ostaju isti.

## SCANME MENU V1 — K07 (18. 10. 2026.) — UX izbori koji traže potvrdu vlasnika

Nijedna stavka ne blokira kod: run je izabrao konzervativnu opciju, a pravila su u `docs/menu/MENU-UX.md`. Vlasnik potvrđuje ili menja.

1. **Obraćanje u proizvodu ScanMe Menu je „Vi"** (rečenice), kao u postojećim Menu tekstovima (`menu-domen`, `menu-editor`, `ordering-panel`); dugmad su kratki glagoli („Objavi", „Pokušaj ponovo"). Interni admin i dalje koristi „ti" (DASHBOARD-STANDARD §7). Alternativa: „ti" i u klijentskom panelu.
2. **Potpisni detalji tri površine** (MENU-UX §1): „šav objave" u panelu i editoru (jedan red: objavljena verzija ↔ broj neobjavljenih izmena + stanje čuvanja), „cena kao tipografija" na javnom meniju i „živi tajmer" u konobarskom panelu (`18:43 · čeka 08:12`, posle praga crveno, ikonica i „kasni", blag puls bez reduced motion). Master §13.3 smer označava kao privremeno odobren.
3. **Boje vrsta zahteva u konobarskom panelu** (MENU-UX §2.2): poziv crvena, račun plava, porudžbina smaragdna (ne ScanMe zelena, da se ne pomeša sa stanjem „Završen"), rezervacija ćilibar. Statusi zahteva: Novi = info (plava), Prihvaćen i Otkazan = neutralno, Završen = uspeh.
4. **Podrazumevani prag kašnjenja je 15 min** (master §10 kaže „npr. 15 min"); lokal ga menja u Podešavanjima (K23, K28).

## SCANME MENU V1 — K08 (18. 10. 2026.) — klijentski panel: izbori koji traže potvrdu vlasnika

Nijedna stavka ne blokira kod: run je izabrao konzervativnu opciju i kod radi po njoj. Vlasnik potvrđuje ili menja.

1. **Urednik vidi samo Početnu i Editor** (K01 §4.1; prompt K08: „Urednik vidi Editor i pregled, ne Tim i naplatu"). „Pregled" je protumačen kao Početna (status menija) i pregled nacrta u Editoru. Ostale sekcije se Uredniku ne prikazuju; otvorene linkom kažu „Ovu sekciju vide vlasnik i menadžer lokala". Alternativa: Urednik vidi i Analitiku.
2. **Menadžer vidi svih osam sekcija.** Uz Tim i pristupi i Podešavanja piše da ulogu Vlasnik dodeljuje samo vlasnik i da naplatu i vlasništvo naloga vodi vlasnik. Naplata nije deo ScanMe Menu panela; gde vlasnik vidi naplatu naloga, otvoreno je pitanje (danas klijentski panel nema naplatu).
3. **Osoblje (PIN) nema klijentski panel.** Nalog bez uloge u ScanMe Menu (i lokal bez ScanMe Menu: isti odgovor, da adresa ne otkriva koji lokal ima Menu) dobija „Ovaj nalog ne otvara ScanMe Menu" i karticu „Radite u smeni?" sa linkom „Kako da uđem u konobarski panel" (ista kartica stoji i na ekranu prijave, jer osoblje bez naloga tu stiže). Link vodi na novu stranicu `/[slug]/konobar`, koja samo objašnjava da se panel otvara linkom ili QR kodom od vlasnika ili menadžera; sam panel je iza tajnog koda (`/[slug]/konobar/[kod]`, K22) i klijentski panel ga nikad ne otkriva.
4. **Ulaz iz postojećeg klijentskog panela** je jedan blok „ScanMe Menu" iznad tabova drugih usluga (ili iznad Venue/Memories), a za lokal koji ima samo ScanMe Menu umesto ekrana „Nemate pristup ovom lokalu". Prikazuje se samo kad lokal ima aktivnu uslugu novog modela (`menuServices`) i nalog ima ulogu u njoj. Nije vezan za zastavicu `MENU_EXISTS` (ona je kuka za preimenovanje u adminu i ostaje `false`). U produkciji niko ne vidi ulaz dok ScanMe ne napravi uslugu (`adminProvision`) ili ne pusti migraciju. Ako ulaz treba da čeka i zastavicu, to je jedan uslov u `components/client-panel/client-panel.tsx`.
5. **Stari meniji ne dobijaju novu uslugu sami.** Panel ne zove `ensureForBusiness` pri otvaranju, jer bi to tiho pravilo nov model pored starog menija. Lokal sa starim menijem (aktivan `scanme_menu` profil, bez `menuServices`) i dalje nema ulaz u klijentskom panelu, kao pre runa.
6. **Editor do K10 otvara postojeći editor** (`/[slug]/meni/editor`). Taj editor radi nad starim menijem (`menus`); za lokal bez starog menija nudi „Napravi meni", koje pravi prazan nacrt STAROG modela (javni meni se ne menja dok se ne objavi). Prompt K08 traži baš ovo prelazno ponašanje; K10 ga zamenjuje pravim editorom u panelu. Komentar u `app/[slug]/meni/editor/page.tsx` kaže da je ruta namerno nepovezana dok je `MENU_EXISTS` `false`; posle K08 je povezana iz novog panela, ali samo za lokale sa novom uslugom (tačka 4).
7. **Arhivirana usluga nema panel ni za ScanMe admina.** Helper pristupa po slug-u traži samo aktivnu uslugu lokala (K02), pa admin arhiviranu uslugu otvara samo u internom alatu.
8. **Tekst ulaza i povratka:** „Otvori ScanMe Menu" (klijentski panel) i „Nazad na klijentski panel" (iz Menu panela). Radni tekst; potvrditi.
9. **Iz starog editora nazad vodi u stari klijentski panel.** Do K10 „Otvori Editor" otvara `/[slug]/meni/editor`, čiji linkovi „nazad" i logo vode na `/[slug]/client-panel`, ne u Menu panel. Stari editor (`components/menu/editor/**`) K08 nije menjao; tekst u panelu zato kaže da se Editor otvara na posebnom ekranu. K10 ovo rešava pravim editorom u panelu.
10. **Nema dugmeta za odjavu u Menu panelu.** Zadatak K08 kaže „ne diraj auth tok", pa shell nema „Odjava" ni „Promeni nalog". Vlasnik prijavljen pogrešnim nalogom vidi „Ovaj nalog ne otvara ScanMe Menu" i karticu „Upravljate ovim lokalom?", a odjavu nalazi u postojećem klijentskom panelu (dugme „Odjava" u sekcijama Links i Google Review; ekran „Nemate pristup ovom lokalu" ga ni danas nema). Predlog: „Odjava" u podnožju navigacije Menu panela, preko postojećeg `signOut` (K28 ili posebna odluka).
