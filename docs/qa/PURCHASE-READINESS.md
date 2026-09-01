# Purchase readiness — presuda (TASK-42)

Zadaci 26–44 su izgradili cenovni motor, Enterprise nalog, tok kupovine,
naplatu i admin sloj. Sajt **nije u prometu**: produkcija je izlog da vlasnik
vidi kako sve radi uživo, cene su placeholderi i to je u redu. Ovo je odgovor
na pitanje: **šta je od kupovnog sloja DOKAZANO, šta je samo sagrađeno, šta je
svesno izostavljeno — i šta najverovatnije pukne kad prvi pravi klijent bude
plaćao.**

## Presuda

**DA za deploy kao izlog i za RUČNI tok naplate (admin unosi porudžbinu i
uplatu — glavni tok prvih pedeset klijenata, TASK-32). NE za samousluženo
plaćanje sa /kupovina: dugme „Plati" je prezentaciono po zapisanoj odluci
(TASK-38 §1 — nema onboarding sloja ni provajdera), i to je izlog, ne rupa.**

Cena je matematički ista na sva tri mesta (726 + 240 slučajeva pod testom),
ceo životni ciklus naloga je dokazan od checkout-a do isteka i povratka, i
razdelnik i dalje drži identitet stola. Ono što NIJE dokazano je isključivo
ono što bez pravog klijenta i pravog novca ne može da se dokaže — pobrojano
ispod, sa prvom pomoći.

---

## DOKAZANO — sa testom koji to dokazuje

1. **CENA JE ISTA NA SVA TRI MESTA** (RFC-002 §2.1, rizik #2 — „razlika nije
   bag nego pravni problem").
   - **`convex/priceParity.test.ts`** (novo, TASK-42):
     - svih **726 zlatnih slučajeva** (31 neprazan podskup × svako cepanje po
       periodu × basic/premium-mesečno/premium-godišnje): klijentska korpa
       (`priceSelection`, ista funkcija koju čita /kupovina korpa i donji
       bar) ≡ upisana zlatna tabela ≡ serverski `price()` ≡ zamrznuti
       `buildPriceSnapshot` fakture, uključujući JSON put do baze bez pomaka
       ijednog dinara;
     - svih **240 prodajnih korpi** (15 podskupova od 4 prodajne usluge ×
       svako cepanje perioda × 3 varijante plana) kroz **PRAVU
       `checkout` mutaciju**: upisani `orders.priceSnapshot` bajt-za-bajt
       jednak motoru, i zbir `orderItems` linija ≡ `servicesChargedRsd`;
     - jednokratni fizički novac: server (`physicalLineTotalRsd`) ≡
       klijentska korpa (`computeProductsOneTime`) za svih 5 proizvoda, sa i
       bez lestvice popusta, i kroz mutaciju — dve vrste novca nikad sabrane.
   - Postojeći stubovi na koje se ovo oslanja: `lib/pricing/golden.test.ts`
     (726 pinovano na committed tabelu), `lib/scanme-pricing.test.ts`
     (marketinške kartice ≡ motor), `convex/orders.test.ts` (admin
     `createOrder` zamrzava identičan breakdown; **snapshot preživljava
     promenu konstanti bajt-identično** — grandfathering).
2. **CEO PUT OD LANDINGA DO ISTEKA I NAZAD** —
   **`convex/purchaseLifecycle.test.ts`** (novo, TASK-42), jedan test, jedan
   klijent: klik na paket „Događaj" (Venue+Memories godišnje, Premium
   godišnje, + fizička stavka) → `checkout` → provisioning complete → **usluge
   aktivne, `getEntitlement` vraća kupljeni premium (10 slika/gostu) IZ PLANA
   NALOGA sa NULA entitlement redova** (RFC-002 §2.2.3 „true by
   construction") → snapshot fakture ≡ ono što je korpa pokazivala →
   `paid_never_configured` dok ništa nije podešeno → `markOrderPaid` (iznos =
   snapshot, ciklus = +1 godina) → statusi prelaze: `active` (−30d) →
   `expiring_soon` (−7d) → `expiring_soon` i entitlement I DALJE VAŽI unutar
   grace-a (+3d) → `expired` izvedeno (+15d) → **dnevni sweep gasi nalog i
   `getEntitlement` PRESTAJE da rešava obe usluge** → `recordManualPayment` →
   status `active`, nov ciklus od datuma uplate, premium se vraća, svaka
   ručna promena u audit tragu. GRACE_DAYS = 14 (vlasnik potvrdio, TASK-35).
   - Uz postojeće: `convex/billing.test.ts` (23 testa lifecycle-a),
     `convex/accountEntitlements.test.ts` (10 testova korak-3 rezolucije),
     `convex/checkout.test.ts` (10 testova checkout-a i fan-out-a).
3. **RAZDELNIK DRŽI IDENTITET STOLA** — jedina stvar koja tiho obara model
   naplate ako se pokvari (RFC-002 §2.4, rizik #3). **`convex/cards.test.ts`**,
   re-potvrđeno na HEAD-u posle svih izmena: „**splitter scan + Memories
   choice mints the guest WITH cardId — the table survives**" (sken kartice →
   card-aware hop `resolveSplitterMemories` → `guest.cardId === card._id`;
   tap dugmeta NIJE drugi sken); hop odbija tuđe prostore (nije open minting
   oracle); **Links+Memories se odbija glasno i pri kreiranju kartice i na
   checkout-u** (poruka sa dva podržana obrasca); `getSplitterView` pinuje
   card-aware href `/r/[cardCode]/m?space=…`. Checkout-provizionirani
   razdelnici uopšte ne nose Memories dugme (prostor još ne postoji —
   TASK-38 §2).
4. **PRISTUPAČNOST ČETIRI KORAKA U OBE TEME** — pun nalaz u
   [purchase-accessibility.md](./purchase-accessibility.md). Sažetak: tamna
   tema kontrast ceo čist; svetla ima 5 padova na sitnom sekundarnom tekstu
   (3,56–4,35 gde treba 4,5 — zapisani, ne popravljani); red naslova bez
   preskoka; sve mete ≥24 px; mobil 375 px bez bočnog prelivanja na sva 4
   koraka; reduced-motion dosledan. **Jedan tvrdi tastaturni blokator NAĐEN I
   POPRAVLJEN u ovom tasku** (kartica je gutala Enter/Space sa unutrašnjeg
   „Dodaj" dugmeta — tastaturom se nije mogla dodati nijedna usluga; guard na
   `event.target`, dve linije). Redosled i vidljivost fokusa provereni uživo;
   sama tastaturna AKTIVACIJA verifikovana analizom koda jer QA pane ne ume
   nativnu aktivaciju dugmeta (ograničenje okruženja, zapisano u nalazu) —
   jednominutna potvrda na pravom browseru je stavka smoke liste ispod.
5. **Ceo lanac provere zelen**: vitest **710 prošlo / 1 preskočen** (uklj. 6
   novih testova ovog taska), lint 0 grešaka, build prolazi,
   harness:namespace prolazi. `harness:check` ostaje **sredinski blokiran**
   (Node v24.8.0 `NewRootCertStore` pad, TASK-28 §4; `nvm` na mašini ne
   postoji — TASK-29 §1; ništa novo).

## Napravljeno ali NIKAD PROBANO u realnim uslovima

- **`checkout` mutacija nikad pozvana sa prave stranice.** Korak-4 UI je
  prezentacioni (TASK-38 §1); nijedan pravi browser nikad nije napravio red u
  `orders`. Ako se ikad zakači dugme na `api.checkout.checkout`, backend je
  spreman i testiran — ali taj šav je neispaljen.
- **Kupovni sloj na produkciji uopšte.** `accounts`, `orders`, `payments`,
  `adminAuditLog`, cron „billing cycle sweep", admin tabela korisnika — sve
  ide na prod PRVI PUT ovim deployem, nad praznim tabelama. Sve gore je
  dokazano u convex-test okruženju, ništa nad pravim deploymentom.
- **Grace/istek u realnom vremenu.** Test unazađuje `planValidUntil`
  (ustanovljen obrazac); niko nije čekao 14 stvarnih dana niti gledao cron da
  ugasi pravi nalog. Napomena iz koda: između isteka grace-a i sledećeg
  dnevnog cron tick-a `getEntitlement` JOŠ rešava (rez čeka sweep) — izvedeni
  status u tabeli kaže „istekao" i do 24h pre nego što capability stvarno
  padne. Namerno (dnevna granularnost), ali prvi put će zbuniti.
- **Enterprise fan-out na pravom scheduleru** (testiran resumable u
  convex-test; prod scheduler nikad).
- **Tastaturni tok od prve usluge do plaćanja na PRAVOM browseru** (pane ne
  ume nativnu aktivaciju — vidi purchase-accessibility.md §0).
- Nasleđeno iz TASK-25 (i dalje važi za Venue/Memories deo proizvoda): TV
  zid u pravom baru, iOS/Android zoologija, scan burst 300/300, izvoz iznad
  ~200 MiB na deployed runtime-u.

## SVESNO IZOSTAVLJENO — ne tražiti u ovom deployu

- **Prave cene.** Placeholder konstante u `lib/pricing/constants.ts`; vlasnik
  popunjava, `npm run pricing:golden` regeneriše tabelu, commit + deploy.
  Motor ne zavisi od brojeva (invarijante bi bacile na nelegalan cenovnik).
- **Srpski provajder plaćanja.** Checkout je stub protiv billing porta
  (RFC-001 seam); ručni unos uplate je GLAVNI tok. Kad se provajder izabere,
  webhook mapira na `applyProviderPayment` bez promene oblika.
- **ScanMe Meni kao proizvod.** USKORO svuda: nije prodajan
  (`PRICING_SERVICE_BY_SERVICE_TYPE` ga nema), kartica disabled, kombi Lokal
  i Kompletan USKORO, admin rename čeka `MENU_EXISTS` flag. Vlasnikova odluka
  o pretprodaji stoji otvorena (TASK-34 §1, RFC-002 §5 Q4).
- **Razdelnik kroz Links stranicu.** BLOKIRAN na vlasnikovoj odluci o
  odmrzavanju Links šava (RFC-002 §6); do tada se odbija glasno na dva mesta.
  Poznata post-creation rupa: Links EDITOR može naknadno da doda `/m/…`
  odredište bez provere (TASK-37 §1 — takođe čeka vlasnika).
- **Samousluženi onboarding** (prijava kupca + prvi lokal u toku) —
  vlasnikova/produktna odluka (TASK-38 §1).

## ŠTA NAJVEROVATNIJE PUKNE kad prvi pravi klijent bude plaćao

Rangirano. Ovo je poenta celog fajla.

1. **Ljudski korak, ne kod: uplata legne na račun, niko je ne upiše.** Prva
   prava naplata je RUČNA. Ako admin posle uplate ne pozove
   `markOrderPaid`/`recordManualPayment`, `planValidUntil` ostane u prošlosti
   → 14 dana grace-a → dnevni sweep TIHO ugasi nalog → premium blokovi
   nestanu sa Venue stranice i Memories kvota padne, klijentu koji je
   UPRAVO PLATIO. Simptom: „platio sam a nestalo mi je". Prva pomoć:
   `recordManualPayment` (vraća sve odmah — dokazano testom), tabela
   korisnika sortira dužnike na vrh. Navika koja spašava: uplata se upisuje
   ISTOG dana kad legne.
2. **Mešoviti periodi u jednoj porudžbini ne pomeraju ciklus.** Jedan datum
   naplate po nalogu (TASK-32 §2). Ako porudžbina nema plan-period i usluge
   su mešane (mesečno+godišnje), `markOrderPaid` upiše uplatu ali NE pomeri
   `planValidUntil` — nalog ostane bez datuma i nikad ne „ističe", a niko ne
   zna do kad je plaćeno. Prva pomoć: admin unese `coversUntil` pri uplati
   ili `setNextBillingAt` odmah posle. Zamka je tiha jer ništa ne pukne — samo
   se knjigovodstvo raziđe.
3. **Prod okruženje kupovnog sloja, prvi put.** Isti razlog kao TASK-25 #1,
   sada za novi sloj: `SCANME_ADMIN_EMAILS` mora biti tačan (inače admin ne
   vidi ni tabelu ni dugmad), cron „billing cycle sweep" mora POSTOJATI na
   prod dashboardu posle deploya (8. cron — runbook §3 nabraja 7 od ranije),
   i tabele moraju biti prazne-ali-žive. Provera: dashboard → crons; admin →
   /admin/customers renderuje praznu tabelu bez greške.
4. **Klijent plati, usluge niko ne aktivira.** Ručni tok van
   `checkout`/`createOrder` mutacija (npr. „upit → dogovor telefonom") nema
   automatsko provizioniranje — admin mora ručno da aktivira usluge u tabeli.
   Jedina zaštita je status **„plaćeno ali nikad podešeno"** koji se sortira
   na vrh (dokazano `billingOverview` testom) — ali samo ako neko GLEDA
   tabelu. Navika: tabela korisnika je jutarnji ekran.
5. **Razdelnik prodat uz Memories traži naknadni korak.** Checkout namerno ne
   stavlja Memories dugme na karticu-razdelnik (prostor još ne postoji);
   vlasnik ga dodaje kroz konzolu kad prostor nastane (TASK-38 §2). Korak
   koji se lako zaboravi; simptom: „kartica ne vodi na uspomene". Vezivanje
   je zabeleženo u `orderItems.boundServices` — tamo se vidi šta je kupljeno.
6. **Prvi utisak pedantnog klijenta na svetloj temi.** Pet sitnih kontrastnih
   padova + nevidljiv fokus na karticama (zapisano, rangirano u
   purchase-accessibility.md §2). Ne obara ništa — ali je prva stvar koju će
   dizajnerski nastrojen kupac primetiti.

## Smoke lista posle OVOG deploya (dopuna runbook §8)

1. Landing `/` (uz passkey), tri paketa vode u `/kupovina` sa upisanim
   uslugama (URL nosi `v=5&services=…`).
2. `/kupovina` sva četiri koraka mišem: korpa = bar = pregled, Događaj daje
   uštedu, Premium dodaje svoju liniju, „Plati" daje sažetak.
3. Tastaturom (1 min, pravi browser): Tab do „Dodaj: Venue" → Enter dodaje;
   do „Dalje" → Enter; do „Plati" → Enter. (Pane ovo nije mogao da izvrši —
   vidi purchase-accessibility.md §0.)
4. `/ponuda` konfigurator radi i cena se slaže sa `/kupovina` za istu uslugu.
5. `/admin/customers` renderuje (praznu) tabelu; dashboard → crons sadrži
   „billing cycle sweep".
6. Jedna postojeća Venue i jedna Memories stranica rade (stari smoke §8
   tačke 1 i 6).
