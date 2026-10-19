# AUTO3D: 3D Rendgen limuzine za Auto Moto Fest 2026 (noćni run, 16–17. 10. 2026.)

> Ovo je izvor istine za ceo run, i svaki korak ga čita pre rada.
> - Tehničke planove pišu plan koraci, u `docs/auto3d/planovi/<ID>.md`.
> - Ovaj fajl se ne prepisuje.
> - Odluke donete tokom noći idu u sekcije koraka u `docs/AUTO3D-PROGRESS.md`, u red **ODLUKE:**.

## 0. Šta pravimo, u jednoj rečenici

Pravimo novi, najviši sajamski paket **„3D Rendgen“**. Uz njega ide javna preview stranica `/sajam/3d`. Na njoj je realistična, univerzalna limuzina bez marke, sa prozirnom karoserijom. Svaki deo može da se klikne, a delovi su složeni u grupe sa filterom, i svaki ima specifikaciju.

**Danas:** ScanMe na sajmu prodaje tri nivoa po izloženom modelu:
- „Za sve izlagače“, bez doplate;
- Starter, 3.000 RSD;
- Napredni, 5.000 RSD.

Posetilac skenira QR na autu i dobija stranicu modela sa specifikacijama.

**Posle runa:** postoji četvrti nivo, 3D Rendgen, za 8.000 RSD po modelu, i stranica koja ga prodaje sama.
- Teodora u ponedeljak, 19. 10, šalje link i pokazuje ga auto kućama koje izlažu na AMF-u (Hala Čair, 30. 10 – 1. 11. 2026).
- Posetioci sajma su fanatici automobila, znaju delove, i ovo im je zanimljivo.
- Kasnije, kad izlagač kupi paket, pravimo model po njegovom autu.

## 1. Odluke (Jovan, 16. 10. 2026.)

| # | Odluka |
|---|---|
| O1 | Novi, najskuplji paket po autu za AMF. Sadržaj: 3D auto sa delovima, svaki deo klikabilan, grupe delova sa filterom i specifikacija za svaki deo. Ideje u §6 su deo ponude. |
| O2 | Cena je **8.000 RSD po modelu** (Napredni ispod njega je 5.000 RSD). Radni naziv je „3D Rendgen“. |
| O3 | Auto je univerzalna **limuzina bez marke**. Treba da bude što bliže pravom autu i da „brutalno izgleda“. Karoserija je prozirna. Pravi se u Blenderu. |
| O4 | Stil je kao 3D hero sa sajta autodelovi: rendgen karoserija, sistemi unutra, klik na deo, kamera, kartica dela, grupe. Ali ovo nije prodavnica delova, nego prikaz auta. Sajt autodelovi se ne dira; njegov kod je samo referenca. |
| O5 | Radi se u ScanMe-u, na posebnoj preview stranici. |
| O6 | Na istom projektu paralelno radi noćni run za ScanMe Meni. Nema sudara: posebna kopija repoa, posebna grana od `aleksa/main` i samo novi fajlovi. |
| O7 | Modeli: Opus 5.5 je glavni, Sonnet 5.5 radi sitnije korake. Radnici (subagenti) su Sonnet i Haiku. |
| O8 | Kasnije, za izlagače koji kupe, pravimo poseban model po njihovom autu. To nije deo ovog runa. |
| O9 | Claude pokreće run i prati ga tokom noći. |

### Predlozi (Claude, čekaju potvrdu)

Ovo su izbori koje sam napravio jer odgovor nije postojao. Run ih sledi, a izveštaj ih ponovo navodi.

| # | Predlog | Zašto | Gde se menja |
|---|---|---|---|
| P1 | Ruta je `/sajam/3d`: javna, a `noindex` dobija iz `app/sajam/layout.tsx`. Linkovi: `?deo=<id>`, `?grupa=<sistem>`, `?rezim=rendgen\|lak\|kostur`, `?tura=1`, `?kiosk=1`. | Pripada sajamskom proizvodu, a statički segment ne dira `[eventSlug]`. | `app/sajam/3d/` |
| P2 | Limuzina je velika premium sportska limuzina (mere u §3). Nema logo, natpis ni prepoznatljiv dizajn bilo koje marke. | Univerzalna je, a izgleda skupo i ozbiljno. | `3d/auto3d/` |
| P3 | Specifikacije delova su uverljive vrednosti za ovaj univerzalni auto. Stranica jasno piše: „Primer vrednosti. Za vaš model unosimo prave podatke.“ | Ne izmišljamo podatke o stvarnom autu. | rečnik delova |
| P4 | 3D Rendgen uključuje sve iz Naprednog, plus: 3D rendgen stranicu modela (QR na autu je otvara), kiosk režim za ekran na štandu i direktne linkove na delove. Model prilagođavamo autu izlagača: klasa karoserije, boja, točkovi, pogon i njegove specifikacije. Tačna replika po meri je posebna, dogovorena usluga. | Za 8.000 RSD ne obećavamo ručno modelovanu repliku. | rečnik paketa |
| P5 | 3D scena je tamni „studio“: leden rendgen ton karoserije, kao u referenci, a sistemi su u svojim bojama. Okvir stranice i sekcija paketa prate sajamski DNA (`FAIR-DESIGN-DNA.md`). ScanMe zelena se koristi samo za oznake ScanMe-a. | Rendgen je „vau“ momenat, a ostatak izgleda kao deo sajamskog proizvoda. | `components/fair/auto3d/` |
| P6 | Nema novih npm paketa. GLB se optimizuje preko `npx -y @gltf-transform/cli@4.5.1`, koji ne ulazi u `package.json`; rezerva je Draco iz Blender izvoza. Dekoderi dolaze iz `three/examples/jsm/libs`. Slike se konvertuju preko `sharp`, koji već postoji. | Ne dira se `package.json`, pa nema sudara sa Meni runom. | — |
| P7 | Snimci ekrana i QA renderi se ne commituju (`output/` je ignorisan). GLB, manifest, posteri i OG slika se commituju u `public/3d/auto3d/`. | Repo je javan, pa nosi samo ono što stranica koristi. | — |
| P8 | Budžet runa: bez limita, kao u prethodnim lancima. | — | `config.json` |
| P9 | Pogon univerzalnog auta: 3,0 l R6 biturbo sa blagim hibridom od 48 V, 8-brzinski automatik i pogon na sve točkove, motor postavljen uzdužno. | Najviše zanimljivih delova za fanatike. | rečnik delova, Blender |
| P10 | Tekstovi idu kroz rečnike `lib/i18n/sr/fair-auto3d.ts` (UI i paket) i `lib/i18n/sr/fair-auto3d-delovi.ts` (delovi). To su samostalni moduli po obrascu `landing-packages.ts`, bez izmene zajedničkog registra. | Pravilo repoa (AGENTS.md, RFC-001 §2.12), bez sudara sa Meni runom. | `lib/i18n/sr/` |
| P11 | Poziv na kontakt koristi isti javni kontakt kao `components/offer-footer.tsx` (telefon i `office@scanme.rs`). Drugi brojevi se ne izmišljaju. | Pravilo repoa: nema izmišljenih podataka o firmi. | rečnik paketa |

## 2. Obim

**Radimo:**
- Blender pipeline za ScanMe u `3d/auto3d/`;
- model limuzine: karoserija, stakla, svetla, točkovi, enterijer, mehanika i električni sistemi;
- GLB za desktop i lakši GLB za telefon, manifest, postere i OG sliku;
- 3D pregledač na čistom three.js;
- stranicu `/sajam/3d` sa svim funkcijama iz §6;
- sekciju paketa;
- materijal za Teodorin poziv;
- testove;
- skill `.claude/skills/auto3d-blender/`, koji već postoji i koraci ga dopunjuju naučenim.

**Ne diramo:**
- Convex (`convex/**`), šemu i podatke;
- `lib/fair-entitlements.ts` i `lib/fair-contract.ts`; novi nivo paketa u backendu je posao za Jovana i Aleksu posle prve prodaje;
- postojeće sajamske strane i komponente; samo ih čitamo i preuzimamo obrasce;
- `package.json`, `package-lock.json`, `proxy.ts`, `next.config.ts`, `tsconfig.json`, `vitest.config.*`, `eslint.config.mjs`;
- root layout i globalni CSS;
- admin;
- Meni (`components/menu/**`, `app/m/**`);
- Links i Venue;
- folder `C:\Users\admin\Desktop\Web Dev Projects\scanme`, gde radi Meni run;
- folder `...\autodelovi`.

## 3. Auto: dizajn brief (limuzina, bez marke)

**Klasa:** velika premium sportska limuzina, motor uzdužno, AWD.
- Duga hauba, kabina pomerena unazad, „fastback“ linija krova koja se spušta u kratak poklopac prtljažnika sa usnom spojlera.
- Široko i nisko; točkovi popunjavaju lukove.

| Mera | Vrednost |
|---|---|
| Dužina | 4,98 m |
| Širina bez retrovizora / sa retrovizorima | 1,94 m / 2,13 m |
| Visina | 1,44 m |
| Međuosovinsko rastojanje | 2,98 m |
| Prednji / zadnji prepust | 0,89 m / 1,11 m |
| Trag točkova, napred / pozadi | 1,63 m / 1,65 m |
| Klirens | 0,13 m |
| Gume, napred / pozadi | 255/35 R21 (spoljni prečnik ≈ 0,712 m) / 285/30 R21 (≈ 0,704 m) |
| Rastojanje od prednje osovine do dna vetrobrana (dash-to-axle) | ≈ 1,00 m |
| Linija ramena (donja ivica prozora) od tla | ≈ 0,96 m |
| Nagib vetrobrana | ≈ 60–63° od vertikale |
| Razmak između gume i luka (gore) | 25–35 mm |
| Fuge između panela | 4–5 mm |

**Tolerancija** za mere iz tabele je ±2 %. Skripta ih meri iz scene, ne procenjuje.

**Potpis (šta ga čini skupim i „brutalnim“):**
- **Napred:**
  - tanka LED traka preko cele širine, koja spaja uske farove;
  - velika maska bez logoa, sa trodimenzionalnom rešetkom;
  - bočni usisnici sa vertikalnim lopaticama;
  - spliter.
- **Bok:**
  - utopljene kvake;
  - oštra linija ramena koja se diže iznad zadnjeg točka („mišić“);
  - prag sa tamnim umetkom;
  - tanke nožice retrovizora;
  - crni sjajni okviri prozora;
  - panoramski stakleni krov.
- **Pozadi:**
  - LED traka preko cele širine;
  - difuzor;
  - četiri izduvna izlaza;
  - usna spojlera.
- **Točkovi:** 21", deset dvostrukih krakova, tamni grafit. Kroz krakove se vide kočnice: napred disk 400 mm sa 6-klipnim čeljustima, pozadi disk 380 mm.
- **Bez marke:** nijedan logo, natpis ni oblik maske po kom se prepoznaje proizvođač; mesta za amblem su prazna.

**Znaci lažnog CG auta.** Svaki krug kvaliteta proverava ove znake:
1. mali točkovi ili uske gume;
2. preveliki razmak gume i luka;
3. točkovi uvučeni u odnosu na karoseriju;
4. auto lebdi iznad poda;
5. previsoka, kockasta karoserija ili prevelik staklenik;
6. nema fuga između panela;
7. oštre ivice bez zaobljenja („CG“ izgled);
8. fasetirane površine, pa se refleksija lomi;
9. nema detalja (retrovizori, kvake, brisači, svetla bez unutrašnjosti);
10. staklo u ravni sa limom ili nevidljivo;
11. delovi mehanike prolaze kroz karoseriju ili kroz jedan drugi.

U rendgenu se vide silueta i ivice, pa silueta i fuge moraju da budu čiste.

## 4. Delovi i grupe

**Deset sistema.** Id je ASCII, naziv dolazi iz rečnika, a boja važi samo za rendgen:

| id | naziv |
|---|---|
| `karoserija` | Karoserija |
| `enterijer` | Enterijer |
| `motor` | Motor |
| `usis_izduv` | Usis i izduv |
| `hladjenje` | Hlađenje |
| `prenos` | Prenos snage |
| `vesanje` | Vešanje i upravljanje |
| `kocnice` | Kočnice i točkovi |
| `energija` | Gorivo i energija |
| `elektrika` | Elektrika i svetla |

**Delovi:**
- Ima ih 60–80, a tačnu listu daje A01.
- Primer:
  - motor: blok, glava, poklopac ventila, usisna grana, dva turbo punjača, starter-generator od 48 V;
  - prenos: menjač, prenosna kutija, prednji i zadnji kardan, prednji i zadnji diferencijal, poluosovine;
  - vešanje: ramena, vazdušni opruge i amortizeri, stabilizatori, podokviri, letva volana;
  - kočnice: diskovi, čeljusti, felne, gume;
  - hlađenje: hladnjak, interkuler, ventilator, ekspanziona posuda;
  - izduv: katalizatori, GPF, lonci, izlazi;
  - energija: rezervoar od 68 l ispod zadnjeg sedišta, baterija od 48 V, akumulator od 12 V u prtljažniku;
  - elektrika: ECU, kablovski snop, farovi, zadnja svetla;
  - enterijer: sedišta, tabla sa ekranima, volan, konzola, pedale;
  - karoserija: hauba, blatobrani, četvoro vrata, krov, poklopac prtljažnika, branici, pragovi, retrovizori, stakla.
- Ista kopija dela na četiri točka može biti jedan deo sa četiri čvora ili četiri dela; to bira A01.

**Kartica dela:**
- naziv;
- jedna do dve rečenice šta deo radi, glasom iskusnog mehaničara koji priča kolegi;
- 3–6 specifikacija sa jedinicama (materijal, masa, mere, tehnička vrednost);
- jedna „zanimljivost“ za fanatike.
- Format brojeva je srpski: `540 Nm`, `1.850 kg`, `8.000 RSD`.

**Posle A02 su id-jevi delova i ugovor zamrznuti.** Kasniji koraci menjaju geometriju i tekst, ali ne id-jeve.

## 5. Ugovor: GLB i manifest

- **Jedinice i ose:** jedinica je metar.
  - Ose su glTF: +Y gore, prednji kraj auta je +Z, leva strana je +X.
  - Ishodište je na tlu, na sredini međuosovinskog rastojanja.
- **Klikabilni čvorovi:** ime je `part__<sistem>__<deo>`, gde je `<deo>` jedinstven ASCII `snake_case` (to je id u URL-u).
  - Pomoćni čvorovi počinju sa `fx__`.
  - Neklikabilni ukrasi sa `deco__` (njih bira A01).
- **extras svakog klikabilnog čvora:**
  - `part_id`, `system`;
  - `explode_dir`, normalizovan, u glTF prostoru;
  - `explode_dist` u metrima;
  - `explode_stage` (0–3);
  - opciono `focus` (`dist`, `az`, `el`).
- **Materijali su slotovi po imenu,** na primer `mat_body_paint`, `mat_glass`, `mat_lens`, `mat_chrome`, `mat_alu`, `mat_steel`, `mat_cast`, `mat_rubber`, `mat_plastic`, `mat_carbon`, `mat_leather`, `mat_led`, `mat_brake_disc`, `mat_caliper`.
  - Tačan spisak daje A01.
  - three.js menja `mat_body_paint` u rendgen ili lak.
- **Fajlovi u `public/3d/auto3d/`:**

  | Fajl | Budžet |
  |---|---|
  | `limuzina.glb` (desktop) | ≤ 6 MB, ≤ 600 hilj. trouglova |
  | `limuzina-lite.glb` (telefon) | ≤ 3 MB, ≤ 250 hilj. trouglova |
  | `limuzina.manifest.json` | generiše se iz scene, ne piše se ručno |
  | `poster-*.avif` i `poster-*.webp` | AVIF ≤ 200 KB svaki |
  | `og.jpg` | 1200 × 630 |

  Draw call-ova ≤ 250.
- **Testovi ugovora:** Node test čita JSON blok GLB-a, bez three-a, i proverava:
  - čvorovi ⇔ manifest ⇔ katalog;
  - budžeti;
  - da nigde nema imena iz reference.

## 6. Pregledač i stranica `/sajam/3d`

**Režimi:**
- **Rendgen** je podrazumevan: providna, ledena karoserija sa fresnel ivicama, a sistemi u bojama.
- **Lak:** neprovidna karoserija sa metalik lakom i clearcoat-om. Boja se bira od 6 ponuđenih.
- **Kostur:** bez karoserije.

**Interakcija:**
- **Delovi:** hover osvetli deo. Klik bira deo: kamera klizi do njega i otvara se kartica dela.
- **Rasklapanje:** klizač raspada auto po sistemima i fazama.
- **Grupe:** filter po grupi; izabrana grupa svetli, ostalo bledi i ne može da se klikne.
- **Lista delova:** sa pretragom; ovo je i tekstualni ekvivalent scene za tastaturu i čitače ekrana.
- **Presek:** ravan seče auto po dužini.

**Vođena tura** traje oko 60 s i ide sistem po sistem, sa titlom. Prekida se na dodir.

**Kiosk** (`?kiosk=1`) je za veliki ekran na štandu:
- auto se sam vrti i rasklapa;
- tura ide u krug;
- posle 45 s bez dodira sve se vraća na početak;
- u uglu je QR „Nastavi na telefonu“ (`lib/qr/qrcodegen.ts`).

**URL stanje:** `?deo=`, `?grupa=`, `?rezim=`, `?tura=1`, `?kiosk=1`. Dugme „Kopiraj link“ kopira link na izabrani deo.

**Raspored:**
- desktop: scena, a uz nju bočne trake za grupe i listu i kartica dela;
- telefon: scena i donji sheet sa jezičcima Grupe, Delovi i Deo;
- kiosk 1920 × 1080.

**Učitavanje i rezerva:**
- Poster renderovan u Blenderu je LCP; canvas se pojavi preko njega kad se model učita.
- Bez WebGL-a stranica i dalje radi: poster, lista delova i kartice.

**Pristupačnost:**
- tastatura kroz celu putanju;
- `aria-live` najava izabranog dela;
- vidljiv fokus;
- mete od 44 px;
- reduced motion: bez samookretanja, rezovi umesto letova kamere.

**Performanse:**
- three se učitava dinamički, samo na ovoj ruti, i nije u zajedničkim chunk-ovima;
- DPR ograničen;
- telefon dobija lite GLB i nema postprocesa;
- crtanje samo kad se nešto menja;
- pauza van ekrana i kad je tab skriven;
- `dispose` pri izlasku.

**Ispod scene:** sekcija paketa (§7) i `generateMetadata` sa OG slikom, za lep pregled linka u Viberu, WhatsApp-u i mejlu.

## 7. Paket „3D Rendgen“ (sadržaj sekcije)

**Nivoi po izloženom modelu na AMF 2026:**

| Nivo | Cena |
|---|---|
| Za sve izlagače | uključeno |
| Starter | 3.000 RSD |
| Napredni | 5.000 RSD |
| **3D Rendgen** | **8.000 RSD**, istaknut |

Šta tačno sadrže prva tri nivoa piše u `docs/events/sajam-automobila-2026/CLAUDE-MAPA-BACKEND-KONTEKST-V2.md` §3 i `BACKEND-HANDOFF.md` §4.1. Tamo se čita; ništa se ne dodaje.

**3D Rendgen:** sve iz Naprednog, plus ono iz P4.

**„Kako izgleda na štandu“:**
1. QR na autu otvara 3D na telefonu posetioca.
2. Ekran na štandu vrti kiosk.
3. QR na pravom delu (na primer na motoru) vodi pravo na taj deo u 3D-u.

**Napomena na stranici:** „Primer vrednosti. Za vaš model unosimo prave podatke.“

**Poziv:** kontakt iz P11.

**Materijal za Teodoru** je u `docs/auto3d/PRODAJA-3D-RENDGEN.md`:
- pitch od 60 s;
- odgovori na česta pitanja;
- prigovori;
- linkovi za demo;
- šta nam treba od izlagača.

## 8. Tehnika i granice

**Nov kod ide u:**

| Šta | Putanja |
|---|---|
| Blender skripte i alati | `3d/auto3d/` |
| Čista logika i ugovor | `lib/auto3d/` |
| UI | `components/fair/auto3d/` |
| Ruta | `app/sajam/3d/` |
| Rečnici | `lib/i18n/sr/fair-auto3d.ts`, `lib/i18n/sr/fair-auto3d-delovi.ts` |
| Fajlovi koje stranica koristi | `public/3d/auto3d/` |
| Dokumentacija | `docs/auto3d/` |

**Lokalni izlaz, bez commita:**
- `.blend` i QA renderi u `output/auto3d/`;
- snimci ekrana u `output/playwright/auto3d/`.

**Referenca, samo za čitanje:** `.nocni-run/auto3d/tmp/izvor/autodelovi/`, kopija Blender pipeline-a, ugovora i 3D hero koda sa sajta autodelovi.
- Kod se portuje i prilagođava.
- Imena iz reference ne smeju da uđu u ScanMe: imena klijenta i proizvoda iz reference, „SKLOP“, `__sklop3d`, eases `sk.*`.

**Blender:** `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` (5.1.1). Putanja je u env varijabli `BLENDER_EXE`.

**Paketi:** samo postojeći (`three` 0.186.1, `gsap`, `framer-motion`, `lucide-react`, `sharp`, `playwright`).

**Testovi:**
- vitest;
- čista logika ide u `lib/auto3d/**/*.test.ts`, a komponente u `components/fair/auto3d/**/*.test.{ts,tsx}` (obe putanje su već u `vitest.config.ts`);
- testovi koji čitaju fajlove imaju `// @vitest-environment node`.

**Dev server:** samo `npx next dev -p 3180`, nikad port 3000 ni 3199, jer ih koristi drugi run.

**`npm run check`** se ne pušta ceo, jer harness koristi port 3199. Runner pušta tsc, lint, testove i build.

## 9. Koraci

Tačni modeli, effort, režimi i sesije su u `.nocni-run/auto3d/steps.json`. Prompt svakog koraka je u `.nocni-run/auto3d/prompts/<ID>.md`.

| ID | Naslov | Model | Effort | Režim | Sesija |
|---|---|---|---|---|---|
| A01 | Arhitektura: auto, delovi, pipeline, stranica | Opus 5.5 | max | plan | nova |
| A02 | Temelj: Blender pipeline, katalog delova, ugovor, prvi GLB | Opus 5.5 | xhigh | goal | ista (A01) |
| A03 | Plan: 3D pregledač i stranica | Opus 5.5 | high | plan | nova |
| A04 | Pregledač: rendgen, izbor dela, kamera, rasklapanje | Opus 5.5 | xhigh | goal | ista (A03) |
| A05 | Stranica `/sajam/3d`: grupe, kartica dela, lista, telefon | Opus 5.5 | xhigh | goal | nova |
| A06 | Karoserija: proporcije, površine, paneli | Opus 5.5 | xhigh | goal | nova |
| A07 | Karoserija: svetla, maska, stakla, točkovi | Opus 5.5 | xhigh | goal | nova |
| A08 | Mehanika i enterijer | Opus 5.5 | xhigh | goal | nova |
| A09 | Vizuelna revizija auta, izvoz, lite i posteri | Opus 5.5 | xhigh | goal | nova |
| A10 | Tura, kiosk, režimi, presek, boja laka | Opus 5.5 | xhigh | goal | nova |
| A11 | Paket 3D Rendgen na stranici i materijal za prodaju | Sonnet 5.5 | high | goal | nova |
| A12 | Performanse, telefon, pristupačnost | Opus 5.5 | xhigh | goal | nova |
| A13 | Revizija celog runa | Opus 5.5 | max | goal | nova |
| A14 | Završni izveštaj i snimci | Sonnet 5.5 | high | auto | nova |

**Redosled je namerno takav:**
- Pregledač i stranica (A04, A05) nastaju odmah posle prvog GLB-a. Tako postoji upotrebljiv demo i ako neki kasniji korak padne.
- Karoserija i mehanika (A06–A09) posle samo menjaju GLB, a ugovor ostaje isti.

## 10. Kraj runa

- Postoji `docs/AUTO3D-REPORT.md` sa:
  - linkovima za demo;
  - spiskom šta Jovan ručno proverava;
  - predlozima P1–P11 na potvrdu;
  - koracima za deploy: push grane, Aleksa spaja, Convex deploy nije potreban.
- Postoji `docs/auto3d/PRODAJA-3D-RENDGEN.md`.
- Grana `codex/jovan-auto3d-2026-10-16` je lokalna, sa jednim commitom po koraku. Ništa nije pushovano ni deployovano.
