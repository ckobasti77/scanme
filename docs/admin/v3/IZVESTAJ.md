# ADMIN v3 „živi kokpit“: izveštaj lanca i beleška koraka V6

Lanac je radio 13. 10. 2026. na grani `codex/jovan-admin-v2-2026-10-11`, od commita `ce50f403` (kraj v2) do `1c8264c4` (V5). Zadatak je `tmp/admin-v2-2026-10-11/ZADATAK-V3.md` (privatan, nije u repou) i važi iznad zadatka v2 gde se razlikuju.

**Šta je admin sada.** Sve iz v2 stoji (okvir, sidebar, harmonika, URL stanje, tekst, prečice). Preko toga:
- svaka stranica ima ulaz („Skener“) i prelaz, a navbar ima Puls sistema;
- tri 3D momenta na zajedničkom kitu: Sazvežđe na Dashboard-u, Živa hala sa Vremeplovom u Događajima, Vitrina sa medaljama;
- igra operatera: XP i nivoi, niz, kombo, šef dana, 20 znački, tabela tima, sajamske misije i ceremonije.

Trajni standard je dopunjen: `docs/admin/DASHBOARD-STANDARD.md`, §12–§15.

**Šta lanac nije radio.** Prijavu na pravi `/admin`, produkciju, deploy, izmenu šeme, javni sajam, nove pakete. Sve je provereno testovima i na `/dev/admin-*-preview` rutama sa TEST podacima. **Pravi `/admin` sa živim podacima niko u lancu nije video**; to je prva stavka za vlasnika (§5.1).

## 1. Šta je urađeno, po koracima

| Korak | Commit | Šta | Beleška |
|---|---|---|---|
| V0 | `9a6362e` | Plan i kreativni pravac: osam potpisnih momenata, podela rada, provere. Bez izmena koda. | `docs/admin/v3/V0-PLAN.md` |
| V1 | `5843e4d` | Tokeni pokreta u tri sloja, reveal engine i atributi na svim stranicama, prelaz stranica, materijal (svetlo, magnet, nagib, shimmer), Puls i živa ivica. | `docs/admin/v3/V1.md` |
| V2 | `0e4ac5e` | 3D kit (lenji uvoz, kvalitet, pauza, bloom, čestice, 2D rezerva) i Sazvežđe kao hero Dashboard-a. | `docs/admin/v3/V2.md` |
| V3 | `35827d7` | Hala na kitu (slojeviti stubovi, uvod kamere, čestice skena), Vremeplov, isečak hale na Pregledu, jedan nov Convex upit samo za čitanje. | `docs/admin/v3/V3.md` |
| V4 | `0479330` | Igra: motor, XP, nivoi, kombo, niz, šef dana, 20 znački, Vitrina sa 3D medaljom, tabela tima, sajamske misije, ceremonije, lanac uzroka; ruta `/dev/admin-igra-preview`. | `docs/admin/v3/V4.md` |
| RV | `77f1607` | Nezavisni pregled: presuda „treba dorada“; 1 visok, 13 srednjih i 17 niskih nalaza; art direkcija 6,5 od 10. Bez izmena koda. | `docs/admin/v3/RV-PREGLED.md` |
| V5 | `1c8264c` | Dorada: visok i svih 13 srednjih nalaza ispravljeno; od 17 niskih 13 ispravljeno, 1 delimično, 3 ostavljena uz razlog; pet „wow“ poteza iz pregleda. | `docs/admin/v3/V5.md` |
| V6 | (ovaj korak) | Standard i ovaj izveštaj. Samo dokumenta. | odeljak 7 |

**U brojevima** (`git diff --shortstat ce50f40 1c8264c`): 287 izmenjenih fajlova, 30.528 dodatih i 784 uklonjena reda. Testovi: sa 335 fajlova i 3.421 testa na kraju v2 na 391 fajl i 4.621 test; nijedan nije isključen ni oslabljen (namerno izmenjeni testovi su navedeni u beleškama koraka). Lint: ista dva zatečena upozorenja pre i posle. `three` nije u početnom bundle-u nijedne od 49 admin i preview ruta; svi lenji chunk-ovi sa `three` zajedno imaju 178 kB gzip (budžet 300), mereno u V4.

**Kako je teklo.** V3 je prošao iz drugog pokušaja: push na Convex DEV runnera pao je zbog mreže, ne zbog koda (V3 §13). U V4 se dev server lanca tri puta sam restartovao (`docs/tasks/BLOCKED.md`, „ADMIN v3 V4“). Tri puta je odbijen po jedan poziv alata (brisanje starih snimaka u V2; `git config` kod radnika u V3 i V4); nijedan nije ništa promenio.

### Po oblastima

- **Pokret** (`lib/admin-v2/motion.ts`, `lib/admin-v2/reveal/`, `components/admin/reveal/`): tri sloja tokena; jedan engine čita `data-admin-reveal` atribute sa deljenih primitiva, pa stranica ne piše animaciju. Atribute nosi svih 28 stranica iz navigacije.
- **Puls** (`lib/admin-v2/pulse.ts`, `components/admin/frame/admin-pulse*.tsx`): otkucaj za svaki pravi događaj, iz podataka koje admin već čita. Bez novog upita.
- **3D kit** (`components/admin/three/`, `lib/admin-v2/three/`): jedna pozornica za sve scene; `three` se učitava tek kad scena treba da krene.
- **Sazvežđe** (`components/admin/dashboard/`, `lib/admin-v2/constellation/`): svaka otvorena stavka „Za reakciju“ je zvezda, orbita je hitnost, prsten oko jezgra je zaostatak. Lista ostaje ispod.
- **Živa hala i Vremeplov** (`components/admin/events/analytics/`, `lib/admin-v2/hall/`): 3D je podrazumevan od 768 px, 2D je izbor, rezerva i telefon.
- **Igra** (`lib/admin-v2/game/`, `components/admin/game/`): jedan čist motor; isti radi u adminu i u preview-u.
- **Backend:** jedan nov admin upit samo za čitanje, `fairEventAnalytics.getEventStandHours` (`convex/fairEventAnalytics.ts`, `convex/lib/fairEventAnalytics.ts`), pušten na DEV. Šema, indeksi i postojeći upiti nisu menjani. Igra nema nijedan nov upit.

## 2. Potpisni momenti i gde ih videti

Sve rute su dev preview sa TEST podacima, na `http://localhost:3170` dok radi dev server lanca. Tri stvari važe za svaki momenat:

- **Ulaz se vidi samo pri klijentskoj navigaciji** (klik na link navbara ili sidebara). Tvrdo učitavanje preview rute crta gotovu stranicu; na pravom `/admin` ulaz radi i tada, jer se sadržaj montira posle čuvara.
- **Reduced motion i tihi režim gase sve ovo.** Ako se ništa ne kreće, proveri sistemsko podešavanje i prekidač u meniju profila.
- **Sjaj (bloom) postoji samo u tamnoj temi** i samo na pravoj grafici. U headless pregledaču se uključuje sa `?kvalitet=high`.

| # | Momenat | Šta se vidi | Gde |
|---|---|---|---|
| 1 | **Skener** | Zelena linija pređe ekran i pali ono preko čega prođe: naslov izlazi iz maske, pločice broje od nule, grafikoni se crtaju, redovi ulaze redom. Gotovo za 900 ms. | Otvori `/dev/admin-okvir-preview/klijenti`, pa klikni „Zadaci“, „Finansije“ ili „Događaji“ u navbaru. Kasni podaci: `/dev/admin-dashboard-preview?kasni=1500`. |
| 2 | **Puls i živa ivica** | Linija na donjoj ivici navbara sa otkucajem za svaki događaj; ivica ekrana je zelenija kad se više dešava. | `/dev/admin-dashboard-preview?puls=demo&energija=1` (šest otkucaja, po jedan od svake vrste) |
| 3 | **Sazvežđe sa prstenom zaostatka** | Jezgro, četiri orbite po hitnosti, hitne zvezde pulsiraju, crveni prsten oko jezgra je šef dana. Hover na red liste crta liniju nišana do njegove zvezde. | `/dev/admin-dashboard-preview`; stanja `?obim=mine`, `?state=empty`, `?state=unavailable`; nišan `?nisan=<id stavke>` |
| 4 | **Rešena i nova stavka** | Rešena zvezda pozeleni i spiralno ode u mirnu orbitu sa tragom; nova pada u orbitu spolja. | `?sazvezdje=1` (rešena, posle 4 s) i `?sazvezdje=2` (nova) |
| 5 | **Lanac uzroka i kombo** | „Reši“ → komet od stavke do trake šefa (broj štete, trzaj) → u XP čip („+30 XP“). Od druge brze akcije brojač komba. | `/dev/admin-dashboard-preview`, dugme „Reši“ na stavci sa ručnim rešavanjem; `/dev/admin-igra-preview?igra=kombo` |
| 6 | **Živa hala sa slojevima** | Kamera dolazi u pogled, stubovi rastu od najbližeg; svaki sloj stuba je jedan sat u boji gužve; iz aktivnih štandova se dižu čestice, novi sken daje prsten i snop. | `/dev/admin-events-preview/analitika#mapa`; skenovi uživo `?uzivo=auto`; isečak na `/dev/admin-events-preview/pregled` |
| 7 | **Vremeplov** | „Premotaj dan“ odigra ceo sajamski dan za 12 s: sat teče, stubovi se zidaju, rang štandova se preslaguje na svaki ceo sat. | `/dev/admin-events-preview/analitika?vremeplov=auto`; zaustavljeno na satu: `?vremeplov=13` |
| 8 | **Ceremonija i Vitrina** | Medalja izleće iz XP čipa u centar uz prsten i čestice; u Vitrini se 3D medalja okreće prevlačenjem, a materijal pokazuje retkost. | `/dev/admin-igra-preview?igra=…` (tabela ispod); Vitrina: `?igra=vitrina` ili prečica G V |
| 9 | **Živi red** | Red koji stigne dok je lista otvorena ulazi sa zelenom ivicom koja gasne. | Nema dev parametra; dokaz su kadrovi `output/playwright/admin-v3/V1/zivi-red-*.png` |

**Stanja igre na `/dev/admin-igra-preview`.** `?stanje=` bira TEST operatera, `?igra=` pritisne dugme posle učitavanja. Ista dugmad su na stranici. Bez `?stanje=` operater je jednu stavku do novog nivoa (uz `?igra=rang` do novog ranga), pa akcija koja nosi XP može da donese i nivo. Za samo jednu ceremoniju dodaj `?stanje=mirno`, npr. `?stanje=mirno&igra=znacka`.

| `?igra=` | Šta izvede |
|---|---|
| `nivo` | akcija koja donosi novi nivo: velika ceremonija |
| `rang` | ista akcija nad operaterom pred novim rangom: novi rang i značka tog ranga, kao jedna ceremonija |
| `znacka` | retka značka: kartica uz XP čip |
| `epska` | epska značka: velika ceremonija |
| `sef` | šef dana pada: ceremonija šefa, pa još jedna, ostatak kao „I još N“ |
| `kombo` | tri brze akcije: brojač komba ×2 |
| `rekord` | nov rekord sata: kartica |
| `vise` | četiri stvari odjednom: dve ceremonije, ostatak u toast |
| `vitrina` | otvara Vitrinu |
| `zaostatak` | novi zaostatak: šef dobija zdravlje nazad |

| `?stanje=` | TEST operater |
|---|---|
| `nivo` | jednu stavku do novog nivoa |
| `rang` | jednu stavku do novog ranga |
| `mirno` | daleko od novog nivoa |
| `pocetak` | nov operater bez ičega |

Ostalo: tabela tima na `/dev/admin-team-preview`; mapa misija pred sajam na `/dev/admin-events-preview/pregled?faza=pre`; dnevni izazovi na istoj ruti dok je sajamski dan otvoren. Preview Dashboard-a, Analitike i Pregleda prima i `?kvalitet=high|low|off` (kvalitet scene) i `?uzivo=1…9` (simulirano čitanje).

## 3. Odluke

Svaka je zapisana u belešci svog koraka, sa razlogom. Ovde su one koje odstupaju od zadatka ili menjaju kako se admin koristi.

**Odstupanja od zadatka (za potvrdu vlasnika)**

1. **Zvezde Sazvežđa su stavke „Za reakciju“, ne klijenti i lokali.** Ime klijenta i aktivnost ne stižu klijentu uz te stavke. Veličina zvezde je koliko stavka čeka, ne aktivnost (V0 §9.1.8, V2).
2. **Niz dana traži moj rad i „Hitno“ viđeno na nuli (ili palog šefa).** Uslov „sve misije rešene“ iz zadatka nije ugrađen: motor igre ne zna misije sidebara. Pravilo piše u Vitrini onako kako se računa (V5, N2).
3. **Mapa misija nema čvor „test skenovi“.** Taj broj ne stiže klijentu (V4).
4. **Ceremonija uvek crta 2D medalju.** Zadatak kaže „3D značka gde ima smisla“; WebGL kontekst unutar trenutka od 1,6 s košta frejmove i gasi ostale scene. 3D medalja je u Vitrini (V5).
5. **Šejderska aura ekrana se ne pravi.** Bila bi treći WebGL kontekst na svakoj stranici, sa sjajem preko teksta. Istu poruku nosi živa ivica (V0 §1). Zadatak to dopušta uz zapisan razlog.
6. **GSAP `Flip` se ne koristi**, iako ga zadatak navodi. Lista klizi sopstvenim FLIP-om iz v2, koji razlikuje filter od pollinga; komet je let između dve izmerene tačke (V5, N8).
7. **Linija grafikona Finansija se otkriva `clip-path`-om, ne DrawSVG-om.** Linija ima `non-scaling-stroke`, pa joj se dužina ne može izmeriti. DrawSVG radi na prstenovima i kvačici (V1).
8. **DPR scena je najviše 1,5** (zadatak dozvoljava 2), radi integrisane grafike (V0, V2).
9. **`FRONTEND-DELTA-<datum>.md` nije napisan.** `docs/events/sajam-automobila-2026/**` je zabranjena putanja lanca. Isti sadržaj je u V3 §9 i u §5.2 ovde.

**Pokret**

10. Pun ulaz ide pri prvom ulasku na rutu u sesiji i ponovo posle 20 minuta; između je kratak ulaz do 360 ms. Pun ulaz na svakoj navigaciji usporava rad, a „jednom u sesiji“ deluje kao da pokreta nema.
11. Stara stranica se pri prelazu priguši (do 55 %, 140 ms), ne gasi: potpuno gašenje bi dalo prazan ekran dok nova ruta stiže.
12. Svetlo za kursorom je jedan sloj u ekranu, ne sloj u svakom panelu, i namerno je tiho (6 % i 9 %).
13. **Tihi režim sada gasi i pokret**, ne samo proslave. Tekst uz prekidač je promenjen.
14. Osigurač otkrivanja je 30 s: kraći bi ugasio otkrivanje na skrol svakome ko prvi ekran čita duže.

**3D**

15. Orbita je klasa prioriteta (`priorityClass`), da broj zvezda na orbiti odgovara broju u legendi.
16. Hero Dashboard-a ima tri visine (20, 15 i 13 rem) i prekidač „Samo lista“; šef dana i kombo ostaju vidljivi i u režimu liste.
17. Hala je druga celina Analitike. Kutija je 28–30 rem; kamera uokviruje štandove sa skenovima.
18. **Običan točkić ne zumira halu**, nego skroluje stranicu; zum je Ctrl i točkić ili dva prsta.
19. Vrh stuba je tačna boja legende sa svetlećim obodom; cela svetleća površina je davala izmaglicu i isprane boje.
20. Boja vrha u Vremeplovu je gužva dana do tog trenutka; sloj nosi gužvu svog sata.
21. Sati otvorenog dana čitaju se ponovo najviše jednom na sat, na „Premotaj dan“ i na „Osveži“; nikad na tajmeru pollinga.
22. Dan i sat Vremeplova nisu u URL-u: to je pogled, ne filter.

**Igra**

23. **XP dolazi iz serverskog dnevnika admin akcija** (`adminActivity.list`), bez novog upita i bez izmene šeme. Lokalno je samo ono što server ne pamti kroz vreme.
24. **Šef je timski, pobeda je lična samo uz moj rad.** Ceremoniju i značke šefa dobija onaj ko je tog dana imao bar jednu akciju koja nosi XP.
25. Odlaganje nikad ne daje pobedu.
26. Kombo dodaje najviše 200 XP dnevno; jeftine akcije imaju dnevnu granicu po vrsti (`XP_DAILY_MAX`).
27. **Rang-lista ljudi postoji** (tabela tima), jer je v3 izričito traži; v2 ju je zabranjivao.
28. Sajamska značka je vezana za događaj; završen događaj je ne daje, a već tačna činjenica se upiše bez ceremonije.
29. XP čip sa „Nv 7“ je u navbaru od 1400 px; ispod toga je prsten sa brojem nivoa oko profila, da svih devet linkova stane.
30. Traka tima na Dashboard-u stoji ispod liste „Za reakciju“: lista je posao, traka je pregled.
31. Maskote i zvuka nema. Šef je traka i prsten sa naslovom.

## 4. Kadrovi pre i posle

„Pre“ je kraj v2 (snimci runnera posle X6), „posle“ je kraj v3 (snimci runnera posle V5). Oba skupa su konačno stanje u svetloj temi, snimljena alatom lanca sa reduced motion. Folderi su lokalni i nisu u repou: `scripts/tasks/logs/admin-v2/snimci/X6-a1/` i `…/V5-a1/`. Sve navedene kadrove sam otvorio u ovom koraku.

| Stranica | Fajl (isti u oba foldera) | Pre (v2) | Posle (v3) |
|---|---|---|---|
| Dashboard, 1280 | `dev_admin-dashboard-preview-1280-svetla.png` | Red od četiri broja, pa lista „Za reakciju“. | Hero: Sazvežđe levo, brojevi i traka „Šef dana: zaostatak“ desno; lista ispod. U sidebaru red „Operater“ sa nivoom, trakom i plamenom niza; prsten sa brojem nivoa oko profila. |
| Dashboard, 390 | `dev_admin-dashboard-preview-390-svetla.png` | Četiri broja, pa lista. | 2D Sazvežđe, brojevi i traka šefa u jednoj kartici, lista ispod; prsten nivoa u gornjoj traci. |
| Analitika, 1280 | `dev_admin-events-preview_analitika-1280-svetla.png` | Posle brojeva idu „Uvidi“. | Posle brojeva ide „Toplotna mapa hale“ sa izborom „2D \| 3D“ (3D izabran). Sama hala je na ovoj širini ispod prvog ekrana. |
| Pregled, 1280 | `dev_admin-events-preview_pregled-1280-svetla.png` | Stanje događaja i „Šta treba da uradim“. | **Prvi ekran je isti**, uz red „Operater“ i prsten nivoa. Izazovi dana i isečak hale su ispod prvog ekrana. |
| Tim, 1280 | `dev_admin-team-preview-1280-svetla.png` (samo u V5) | Nije sniman u X6. | Panel „Tabela tima“ sa medaljama, nedeljnim XP-om, kombom i promenom mesta, iznad brojeva člana. |

Ono što statičan snimak u svetloj temi ne pokazuje je najveći deo v3: pokret, sjaj i igra. To su kadrovi skripti sa lažnim satom, u `output/playwright/admin-v3/` (git ih ignoriše). Otvorio sam ove:

| Kadar | Šta se vidi |
|---|---|
| `V5/R2/uvod-tamna-0300.png` | Sazvežđe 300 ms po ulazu: jezgro i prsten zaostatka svetle, zvezde su još prigušene. |
| `V5/R2/sazvezdje-1440-tamna.png` | Sazvežđe upaljeno: zvezde sa sjajem u tri tona, spoljna orbita kao pojas tačaka. |
| `V5/R3/tamna-2-sredina-premotavanja.png` | Hala usred premotavanja: slojeviti stubovi sa svetlećim obodima, zeleni snopovi i čestice, prsten celog sata po podu, sat, klizač i rang ispod. |
| `V5/R5/kadrovi/sef-tamna-0520.png` | Ceremonija „Šef je pao“: zlatna medalja u centru, prsten udara, čestice kao tragovi, toast „I još 2“. |
| `V5/R5/kadrovi/komet-tamna-1440-0450.png` | Komet stiže u XP čip dok teče ceremonija „Novi nivo: 8“; traka šefa pokazuje „17 od 20“ i „−3“. |
| `V5/vodja/s13-vitrina-tamna.png` | Vitrina: holografska medalja levo, mreža 20 znački u dve grupe, zaključane kao siluete, napomene o tome šta se vodi na uređaju. |

Ostali kadrovi i video snimci su popisani u beleškama koraka (V1 §6, V2 §10, V3 §10, V4 §10, V5 §8). Video snimke niko u lancu nije mogao da pogleda.

## 5. Otvorene stavke

### 5.1 Za vlasnika

Prve tri su posao, ostalo su odluke ukusa koje se menjaju na jednom mestu.

1. **Pogledati pravi `/admin` sa živim podacima.** Niko ga u lancu nije video. Posebno: ulaz uz spore upite, igra nad pravim dnevnikom (`GameLive`), čitanje sati na Pregledu i Analitici, Sazvežđe kad se lista osvežava svake minute.
2. **Pogledati 3D na pravoj grafici.** FPS, rad regulatora kvaliteta i jačina sjaja nisu mereni: kadrovi su sa softverskim WebGL-om. Dodir na tabletu i stariji Safari nisu vežbani.
3. **Pogledati video snimke** (`output/playwright/admin-v3/V*/video/`): pretapanje platna, trzaj trake šefa, FLIP ranga i let kometa vide se samo u njima.
4. Da li prvi pogled na v3 treba da bude u tamnoj temi: sjaj i dubina postoje samo tamo.
5. XP vrednosti, imena rangova, dnevna granica komba (200 XP) i dnevne granice jeftinih akcija. Sve je u `lib/admin-v2/game/xp.ts`, `combo.ts` i `levels.ts`.
6. Da li niz dana treba da prizna i „sve misije rešene“ (odluka 2).
7. Da li glavno dugme „Reši“ prelazi iz zelene ispune u obrub, da zelena ispuna ostane samo za ono što se upravo dešava.
8. Jačina svetla za kursorom (6 % i 9 %) i jačina sjaja u tamnoj temi: namerno su tihe.
9. Da li pun ulaz treba da se vraća posle 20 minuta ili ređe.
10. Da li traka tima na Dashboard-u ide iznad liste, po cenu jednog reda liste na prvom ekranu.
11. Da li boja tačke u redu liste treba da bude isti ton kao zvezda (sada se u retkom slučaju razlikuju).
12. Da li je hero od 13 rem na niskom prozoru prihvatljiv.
13. Hala: da li običan točkić treba da zumira posle klika u halu; da li je boja vrha u Vremeplovu gužva dana ili tekućeg sata; da li završen dan treba skratiti na poslednji sat sa skenom.

### 5.2 Za Aleksu

**Novi upit (jedina izmena backend-a u v3):**

1. **`fairEventAnalytics.getEventStandHours({ eventId, dateKey, at })`**, samo za čitanje, samo za admina. Potpis, granice i izmeren trošak su u V3 §3.
   - Najviše 2.150 opsega indeksa po čitanju (granica Convex-a je 4.096) i oko 17.500 dokumenata (granica 32.000). Brojače čita jedan po jedan; trajanje nije mereno, samo broj čitanja. Da li ostaje ovako ili ide zbirni dokument?
   - Pušten je samo na DEV (`dev:expert-pelican-136`). **Na produkciju ništa nije pušteno:** Vremeplov i isečak hale ne rade na produkciji dok se upit ne pusti. Deploy je tvoja odluka.
   - `convex/fairAuthz.test.ts` ga navodi kao admin funkciju.

**Postojeći upiti koje v3 čita češće ili na nov način (za ocenu troška):**

2. Okvir drži jednu živu pretplatu na `adminDashboard.reactions({ scope: "all", limit: 1 })` na svakoj admin stranici (Puls i šef dana dele je).
3. Igra čita `adminActivity.list` po operateru: 50 najnovijih redova živo, istoriju jednom (do 1.000 redova). Tabela tima čita do 200 redova po članu, pri otvaranju i na 5 minuta dok je na ekranu. Na Dashboard-u je traka tima uvek na stranici.
4. Pregled čita `getEventAnalytics` dok je sajamski dan otvoren i blok „izazovi + hala“ na ekranu, jednom pa na 60 s.

**Šta bi backend mogao da doda (novi upiti ili polja; ništa od ovoga nije rađeno):**

5. **Ime klijenta i aktivnost uz stavke „Za reakciju“** (`contextLabel` je uvek `null`): tada zvezde mogu biti klijenti, sa veličinom po aktivnosti.
6. **Istorija zaostatka po danu i nedeljni XP po članu na serveru:** tada su niz, najveće zdravlje šefa i tabela tima isti na svakom uređaju i jeftiniji za čitanje. Danas se vode u pregledaču.
7. **Broj test skenova pre otvaranja po događaju:** tada mapa misija dobija čvor „test skenovi“.

**Pitanja:**

8. Da li su stari redovi `adminAuditLog` projektovani u `adminActivityRows` na produkciji? Od toga zavisi od kog datuma XP kreće.
9. Da li zahtev bez kolačića posetioca ikad pravi sajamski sken? Novi upit broji isto što i `getEventAnalytics` (zatečeno; tiče se svih brojeva skenova).
10. `getEventAnalytics` je na većem sajmu blizu granice od 4.096 opsega (zatečeno; Vremeplov ima svoj budžet).
11. „Izmena QR ili NFC kanala“ nosi XP, a dnevnik ne kaže da li je to ispravka. Ako treba razlika, traži poseban `action`.

### 5.3 Poznata ograničenja

- **Lokalno, po uređaju:** niz dana, najveći zaostatak dana i značke koje su trenutak ne prelaze na drugi uređaj. Datum sajamske značke je trenutak kad ju je ovaj pregledač prvi put video. UI to kaže tamo gde se prikazuje.
- **Tuđe odlaganje se ne prepoznaje:** ako kolega odloži poslednju stavku zaostatka, traka pokaže da je šef pao, a ko je tog dana radio dobije i ceremoniju.
- **Dve kartice istog admina** mogu da pokažu istu ceremoniju.
- **Zbir XP-a i rep od 26 h:** isti zadatak ili kanal dirnut tri puta u oko dva dana može dati zbir koji odstupa. Nađeno čitanjem, nije reprodukovano testom.
- **Greška živog čitanja gasi igru** do ponovnog učitavanja stranice, bez poruke.
- **2D slika i scena Sazvežđa nisu isto uokvirene**, pa se pri paljenju vidi bleda senka sa pomakom.
- **Pun ulaz scene postoji samo pri klijentskoj navigaciji.**
- **Hala:** oznake štandova mogu da se dodirnu; slojevi živog prikaza kasne za visinom između dva čitanja sati; završen dan se premotava do 24:00 sa praznim večernjim satima.
- **Analitika i Pregled** različito čitaju „događaj je završen“ uveče poslednjeg dana.
- **`scenes/medal-scene.ts`** ima režim `ceremony` koji više niko ne poziva.
- **Ostali widgeti Dashboard-a** čiji upit prima `now` (Finansije, Zadaci) i dalje se vraćaju na skeleton pri svakom čitanju (zatečeno).
- **Nije vežbano u pregledaču:** filter u prvih 900 ms ulaza, promena sistemskog podešavanja pokreta uživo, točkić na starom Safariju, dodir na tabletu.
- **Art direkcija:** pregled RV je ocenio 6,5 od 10 pre dorade. Posle dorade ocena nije ponovljena; van Dashboard-a, Događaja i Vitrine admin je i dalje v2 sa ulazom.

## 6. Uputstvo

### 6.1 Kako se igra

Igra ne traži ništa posebno: radiš svoj posao, a admin ga broji.

1. **XP dobijaš za pravi rad.** Rešena stavka „Za reakciju“ i završena isporuka nose najviše (30), završen zadatak 25, poslat odgovor, uplata, odobren dizajn i kontrola kvaliteta 15, sitnije radnje 3 do 10. Svaka akcija je red u dnevniku na serveru, pa XP postoji na svakom uređaju.
2. **Nivo i rang** rastu sa XP-om: Pripravnik, Operater, Dispečer, Komandant, Legenda. Nivo vidiš u prstenu uz profil (od 1400 px i kao „Nv 7“) i u redu „Operater“ na dnu sidebara, gde su i XP danas i traka do sledećeg nivoa.
3. **Kombo:** radi brzo. Akcije sa razmakom do 2 minuta se nižu; treća i četvrta nose ×2, od pete ×3. Brojač je ispod šefa dana i prazni se 2 minuta.
4. **Šef dana** je zaostatak celog tima: hitno, čeka odgovor i današnje, ponderisano. Traka je na Dashboard-u, a isti broj je crveni prsten oko jezgra Sazvežđa. Svaka tvoja rešena stavka je udarac sa brojem štete. Kad zaostatak padne na nulu, šef je pao; ceremoniju i značku dobija ko je tog dana radio. Novi zaostatak mu vraća zdravlje. Odlaganje nije pobeda.
5. **Niz dana:** radni dan se upisuje kad imaš bar jednu akciju i kad „Hitno“ padne na nulu. Vikend ne prekida niz. Plamen uz „Operater“ pokazuje koliko dana traje; prekinut niz piše kada je prekinut.
6. **Značke:** 20, u četiri retkosti (obična, retka, epska, legendarna). Vidiš ih u **Vitrini**: izaberi značku iz liste, medalju okreni prevlačenjem. Zaključana značka pokazuje uslov i napredak.
7. **Tabela tima:** nedeljni XP po članu, od ponedeljka, na stranici Tim i kao tanak red na Dashboard-u.
8. **Sajam:** pre sajma mapa misija na Pregledu događaja (katalog, nalepnice, izlagači, pitanja, leadovi i forme, spremno); tokom sajma izazovi dana sa napretkom uživo.
9. **Ceremonija** (novi nivo, rang, značka, rekord, pao šef) traje najviše 1,6 s. **Bilo koji taster ili klik je preskače**, i taj klik uradi svoj posao. Dok kucaš u polje ili je otvoren dijalog, umesto nje stiže miran toast.

Šta igra ne radi: ne izmišlja nijedan broj, nema zvuk, ne slavi ono što se desilo dok admin nije bio otvoren.

### 6.2 Prečice

Ne rade dok je fokus u polju za unos, uz otvoren dijalog ni uz modifikator. Posle tastera G u navbaru stoji čip „G …“ dok se čeka slovo.

| Prečica | Šta radi |
|---|---|
| Ctrl K | pretraga i komande |
| ? | spisak prečica |
| / | pretraga stranice |
| Esc | zatvara najbliži sloj |
| G D | Dashboard |
| G K | Klijenti |
| G I | Inbox |
| G Z | Zadaci |
| G E | Događaji |
| G F | Finansije |
| **G V** | **Vitrina** (novo u v3) |

U hali: prevlačenje okreće, Ctrl i točkić ili dva prsta zumiraju, „Vrati pogled“ vraća kameru. Na klizaču Vremeplova: strelice pomeraju jedan sat, Page Up i Page Down tri, Home i End idu na početak i kraj dana, razmak i Enter pokreću i pauziraju.

### 6.3 Tihi režim

Prekidač „Tihi režim“ je u meniju profila i pamti se u ovom pregledaču.

- **Gasi:** ulaz stranice i Skener, prelaz, svetlo za kursorom, magnet i nagib, Puls i živu ivicu (linija stoji ravna), okretanje i čestice u 3D scenama, ceremonije i obaveštenja o rekordima.
- **Ostaje:** svi brojevi, napredak, XP, nivo, traka šefa, značke. Novi nivo, značka i pao šef i dalje stižu, kao jedan miran toast.
- Premotavanje dana u Vremeplovu skače sat po sat umesto da klizi.
- Uključen usred rada odmah smiruje 3D scene; ulaz već otvorene stranice se ne igra ponovo kad se isključi.

Sistemsko podešavanje „smanji pokret“ (`prefers-reduced-motion`) radi isto za pokret, bez prekidača.

Uz to postoje dva izbora prikaza koja se pamte u pregledaču: „Sazvežđe / Samo lista“ na Dashboard-u i „2D | 3D“ na hali.

## 7. Beleška koraka V6

### 7.1 Šta je urađeno i gde

- **`docs/admin/DASHBOARD-STANDARD.md`:** v2 tekst nije brisan. Rečenice koje v3 zamenjuje su precrtane i uz njih stoji „**Zamenjeno u v3**“ sa novim pravilom ili uputom na odeljak (§0 pravila 2 i 3, §4 Marke, §5 tabela i pravila, §6 zabrane, §9 petlja 3D scene). Dodati su §12 Pokret v3 (tri sloja, reveal engine sa atributima i primerom, prelaz stranica, materijal, Puls i živa ivica), §13 3D kit (kad 3D, budžeti, rezerva, dostupnost, primer `AdminStage`), §14 Gamifikacija v3 (mehanike, ceremonije, šta je pošteno, primer XP pravila) i §15 Tihi režim i reduced motion. Dopunjeni su §10 (kadrovi pokreta) i §11 (šta važi za aplikaciju posetilaca).
- **`docs/admin/v3/IZVESTAJ.md`:** ovaj fajl.

### 7.2 Odluke i razlozi

1. **Standard je nadograđen na mestu, sa precrtanim rečenicama**, umesto novog fajla ili prepisanih odeljaka. Uputstvo traži da v2 ostane i da se vidi šta je zamenjeno; ko čita §5 ili §6 odmah vidi da pravilo više ne važi i gde je novo.
2. **`ADMIN_PAGE_OFFSET` je u standardu označen kao uklonjen** (traženo u V1 §7). Vrednosti u §12 i §13 su prepisane iz `lib/admin-v2/motion.ts` i beleški koraka, a putanje proverene u stablu.
3. **Kod nije menjan.** Očita greška u tekstu koda nije nađena. Mrtav režim `ceremony` u `scenes/medal-scene.ts` nije tekst i ostaje kao poznato ograničenje.
4. **`AMF-PREPORUKE-IZ-PODATAKA.md` nije diran**, iako je u dozvoljenim putanjama: uputstvo koraka ga ne traži, a v3 nije doneo nove podatke sa sajma.
5. **Novi snimci nisu pravljeni:** korak ne menja nijedan fajl koji pregledač učitava. Za „pre i posle“ su korišćeni postojeći snimci runnera i kadrovi koraka; svaki navedeni sam otvorio.
6. **Brojevi po štandu nisu navedeni ni iz TEST fixtures.** Beleške koraka citiraju izmišljene TEST brojeve; ovde su izostavljeni, da izveštaj nema nijedan broj uz šifru štanda.
7. **Otvoreno pitanje V0 §9.4.7 (tamna tema kao prvi pogled) i stavke „šta nije provereno“ iz RV su podignute u §5.1**, jer ih nijedan korak nije zatvorio.

### 7.3 Fajlovi van dozvoljenih putanja

**U ovom koraku: nijedan.** Izmenjeni su samo `docs/admin/DASHBOARD-STANDARD.md` i `docs/admin/v3/IZVESTAJ.md`, oba pod `docs/admin/**`. Pomoćni fajlovi su u `output/playwright/admin-v3/V6/` i `tmp/admin-v2-rad/v6/` (git ih ignoriše).

**U celom lancu v3** (iz beleški koraka):

| Fajl | Korak | Razlog |
|---|---|---|
| `lib/i18n/types.ts` | V1, V2, V3, V4 | Nov tekst mora imati ključ u `Dict` interfejsu (pravilo repoa, RFC-001 §2.12). Dodavana su samo polja tipa `string` i tipovi iz fajla bez uvoza; typecheck Convex-a prolazi. |
| `convex/fairAuthz.test.ts` | V3 | Tabela zaštite svih sajamskih funkcija mora da navede novi upit `getEventStandHours`; test poredi tabelu sa izvozima modula. |

V5 nije dirao nijedan fajl van opsega. `docs/tasks/BLOCKED.md` je dobio unos u V4 (dev server lanca).

### 7.4 Provere sa izlazom

`tsc`, lint i testovi su pušteni posle izmene standarda, dok je ovaj izveštaj pisan (dokumenta ne ulaze ni u jedan od ta tri gejta); `git diff --check` i `git status` posle poslednje izmene. Logovi su u `output/playwright/admin-v3/V6/`.

```
$ npx tsc --noEmit
TSC_EXIT=0
$ npx tsc --noEmit -p convex/tsconfig.json
TSC_CONVEX_EXIT=0

$ npm run lint
components/admin/venue-admin.tsx
  24:10  warning  'useMemo' is defined but never used  @typescript-eslint/no-unused-vars
convex/purchaseLifecycle.test.ts
  26:10  warning  'price' is defined but never used  @typescript-eslint/no-unused-vars
✖ 2 problems (0 errors, 2 warnings)
LINT_EXIT=0

$ npm test -- --testTimeout=30000 --hookTimeout=60000
 Test Files  391 passed | 2 skipped (393)
      Tests  4621 passed | 2 skipped (4623)
   Duration  92.23s
TEST_EXIT=0

$ git diff --check
DIFFCHECK_EXIT=0

$ git status --short        (bez zatečenih nepraćenih foldera .claude/, scripts/, docs/sajam/)
 M docs/admin/DASHBOARD-STANDARD.md
?? docs/admin/v3/IZVESTAJ.md
```

- Isto kao posle V5: 391 fajl i 4.621 test, dva zatečena preskočena test fajla, dva zatečena upozorenja linta u fajlovima koje lanac nije dirao.
- Oba dokumenta su UTF-8, bez CRLF i bez razmaka na kraju reda.
- `npm run build`, `harness:check` i snimke posle koraka pušta runner; ovde nisu pokretani (korak ne menja kod).
- **Privatni brojevi.** Skripta `tmp/admin-v2-rad/v6/privatno.py` je brojeve oba dokumenta uporedila sa tabelama po modelu i štandu privatnog uzorka (`tmp/admin-v2-2026-10-11/PODACI-SAJAM-2026.md`, naveden samo putanjom). Poklapaju se samo dvocifreni brojevi koji su ovde datumi, redni brojevi, brojevi odeljaka, nivoi, sekunde i pragovi pravila; nijedan trocifren ili veći, i nijedan uz šifru štanda, model ili izlagača. Privatni fajl nije kopiran.

### 7.5 Snimci

Novih snimaka nema (odluka 5). Otvoreni u ovom koraku: devet snimaka runnera iz `scripts/tasks/logs/admin-v2/snimci/X6-a1/` i `V5-a1/` i šest kadrova iz `output/playwright/admin-v3/V5/`, svi navedeni u §4.
