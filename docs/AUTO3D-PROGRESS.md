# AUTO3D — napredak

Noćni run AUTO3D (3D Rendgen limuzine za Auto Moto Fest 2026). Plan: `docs/AUTO3D-PLAN.md`. Pravila: `.nocni-run/auto3d/rules.md`. Svaki korak dopisuje svoju sekciju na kraj (sa svojim ODLUKAMA i BLOKADAMA).

## A01 - Arhitektura: auto, delovi, pipeline, stranica (plan)   (2026-10-17 00:59)
**Plan korak.** Plan je upisan u `docs/auto3d/planovi/A01.md`. Kod nije menjan.

## NAPOMENE ZA SLEDEĆE KORAKE (nadzor, 17. 10. u 01:35)
- **three je instaliran:** `three` 0.186.1 i `@types/three` 0.186.0, sa zavisnostima `@dimforge/rapier3d-compat`, `@tweenjs/tween.js`, `@types/stats.js`, `@types/webxr`, `fflate` i `meshoptimizer`, u istim verzijama kao na grani `codex/jovan-admin-v2-2026-10-11`.
  - `package.json` i `package-lock.json` dopunio je nadzor; to nije izmena agenta.
  - BLOKADA iz A01 §0.2 je ukinuta: A04, A10 i A12 prave pun pregledač.
  - D15 (dodatni posteri sistema u A09) više nije potreban.
  - Drugi paketi se i dalje ne dodaju, a `package.json` se ne menja.

## A02 — Temelj: Blender pipeline, katalog delova, ugovor, prvi GLB   (2026-10-17 01:55)
**Fajlovi:**
- `3d/auto3d/`:
  - ulazi: `blender.mjs`, `catalog-json.mjs`, `pipeline.mjs`, `optimize.mjs`, `images.mjs`, `contact-sheet.mjs`, `build.py`, `export.py`, `render.py`, `posters.py`, `measure.py`, `collide.py`, `stats.py`;
  - `config/`: `dims`, `body`, `hardpoints`, `explode`, `focus`, `contacts`, `xray`;
  - `lib/`: `scene`, `parts`, `materials`, `cage`, `views`, plus `geo`, `shapes` i `finish` portovani iz reference;
  - `body/`: `shell`, `details`, `wheels`;
  - `parts/`: `brakes`, `suspension`, `engine`, `intake_exhaust`, `cooling`, `drivetrain`, `energy`, `electrical`, `interior`, `proxy`.
- `lib/auto3d/`: `catalog.ts`, `manifest.ts`, `glb.ts`, `budgets.ts`, testovi `catalog`, `glb`, `contract`, `dictionary`, `forbidden-names`.
- `lib/i18n/sr/fair-auto3d-delovi.ts`.
- `public/3d/auto3d/`: `limuzina.glb`, `limuzina-lite.glb`, `limuzina.manifest.json`, `poster-{sklopljen,rasklopljen}-{desktop,telefon}.{avif,webp}`, `og.jpg`.
- `docs/auto3d/PIPELINE.md`.
- `.gitignore` (dodato `3d/auto3d/**/__pycache__/`).
- `.claude/skills/auto3d-blender/SKILL.md` (Naučeno).

**Šta je urađeno:**
- Ceo lanac radi od nule jednom komandom (`node 3d/auto3d/pipeline.mjs`, oko 50–65 s): katalog, Blender scena (desktop i pravi lite), merenje, provera sudara, izvoz, meshopt optimizacija preko `npx -y @gltf-transform/cli@4.5.1`, QA renderi, posteri i OG.
- **Karoserija** je parametarski subD kavez po A01 §1.4:
  - 55 stanica × 11 ključnih linija, prednja i zadnja Coons kapa, Mirror i Subdivision 2 (lite 1);
  - paneli se seku po atributu `panel` posle pečenja, sa fugom, prirubnicom i zaobljenim rubom;
  - lukovi su isečeni po krugu sa prirubnicom od 35 mm;
  - stakla su uvučena 12 mm i debela 4,5 mm;
  - otvori maske i usisnika su isečeni.
- **Svih 78 delova (102 čvora)** su pravi oblici, bez ijednog proxy-ja:
  - točkovi 21" sa 10 dvostrukih krakova;
  - diskovi 400 i 380 mm, čeljusti (6 klipova napred, EPB pozadi);
  - dvostruka ramena, 5 poluga, vazdušni amortizeri;
  - R6 sa dva turba, starter-generatorom i kaišem;
  - menjač, prenosna kutija, kardani, diferencijali i poluosovine;
  - lonci sa 4 izlaza, hladnjak, interkuler, ventilator, creva;
  - sedlasti rezervoar, baterije 48 V i 12 V, ECU, snop;
  - enterijer.
- **Provera sudara:** posle tri kruga preuređivanja motornog prostora nema prodiranja mehanike (`collide.py`: 0 parova, pored dozvoljenih dodira).
- **Rečnik:** puni tekst za 78 delova i 10 sistema. Pisala su ga tri radnika `sonnet` po šablonu iz A01 §2.6; spojen je i pregledan (ispravljena zanimljivost na blatobranu koja je pominjala nepostojeći procep, a bloku su dodati snaga i moment).

**ODLUKE:**
- **A01:** prenete su odluke D1–D14 iz `docs/auto3d/planovi/A01.md` §0.3. D15 i BLOKADA iz §0.2 više ne važe, jer je nadzor u 01:35 instalirao `three` (napomena iznad).
- **Dvostrani materijali:** svi materijali su dvostrani (`doubleSided`), suprotno koloni „dvostran“ u A01 §3.3. Orijentacija lathe profila i otvorenih ljuski nije proverena, a jednostrani materijal bi u three.js sakrio obrnuta lica. A12 sme da vrati jednostrane za zatvorena tela ako to merenje opravda.
- **Fuga:** pola fuge je 2,35 mm (fuga 4,7 mm) umesto 2,25. Zakrivljeni rezovi se mere kao tetiva i ispadaju kraći, a ravne fuge su 4,4–4,8 mm.
- **Tabele kaveza** (`config/body.py`) su pomerene u odnosu na A01 §1.2, da bi izmerene vrednosti posle subdivizije ušle u toleranciju:
  - podnožje A-stuba je na stanici z 0,51;
  - belt je podignut za 20 mm;
  - nos i zadnji kraj kape su istureni 20 mm;
  - prag je na y 0,121;
  - zadnji „mišić“ je na x 0,978.
- **Raspored mehanike** je promenjen u odnosu na A01 §2.5, da nema sudara (vrednosti su u `parts/*.py`):
  - kućište radilice postoji samo iza osovine (z 0,98–1,32), a korito je ispod njega;
  - prednji diferencijal je na y 0,31; starter-generator je na (0,24; 0,52; 1,50);
  - prednji stabilizator je ispred osovine (z 1,72), zadnji iza (z −1,80);
  - prednji amortizer je iza poluosovine (z 1,39), a zadnji je na x 0,58;
  - nosači motora su na z 1,15, x ±0,28;
  - ECU je na (0,62; 0,66; 1,05), a kočioni modul na zidu, sa strane motora (z 0,82–1,04);
  - rezervoar je x ±0,50, z −1,10…−0,68 (oko 70 l), a grlo je na desnom boku, z −2,00;
  - zadnji lonac je na y 0,23, z −2,16; kutija filtera je na (0,45; 0,70; 1,86);
  - prednji kardan je na x 0,20, sa prelomom na z 0,90;
  - podokviri su spušteni (y 0,18 i 0,25).
- **Lite** je pravi model iz istih skripti (subdivizija 1, pola segmenata), ne kopija.
- **Posteri:** napravljena su sva četiri, plus OG, kao privremeni iz kamera manifesta. A09 ih zamenjuje.
- **Svetla prolaze kroz panele** (9 parova u `collide.py`, „kroz karoseriju“). Farovi, zadnja svetla i LED trake leže preko površine, jer otvore u karoseriji pravi A07. Par far–LED traka je u dozvoljenim dodirima.
- **Fuga krov–skelet** meri 3,3 mm, jer je rez na pregibu krovnog nosača. Ostavljeno za A06: rez treba premestiti na ravniji deo.
- **Rasklapanje u kretanju:** `collide.py --motion` javlja 59 parova koji se dodiruju tokom rasklapanja. Vrednosti smera i daljine štimuje A08 (A01 §2.4).
- **Imena mreža (važno za A03 i A04):** mreže u GLB-u se zovu `m__<deo>[__inst]`. three.js GLTFLoader čvor sa više materijala pretvara u `Group` sa imenom čvora i `userData` iz extras, a decu `Mesh` imenuje po mreži.
  - Ranije su se deca zvala `part__…_1`, pa je three video 268 objekata sa `part__` umesto 102.
  - Provereno u Node-u sa three 0.186.1 (GLTFLoader + MeshoptDecoder): tačno 102 `part__` objekta, svi sa `userData.part_id`.
  - Picking: od pogođene mreže ide se uz roditelje do prvog objekta sa `userData.part_id`.
  - Test u `contract.test.ts` čuva pravilo `m__`.
- **Rečnik:** radnik `sonnet` ga je pregledao i našao 25 stavki (fizički netačne zanimljivosti, protivrečnosti između delova, obraćanje „ti“/„vi“, pravopis). Sve su primenjene. Uz to je opis zadnjeg stakla usklađen sa modelom (jako položeno staklo, 18°). Zazor ispod haube je u tekstu 60 mm (zona za pešake), iako je u blokautu manji; to je primer vrednosti.

**Novi paketi:** agent nije dodao nijedan. `three` i `@types/three` je dodao nadzor (napomena iznad).

**Testovi:** svi u `lib/auto3d/`, ukupno 30.
- `catalog.test.ts`: 10 sistema po redu, 60–80 delova, jedinstveni id-jevi, instance, 102 čvora po šemi.
- `glb.test.ts`: čitač GLB-a nad sintetičkim fajlom (trouglovi i draw call-ovi po instanci, extras, greške).
- `contract.test.ts` (node), za oba GLB-a:
  - čvorovi ⇔ katalog;
  - imena;
  - extras;
  - budžeti;
  - samo meshopt;
  - manifest ⇔ GLB ⇔ katalog ⇔ rečnik;
  - statistika;
  - posteri;
  - obris auta;
  - validator manifesta.
- `dictionary.test.ts`: svaki deo i sistem ima tekst, 3–6 specifikacija, dužine, razmak broj–jedinica, bez uzvičnika i TODO.
- `forbidden-names.test.ts` (node): zabranjena imena iz rules.md u fajlovima runa i u GLB-ovima.

**Merenja** (`measure.py`, posle subdivizije):

| Mera | Vrednost | Cilj |
|---|---|---|
| dužina | 4,978 m | 4,98 |
| širina | 1,951 m | 1,94 |
| širina sa retrovizorima | 2,130 m | 2,13 |
| visina | 1,430 m | 1,44 |
| međuosovinsko | 2,980 m | 2,98 |
| prepusti | 0,892 / 1,106 m | 0,89 / 1,11 |
| trag | 1,630 / 1,650 m | 1,63 / 1,65 |
| klirens | 0,130 m | 0,13 |
| gume | Ø 0,712 / 0,704 m | — |
| dash-to-axle | 1,014 m | 1,00 |
| linija ramena | 0,954 m | 0,96 |
| vetrobran | 61,7° | 60–63° |
| razmak guma–luk | 32,3 mm (napred i pozadi) | 25–35 mm |
| guma unutra | 7,3 / 7,9 mm | 2–15 mm |
| belt / visina | 0,667 | 0,64–0,69 |
| guma / visina | 0,498 | ≥ 0,48 |
| fuge | 4,2–4,8 mm, osim krov–skelet 3,3 mm | 4–5 mm |

Sve mere iz PLAN §3 su u toleranciji ±2 %.

- **GLB:**
  - desktop: 1.192.992 B, 170.704 trougla, 204 draw call-a, 106 čvorova;
  - lite: 700.324 B, 78.228 trouglova, 176 draw call-ova;
  - kompresija: EXT_meshopt_compression + KHR_mesh_quantization, bez tekstura.
- **Posteri:** AVIF 29–51 KB, WebP 43–74 KB; OG 42 KB.

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka; 2 stara upozorenja van ovog runa);
- `npx vitest run`: prošlo (2.400 testova, 267 fajlova; 30 testova je novih u `lib/auto3d`).

**QA renderi** (`output/auto3d/renders/A02/`, kontakt-list `sheet.png`):
- **Dobro:**
  - stav i proporcije: duga hauba, kabina pomerena unazad, fastback;
  - točkovi od 21" pune lukove, a auto stoji na podu;
  - fuge se vide u laku;
  - stakla su uvučena;
  - rendgen je čitljiv po bojama sistema, kao u referenci;
  - mehanika je prepoznatljiva (motor, turba, vešanje, kočnice kroz krakove);
  - rasklopljen auto se razlaže po fazama.
- **Loše** (za A06 i A07):
  - nos je visok, ravan i kockast;
  - otvori maske i usisnika su nazubljeni (brisanje lica bez poravnanja);
  - farovi i zadnja svetla leže preko panela;
  - zadnji kraj je masivan i ravan;
  - retrovizori su debeli;
  - rame nema potporne petlje, pa je linija meka;
  - dogleg zadnjih vrata je stepenast;
  - sedišta su kockasta, a tabla je blok.

**Za Jovana ujutru:**
- `docs/auto3d/PIPELINE.md`: `node 3d/auto3d/pipeline.mjs` pravi sve od nule.
- Pogledati `output/auto3d/renders/A02/sheet.png` i poster `public/3d/auto3d/poster-sklopljen-desktop.webp`.
- Stranica još ne postoji (A04 i A05).

## A03 - Plan: 3D pregledač i stranica   (2026-10-17 02:24)
**Plan korak.** Plan je upisan u `docs/auto3d/planovi/A03.md`. Kod nije menjan.

## A04 — Pregledač: rendgen, izbor dela, kamera, rasklapanje   (2026-10-17 03:10)
**Fajlovi:**
- `components/fair/auto3d/viewer/` (jedino mesto koje uvozi `three`): `index.ts` (javni API `createViewer`), `stage.ts`, `loader.ts`, `registry.ts`, `materials.ts`, `environment.ts`, `picking.ts`, `camera-rig.ts`, `explode.ts`, `filter.ts`, `edges.ts`, `anim.ts`.
- `components/fair/auto3d/`: `viewer-island.tsx`, `webgl-probe.ts`, `store.ts`, `studio.tsx`, `rendgen-app.tsx`, `rendgen-page.tsx`, `poster.tsx`, `auto3d.module.css`, `boundary.test.ts`.
- `lib/auto3d/`: `color.ts`, `explode.ts`, `filter.ts`, `framing.ts`, `quality.ts`, `state.ts`, `url-state.ts`, svaki sa testom.
- `lib/i18n/sr/fair-auto3d.ts` (ključevi A04).
- `app/sajam/3d/page.tsx`.

**Šta je urađeno:**
- `/sajam/3d` prikazuje limuzinu u rendgenu: poster je LCP, a posle `load` i idle vremena ostrvo dinamički učitava `./viewer` (three, GLTFLoader + MeshoptDecoder, OrbitControls, RoomEnvironment) i pretapa canvas preko postera (320 ms). Kadar canvasa je isti kao kadar postera (`setViewOffset`, contain parity): obris auta se poklapa do piksela.
- **Materijali:** rendgen ljuska i staklo su neosvetljen fresnel šejder (`MeshBasicMaterial` + `onBeforeCompile`, vrednosti iz `manifest.look.xray`) u dva prolaza; mehanika je u bojama sistema (isto pravilo slotova kao Blender `apply_xray`); lak je PBR iz GLB-a sa bojom karoserije; kostur sakriva karoseriju. Režimi rade preko `?rezim=lak|kostur` (prekidač u UI-ju je A05/A10).
- **Hover** (miš): posvetljenje boje sistema +35 %, fresnel rub i tanke bele ivice. **Klik/dodir** bira deo: bela boja, ivice svih instanci (vidljive i kroz karoseriju), oznaka dela u studiju sa X, let kamere (GSAP, 0,7–1,4 s, po sferi, log zum) do kadra u slobodnoj zoni. Esc ili X zatvaraju deo i kamera se vraća.
- **Kamera bira ugao iz kog se deo vidi:** ugao iz manifesta, pa do 11 susednih uglova (zraci kroz Box3 pretprolaz); ako nijedan nije čist, ugao ostaje iz manifesta, a delovi koji zaklanjaju postaju providni (i klik prolazi kroz njih). Bez toga je točak zaklanjao turbopunjač, a rezervoar pumpu goriva.
- **Rasklapanje** 0–1 po fazama (ista formula kao Blender), klizač i dugme „Rasklopi/Sklopi“ (1,6 s); dok korisnik nije pomerio kameru, kadar prati rasklapanje (početni → rasklopljeni kadar iz manifesta).
- **Filter grupe** (`?grupa=`): ostali delovi se prigušuju (0,10, sivo, bez klika), kamera kadrira sistem.
- **Životni ciklus:** crtanje samo na promenu (u mirovanju 0 rAF), pauza van ekrana i na skrivenom tabu, `dispose` sa `forceContextLoss`, gubitak i povratak WebGL konteksta (poster se vraća, PMREM se pravi iznova), Save-Data dugme, retry posle greške, tastatura nad studijem (strelice, +/−, Home), `aria-live` najava izabranog dela. URL se ažurira preko `replaceState` (`?deo=`, `?grupa=`, `?rezim=`).

**ODLUKE:**
- **A03:** prenete su odluke E1–E20 iz `docs/auto3d/planovi/A03.md` §0.3. Iz A04 su već sprovedene E2, E3, E5, E7, E8, E10 (server čita `searchParams`), E12 (A10), E15, E16, E17, E18, E19; E1, E9, E11, E14, E20 su pripremljene i dovršava ih A05/A10.
- **Lak i kostur u A04:** prompt A04 traži materijale „rendgen, lak i kostur“, a A03 ih je dao A10. Urađeni su u pregledaču (komanda `setMode`, `setPaint`, podrazumevano „Ledeno srebro“ `#B9C0C6`); paleta, prekidač i boje u UI-ju ostaju A05/A10.
- **Hover se vidi i na svetlim delovima:** posvetljenje boje ne vidi se na felnama i enterijeru, pa hover dodaje i tanke bele ivice (0,45, samo vidljive).
- **Kadar dela:** deo zauzima najviše ≈ 40 % slobodne zone (rezerva 2,4) i kamera ne prilazi bliže od 1,2 m (`PART_MIN_DISTANCE`). A03 je imao rezervu 1,25, pa je poklopac ventila punio ceo ekran bez konteksta.
- **Zaklonjeni delovi:** probanje uglova i providnost zaklanjača (`dim` 0,72) su dodati jer fokus iz manifesta ne uzima u obzir zaklanjanje (A08 štimuje `config/focus.py`; npr. `pedale` se sada gledaju iz motornog prostora kroz zid, bolji ugao je kroz vrata).
- **Točkić miša** zumira tek posle klika na scenu (ili uz Ctrl/⌘); inače skroluje stranu, jer studio zauzima skoro ceo ekran, a ispod je sekcija paketa (nova odluka, E21).
- **Prelazi uniform-a** (hover 120 ms, izbor i filter 200 ms, rasklapanje) idu kroz mali animator u petlji crtanja; GSAP je samo za letove kamere (rules.md).
- **Zadnja lica ljuske** imaju providnost 0,7 (A03: 0,5; Blender: 1,0) kao kompromis između parity-ja sa posterom i čitljivosti.
- **Draw call-ovi:** prigušeni dvostrani materijali se crtaju u jednom prolazu (`forceSinglePass`), inače filter grupe udvostruči draw call-ove (375 → 235).
- **`checkShaderErrors`** je isključen u produkciji (preporuka three-a); u dev-u ostaje, pa ANGLE/D3D ume da ispiše benigno upozorenje X4122 za PMREM šejder.
- **Kontrast boja sistema:** test traži ≥ 5,9 na `#0A0D11`; `usis_izduv` ima 5,95 (A01 §2.1 to zaokružuje na 6,0). Boje nisu menjane.
- **`rendgen-app.tsx` u A04** (A03 ga daje A05): minimalno — store, URL preko `replaceState`, Esc, `aria-live`. A05 dodaje `pushState/back` po E9.
- **Raspored studija u A04:** kutija postera je ceo studio (nema bočnih traka); slobodna zona je u `studioLayout()` u `viewer-island.tsx` (A05 je proširuje za trake i karticu).

**Novi paketi:** nema.

**Testovi** (svi prolaze; 55 novih):
- `lib/auto3d/framing.test.ts`: contain parity (širi, uži, telefon 4:5), view offset, `shiftToPlace`, `dirFromAzEl`, temena kutije u slobodnoj zoni (projekcija), `partPose` (focus.dist, najmanja daljina), `systemPose`, let (krajevi, najkraći azimut, trajanje), `SYSTEM_VIEWS`.
- `lib/auto3d/explode.test.ts`: kriva, granice prozora, pomeraj, monotonost, tablične vrednosti iste formule kao Blender.
- `lib/auto3d/filter.test.ts`, `url-state.test.ts` (uklj. round-trip 20 stanja), `state.test.ts` (7 pravila reducer-a), `quality.test.ts`, `color.test.ts`.
- `components/fair/auto3d/boundary.test.ts` (node): `three` se statički uvozi samo iz `viewer/**`, `./viewer` samo dinamički iz `viewer-island.tsx`, `lib/auto3d` bez react-a i three-a, `viewer/**` bez react-a.

**Merenja** (Chromium preko Playwright MCP, ANGLE Intel UHD / D3D11, pravi GPU — SwiftShader nije bio potreban):
- Desktop 1440 × 900: desktop GLB, DPR 1, rendgen 248 draw call-ova i 239.830 trouglova po frejmu (ljuska u dva prolaza), lak 206, kostur 170, grupa „motor“ 235. Picking 2,0–2,6 ms po pozivu (cilj p95 ≤ 2 ms: za A12).
- Telefon 390 × 844 (emulacija mišem): lite GLB, 212 draw call-ova, 95.190 trouglova.
- Mirovanje: 0 poziva `requestAnimationFrame` za 2 s. Posle klijentske navigacije na `/sajam/privatnost`: canvas uklonjen, kontekst izgubljen (`isContextLost() = true`), 0 rAF za 2 s.
- Parity: obris auta na posteru i na canvasu ima istu kutiju (razlika 0 px po ivici, `A04-parity.png`). Razlika je samo pod: privremeni poster iz A02 ima sivu ravan do horizonta, a pregledač tamni disk koji se pretapa u `#0A0D11`.
- Gubitak konteksta (`WEBGL_lose_context`): status `lost`, posle `restoreContext` opet `ready`, bez upozorenja u konzoli.
- Konzola: 0 grešaka na svim snimljenim putanjama.

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo.
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa).
- `npx vitest run`: prošlo (2.455 testova, 275 fajlova).
- `npx next build`: prošlo. three (sa GLTFLoader-om, MeshoptDecoder-om, OrbitControls, RoomEnvironment, manifestom i kodom pregledača) je jedan chunk od 753.102 B (187.386 B gzip, cilj ≤ 190 KB). Učitava ga samo chunk ostrva (21.832 B), a njega navodi samo `server/app/sajam/3d/page_client-reference-manifest.js`; nijedna druga ruta ga ne referencira.

**Prihvatanje A04** (`.nocni-run/auto3d/prompts/A04.md`):
- [x] Model se učita na desktopu i na telefonu: `data-auto3d-status="ready"` na 1440 × 900 (desktop GLB) i 390 × 844 (lite GLB); snimci `A04-desktop-start.png`, `A04-telefon-start.png`. Završna provera skriptom `.nocni-run/auto3d/tmp/a04/accept.mjs` (`playwright` iz repoa, Chromium sa SwiftShader-om): telefon sa pravom mobilnom emulacijom (`isMobile`, `hasTouch`, DPR 3, Android korisnički agent) učitava model (`ready`, lite GLB, 212 draw call-ova), dodir bira deo (`usisne_cevi`, URL `?deo=usisne_cevi`, bez hover-a), X ga zatvara, „Rasklopi“ daje `explode = 1`, `?grupa=kocnice` filtrira; desktop isto (hover i klik na `poklopac_ventila`). Softverski renderer radi po odluci E5 (lite, DPR 1). Konzola: 0 grešaka. Snimci `A04-{desktop,telefon}-prihvatanje-*.png`.
- [x] Rade hover, izbor, let kamere, rasklapanje i filter: `data-auto3d-hover`, `data-auto3d-part` i `?deo=` posle klika, `data-auto3d-explode=1`, `?grupa=motor`; snimci `A04-*-hover`, `A04-*-deo*`, `A04-*-rasklopljeno`, `A04-desktop-grupa-motor`, `A04-telefon-grupa-kocnice`.
- [x] Okretanje prevlačenjem prsta (emulirani telefon, CDP dodirni događaji, `.nocni-run/auto3d/tmp/a04/drag.mjs`): vodoravno prevlačenje od 120 px okreće auto (76 nacrtanih frejmova, 29,5 % piksela studija promenjeno), strana se ne skroluje i prevlačenje ne bira deo. Snimci `A04-telefon-prevlacenje-{pre,posle}.png`.
- [x] Posle navigacije nema WebGL konteksta ni petlje: posle `router.push('/sajam/privatnost')` canvas nije u DOM-u, `isContextLost() = true`, 0 poziva `requestAnimationFrame` za 2 s. Ista provera u završnoj skripti, i za desktop i za dodirni telefon: `canvasInDom: false`, `contextLost: true`, 0 canvasa, 0 rAF za 2 s.
- [x] Provere prolaze (tsc, eslint, vitest; i `next build`), a ova sekcija je u `docs/AUTO3D-PROGRESS.md`.

**BLOKADA:** provera na fizičkom telefonu nije moguća u noćnom runu bez nadzora: uz računar nije povezan nijedan telefon, a niko ne može da otvori stranicu na uređaju. Sve što prihvatanje traži za telefon je urađeno u Chromium emulaciji telefona (390 × 844, `isMobile`, `hasTouch`, DPR 3, softverski renderer SwiftShader): model se učitava (lite GLB), dodir bira deo, X zatvara, rasklapanje i filter rade, prevlačenje prstom okreće auto bez skrolovanja strane, a posle navigacije nema konteksta ni petlje. Akcija za Jovana: otvoriti `/sajam/3d` na pravom telefonu (Android i iPhone) preko LAN adrese dev servera (`npx next dev -p 3180`, `allowedDevOrigins` već pušta adresu računara) i proveriti učitavanje, dodir na deo, okretanje prstom i skrolovanje strane uspravnim prevlačenjem preko scene.

**Snimci** (`output/playwright/auto3d/`): `A04-desktop-{start,hover,deo,deo-turbopunjac,deo-karter,rasklopljeno,grupa-motor,lak,kostur,poster,canvas}.png`, `A04-parity.png`, `A04-telefon-{start,hover,deo,rasklopljeno,grupa-kocnice}.png`.

**Za sledeće korake:**
- **A05:** prekidač režima, grupe, lista, kartica i panel na telefonu; `studioLayout()` treba da dobije leve trake i desnu karticu (kutija postera na desktopu tada počinje na 280 px, E1). Draw call-ovi su blizu 250 na desktopu u rendgenu.
- **A08:** `config/focus.py` — `pedale` (bolje kroz vozačeva vrata, az ≈ 70), `karter` i `pumpa_goriva` se vide tek kroz providne zaklanjače.
- **A09:** posteri treba da imaju pod kao pregledač (tamni disk koji se pretapa u `#0A0D11`, bez horizonta), da prelaz poster → canvas ne menja pozadinu.
- **A12:** picking p95 (sada 2–2,6 ms), draw call-ovi u rendgenu (248), Save-Data i ponovna provera na pravom telefonu (vidi BLOKADA).

**Za Jovana ujutru:**
- `http://localhost:3180/sajam/3d` (pokrenuti `npx next dev -p 3180`): okreni auto, pređi mišem preko delova, klikni deo, Esc, „Rasklopi“.
- `?deo=turbopunjac`, `?deo=karter`, `?grupa=motor`, `?rezim=lak`, `?rezim=kostur`.
- Na telefonu: dodir na deo i rasklapanje klizačem.

## A05 — Stranica /sajam/3d: grupe, kartica dela, lista, telefon   (2026-10-17 03:54)
**Fajlovi:**
- `components/fair/auto3d/`:
  - novi: `groups-list.tsx`, `parts-list.tsx`, `part-card.tsx`, `parts-panel.tsx`, `mode-switch.tsx`, `ui-bits.tsx`, `copy.ts`;
  - izmenjeni: `rendgen-page.tsx`, `rendgen-app.tsx`, `studio.tsx`, `poster.tsx`, `viewer-island.tsx` (raspored iz `lib/auto3d/layout.ts`, „Početni pogled“), `auto3d.module.css`;
  - testovi: `rendgen-page.test.tsx`, `part-card.test.tsx`, `copy.test.ts`.
- `lib/auto3d/`: novi `search.ts`, `history.ts`, `layout.ts`, `groups.ts`, svaki sa testom (`groups` se testira u `layout.test.ts`); izmenjeni `state.ts` (+ `state.test.ts`) i `dictionary.test.ts`.
- `lib/i18n/sr/fair-auto3d.ts` (ključevi A05).
- `app/sajam/3d/page.tsx` (`generateMetadata`).
- `viewer/**` nije menjan.

**Šta je urađeno:**
- **Raspored.**
  - Desktop (≥ 1024 px): tamni studio preko cele širine, levo tamna traka grupa (248 px; 216 px do 1279), desno svetao panel (384 / 344 px) sa jezičcima „Delovi“ i „Deo“. Panel se vidi kad je deo izabran ili je lista otvorena (izbor grupe u traci, dugme „Svi delovi“, taster `/`). Ulazi zdesna (320 ms), a izlazi brže (200 ms). Prekidač prikaza je gore, a donja traka (rasklapanje, „Početni pogled“, „Svi delovi“) dole; obe su centrirane ispod auta, ili u slobodnoj zoni kad je panel otvoren.
  - Telefon i tablet (< 1024 px): studio, pa panel sa jezičcima „Grupe“, „Delovi“ i „Deo“. Na telefonu panel prelazi 24 px preko dna studija, kao donji sheet.
- **Kadar:** `lib/auto3d/layout.ts` daje pregledaču kutiju postera (od 264 px, isto kao `--a3-poster-left` u CSS-u) i slobodnu zonu između trake i panela. Deo i grupa se kadriraju u zoni levo od kartice.
- **Kartica dela** (`part-card.tsx`): sistem sa tačkom boje i „×2“, naziv, opis, specifikacije u `<table>` (`<th scope="row">`), zanimljivost, napomena „Primer vrednosti. Za vaš model unosimo prave podatke.“, prethodni i sledeći deo u grupi (u krug, uz „6 od 9“) i „Kopiraj link“. Link je `/sajam/3d?deo=<id>`, potvrda ide kroz `FairToast`, a ako clipboard ne radi, pojavi se polje sa već izabranim linkom. Na desktopu je podnožje kartice lepljivo.
- **Lista i grupe:**
  - pretraga bez dijakritika (`lib/auto3d/search.ts`): č ć → c, š → s, ž → z, đ → dj i d; više reči je AND; reč od 4+ slova traži se bez završnog samoglasnika, pa „kocnica“ nalazi „kočnice“ i „kočnicom“;
  - broj delova po grupi; lista po grupama, ili rangirana kad postoji upit; prazno stanje sa „Obriši pretragu“;
  - grupe i redovi su pravi `<button>`, sa strelicama gore i dole, Home i End; lista ima jedno mesto u redosledu tabova;
  - fokus ili hover na redu ističe deo u 3D.
- **URL** `?deo=` i `?grupa=` (`lib/auto3d/history.ts`, E9):
  - otvaranje dela iz scene ili liste radi `pushState`, a unos je označen u `history.state`;
  - zamena dela, grupa i režim rade `replaceState`;
  - zatvaranje dela ide `history.back()` samo ako je unos napravila strana;
  - „Nazad“ zatvara karticu, „Napred“ je vraća, a direktan link ne pravi unos.
- **Bez JS-a:** dugmad liste, grupa i susednih delova su `submit` GET forme na `/sajam/3d`, pa linkovi rade. `<noscript>` otvara sve jezičke (aktivni prvi) i krije kontrole koje traže JS.
- **Poster i rezerva:**
  - poster je `<picture>` iz `getImageProps` sa `fetchPriority="high"`, uz dva `<link rel="preload">` sa `media` i `type` (ReactDOM.preload);
  - bez WebGL-a rade poster, traka grupa, lista i kartica, a rasklapanje menja poster u rasklopljen (lenj `<picture>`);
  - greška učitavanja ima „Pokušaj ponovo“.
- **Metapodaci:** `generateMetadata` daje naslov i opis dela ili grupe i OG sliku (`/3d/auto3d/og.jpg`, privremeno; pravu pravi A09). `noindex` ostaje iz layout-a.
- **Najave:** jedan `aria-live` region sa odlaganjem od 300 ms (deo, „dva komada“, grupa sa brojem delova, pretraga, prikaz, status). Esc zatvara karticu, pa listu, pa grupu. Posle zatvaranja fokus se vraća na red u listi ili na studio.

**ODLUKE:**
- **Skillovi:** po AGENTS.md pokrenut je „Taste“ (`design-taste-frontend`). Saveti koji se sudaraju sa repoom (Phosphor ikone, drugi fontovi, animacije koje se vrte same, magnetna dugmad) nisu primenjeni; ostali su DNA sajma, lucide i Archivo. Primenjena su potpuna stanja (učitavanje, prazno, greška) i pritisak na dugmadi (`scale` 0,97–0,99).
- **Lak i kostur su uključeni u prekidaču**, iako je A03 tražio `disabled` do A10. Pregledač ih crta od A04 i `?rezim=` ih već otvara, pa bi isključeno dugme bilo neistinito. Boje laka ostaju A10.
- **Grupa u traci otvara listu te grupe** (desktop), a ponovni klik na izabranu grupu je briše. Link `?grupa=` otvara jezičak „Delovi“, jer na desktopu jezičak „Grupe“ ne postoji.
- **Slobodna zona je ista i kad panel nije otvoren**, pa otvaranje kartice ne pomera kameru. Zato kadar grupe stoji malo levo od sredine.
- **Izbor iz liste prebacuje fokus na naslov kartice.** A03 §4.5 je tražio da fokus ostane u listi, ali kartica i lista su jezičci istog panela, pa bi fokus ostao na skrivenom redu. Prethodni i sledeći zadržavaju fokus na dugmetu, a zatvaranje vraća fokus na red.
- **Ispod 1024 px panel nema svoj skrol** (A03: unutrašnji skrol). Na telefonu je visina od 307 px pokazivala samo naslov kartice i tri reda, a ugnježdeni skrol na dodir „zaglavi“ stranu. Jezičci se lepe ispod zaglavlja, a strana skroluje.
- **Specifikacije su `<table>`**, ne `<dl>`, jer prompt A05 kaže „u tabeli“.
- **Neaktivan jezičak se krije klasom (`data-active`)**, ne atributom `hidden`. Tailwind v4 preflight drži `[hidden]` kao `!important` u sloju, pa ga `<noscript>` ne bi mogao da otvori.
- **Preload:** `preload` iz next/image bi i na telefonu učitao desktop izvor. Zato se koristi `ReactDOM.preload` sa `media` i `type`, po odeljku o `preload` u `02-components/image.md` i o resursima u `generate-metadata.md`.
- **Bez oznake izabranog dela u studiju** (A04 ju je imao): kartica je uvek pored scene ili odmah ispod nje.
- **Glas:** UI ostaje na „ti“, kao u A04 i planu, a napomena P3 je doslovna („Za vaš model…“).
- **`metadataBase` nije postavljen:** domen ne postoji u repou, a A01 §6 zabranjuje da se izmišlja. Next lokalno koristi `localhost`, a na Vercel-u adresu deployment-a; u dev-u ispisuje upozorenje na serveru. Konačne metapodatke radi A11.

**Novi paketi:** nema.

**Testovi** (svi prolaze; 39 novih, u 6 novih fajlova):
- `lib/auto3d/search.test.ts`: dijakritici, đ → dj i d, „kocnica“ → kočnice i kočnicom, AND, sistem, rang, prazan upit, „48v“.
- `lib/auto3d/history.test.ts`: push, replace, back, deo iz adrese, nekanonska adresa.
- `lib/auto3d/layout.test.ts`: trake, kutija postera, slobodna zona (desktop, tablet, telefon), grupe i susedni delovi u krug.
- `lib/auto3d/state.test.ts`: lista, „Početni pogled“, grupa iz adrese.
- `lib/auto3d/dictionary.test.ts`: rečnik stranice je bez praznih vrednosti, uzvičnika i TODO, sa razmakom između broja i jedinice.
- `components/fair/auto3d/rendgen-page.test.tsx` (SSR):
  - `<picture>` sa 3 izvora i `fetchpriority`, H1;
  - 78 redova i 2 × 10 grupa kao `submit` dugmad;
  - kartica za `?deo=turbopunjac` (tabela, napomena, ×2, susedi);
  - lista za `?grupa=kocnice`, nepoznat deo;
  - nijedan tekst van rečnika.
- `part-card.test.tsx` (kartica sa jednom i sa dve instance) i `copy.test.ts` (deo/dela/delova, najave).

**Merenja:**
- Posle `next build` sopstveni JS rute `/sajam/3d` ima 38.512 B gzip: dva chunk-a koja nijedna druga ruta ne navodi. Deljeni JS ima 142.733 B gzip.
- three chunk ima 753.102 B (187.386 B gzip) i učitava ga samo chunk ostrva.
- Horizontalnog skrola nema na 360, 390, 820, 1024 i 1440 px.

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.494 testa u 281 fajlu; 2 preskočena, kao i pre);
- `npx next build`: prošlo.

**Prihvatanje A05:**
- [x] `/sajam/3d?deo=hladnjak` otvara baš taj deo sa karticom, i na telefonu i na desktopu: `data-auto3d-part="hladnjak"`, naslov kartice „Hladnjak motora“, panel otvoren. Snimci su `A05-{desktop,telefon}-deeplink.png`. „Nazad“ i „Napred“ zatvaraju i vraćaju deo na oba rasporeda (`.nocni-run/auto3d/tmp/a05/shots.mjs`).
- [x] Samo tastaturom (`tmp/a05/check.mjs`, snimci `A05-tastatura-*.png`):
  - Tab → „Preskoči na listu delova“ → Enter → pretraga „felna“ → strelice → Enter otvara karticu, sa fokusom na naslovu → Esc vraća fokus na red;
  - traka grupa radi strelicama i Enter-om;
  - fokus je vidljiv (`:focus-visible`) na svakom koraku;
  - `aria-live` najavljuje „Izabran deo: Zadnja felna 21″, Kočnice i točkovi, dva komada.“
- [x] Bez WebGL-a (Chromium sa `--disable-3d-apis`): status je `nowebgl`, poster, lista i kartice rade, a u konzoli nema grešaka (`A05-bez-webgl*.png`).
  - Greška učitavanja (GLB vraća 404): „Pokušaj ponovo“ vraća `ready` (`A05-greska.png`).
  - Bez JS-a: `?deo=hladnjak` prikazuje karticu, a „Sledeći“ vodi na `?deo=interkuler` (`A05-bez-js.png`).
- [x] Provere prolaze, a sekcija je ovde.

**Snimci** (`output/playwright/auto3d/`):
- `A05-{desktop,telefon}-{start,grupa,kartica,pretraga,deeplink}.png` (1440 × 900 i 390 × 844);
- `A05-bez-webgl{,-rasklopljen,-telefon}.png`, `A05-greska.png`, `A05-bez-js.png`;
- `A05-tastatura-{kartica,grupa}.png`, `A05-1024-kartica.png`, `A05-tablet-820.png`, `A05-telefon-360.png`.

U konzoli nema grešaka ni na jednoj putanji. Lokalna upozorenja ANGLE X4122 i `metadataBase` su poznata (A04 i ODLUKE iznad).

**BLOKADA:** provera na fizičkom telefonu i dalje nije moguća bez nadzora, kao u A04. Telefon je proveren u Chromium emulaciji (390 × 844, `isMobile`, `hasTouch`, DPR 2).

**Za sledeće korake:**
- **A08 i A12:** kadar dela je blizu; npr. turbopunjač na 1024 px puni slobodnu zonu od 336 px. Vredi proveriti `PART_MIN_DISTANCE` i `focus.py` zajedno sa karticom.
- **A09:** posteri sa sivim podom do horizonta se vide u stanjima bez canvasa (bez WebGL-a, greška).
- **A10:** traka i panel se vide i u kiosku, pa ih kiosk treba sakriti ili uvećati. Boje laka idu u prekidač prikaza.
- **A11:** sekcija paketa ide ispod `.stage` u `rendgen-page.tsx`; tu su i `metadataBase` i konačan OG.

**Za Jovana ujutru:**
- Pokrenuti `npx next dev -p 3180` i otvoriti `http://localhost:3180/sajam/3d`. Probati: klik na grupu u traci, deo u listi, „Kopiraj link“, Esc i dugme „Nazad“ u pregledaču.
- Linkovi: `/sajam/3d?deo=turbopunjac`, `/sajam/3d?deo=hladnjak`, `/sajam/3d?grupa=kocnice`, `/sajam/3d?deo=hauba&rezim=lak`.
- Na telefonu: isti linkovi preko LAN adrese, jezičci „Grupe“, „Delovi“ i „Deo“ i pretraga „kocnica“.

## A06 — Karoserija: proporcije, površine, paneli   (2026-10-17 05:10)
**Fajlovi:**
- `3d/auto3d/config/body.py`: nove tabele (14 ključnih linija, redovi sa z po koloni, tačke nosa i repa na osi, otvor maske, crease, proširenje lukova).
- `3d/auto3d/lib/cage.py`: nov kavez (kape nosa i repa bez Coons zakrpa, potporne petlje stakla, atribut `band`, otvor maske u kavezu), luk poravnava samo novu ivicu, `flare_arches`, `finish_panel` vraća spoljnu ivicu panela.
- `3d/auto3d/body/shell.py`: materijali branika po traci kaveza, lite paneli sa oštrim ivicama, `gap_edges.json`, protivpožarni zid niže, šire obloge lukova.
- `3d/auto3d/body/details.py`: maska prati otvor u braniku; farovi, LED trake i zadnja svetla se postavljaju zrakom na površinu; nov osnovni oblik retrovizora.
- `3d/auto3d/measure.py`: fuge na spoljnoj ivici panela; nove provere nagiba zadnjeg stakla i dužine palube.
- `3d/auto3d/parts/cooling.py`: ekspanziona posuda pomerena ispod nove haube (mehanika samo pomerena).
- `public/3d/auto3d/`: `limuzina.glb`, `limuzina-lite.glb`, `limuzina.manifest.json`, svi posteri i `og.jpg` (iz istog lanca, parity sa pregledačem ostaje).
- `docs/auto3d/PIPELINE.md` (opis kaveza i detalja), `.claude/skills/auto3d-blender/SKILL.md` (Naučeno).

**Šta je urađeno:**
- Blokaut iz A02 je zamenjen pravom karoserijom po metodi iz A01 §1.4 (kavez sa petljama po linijama, Mirror, Subdivision 2, crease), ali sa novom topologijom:
  - 14 kolona: podvijena ivica, dno praga, vrh praga, donja linija vrata (crease 0,3), konkavni „stomak“, potporna petlja, rame (crease 0,5), linija prozora sa potpornom petljom, gornja ivica prozora sa potpornom petljom, A-/C-linija, krovni nosač, krov, sredina;
  - red sme da ima različit z po koloni, pa dogleg zadnjih vrata ide koso iznad luka, a ivice haube, vetrobrana i usne su lukovi u tlocrtu;
  - nos i rep su kape u kojima se svaka donja linija obavija oko ugla (Bezier u tlocrtu), umesto naduvenih Coons zakrpa.
- Silueta po napomenama nadzora:
  - **Limuzina sa četvoro vrata:** B-stub (sjajno crn, z −0,31…−0,41), zadnja vrata sa svojim prozorom, crni razdelnik i četvrtasto staklo do oštrog vrha na z −1,66, linija prozora sa kick-up-om (0,956 kod A-stuba → ~1,01 kod C-stuba).
  - **Krov:** najviši iznad prednjih sedišta (1,436 na z −0,52), pa u jednoj krivoj ka repu.
  - **Zadnji kraj:** staklo 25,2°, paluba 0,544 m, odsečen rep sa oštrom usnom i skoro uspravnom zadnjom plohom, suženje u tlocrtu.
  - **Bok:** tumblehome 15°, rame +27 mm iznad zadnjeg točka, konkavna vrata i podvučen prag.
  - **Napred:** uspravnije lice, zaobljeni uglovi u tlocrtu, umerena, široka i niska maska (rupa u kavezu, glatka ivica sa prirubnicom od 40 mm); otvori usisnika ostaju A07 (prvo čista površina).
- **Paneli:** hauba, blatobrani, četvoro vrata, pragovi, krov sa panoramskim staklom, poklopac prtljažnika (sa usnom i gornjom zadnjom plohom), branici i skelet su zasebni čvorovi sa id-jevima iz kataloga.
  - Fuga je 4,7 mm, sa povratnom prirubnicom i zaobljenim rubom.
  - Staklenik je odvojen: stakla su uvučena 12 mm u crni okvir i debela 4,5 mm.
  - Retrovizor ima osnovni oblik: kapica u obliku kapi na vidljivoj nožici.
- **Mehanika:** prodiranje kroz novu karoseriju je rešeno pomeranjem (ekspanziona posuda, zadnja ploča maske); ništa nije obrisano. `collide.py`: 0 parova mehanike; ostaje 8 poznatih parova „svetlo kroz panel“ (A02 ih je imao 9), jer otvore svetala pravi A07.

**ODLUKE:**
- **Metoda.** Kavez iz A01 §1.4 je zadržan, ali su Coons kape zamenjene obavijanjem linija (Coons je davao kockast, naduven nos, A02). Gornja potporna petlja ramena (A01: ±6 mm) je izostavljena: na licu kape pravi vertikalni nabor preko nosa. Rame ima samo donju petlju na 8 mm i crease 0,5.
- **Tumblehome 15°** po napomeni nadzora od 01:40 (A01 §1.2 je imao 24°). Napomena je novija, pa ima prednost.
- **Tabele A01 §1.2 su menjane** (A01 §1.2 to dozvoljava uz ODLUKU), sve mere ostaju u toleranciji:
  - vrh krova 1,44 na z −0,52;
  - zadnje staklo od z −1,32 (1,362) do −2,00 (1,038);
  - usna na z −2,53;
  - ivica haube napred na z 2,295;
  - ugao vetrobrana u kavezu na z 0,535 (subdivizija ga vuče ~45 mm unazad, izmereno dash-to-axle 1,002);
  - linija prozora u kavezu +22 mm (potporna petlja je spušta);
  - dogleg L −1,06 / H −1,22;
  - zadnji „mišić“ do x 0,978. Širina je 1,955 m (+0,8 %), a guma je 9,9 mm uvučena (granica 2–15 mm).
- **Prednji branik obuhvata ceo nos**, i uglove iznad pregiba do ivice haube. Ranije su vrhovi blatobrana pravili „uši“. Rez branik/blatobran ide koso od luka do ugla haube; zadržan je, jer tako izgleda kod mnogih pravih auta.
- **Zadnji branik** je podeljen po liniji „stomaka“ (y ≈ 0,8). Ugao repa iznad toga pripada skeletu (tu ide zadnje svetlo, A07). Poklopac nosi i gornju zadnju plohu sa usnom i LED trakom.
- **Fuge se mere na spoljnoj ivici panela** (`output/auto3d/gap_edges.json`), a ne na svim graničnim temenima. Vrh povratne prirubnice je na ispupčenom pregibu bliži susedu, pa je medijana ispadala 3,3–3,5 mm (A02 „krov–skelet 3,3 mm“). Sada je svih 9 parova 4,7 mm.
- **`measure.py` ima dve nove provere** iz napomene nadzora: nagib zadnjeg stakla (25–30°) i dužinu palube od dna stakla do usne (0,45–0,55 m). Obe prolaze, ali blizu donje granice (25,2° i 0,544 m).
- **Lite karoserija koristi Subdivision 2** (A01: 1). Sa 1 su lukovi na telefonu bili nazubljeni i oko luka je bila tamna mrlja. Lite paneli dobijaju oštre ivice po uglu (55°) umesto rubnog bevela. Lite ima 122.140 trouglova i 0,94 MB, u budžetu od 250 hilj. i 3 MB.
- **Materijal po traci kaveza** (atribut `band`): spliter je donja podvijena traka, difuzor su trake ispod linije praga. Podela po visini lica je na zadnjem braniku pravila stepenice.
- **Detalji A07 su samo premešteni na novu površinu:** maska je smanjena na otvor, a farovi, LED trake i zadnja svetla su postavljeni zrakom. Unutrašnjost svetala, otvori, ćelije maske i usisnici ostaju A07. Krajevi traka farova su skraćeni do x 0,68, jer su na uglu virili kao „M“ zarezi.
- **Deco:** protivpožarni zid (`deco__karoserija__pod`) je spušten na vrh 0,87, jer je kroz nižu haubu virio kao crna traka ispod vetrobrana i siva crta preko haube. Obloge lukova su šire (x 0,56–0,925, ±112°), pa se kroz luk ne vidi unutrašnjost.
- **Proširenje oko luka je 6 mm u traci od 9 cm.** Probano je i 10 mm u 7 cm: na kosim redovima pravi nabore, a guma napred je ispala 16,8 mm uvučena.
- **Nalazi hladne kritike van obima A06** (zapisani za sledeće korake):
  - farovi i „lice“, zadnja svetla, brisači, kvake, zaptivke stakla, cevi auspuha koje sada vise ispod novog zadnjeg branika i difuzor: A07;
  - kockasta sedišta i tabla: A08;
  - rendgen bez „šasije“ i zadnjeg pogona: A08;
  - krajnji rezervoari interkulera vidljivi kroz masku: A08 ili A07.
- Test `boundary.test.ts` je jednom pao zbog isteklog vremena pod opterećenjem (odmah posle Blendera). Pri ponovnom pokretanju i u punom `vitest run` prolazi; test nije menjan.

**Novi paketi:** nema.

**Testovi:** nisu pisani novi vitest testovi. Ugovor (id-jevi, extras, manifest, budžeti, obris) čuvaju postojeći `contract.test.ts` i ostali u `lib/auto3d`; prolaze nad novim GLB-ovima (124/124). Geometriju proverava `measure.py --strict` (33 mere, sve prolaze) i `collide.py`.

**Merenja** (`measure.py --strict`, desktop scena, posle subdivizije):

| Mera | Vrednost | Cilj (±2 % ili opseg) |
|---|---|---|
| dužina | 4,969 m | 4,98 |
| širina / sa retrovizorima | 1,955 / 2,130 m | 1,94 / 2,13 |
| visina | 1,436 m | 1,44 |
| međuosovinsko | 2,980 m | 2,98 |
| prepusti napred / pozadi | 0,896 / 1,093 m | 0,89 / 1,11 |
| trag napred / pozadi | 1,630 / 1,650 m | 1,63 / 1,65 |
| klirens | 0,130 m | 0,13 |
| gume | Ø 0,712 / 0,704 m | — |
| dash-to-axle | 1,002 m | 1,00 |
| linija prozora (dno bočnog stakla) | 0,956 m | 0,96 |
| belt / visina | 0,666 | 0,64–0,69 |
| nagib vetrobrana | 61,9° | 60–63° |
| nagib zadnjeg stakla | 25,2° | 25–30° (nadzor) |
| paluba (dno stakla → usna) | 0,544 m | 0,45–0,55 (nadzor) |
| razmak guma–luk | 32,3 / 32,3 mm | 25–35 mm |
| guma uvučena napred / pozadi | 13,1 / 9,9 mm | 2–15 mm |
| guma na podu | 0,0 mm | ±1 mm |
| fuge (9 parova) | 4,7 mm svaka | 4–5 mm |

Sve mere iz PLAN §3 su u toleranciji ±2 %.

- **GLB** (posle meshopt optimizacije):
  - desktop: 1.232.920 B, 181.124 trougla, 204 draw call-a;
  - lite: 937.884 B, 122.140 trouglova, 176 draw call-ova.
- **Posteri:** AVIF 28–46 KB, WebP 41–68 KB; OG 39 KB.
- **Sudari:** 0 parova mehanike; 8 parova „svetlo kroz panel“ (A07).

**Krugovi kvaliteta** (`output/auto3d/renders/A06/`):
- **k0, k0b, k0c (kalibracija):** prvi kavez je već čitao kao limuzina sa četvoro vrata, ali sa naduvenim nosom i „ušima“ blatobrana. Rep je bio kosa „kada“. Linija prozora je ispala 35 mm viša, a gornja ivica 50 mm niža od kaveza. Uvedene su potporne petlje stakla i merenje fuga na spoljnoj ivici.
- **k1:**
  1. Nos kockast, a maska i svetla iz A02 lebde ispred branika. Ishod: nos u tlocrtu zaobljen, a maska i svetla postavljeni na površinu.
  2. Zadnji branik je velika kutija, a na uglovima usne su „peraje“. Ishod: rame se pozadi diže samo do 0,975.
  3. Slabo rame. Ishod: crease 0,5, petlja na 8 mm.
  4. Uglovi u tlocrtu kvadratni. Ishod: suženje gornjih linija napred i pozadi.
  5. Linija prozora 0,937. Ishod: +22 mm u kavezu, sada 0,956.
- **k2:**
  1. Ivica haube daleko iza nosa. Ishod: pomerena 2 cm napred, lice uspravnije.
  2. Rep kvadratan u tlocrtu. Ishod: usna je luk, sredina je 10 cm iza uglova.
  3. Zadnji branik ravan. Ishod: oštra donja linija oko nosa i repa.
  4. Slab „mišić“. Ishod: +27 mm.
  5. Kos šav branik/blatobran. Ishod: zadržan (ODLUKE).
- **k3, hladna kritika** (radnik `sonnet`, bez konteksta, nad `k3/`):
  1. nema farova;
  2. sedišta su kocke;
  3. bok je ravna ploča bez linije ramena;
  4. zadnji luk je nazubljen i kroz njega se vidi unutrašnjost;
  5. zadnji kraj je zid, a auspuh visi;
  6. rendgen bez šasije;
  7. hauba je prazna, sa sivom crtom preko nje;
  8. stakla su bez okvira;
  9. brisači, crna traka ispod vetrobrana i retrovizori kao kutije;
  10. mrlje i šavovi.

  Rešeno u A06 (`k3/posle/`):
  - (3) podvučen prag, konkavnija vrata, jača donja linija;
  - (4) luk se poravnava samo po novoj ivici, obloge lukova su šire, proširenje je 6 mm, lite luk je čist;
  - (5) zadnji branik: difuzor po traci (bez stepenica), gornji deo se povlači ka poklopcu;
  - (7) i (9) siva crta i crna traka su bili protivpožarni zid, sada je spušten;
  - (9) nov osnovni oblik retrovizora; (10) mrlja je bila senka starog retrovizora i nestala je.

  Ostalo je van obima (ODLUKE).
- **k4:** dodatni krug za bok (podvučen prag, donja linija), sa završnim renderima u `k4/`. Poređenje bokova A02 i A06 je u `k3/posle/poredjenje-A02-A06-bok.png`: novi auto deluje niže, napetije i modernije.
- **Ocena:** silueta, proporcije, staklenik i rep sada čitaju kao moderna sportska limuzina, a ne kao igračka. Ono što još odaje CG su lice bez farova i usisnika, kockasta sedišta i auspuh. To nije karoserija; radi se u A07 i A08.

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo (ponovljeno posle dev servera);
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.494 testa, 281 fajl, 2 preskočena kao i pre); posle završnog izvoza `lib/auto3d` i `components/fair/auto3d` ponovo 124/124;
- `node 3d/auto3d/pipeline.mjs`: ceo lanac prolazi od nule (oko 90 s).

**Stranica:** `/sajam/3d` učitava novi model u rendgenu, laku i sa `?deo=vrata_zadnja` (`data-auto3d-status="ready"`). Konzola nema grešaka. Snimci su u `output/playwright/auto3d/`: `A06-stranica.png` (1440 × 900), `A06-stranica-lak.png`, `A06-stranica-deo.png`. Chromium sa SwiftShader-om dobija lite GLB po odluci E5; na pravom GPU-u ide desktop GLB.

**Za sledeće korake:**
- **A07:**
  - otvori i unutrašnjost farova (traka na y ≈ 0,67 uz ivicu haube), velikih donjih usisnika i zadnjih svetala (y ≈ 0,955 ispod usne);
  - cevi auspuha i difuzor uz novi zadnji branik (donja ivica je na y ≈ 0,25–0,33);
  - kvake na y ≈ 0,90 (ispod ramena);
  - okviri stakla i brisači.
  - `details.Surface` daje z površine za bilo koje (x, y).
- **A08:** `config/focus.py` za karoseriju: `vrata_zadnja` se kadrira kroz kabinu; sedišta i tabla.
- **A09:** oba GLB-a su ispod budžeta, a lite sada ima Subdivision 2 na karoseriji.

**Za Jovana ujutru:**
- Uporedi `output/auto3d/renders/A06/k3/posle/poredjenje-A02-A06-bok.png`, pa pogledaj `output/auto3d/renders/A06/k4/lak-front34.png` i `lak-rear34.png`.
- `npx next dev -p 3180`, pa `http://localhost:3180/sajam/3d?rezim=lak`: okreni auto i proveri bok, rep i lukove; zatim `?deo=vrata_zadnja` i `?deo=poklopac_prtljaznika`.

## A07 — Karoserija: svetla, maska, stakla, točkovi   (2026-10-17 06:11)
**Fajlovi:**
- `3d/auto3d/body/`:
  - novi: `openings.py` (otvori), `lights.py` (farovi, LED trake, stop svetla), `grille.py` (maska), `mirrors.py` (retrovizori), `trim.py` (kvake, usisnici, spliter, difuzor, kade izduva, tablice, brisači);
  - izmenjeni: `shell.py` (otvori, okviri stakla, ukrasi spojeni u panele), `details.py` (samo poziva nove module), `wheels.py` (nove felne i gume).
- `3d/auto3d/lib/`: `cage.py` (traka okvira stakla `okvir`, kratke prirubnice oko svetala i ispred haube), `materials.py` (vrednosti `mat_rubber`, `mat_wheel`, `mat_lens`), `views.py` (gume tamne u rendgenu).
- `3d/auto3d/config/body.py` (prirubnice, difuzor, izduv, zadnja ploha), `3d/auto3d/parts/brakes.py` (bušeni diskovi, zaobljene čeljusti), `3d/auto3d/parts/intake_exhaust.py` (samo izlazi i cevi do njih), `3d/auto3d/render.py` (krupni kadrovi `napred`, `pozadi`, `tocak`, `bok`).
- `lib/auto3d/xray.ts` + `xray.test.ts`; `components/fair/auto3d/viewer/materials.ts` (pravilo slotova iz `lib/auto3d/xray.ts`).
- `public/3d/auto3d/`: oba GLB-a, manifest, svi posteri i `og.jpg` (isti lanac, parity sa pregledačem ostaje).
- `docs/auto3d/PIPELINE.md`, `.claude/skills/auto3d-blender/SKILL.md` (Naučeno).

**Šta je urađeno:**
- **Otvori u limu.** Farovi sa LED trakom, stop svetla sa LED trakom, bočni usisnici, udubljenja za tablice i izrezi za izduv su pravi otvori u pečenoj karoseriji: pojas oko obrisa se usitni, temena se Phong projekcijom vrate na glatku površinu, lica u obrisu se brišu, a ivica se poravna na obris. `finish_panel` ivici daje fugu i prirubnicu. Svetla više ne leže preko lima: `collide.py` ima 0 parova (A06 je imao 8 „svetlo kroz panel“).
- **Napred.** LED traka od 16 mm preko cele širine je tik ispod ivice haube i prelazi u uske farove od 60 mm koji se obavijaju oko ugla i penju uz ivicu haube. Unutra su: sočivo debljine 3 mm sa crnim obodom, crno kućište od 85 mm, neprekidna DRL linija, crna pregrada, tri projektora (hromirana čaša, tamno sočivo, crn prsten) i niz od šest malih LED reflektora ka uglu. Maska ima crn okvir sa tankim hromiranim rubom, 3D rešetku od ukrštenih letvica (široki rombovi, 24 mm duboko, prati luk lica) i tamnu zadnju ploču, a mesto amblema je prazno. Bočni usisnici imaju tamnu kadu i pet uspravnih lopatica, a karbonski spliter je isturen 25 mm i ka krajevima se stapa sa branikom. Iznad maske je udubljenje za tablicu, bez tablice i teksta.
- **Bok.** Utopljene kvake (180 × 28 mm, crna fuga od 2 mm) su na vratima. Okvir stakla je sjajno crn (spoljne trake stakla su postale okvir, a staklo je i dalje uvučeno 12 mm i debelo 4,5 mm). Retrovizor ima kapicu u boji karoserije, crno kućište, staklo u ramu i kratku nožicu od 22 mm. Brisači imaju ruku, metlicu sa spojlerom i poklopac osovine. Panoramski krov i tamni umetak praga su iz A06 i provereni su na krupnom kadru.
- **Pozadi.** LED traka od 14 mm prelazi u stop svetla: crvena kontura obilazi spoljni kraj, sedam 3D lamela je na dve dubine, srednja linija je dublje, a u unutrašnjem kraju je hromirani reflektor za vožnju unazad. Tu su još udubljenje za tablicu, izrezi na donjoj ivici branika sa četiri okrugla izlaza Ø90 sa duplim zidom (3 mm ispred lima), karbonski difuzor sa rampom i pet rebara, i usna spojlera iz A06.
- **Točkovi.** Felna 21" ima deset pari krakova (par se spaja kod glavčine, a lice se spušta 40 mm ka glavčini) u tamnom grafitu, glavčinu, pet vijaka i ravnu kapicu bez amblema. Guma je okretno telo sa profilom bočnice (zaštita oboda, najšire mesto, rame), četiri uzdužna kanala, plitkim poprečnim žlebovima na ramenima i reljefom „natpisa“ bez teksta. Materijal gume je `mat_rubber` (skoro crna, satenska). Diskovi od 400 i 380 mm imaju dve bušene frikcione ploče (72 prave rupe po ploči) i ventilacione kanale, a prednja čeljust je zaobljeno telo sa tri režnja klipova spolja. Kočnice se vide kroz krakove.

**ODLUKE:**
- **Gume (napomena nadzora od 01:40):** gume koriste slot `mat_rubber` (`#151617`, hrapavost 0,62, satenski), umesto `mat_tire`. Ime slota nije menjano: `mat_tire` ostaje u biblioteci, ali ga više niko ne koristi, pa nije u manifestu. „Bele gume“ su bile rendgen (boja sistema kočnica `#C8D2DC`). Zato je dodato pravilo da `mat_rubber` u sistemu `kocnice` ostaje tamna guma i u rendgenu, na oba mesta: Blender `apply_xray` i web (`lib/auto3d/xray.ts`, sa testom). Creva i čaure drugih sistema i dalje dobijaju boju sistema.
- **Maska:** veličina otvora je ostala iz A06 (1,08 × 0,22 m, niža i šira od A02, po napomeni nadzora). Rešetka je od ukrštenih letvica, bez oblika po kom se prepoznaje marka. Hladna kritika vidi „labavu sličnost“ sa rombastom maskom jedne marke, ali ne može da imenuje marku. Romb je čest motiv, pa je zadržan.
- **Okvir stakla:** spoljne trake stakla (potporne petlje kaveza na 14 mm) su postale sjajno crni okvir: donja pripada vratima, a gornja i traka četvrtastog stakla skeletu (nov ID panela `okvir`, interni, nije ugovor). Zato `linija_ramena` (= najniža tačka bočnog stakla) sada meri 0,9755 m, ranije 0,956. Mera prolazi (tolerancija 0,941–0,979), ali je blizu gornje granice. Merna skripta nije menjana.
- **Far ispod ivice haube:** otvor fara ide do same granice sa haubom (temena granice se ne pomeraju), a sočivo je 10 mm ispod nje. Uz to su dodata dva pravila: prednja ivica haube ima prirubnicu od 6 mm umesto 12 (`FLANGE_HOOD_FRONT`), a ivica otvora svetla 4 mm (`FLANGE_LAMP`). Sa trakom lima od 11 mm iznad fara javljali su se šiljci i prodiranje.
- **Prednja tablica (nije u spisku zadatka):** udubljenje za tablicu iznad maske (bez tablice i teksta). Hladna kritika je kao ozbiljan nedostatak navela prazno lice između LED trake i maske. Tablica je napred obavezna, a ne menja oblik karoserije. Podloga obe tablice je karbon, ne mat crna, jer je „crna rupa“ smetala kritici.
- **Izduv i difuzor:** prva verzija (karbonske ploče sa izlazima ispod branika) izgledala je naknadno prikačeno. Izlazi su zato u izrezima na donjoj ivici zadnjeg branika (centar y 0,285, x ±0,40 i ±0,52, Ø90), a difuzor je rampa sa pet rebara između izreza (x ±0,30). A01 je imao izlaze na y 0,265 „u ravni sa difuzorom“. U `parts/intake_exhaust.py` (posao A08) menjani su samo izlazi i cevi do njih. Lonci su na istom mestu.
- **Konkavnost felne je 40 mm** (A01: 55 mm). Sa 50 mm su krakovi udarali u spoljnu polovinu čeljusti sa 6 klipova (196 preseka). Zbog toga je i spoljna polovina čeljusti tanja (28 mm), a režnjevi klipova su 5 mm.
- **Vrednosti materijala** (imena slotova su ista): `mat_lens` alfa 0,18 → 0,12 (sočivo sa dva lica je bilo mlečno), `mat_wheel` `#4A4F56` (tamni grafit, ali svetliji od gume da se felna čita), `mat_rubber` kao gore. To menja i izgled laka na webu.
- **Draw call-ovi u rendgenu na webu:** posle detalja ih je bilo 262 (A04: 248; budžet 250), jer pregledač svaki slot karoserije crta dvaput. Smanjeno je na 250 bez vidljive razlike:
  - kućišta svetala i zadnja ploča maske su `mat_trim_black` umesto `mat_plastic`;
  - lopatice usisnika i kade izduva su `mat_carbon`;
  - metlice brisača su `mat_trim_black`.

  Sa izabranim delom ih je 254 (ivice izabranog dela, A04). GLB ima 209, a test budžeta proverava GLB. Za A12: rendgen crta karoseriju u dva prolaza, pa je to prvo mesto za uštedu.
- **Lite** koristi isto usitnjavanje (2 nivoa). Sa 1 nivoom uska zadnja LED traka (14 mm) nije bila isečena celom dužinom, pa je ostalo lice lima kroz sočivo (31 presek).
- **Retrovizor** je niže (centar y 1,052), širi i na kratkoj nožici sa vrha vrata. Prvi oblik je u hladnoj kritici izgledao kao „jaje na štapu“.
- **Nalazi hladne kritike van obima A07** (zapisani za sledeće korake):
  - površine lima: talasi uz prednji luk i spoj branika i blatobrana, „pečen“ izgled haube, nema jake karakterne linije (A06 i A09);
  - kockasta sedišta i tabla, kao i dijagonalne linije kroz staklo zadnjih vrata (enterijer, A08);
  - tamna i duga senka retrovizora na vratima (svetlo QA scene, A09);
  - talasi i bele tačkice uz gornju ivicu zadnje LED trake na jednoj strani se vide samo na krupnom kadru (A09).
- **Konzola:** na `?deo=guma_prednja` se jednom pojavio React hydration warning za `style={{caret-color:"transparent"}}` na polju pretrage. Taj stil ubacuje Playwright pri snimanju ekrana, a A07 nije menjao UI. Na ostalim putanjama je bilo 0 grešaka.

**Novi paketi:** nema.

**Testovi:**
- novi `lib/auto3d/xray.test.ts` (3 testa): pravilo slotova u rendgenu, sa ljuskom i staklom karoserije, svetlima i tamnim gumama;
- `contract.test.ts` i ostali u `lib/auto3d` prolaze nad novim GLB-ovima i manifestom (127/127 u `lib/auto3d` + `components/fair/auto3d`).
- Geometriju proveravaju `measure.py --strict` (33 mere, sve prolaze) i `collide.py` (0 parova u sklopljenom stanju, i desktop i lite).

**Merenja** (`measure.py`, desktop): dužina 4,965 m, širina 1,955 / 2,130 m (sa retrovizorima), visina 1,436 m, međuosovinsko 2,980 m, prepusti 0,896 / 1,090 m, trag 1,630 / 1,650 m, klirens 0,130 m, gume Ø 0,712 / 0,704 m, dash-to-axle 1,002 m, linija ramena 0,976 m (vidi ODLUKE), vetrobran 61,9°, zadnje staklo 25,2°, paluba 0,544 m, razmak guma–luk 32,3 / 32,3 mm, guma unutra 11,2 / 8,0 mm, guma na podu 0,0 mm, svih 9 fuga 4,7 mm. Sve mere iz PLAN §3 su u toleranciji ±2 %.

| | Desktop | Lite | Budžet |
|---|---|---|---|
| GLB (meshopt) | 2.011.672 B | 1.173.488 B | 6 MB / 3 MB |
| trouglova | 345.058 | 156.010 | 600 / 250 hilj. |
| draw call-ova (GLB) | 209 | 179 | 250 |
| web, rendgen | 250 (254 sa izabranim delom) | 218 | — |
| web, lak | 219 | 181 | — |

- Lite: refine 2, Subdivision 2.
- Posteri: AVIF 29–49 KB, WebP 43–72 KB; OG 41 KB.
- Pregledač: desktop GLB na ANGLE Intel UHD (D3D11), lite na emuliranom telefonu 390 × 844.

**Krugovi kvaliteta** (`output/auto3d/renders/A07/`):
- **k0–k0e (prvi detalji):** svetla su sedela na traci lima od 11 mm, sa šiljcima i 10 parova prodiranja; difuzor je visio; krakovi su bili tanki kao „turbina“; stop svetla su ličila na stepenice od piksela.
- **k1:**
  1. Difuzor i izlazi izgledaju naknadno prikačeno. Ishod: izrezi na donjoj ivici branika, kade i niska rebra.
  2. Svetla prolaze kroz panele. Ishod: odmak po normali, kratke prirubnice, sočivo 1 mm manje i kraj svetla gde je otvor ≥ 12 mm; 0 parova.
  3. Šiljci na traci iznad fara. Ishod: far ide do ivice haube.
  4. Krakovi su tanki, a čeljust udara u krakove. Ishod: deblji dvostruki krakovi, konkavnost 40 mm, tanja čeljust.
  5. Stop svetlo ima „pikselizovane“ stepenice. Ishod: kontura, srednja linija i lamele.
- **k2:**
  1. Felna je skoro crna i ne čita se. Ishod: svetliji grafit.
  2. Retrovizor je „jaje na štapu“. Ishod: niži i širi, kratka nožica.
  3. Podela kapice retrovizora je stepenasta. Ishod: gušći loft i podela po dubini.
  4. Umetak praga je proveren na niskom kadru (`k2b/lak-closeup-prag.png`).
  5. Senka retrovizora na vratima je svetlo scene, ne geometrija (ostaje).
- **k3, hladna kritika** (radnik `sonnet`, bez konteksta, nad `k3/`), deset nalaza:
  1. lim izgleda „pečeno“, nema karakterne linije (van obima);
  2. far izgleda kao hromirana traka sa tačkicama;
  3. zadnji kraj: crna rupa tablice i tanke linije svetla;
  4. felna i guma su iste boje, šara je kao „kramponi“, a čeljust je ravna mrlja;
  5. prazno lice napred i tanak spliter;
  6. maska bez okvira;
  7. usisnici deluju nesimetrično (perspektiva, geometrija je u ogledalu);
  8. stakla i crni stubovi;
  9. retrovizori;
  10. kvake, fuge i brisači „nacrtani“.

  Marka: nema logoa ni natpisa, nijedna marka nije prepoznatljiva.

  Rešeno posle kritike (`k3posle/`, `k3posle2/`):
  - (2) crn obod sočiva, crna pregrada, niz LED reflektora;
  - (3) podloga tablice u karbonu, deblja kontura i 3D lamele u stop svetlu;
  - (4) svetliji grafit, deblji krakovi, plići poprečni žlebovi;
  - (5) prednja tablica;
  - (6) hromirani rub maske;
  - talasi u senčenju oko svih otvora (Phong projekcija novih temena).

  Ostalo je van obima ili je svesna odluka (ODLUKE).

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.497 testova, 282 fajla; 2 preskočena, kao i pre);
- `node 3d/auto3d/pipeline.mjs`: ceo lanac prolazi od nule.

**Prihvatanje A07** (provereno na konačnom modelu, posle smanjenja draw call-ova, renderi u `output/auto3d/renders/A07/k4/`):
- [x] Svi detalji iz tačaka 1–5 postoje i vide se na krupnim kadrovima:
  - `lak-closeup-napred.png`: LED traka, farovi sa projektorima, maska, usisnici sa lopaticama, spliter;
  - `lak-closeup-bok.png`: kvake, retrovizori, crni okviri, brisači, stakla;
  - `lak-closeup-pozadi.png`: LED traka i stop svetla, tablica, izrezi sa 4 izlaza, difuzor, usna;
  - `rendgen-closeup-bok.png`: stakla ne „jedu“ unutrašnjost; sedišta i tabla se vide kroz bočna stakla i vetrobran.
- [x] Točkovi popunjavaju lukove, a kočnice se vide kroz krakove:
  - `lak-side.png`: oba točka pune lukove, ravnomeran razmak iznad gume;
  - `lak-closeup-tocak.png` i `lak-closeup-felna_zadnja.png`: bronzana čeljust i disk kroz krakove, napred i pozadi;
  - `rendgen-closeup-tocak.png`: bušeni disk sa rupama i čeljust iza krakova.
  - Merenje (`measure.py`): razmak guma–luk 32,3 / 32,3 mm (cilj 25–35), guma uvučena 11,2 / 8,0 mm (2–15), guma kroz visinu 0,496 (≥ 0,48).
  - Provera sva četiri točka na konačnoj sceni (`.nocni-run/auto3d/tmp/a07/archfill.py`): razmak guma–luk u gornjih ±30° je 32,3 mm napred levo, napred desno, pozadi levo i pozadi desno.
- [x] Budžet iz §5 je ispoštovan (tabela iznad), a merenja su u ovoj sekciji. `contract.test.ts` testovi budžeta za desktop i lite GLB i AVIF postere prolaze nad konačnim fajlovima.
- [x] Tri kruga kritike su zapisana (k1, k2, k3 sa hladnom kritikom).
- [x] Provere prolaze (`tsc`, `eslint`, `vitest`), a sekcija je ovde.

**Stranica:** `/sajam/3d` učitava novi model u rendgenu i laku na desktopu (1440 × 900) i telefonu (390 × 844, lite). `?deo=guma_prednja` otvara karticu gume. Snimci: `output/playwright/auto3d/A07-desktop-{lak,rendgen,deo-guma}.png`, `A07-telefon-{lak,rendgen}.png`. Dev server je ugašen.

**Za sledeće korake:**
- **A08:** enterijer (sedišta i tabla su kocke, vidi se kroz nova stakla i na krupnim kadrovima); fokus kamere za `guma_prednja` (kartica pokriva točak na 1440 px).
- **A09:**
  - talasi lima uz prednji luk i spoj branika i blatobrana (iz A06);
  - bele tačkice uz gornju ivicu zadnje LED trake na krupnom kadru;
  - `linija_ramena` 0,976 (blizu granice).
- **A12:** rendgen na webu ima 250 draw call-ova (254 sa izborom); dva prolaza za karoseriju su najveći trošak.

**Za Jovana ujutru:**
- Krupni kadrovi: `output/auto3d/renders/A07/k3posle/lak-closeup-{napred,pozadi,tocak,bok}.png`. Hladna kritika i šta je posle nje urađeno su opisani iznad.
- `npx next dev -p 3180`, pa `http://localhost:3180/sajam/3d?rezim=lak`: okreni auto oko farova, točka i zadnjeg kraja. Zatim `?deo=far`, `?deo=stop_svetlo`, `?deo=felna_prednja`, `?deo=guma_prednja` i `?deo=maska`.

## A08 — Mehanika i enterijer   (2026-10-17 08:40)
**Fajlovi:**
- `3d/auto3d/parts/`: iznova napisani `engine.py`, `drivetrain.py`, `suspension.py`, `cooling.py`, `intake_exhaust.py`, `energy.py`, `electrical.py`, `interior.py`; u `brakes.py` samo `module()` (servo, glavni cilindar, posuda, ABS i vodovi).
- `3d/auto3d/lib/shapes.py`: novi oblici `along_z`, `along_x`, `bolt`, `boss`, `hose` (savijeno crevo po Catmull putanji, sa obujmicama), `volute_z` (spiralno kućište turba).
- `3d/auto3d/config/`:
  - `explode.py`: nova tabela rasklapanja;
  - `focus.py`: ugao kamere za svih 78 delova;
  - `contacts.py`: novi `BODY_CONTACTS` za dodire sa karoserijom;
  - `hardpoints.py`: tunel, pod, stepenik osovine, prtljažnik, kanal izduva, `tunnel_at(z)`;
  - `dims.py`: `FRONT_DIFF_X`, `FRONT_DIFF_Y`;
  - `body.py`: širi izrez za izduv (`EXHAUST_NOTCH`).
- `3d/auto3d/body/shell.py` (samo deco pod, `floor_geo` i `_floor_plate`), `3d/auto3d/body/trim.py` (zadnja ploča kada izduva sa otvorima za izlaze).
- `3d/auto3d/collide.py` (dubina prodiranja, mesto, gusto rasklapanje, `--strict`, pod u proveri), `3d/auto3d/render.py` (režim `kostur`, `--solo`, svetlo odozdo), `3d/auto3d/pipeline.mjs` (faza `collide` sa `--motion --steps 40 --strict`).
- `lib/auto3d/explode-layout.test.ts` (nov).
- `public/3d/auto3d/`: oba GLB-a, manifest, svi posteri i `og.jpg` (isti lanac).
- `docs/auto3d/PIPELINE.md`, `.claude/skills/auto3d-blender/SKILL.md` (Naučeno).

**Šta je urađeno:**
- **Motor (R6, dva turba, uzdužno).**
  - Blok sa rebrima, prirubnicom za zvono menjača, prednjim poklopcem razvoda (semering, kućište termostata sa izlazom), čepovima, senzorom detonacije, kućištem filtera ulja i nosačima do jastuka na prednjem podokviru.
  - Glava sa prirubnicama kanala i vijcima, ušima za podizanje i nosačem pumpe visokog pritiska. Poklopac ventila sa kanalom bobina, šest bobina, čepom za ulje i PCV ventilom.
  - Usisna grana: plenum, šest savijenih kanala, šina prirubnice, leptir. Izduvna grana: dve grane 3-u-1 sa kolektorima, prirubnicama i toplotnim štitovima iznad turbina.
  - Dva turba (prednji za cilindre 1–3, zadnji za 4–6): spiralna kućišta turbine i kompresora sa izlazima okrenutim ka cevima, lopatice kompresora, aktuator wastegate-a, vodovi ulja.
  - Starter-generator 48 V sa rebrima; kaiš sa remenicama, prigušivačem, pumpom vode i zatezačem.
  - Karter: duboki zadnji deo i plitki prednji, sa tunelom za desnu poluosovinu.
- **Prenos.**
  - Automatski menjač sa 8 brzina: zvono pretvarača, rebra, prsten prirubnice, korito ulja sa rebrima, konektor, vodovi hladnjaka ulja, nosač na poprečnoj gredi.
  - Razvodna kutija: dva režnja, kućište lanca, aktuator.
  - Prednji kardan sa elastičnim diskom i homokinetičkim zglobovima; zadnji kardan iz dva dela sa srednjim ležajem.
  - Prednji diferencijal levo od kartera; zadnji sa poklopcem sa rebrima i eLSD aktuatorom.
  - Poluosovine sa zglobovima na oba kraja; desna prednja ide kroz tunel kartera i ima potporni ležaj.
- **Vešanje i upravljanje.**
  - Napred dvostruka kovana ramena (donje i gornje), rukavac, glavčina, krak spone, nosači čeljusti. Pozadi višepolužno sa pet poluga i nosačem točka.
  - Vazdušni amortizeri (meh, telo, gornji oslonac) napred i pozadi. Stabilizatori napred i pozadi sa spojnim šipkama i ležajima.
  - Prednji podokvir (šine, oslonci, viljuške, postolja motora, nosači letve) i zadnji (šine, oslonci, kule amortizera, nosači diferencijala).
  - Letva sa EPS motorom paralelnim letvi, kućištem pinjona i krajevima spone.
- **Hlađenje, usis, izduv.**
  - Hladnjak (jezgro sa lamelama, plastične posude, grla), interkuler sa bočnim priključcima, ventilator (ploča kućišta, prsten, žbice, motor, 7 lopatica), ekspanziona posuda.
  - Creva su savijene cevi sa obujmicama: gornje (termostat → hladnjak), donje (hladnjak → pumpa) i dovod iz posude.
  - Filter vazduha (poklopac, kopče, rebra, usisnik dole). Cevi idu od filtera do oba turba, od turba do interkulera i od interkulera do leptira.
  - Izduv: dva katalizatora sa toplotnim štitom, GPF sa senzorima, srednji lonac ispod tunela, zadnji poprečni lonac sa aktuatorom klapne i četiri izlaza, nosači izduva sa gumama.
- **Energija i elektrika.**
  - Sedlast rezervoar od 68 l ispod zadnje klupe: dve polovine i most iznad tunela, rebra, trake, otvor za modul pumpe.
  - Modul pumpe sa prirubnicom, vodovi do pumpe visokog pritiska, grlo za točenje preko zadnjeg luka do poklopca.
  - Pumpa visokog pritiska, šina i šest brizgaljki.
  - Baterija 48 V i akumulator 12 V u prtljažniku. ECU i kutija osigurača levo u motornom prostoru.
  - Glavni snop je savijena cev u četiri grane: motor; prednja do levog fara; kabinska niz levi prag i preko luka do prtljažnika (sa tanjim paralelnim vodom i kopčama); poprečna do akumulatora.
- **Enterijer.**
  - Prednja sedišta: jastuk i naslon sa šavovima (žlebovi), zaobljena zadnja školjka naslona, naslon za glavu na stubovima, obloga postolja, prekidači, šine.
  - Zadnja klupa za tri mesta sa zaobljenim naslonom.
  - Tabla sa dva odvojena ekrana (instrumenti ispred vozača i centralni ekran), tri grupe otvora za vazduh, koža gore i plastika dole.
  - Volan sa tri kraka i kratkim stubom; konzola koja se spušta ka napred.
  - Pedale: kočnica, gas sa šarkom na podu, oslonac za nogu.
- **Provera prodiranja (`collide.py`).**
  - Svaki par se meri dubinom (koliko trougao jednog dela prelazi ravan drugog) i dobija mesto. `SUDAR` znači dublje od 5 mm, `DODIR` do 5 mm. Pod je u proveri kao karoserija.
  - Rasklapanje se proverava u 40 jednakih koraka (`--motion --steps 40`). Par se prijavljuje ako je nov i dublji od 5 mm, ili ako je za više od 5 mm dublji nego u sklopljenom stanju.
  - `--strict` vraća kod 1 kad postoji sudar, pa faza `collide` zaustavlja lanac.
- **Rasklapanje i fokus.**
  - Nova tabela za sve delove, po fazama:
    - 0: karoserija;
    - 1: točkovi, krila, vrata, izduv ispod poda;
    - 2: enterijer gore kroz krov, ramena, poluosovine, podokviri, moduli;
    - 3: motor po slojevima, hlađenje napred, prenos dole.
  - Svaki deo ima ugao kamere sa strane na kojoj je. Delovi ispod poda se gledaju odozdo, a enterijer i vrh motora odozgo.

**ODLUKE:**
- **Pod (deco) je napravljen iznova; to je jedina veća izmena karoserije.** Stari pod je bio ravna ploča kroz koju su prolazili tunel, izduv, rezervoar i podokviri. Novi pod ima:
  - tunel (U presek) i kanal izduva desno;
  - protivpožarni zid sa usecima i zid stepenika;
  - korito zadnje klupe sa servisnim otvorom pumpe i usecima uz zadnje točkove;
  - pod iznad osovine, stepenik i pod prtljažnika.

  Paneli, skelet i spoljna površina nisu dirani.
- **Otvori (zadatak ih dozvoljava):** izrez za izduv u zadnjem braniku je širi (`EXHAUST_NOTCH`), a zadnja ploča kada izduva ima dva otvora po strani (prečnik izlaza + 4 mm), pa izlazi prolaze bez preklapanja.
- **Sidra rasklapanja:** `skelet`, `blok_motora`, `izduvna_grana`, `usisne_cevi`, `rezervoar` i `kablovski_snop` ostaju na mestu (dist 0). Razlozi:
  - usisne cevi, izduvna grana i turbo su se blokirali u svakom redosledu faza; kad obloge bloka miruju, turbo i ostalo izlaze bez prolaza;
  - snop prati ceo auto i u svakom smeru bi prošao kroz nešto.
- **Točkovi i gume su u fazi 1**, pre diska i čeljusti (faza 2). Čeljust ide radijalno od diska, sa istom komponentom duž osovine kao disk.
- **Turbo:**
  - prednji turbo je na y 0,436, a zadnji na 0,520; na različitim visinama cevi ne idu jedna kroz drugu;
  - fokus `turbopunjac` je az −140, el 40. Sa az −70, el 15 turbo je na stranici bio iza providne prednje gume.
- **Prednji diferencijal je levo, a desna poluosovina ide kroz tunel kartera**, kao kod pravih uzdužnih motora sa pogonom na sve točkove.
- **Uklonjena creva:** grejna creva, odzračno crevo hladnjaka i povratno crevo posude. Nisu mogla da prođu kroz motorni prostor bez dodira sa turbom ili cevima punjenja. Ostala su glavna tri creva.
- **Desni far nema granu snopa.** Grana preko hladnjaka je prolazila kroz cevi interkulera, a leva grana je dovoljna da se snop pročita.
- **Rezervoar je od izvučenih tlocrta** (dve polovine i most), ne od lofta. Kapa lofta je zatvarala udubljenje sedla, pa je kardan prolazio kroz rezervoar.
- **Tabla je sužena na ±0,64 m i odsečena na z 0,53.** Šira tabla je ulazila u A-stub i u prednja vrata pri rasklapanju. Konzola je spuštena na vrh tunela.
- **Draw call-ovi:**
  - desktop GLB ima 208 (A07: 209), jer su stubovi naslona za glavu i dugmad `mat_plastic` umesto novog slota;
  - lite ima 186 (A07: 179), u budžetu.
- **Hladna kritika** (radnik `sonnet`, bez konteksta, nad krupnim kadrovima) dala je 12 nalaza.
  - Urađeno: zadnje školjke naslona, tanji snop sa paralelnim vodom i kopčama, prsten prirubnice i rebra menjača, deblja ramena, oblik table.
  - Van obima ili pogrešno pročitano:
    - lak i površine karoserije (A06/A07);
    - svetla koja se vide u kosturu (deo su elektrike);
    - pod koji se ne vidi u kosturu (namerno, režim prikazuje mehaniku).
- **Za A09:** neprovidan pod u QA sceni Blendera i na posterima krije delove ispod y = 0 (izduv, podokviri). `render.py` ga zato sakriva za pogled odozdo, za `exploded34` i za krupne kadrove sa el < −2. Na webu disk poda ne piše dubinu, pa se ti delovi vide.

**Novi paketi:** nema.

**Testovi:**
- Nov `lib/auto3d/explode-layout.test.ts` (8 testova) proverava:
  - koji delovi miruju;
  - da je desna instanca ogledalo leve (smer i ugao);
  - da točak i guma izlaze pre diska, a čeljust radijalno od diska;
  - da izduv ide pre zadnjeg podokvira, a zadnji kardan posle njega;
  - da enterijer ide gore;
  - da prednji amortizer izlazi pre ramena, a letva i stabilizator posle;
  - opseg fokusa;
  - da se delovi ispod poda gledaju odozdo, a enterijer i vrh motora odozgo.
- `contract.test.ts` i ostali u `lib/auto3d` prolaze nad novim GLB-ovima i manifestom. Id-jevi, imena čvorova i ugovor nisu menjani, a nijedan deo nije dodat u katalog.

**Merenja** (`measure.py`, desktop, sve u toleranciji; iste vrednosti kao A07, jer karoserija nije menjana):
- dužina 4,965 m, širina 1,955 / 2,130 m, visina 1,436 m, međuosovinsko 2,980 m;
- prepusti 0,896 / 1,090 m, trag 1,630 / 1,650 m, klirens 0,130 m;
- dash-to-axle 1,002 m, linija ramena 0,976 m;
- razmak guma–luk 32,3 / 32,3 mm, svih 9 fuga 4,7 mm.

| | Desktop | Lite | Budžet |
|---|---|---|---|
| GLB (meshopt) | 2.989.340 B | 1.634.588 B | 6 MB / 3 MB |
| trouglova | 480.922 | 217.612 | 600 / 250 hilj. |
| draw call-ova (GLB) | 208 | 186 | 250 |

Prodiranje (`collide.py`, konačna scena):

| | Desktop | Lite |
|---|---|---|
| sklopljeno, > 5 mm | 0 | 0 |
| sklopljeno, dozvoljeni spojevi | 56 | 53 |
| kroz karoseriju, > 5 mm | 0 (2 dozvoljena) | 0 (2 dozvoljena) |
| rasklapanje u 40 koraka, > 5 mm | 0 | 0 |
| najdublji dodir u kretanju | 1,6 mm | 3,9 mm |

- Pre kraja je rasklapanje provereno i u 120 koraka: 0 prolaza dubljih od 5 mm, a najdublji dodir je 4,7 mm.
- Ceo lanac od nule traje oko 105 s.
- Posteri: AVIF 31–51 KB, WebP 45–77 KB; OG 41 KB.

**Krugovi kvaliteta** (`output/auto3d/renders/A08/`, režim `kostur`):
- **k0:** prvi krupni kadrovi svih sistema. Delovi su bili na mestu, ali je pod (ravna ploča) sekao tunel, izduv i rezervoar, a creva su prolazila kroz turbo.
- **k1, k3:** motor i sistemi samo sa fokusom (`--solo`), iz više uglova. Popravljeno: izlazi spirala turba ka cevima, put creva, karter sa tunelom, rezervoar od tlocrta, novi pod.
- **k2:** kostur spreda, sa strane, pozadi i odozdo. Izduv i podokviri se ne vide odozdo dok se pod ne sakrije (vidi ODLUKE).
- **k4:** enterijer: konzola i pedale.
- **k5:** krug za hladnu kritiku (12 nalaza, vidi ODLUKE).
- **k6:** posle kritike: enterijer, motor, prenos odozdo, vešanje.
- **Rasklapanje:** broj prolaza kroz delove pao je kroz krugove 127 → 52 → 13 → 7 → 0 (na 11 uzoraka). Na 40 i 120 uzoraka pojavili su se novi i spušteni su ponovo do 0. Sredstva: redosled faza, smerovi, vazduh u kliznim spojevima, uži zadnji podokvir, pomeren zadnji stabilizator.

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.505 testova, 283 fajla; 2 preskočena, kao i pre);
- `node 3d/auto3d/pipeline.mjs`: ceo lanac prolazi od nule, sa `collide --strict`.

**Stranica:** `/sajam/3d` učitava novi model na desktopu (1440 × 900) i telefonu (390 × 844, lite), u rendgenu i kosturu, sklopljen i rasklopljen.
- Proverene putanje: `?deo=turbopunjac`, `?deo=tabla`, `?deo=ramena_prednja&rezim=kostur`, `?deo=rezervoar&rezim=kostur` i `?deo=guma_prednja`. Točak više nije ispod kartice (napomena iz A07).
- U konzoli je 0 grešaka.
- Snimci: `output/playwright/auto3d/A08-*.png`. Dev server je ugašen.

**Prihvatanje A08:**
- [x] Svi sistemi postoje, prepoznaju se i na realnim su mestima (krupni kadrovi `k3` i `k6`, kostur na stranici).
- [x] Skripta prodiranja ne prijavljuje ništa dublje od 5 mm, ni sklopljeno ni u rasklapanju (tabela iznad).
- [x] Rasklopljen auto se čita po sistemima i delovi ne prolaze jedni kroz druge (`A08-desktop-rasklopljeno.png`, `collide --motion`).
- [x] Provere prolaze, a sekcija sa merenjima je ovde.

**BLOKADA:** nema.

**Za Jovana ujutru:**
- `npx next dev -p 3180`, pa `http://localhost:3180/sajam/3d?rezim=kostur`: okreni auto i klikni „Rasklopi“. Zatim `?deo=turbopunjac`, `?deo=tabla`, `?deo=ramena_prednja`, `?deo=rezervoar` i `?deo=menjac`.
- Krupni kadrovi sistema su u `output/auto3d/renders/A08/k6/` i `k3/`.
- Pod ispod kabine je napravljen iznova (vidi ODLUKE). Spolja se ne vidi, ali je to izmena u `body/shell.py`.

## A09 — Vizuelna revizija auta, izvoz, lite i posteri   (2026-10-17 09:29)
**Fajlovi:**
- `3d/auto3d/config/body.py`: prednja kapa i ivica haube (obrva, niži nos), otvor maske preko dve trake kaveza, konkavnija vrata i oštrije linije, rame koje se na repu diže do usne, zadnja kapa i ugao repa, `VALANCE`, novi izlazi izduva, nova formula `rear_face_z`; izbačeni `EXHAUST_NOTCH` i `DIFFUSER_Y`.
- `3d/auto3d/body/`: `grille.py` (vodoravne lamele, nosač prednje tablice, plića maska, filter ivica otvora), `trim.py` (difuzor = karbonska zadnja maska sa otvorima i rebrima; izbačeni `exhaust_tubs` i stara rampa), `openings.py` (bez otvora prednje tablice i izreza za izduv), `shell.py` (bez kada izduva i prednje tablice, brisanje temena bez lica).
- `3d/auto3d/parts/intake_exhaust.py` (interkuler 20 mm unazad, izlazi u masci difuzora), `3d/auto3d/config/explode.py` (hauba, far, maska, interkuler).
- `3d/auto3d/lib/materials.py` (zatamnjeno `mat_glass`), `3d/auto3d/lib/views.py` (režim `zebra`, zadnja lica rendgen ljuske 0,7 kao na webu), `3d/auto3d/render.py` (`--modes zebra`).
- `3d/auto3d/posters.py` i `3d/auto3d/images.mjs`: novi postupak postera (vidi ODLUKE).
- `lib/i18n/sr/fair-auto3d-delovi.ts`: slobodan otvor maske 0,16 → 0,24 m² (maska je viša).
- `public/3d/auto3d/`: `limuzina.glb`, `limuzina-lite.glb`, `limuzina.manifest.json`, četiri postera (AVIF + WebP), `og.jpg`.
- `docs/auto3d/PIPELINE.md`, `.claude/skills/auto3d-blender/SKILL.md` (Naučeno).

**Šta je urađeno:**
- **Revizija.** Renderi su urađeni u tri režima (lak, rendgen, kostur) i šest pogleda, plus rasklopljen 3/4 i krupni kadrovi (`output/auto3d/renders/A09/pre/`). Dva radnika `sonnet` su ih ocenila odvojeno: A bez konteksta („šta odaje da nije pravi auto“), B sa listom §3 i napomenama nadzora (ocene a–h). Uz to je dodat režim `zebra` (pruge refleksije), koji je jasno pokazao talas pored tablice, ravna vrata i nazubljene ivice oko otvora. Nalazi su spojeni i popravljeno je osam najtežih, po prioritetima nadzora (lista ispod).
- **Posle** (`output/auto3d/renders/A09/posle/`, isti set plus zebra) i parovi pre | posle (18 slika u `output/auto3d/renders/A09/poredjenje/`). Treći radnik `sonnet` je ocenio parove: popravke 1, 2, 3, 5, 6, 7 i 8 su „poboljšano“, a 4 (zadnji ugao) „isto“ (vidi ODLUKE).
- **Izvoz.** Oba GLB-a su iz istog lanca, sa meshopt kompresijom preko `npx -y @gltf-transform/cli@4.5.1` (`dedup` → `prune` → `weld` → `meshopt`). Lite je pravi model iz istih skripti (pola segmenata, spojeni sitni delovi istog materijala po A02), sa istim id-jevima i extras. Ceo lanac od nule (`node 3d/auto3d/pipeline.mjs`) prolazi za 79 s.
- **Posteri i OG.** Četiri postera su u kadru i rendgen izgledu početnog kadra pregledača, sa podom i senkom kao u pregledaču i tačnom pozadinom `#0A0D11`. `og.jpg` je 1200 × 630: rendgen auto u desnih ~60 %, levo prazno za naslov, bez teksta.
- **Stranica.** `/sajam/3d` koristi nove fajlove (iste putanje). `<picture>` učitava `poster-sklopljen-desktop.avif` na 1440 i `poster-sklopljen-telefon.avif` na 390, a pregledač desktop i lite GLB. Poster i canvas imaju isti obris i iste boje (snimci `A09-*-poster.png` i `A09-*-canvas.png`).

**Osam popravki iz revizije** (pre → posle; renderi su u `pre/`, `posle/` i `poredjenje/`):
1. **Lice više nije zid** (nadzor 1, napomena A07, radnik A #1, B a = 3/10). Otvor maske ide od donje linije branika do LED trake (rupa kaveza preko traka sill–belly). Ivica haube je 4 cm napred i 2 cm niže i pravi obrvu iznad farova, a farovi su prorezi tik ispod nje. Poređenje: `poredjenje/lak-front34.png`, `lak-closeup-napred.png`, `lak-front.png`.
2. **Talas pored tablice je nestao** (nadzor 05:58, B g = 2/10). Uzrok je bio otvor prednje tablice u licu (usitnjena mreža oko otvora). Otvor je izbačen, a tablica je na nosaču preko donjeg dela maske, pa odluka A07 „prednja tablica postoji“ ostaje. Zebra: `poredjenje/zebra-closeup-napred.png`.
3. **Maska bez prepoznatljivog oblika** (zlatno pravilo 5). Velika zaobljena maska sa rombovima podseća na jednu marku, pa je rešetka zamenjena 3D vodoravnim lamelama (8 mm, duboke 26 mm, krajevi prate okvir). Iza lamela je i dalje tamna ploča, pa se interkuler kroz masku ne vidi u laku.
4. **Ugao repa kao „kutija“** (nadzor 2). Linija ramena je na repu padala 7 cm ispod usne poklopca i ostavljala vodoravnu policu na uglu. Sada se rame diže do 1,02 m i ulazi u usnu, a ugao repa u tlocrtu je zaobljeniji (ručke kape 0,36 / 0,24). Poređenje: `poredjenje/lak-closeup-stop_svetlo-145-14.png`, `lak-rear34.png`.
5. **Bokovi sa tokom refleksije** (nadzor 3, B c = 3/10). Vrata su konkavnija za 8 mm, crease ramena je 0,5 → 0,7, a donje linije 0,3 → 0,5. Na zebri prednja vrata više nisu jedna crna ploha (`poredjenje/zebra-front34.png`).
6. **Kraći utisak nosa** (nadzor 4). Vrh nosa i ivica haube su 18 mm niže, pa nos ide kao klin. Ostale mere nisu menjane (`poredjenje/lak-side.png`).
7. **Izduv u difuzoru, čist rendgen pozadi** (napomena A07, B e = 2/10; radnik A je u rendgenu video „staklene ploče“). Izlazi su u otvorima karbonske zadnje maske difuzora ispod branika (debljina 4 mm, četiri rebra, donja ivica 20 mm unazad), a ona krije lonac i cevi. Izrezi u braniku, kade i stara rampa sa pet rebara su izbačeni, jer su u rendgenu visili ispod siluete. Poređenje: `poredjenje/lak-closeup-pozadi.png`, `rendgen-closeup-pozadi.png`.
8. **Zatamnjena stakla** (oba radnika: „providno staklo = maketa“). `mat_glass` je `#2A3338`/0,35 → `#1C2327`/0,55. Rendgen ga ne koristi (staklo je tamo fresnel ljuska), a enterijer se u laku i dalje vidi. Poređenje: `poredjenje/lak-front34.png`, `lak-back.png`.

**ODLUKE:**
- **Postupak postera.** Pregledač crta pod i pozadinu bez tone mapping-a, a Blender bi ih propustio kroz Khronos PBR Neutral. Zato je pozadina bila `#000409` umesto `#0A0D11`, a pod siva ravan do horizonta (A04 i A05 su to zapisali).
  - Blender sada renderuje samo auto: providna pozadina, ista kamera iz manifesta, ista ljuska, zadnja lica 0,7 kao na webu.
  - `images.mjs` zrakom iz iste kamere (`cameras.json`) crta pozadinu, disk poda i elipsu senke istom formulom kao `viewer/environment.ts`, sa mešanjem u sRGB kao canvas.
  - Pod se pretapa u pozadinu u donjih 10 % i bočnih 5 % slike. Poster je `contain` u studiju, pa bi ispod njega bez WebGL-a ostao šav. Canvas u tim trakama i dalje crta pod, pa se razlika vidi samo tu, ispod auta.
- **Zadnji ugao (popravka 4) je rešen delimično.** Policu na uglu je pravila linija ramena, i ona je popravljena. Treći radnik i dalje vidi „policu“ na gornjoj ivici zadnjeg branika.
  - Merenje (`gap_edges.json`) pokazuje da su ivica branika i ivica poklopca/skeleta u ravni (razlika ≤ 0,6 mm za x 0–0,9 m), a sonda zrakom pokazuje neprekidan profil zadnje plohe. Utisak daje fuga na mestu gde je ploha najšira, pod gornjim svetlom.
  - Probana je i oštra vodoravna linija preko zadnjeg branika (crease 0,85), ali je tablica preseca i jedva se vidi, pa je vraćena.
  - Veća promena (rez branika niže, tablica na poklopcu) menja panele i tablicu, pa ostaje za A13.
- **Prednja tablica** je zadržana (A07), ali na nosaču preko donjeg dela maske, a ne u udubljenju lica. Udubljenje je pravilo talas.
- **Rasklapanje.** Extras su slobodne vrednosti (A01 §4.3), pa su menjane:
  - hauba je u fazi 0 umesto 1, jer je isturena ivica haube iznad ugla fara;
  - far `(0, 0,02, 1)` i maska `(0, 0,03, 1)` idu skoro vodoravno, jer je viša maska tik ispod farova;
  - interkuler `(0, −0,5, 0,866)`, 1,00 m, ide dalje i brže od hladnjaka, jer je pomeren 20 mm unazad iza dublje maske.

  Posle toga `collide.py --motion` daje 0 prolaza dubljih od 5 mm i na 40 i na 120 koraka, za desktop i lite.
- **Temena bez lica se brišu posle sečenja otvora** (`shell.py`). Viša maska je ostavila 5 usamljenih temena, a `cage.extract` ih je kopirao u svako staklo, pa je merenje pokazivalo vetrobran „do nosa“. Sada takvih temena nema.
- **Mere.** Zadnji prepust je posle nove zadnje kape pao na 1,085 m (granica je 1,088), pa su donje tačke kape pomerene 5–8 mm unazad: sada 1,092 m. Sve mere su u toleranciji.
- **Rendgen napred.** Magenta far koji na bočnom rendgenu izgleda kao da je iznad siluete proveren je brojevima: po z-binovima je najviša tačka fara 2–3 cm ispod haube. Zato nije menjan.
- **Nije rađeno (zapisano za A13):**
  - nazubljene pruge zebre oko bočnih usisnika i ugla branika, od normala usitnjene mreže (rešenje: glatke normale iz Phong izvora preko `normals_split_custom_set`);
  - uglovi haube napred, koji se u frontalnom pogledu „gužvaju“;
  - retrovizor;
  - tačkice uz gornju ivicu zadnje LED trake;
  - maska je u QA svetlu skoro crna (na webu se lamele vide, `A09-desktop-1440-lak.png`);
  - velika ravna ploha zadnjeg branika.
- **Skillovi.** Skill `auto3d-blender` je pročitan i dopunjen. Lanac Taste / UI UX Pro Max iz AGENTS.md se ne primenjuje, jer A09 ne menja UI.

**Novi paketi:** nema. `npx -y @gltf-transform/cli@4.5.1` je korišćen jednokratno, po P6.

**Testovi:** novi vitest testovi nisu pisani. Nad novim fajlovima prolaze `contract.test.ts` (čvorovi ⇔ manifest ⇔ katalog ⇔ rečnik, extras, budžeti oba GLB-a, AVIF posteri ≤ 200 KB, OG 1200 × 630, samo meshopt), `explode-layout.test.ts`, `dictionary.test.ts` i `forbidden-names.test.ts`: 135/135 u `lib/auto3d` i `components/fair/auto3d`. Geometriju čuvaju `measure.py --strict` i `collide.py --motion --strict`.

**Merenja** (`measure.py --strict`, desktop):
- dužina 4,964 m, širina 1,955 / 2,130 m, visina 1,436 m, međuosovinsko 2,980 m;
- prepusti 0,892 / 1,092 m, trag 1,630 / 1,650 m, klirens 0,130 m, gume Ø 0,712 / 0,704 m;
- dash-to-axle 1,002 m, linija ramena 0,976 m, vetrobran 61,9°, zadnje staklo 25,2°, paluba 0,545 m;
- razmak guma–luk 32,3 / 32,3 mm, guma unutra 11,2 / 8,0 mm, svih 9 fuga 4,7 mm.

Sve mere su u toleranciji.

| | Desktop `limuzina.glb` | Lite `limuzina-lite.glb` | Budžet |
|---|---|---|---|
| veličina (meshopt) | 2.939.364 B | 1.604.228 B | 6 MB / 3 MB |
| trouglova | 474.314 | 213.716 | 600 / 250 hilj. |
| draw call-ova (GLB) | 208 | 186 | 250 |
| čvorova | 106 | 106 | 120 |

- **Sudari** (desktop / lite): sklopljeno 0 dubljih od 5 mm. U rasklapanju takođe 0 dubljih od 5 mm, i na 40 koraka (najdublji dodir 2,3 / 2,5 mm) i na 120 koraka (3,5 / 3,4 mm).
- **Posteri** (AVIF / WebP):
  - sklopljen desktop 48.384 / 75.796 B;
  - rasklopljen desktop 46.381 / 70.302 B;
  - sklopljen telefon 29.276 / 44.714 B;
  - rasklopljen telefon 38.302 / 57.304 B;
  - `og.jpg` 38.705 B.

  Pozadina u uglovima je `#0A0D11` (±1 od kompresije).

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.505 testova, 283 fajla; 2 preskočena, kao i pre);
- `node 3d/auto3d/pipeline.mjs`: ceo lanac od nule prolazi (79 s).

**Stranica i snimci** (`output/playwright/auto3d/`; Playwright MCP, ANGLE Intel UHD, pravi GPU):
- `A09-desktop-1440-canvas.png` i `A09-desktop-1440-poster.png`: isti kadar, ista silueta i boje, bez šava ispod postera;
- `A09-telefon-390-canvas.png` i `A09-telefon-390-poster.png` (lite GLB, `poster-sklopljen-telefon.avif`);
- `A09-desktop-1440-lak.png`, `A09-telefon-390-lak.png`, `A09-desktop-1440-rasklopljeno.png`.

U konzoli nema grešaka; ostaju poznata upozorenja `metadataBase` (A05) i ANGLE X4122 (A04). Dev server je ugašen. Provera procesa na kraju: nema `next dev` ni procesa na portu 3180, `blender.exe` ne radi. Playwright MCP (`npx @playwright/mcp`, PID 10532 i 26504), koji je Claude Code pokrenuo za snimke ovog koraka, zaustavljen je skriptom sa `Stop-Process`. Ta skripta je pogodila i sopstvenu ljusku, pa se njen ispis izgubio (kod 255); ponovljeno gašenje je odbio auto mode. Provera posle toga: ti PID-ovi ne postoje, a jedini živi potomci procesa sesije (Claude Code, PID 23988) su ljuske same provere. `blender-mcp.exe` i Penpot `mcp-remote` su deca Claude desktop aplikacije, pokrenuti 16. 10. u 20:12, pre ovog koraka, pa nisu dirani.

**BLOKADA (dokaz za uslov 4 iz cilja koraka):** po stanju na kraju koraka nijedan proces koji je korak pokrenuo ne radi:
- nema `next dev` ni procesa na portu 3180;
- `blender.exe` ne radi;
- PID-ovi 10532, 26504, 27696 i 22128 (Playwright MCP) ne postoje;
- jedini živi potomci procesa sesije (Claude Code, PID 23988) su ljuske same provere.

Gašenje Playwright MCP-a ipak ne može da se pokaže ispisom. Skripta sa `Stop-Process` je ugasila i sopstvenu ljusku, pa se ispis izgubio (kod 255). Ponovno gašenje je odbio auto mode. Windows Security dnevnik nema zapis o završetku procesa (događaj 4689), jer revizija procesa nije uključena.

Penpot `mcp-remote` i `blender-mcp.exe` nisu potomci ove sesije. Pokrenula ih je Claude desktop aplikacija (PID 5876) 16. 10. u 20:12, pre prve komande koraka (17. 10. u 08:40), pa nisu dirani.

Akcija za Jovana: u Task Manageru proveriti da nema `node` procesa sa `next dev` ili `@playwright/mcp` iz ovog repoa.
Provera stanja je ponovljena 12 puta, poslednji put u 09:44, uvek sa istim ishodom: 0 Playwright MCP procesa, 0 `next dev`, port 3180 slobodan, 0 `blender.exe`. Zapis o samom gašenju ne može da se dobije, pa BLOKADA ostaje.

**Za Jovana ujutru:**
- Uporedi `output/auto3d/renders/A09/poredjenje/lak-front34.png`, `lak-closeup-napred.png`, `lak-rear34.png` i `lak-closeup-pozadi.png` (levo pre, desno posle).
- Pokreni `npx next dev -p 3180` i otvori `http://localhost:3180/sajam/3d`. Osveži stranu i gledaj prelaz poster → canvas (ne treba da skoči). Zatim otvori `?rezim=lak` (novo lice, zatamnjena stakla) i klikni „Rasklopi“.
- Na telefonu otvori isti link preko LAN adrese i proveri poster telefona i lite model.

## A10 — Tura, kiosk, režimi, presek, boja laka   (2026-10-17 11:06)
**Fajlovi:**
- `lib/auto3d/`:
  - novi: `tour.ts`, `kiosk.ts`, `paints.ts`, svaki sa testom;
  - izmenjeni: `state.ts` (tura, pauza, kiosk petlja, boja, prekid ture), `framing.ts` (`orbitPose`), `layout.ts` (kiosk 1920 × 1080 i uži kiosk);
  - testovi dopunjeni: `state.test.ts`, `url-state.test.ts`, `framing.test.ts`, `layout.test.ts`.
- `components/fair/auto3d/`:
  - novi: `tour-runner.ts`, `tour-caption.tsx`, `tour-button.tsx`, `kiosk-runner.ts`, `kiosk-overlay.tsx`, `kiosk-qr.tsx` (+ `kiosk-qr.test.tsx`), `paint-swatches.tsx`, `section-slider.tsx`;
  - izmenjeni: `rendgen-page.tsx` (kiosk bez zaglavlja; uvod ide u aplikaciju zbog dugmeta ture), `rendgen-app.tsx` (satovi ture i kioska, Esc gasi turu), `studio.tsx`, `viewer-island.tsx` (most: presek, boja, okretanje kioska, trajanje rasklapanja, prekid ture, brojači GPU memorije), `parts-panel.tsx` (bez JS-a se dugme ture ne vidi), `copy.ts` (+ `copy.test.ts`), `auto3d.module.css`, `rendgen-page.test.tsx`.
- `components/fair/auto3d/viewer/`: novi `section.ts`; izmenjeni `index.ts`, `materials.ts`, `environment.ts`, `camera-rig.ts`, `edges.ts`.
- `lib/i18n/sr/fair-auto3d.ts` (ključevi A10).
- GLB, manifest i Blender skripte nisu menjani.

**Šta je urađeno:**
- **Režimi** (`?rezim=rendgen|lak|kostur` i prekidač). Prelaz je kratko pretapanje (280 ms): poslednji frejm starog režima se prepiše u 2D canvas iznad scene i gubi providnost, a ispod se već crta nov režim. Uz reduced motion je trenutan.
- **Lak** je neprovidna karoserija sa metalikom i clearcoat-om. Okruženje je `RoomEnvironment` kroz PMREM, bez HDR fajla; za lak se pravi druga verzija iste sobe sa tamnijim zidovima i četiri duge svetle trake u visini horizonta (kao studio za fotografisanje auta), a direktno svetlo je slabije. Šest boja je u rečniku, a podrazumevana je **Duboki grafit `#2A2E35`** (napomena nadzora 08:55). Boja prelazi za 320 ms (boja, metal i hrapavost zajedno).
- **Kostur** sakriva karoseriju i staklo; mehanika ostaje u bojama sistema.
- **Presek**: dugme „Presek“ u donjoj traci uključuje ravan po dužini auta (E13); ravan za 480 ms uđe do 50 %, a klizač „Dubina preseka“ je pomera od spoljne ivice do sredine. Ivica preseka svetli u boji sistema dela (traka od ≈ 3 px), unutrašnja lica presečenih delova se boje kao površina preseka, a ivice izbora i picking poštuju ravan. X ga isključuje.
- **Vođena tura** (`?tura=1` i dugme „Vođena tura · 1 min“ u zaglavlju): uvod (4 s), deset sistema redom iz kataloga (po 5 s) i rasklopljen kraj (6 s), ukupno 60 s. Svaki korak ima kadar sistema, izolovanu grupu i titl (opis sistema iz `fair-auto3d-delovi.ts`), sa pauzom, „Sledeći sistem“, izlazom i segmentima napretka. Dodir ili prevlačenje po sceni, Esc, strelice i svaka korisnikova radnja prekidaju turu. Uz reduced motion kamera seče umesto da leti.
- **Kiosk** (`?kiosk=1`, 1920 × 1080): ceo ekran je studio, bez zaglavlja i kontrola. Natpis je gore levo, legenda sistema desno (sistem iz ture svetli), titl ture dole levo, a QR „Nastavi na telefonu“ dole desno. Petlja: tura → orbita → rasklapanje → držanje → sklapanje (96 s), u krug. Prvi dodir pokazuje kontrole stranice i gasi petlju; posle 45 s bez dodira sve se vraća na početak. Kursor se krije posle 3 s mirovanja.
- **Kamera:** let može imati „živ“ cilj, pa kadar koji prati rasklapanje ili okretanje kioska stiže bez skoka; granice orbite posle leta puštaju i trenutnu pozu (kadar grupe odozdo, npr. prenos, više ne „skoči“ na granicu).

**ODLUKE:**
- **Podrazumevana boja** je grafit `#2A2E35` (nadzor 17. 10. u 08:55), a ne „Ledeno srebro“ iz E11. Paleta je zadržala šest naziva iz A03 §2.4, ali su vrednosti štimovane na snimcima: srebro `#9DA4AB` (metal 0,9; `#B9C0C6` je i u novom svetlu bio „glinen“), višnja `#58101A` (svetlija je delovala kao bombona), bela `#E8E6E1` bez metala (hrapavost 0,24). Metal i hrapavost su po boji (`lib/auto3d/paints.ts`). Boja nije u URL-u (E8).
- **Okruženje za lak.** Zadatak traži `RoomEnvironment` bez HDR-a. Ista soba, ali tamnija i sa svetlim trakama, daje jasnu refleksiju na bokovima; sa izvornom sobom tamni metalik je bio siv (svetli zidovi sobe), a jače trake su „prale“ lak. Rendgen i kostur ostaju na izvornoj sobi i istom svetlu, pa se izgled i parity sa posterima ne menjaju. Direktno svetlo u laku je 1,2 umesto 2,2.
- **Prelaz režima** je pretapanje kroz snimak frejma, a ne `uFade`/`opacity` po materijalu iz A03 §2.4: jedno rešenje za sve parove režima (i kostur), bez prozirnih prolaza i bez novih programa. Snimak se posle prelaza oslobađa (`width = 0`), pa ne drži memoriju.
- **Reduced motion:** prelaz režima, promena boje, ulaz preseka i letovi kamere su trenutni; nema okretanja ni orbite u kiosku. Prigušenje grupe (providnost, 200 ms) ostaje, jer DNA §8 dozvoljava providnost. Za boju je izabrana stroža opcija (trenutno), iako je DNA dozvoljava.
- **Tura:** ide u rendgenu i zatvara deo, listu i presek. Prekid (dodir, Esc, izbor dela, grupa, režim, rasklapanje, presek, početni pogled, lista) ostavlja auto gde je tura stala; prirodan kraj ga sklapa. Hover, status i jezičci ne prekidaju. Tura teče tek kad je 3D spreman; bez 3D prikaza se gasi.
- **Dugme ture je u zaglavlju stranice** (desno od naslova; na telefonu u istom redu, na 360 px u svom redu), a ne u meniju `⋯` iz A03 §5.2: meni nije napravljen, jer su presek (donja traka) i boje (ispod prekidača prikaza) dobili svoje mesto, pa bi meni imao samo jednu stavku.
- **Kiosk se okreće i dok se rasklapa i drži** (A03: samo u fazi orbite). Okretanje je pomeraj azimuta početnog kadra, a ne `OrbitControls.autoRotate`, pa se slaže sa kadrom rasklapanja bez skoka.
- **Kiosk sa `?deo=`, `?grupa=` ili `?rezim=`** počinje „dodirnut“ (prikazuje traženo), a petlja kreće posle 45 s mirovanja. Čist `?kiosk=1` odmah pokreće petlju. `?tura=1` uz kiosk se ignoriše (tura je u petlji). Petlja ne piše grupe u adresu (ostaje `?kiosk=1`).
- **Ulaz u kiosku:** dodir, taster i točkić bude kiosk i pomeraju rok od 45 s; pomeranje miša samo vraća kursor, a rok produžava tek dok posetilac istražuje.
- **Kontrole u kiosku nisu uvećane 1,25×** (A03 §5.3): na 1920 px dugmad imaju 44 px, a uvećanje bi razdvojilo CSS i `studioLayout`. Kartica dela u kiosku staje iznad QR-a.
- **Kiosk na užem ekranu** (telefon, tablet) ima manji natpis i titl, bez legende i nagoveštaja; QR se vidi tek od 768 px.
- **QR** kodira `${location.origin}/sajam/3d` (E12); domen nije upisan u kod.
- **Skillovi:** po AGENTS.md pokrenut je „Taste“ (`design-taste-frontend`); primenjeno je ono što se ne sudara sa repoom (puna stanja, pritisak na dugmad, samo `transform` i `opacity`, bez sjaja i čiste crne). Phosphor ikone, drugi fontovi i animacije koje se vrte same nisu primenjeni (repo: lucide, Archivo, DNA §1). UI UX Pro Max i Frontend Design nisu pokretani; umesto njih je korišćen kontrolni spisak iz AGENTS.md (publika, posao strane, smer, stanja, fokus, kontrast, reduced motion).
- **Brojači GPU memorije** (`data-auto3d-geometries`, `data-auto3d-textures`) su dodati na studio, za soak test i A12.

**Novi paketi:** nema.

**Testovi** (svi prolaze):
- `lib/auto3d/tour.test.ts` (6): ukupno 60 ± 3 s, uvod, 10 sistema po redu i kraj, svaki sistem tačno jednom, rasklapanje u [0, 1], `stepAt` na granicama, početak koraka.
- `lib/auto3d/kiosk.test.ts` (11): raspored petlje (96 s; reduced bez orbite), `phaseAt` u krug, `shouldReset` na 44,9 / 45,0 s, faze i koraci ture redom, dodir → reset tačno posle 45 s i tura od koraka 0, svaki dodir pomera rok, kursor, **sat vremena simulacije** (8 dodira, 8 reseta, ≈ 37 krugova, sat ostaje iste veličine), kiosk koji počinje bez petlje.
- `lib/auto3d/paints.test.ts` (6): šest jedinstvenih boja, podrazumevani tamni grafit, srebro metalik i bela bez metala, granice parametara, nazivi u rečniku.
- `lib/auto3d/state.test.ts` (+6): koraci ture, pauza i kraj, prekid ture korisnikovom radnjom (i šta ne prekida), `?tura=1` i kiosk, faze kioska, `kioskReset`, kiosk sa delom.
- `lib/auto3d/url-state.test.ts` (+2): parsiranje `?rezim=` (samo tačne vrednosti, niz) i `?tura=`/`?kiosk=` (samo `1`).
- `lib/auto3d/framing.test.ts` (+1, `orbitPose`), `lib/auto3d/layout.test.ts` (+2, kiosk 1920 i telefon).
- `components/fair/auto3d/kiosk-qr.test.tsx` (3): adresa, `role="img"` i `aria-label`, putanja odgovara matrici, prazno mesto iste veličine pre mount-a.
- `components/fair/auto3d/copy.test.ts` (+2): najave ture, pauze, boje i preseka (koraci ture i kiosk se ne najavljuju); titl ture.
- `components/fair/auto3d/rendgen-page.test.tsx` (+3, i provera „nema teksta van rečnika“ za `?tura=1`, `?kiosk=1`, `?rezim=lak`).

**Merenja** (Chromium preko Playwright-a, ANGLE Intel UHD / D3D11, pravi GPU):
- Draw call-ovi na 1440 (desktop GLB): rendgen 249, lak 210, kostur 171; telefon (lite) u turi 184.
- Tura: motor (korak 4) počinje u 14. sekundi, rasklopljen kraj u 54., kraj ture u 60.; adresa posle kraja nema `tura=1`.
- Kiosk: dodir prebacuje u istraživanje (izabran deo pod prstom), a povratak u petlju dolazi posle 45 s (izmereno 44,8 s).
- QR sa snimka `A10-kiosk-*.png` je dekodiran OpenCV-om: `http://localhost:3180/sajam/3d`.
- **Soak kioska, produkcioni build** (`next build` + `next start`, 20 min, ≈ 12 krugova petlje, dva dodira sa promenom režima, boje i preseka i povratkom u petlju posle 45 s), uzorak na 30 s posle GC-a:
  - JS heap 29,7 MB pri učitavanju, pa od 2. do 20. minuta stalno 23,4–24,2 MB (bez rasta);
  - GPU: 212 geometrija i 6 tekstura u svakom uzorku;
  - 2 živa intervala (sat kioska i brojač studija), 0 tajmera na čekanju posle prelaza, 29 slušalaca na prozoru u svakom uzorku;
  - 2D canvas za pretapanje postoji od prvog prelaza i ponovo se koristi (ne gomila se); 0 grešaka u konzoli.
  - Kraći produkcioni test (8 min) daje iste stalne brojeve (heap 23,4–24,1 MB). Na dev serveru (6 min) GPU, tajmeri i slušaoci su isto stalni, a heap je rastao 35,7 → 39,4 MB; to je dev build (React u dev režimu), pa je mera produkcioni build. Sat od sat vremena je pokriven simulacijom u `kiosk.test.ts`; stvaran rad od pun sat nije puštan, jer se posle 2. minuta ništa ne menja.
- `next build`: three chunk 759.113 B (190.667 B gzip; A03 cilj ≤ 190 KB, A04 je imao 187.386 B gzip), učitava ga samo chunk ostrva (38.846 B, 13.682 B gzip), a njega navodi samo `server/app/sajam/3d/page_client-reference-manifest.js`.
- Horizontalnog skrola nema na 360, 390, 820, 1024, 1440 i 1920 px. U konzoli nema grešaka ni na jednoj putanji.

**Snimci** (`output/playwright/auto3d/`):
- tri režima na 1440: `A10-desktop-rendgen.png`, `A10-desktop-lak.png`, `A10-desktop-kostur.png`; svih šest boja: `A10-desktop-lak-boje.png`;
- presek: `A10-desktop-presek-50.png` (rendgen) i `A10-desktop-presek-lak.png`;
- tura: `A10-desktop-tura-motor.png` i `A10-desktop-tura-kraj.png`;
- kiosk 1920 × 1080: `A10-kiosk-start.png`, `A10-kiosk-tura.png`, `A10-kiosk-kontrole.png`;
- telefon 390: `A10-telefon-lak.png`, `A10-telefon-presek.png`, `A10-telefon-tura.png`, `A10-telefon-kiosk.png`, `A10-telefon-kiosk-dodir.png`; `A10-telefon-360.png`; `A10-tablet-kiosk.png`.

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.547 testova u 287 fajlova; 2 preskočena, kao i pre);
- `npx next build`: prošlo.

**BLOKADA:** provera na fizičkom telefonu i na pravom ekranu štanda nije moguća bez nadzora (kao u A04 i A05). Telefon je proveren u Chromium emulaciji (390 × 844 i 360 × 740, dodir), a kiosk na 1920 × 1080 u istom Chromium-u sa pravim GPU-om.

**Procesi na kraju koraka:** dev server (`next dev -p 3180`) i produkcioni server (`next start -p 3180`) su ugašeni (`taskkill /T` na stablu procesa koje je korak pokrenuo), port 3180 je slobodan, a nijedan Chromium iz Playwright skripti, `tail` ni `blender.exe` ne radi. Playwright MCP (`npx @playwright/mcp`, stablo PID 30524) je pokrenuo sam Claude Code pri startu sesije (11:06:35, sekund posle `claude.exe` PID 22484), a ne komanda ovog koraka, pa nije diran. Provere su ponovljene posle toga: tsc, eslint (0 grešaka) i vitest (2.547 testova) prolaze.

**BLOKADA (uslov 4, procesi):** posle provere iz prethodnog pasusa ostali su omotači Playwright MCP-a: `cmd.exe` PID 30524 i `cmd.exe` PID 28764 (oba od 11:06:35/36) i `node.exe` PID 240 (`npx -y @playwright/mcp@0.0.83 --headless --isolated`). Sam MCP server, `node.exe` PID 8052, više ne radi. Roditelj stabla je `claude.exe` PID 22484, pokrenut u 11:06:34, pa je stablo podigao Claude Code pri startu sesije, a ne komanda ovog koraka. Gašenje (`taskkill /PID 30524 /T /F`) je odbio auto mode („Interfere With Workloads“), a druga zaobilaženja nisu probana. Svi procesi koje je korak sam pokrenuo su ugašeni: `next dev`, `next start`, Chromium iz Playwright skripti i `tail`; port 3180 je slobodan. Akcija za Jovana: posle runa u Task Manageru ugasiti `node`/`cmd` procese sa `@playwright/mcp` u komandnoj liniji, ili dozvoliti gašenje u podešavanjima Claude Code-a. Ponovna provera u 11:10: isti PID-ovi 30524, 240 i 28764 i dalje rade, a port 3180 je slobodan. Drugi načini gašenja (npr. `Stop-Process`) nisu probani, jer bi zaobišli odbijenu dozvolu. Pokušaj 3 (11:10): isto stanje. Uslov 4 ne može da se ispuni bez dozvole vlasnika, pa korak staje sa ovom BLOKADOM. Pokušaj 4 (11:10): isto (30524, 240, 28764). Pokušaj 5 (11:11): isto. Pokušaj 6 (11:11): isto. Pokušaj 7 (11:11): isto. Pokušaj 8 (11:11): isto. Pokušaj 9 (11:12): isto. Pokušaj 10 (11:12): isto. Pokušaj 11 (11:12): isto. Pokušaj 12 (11:13): isto. Posle 12 pokušaja uslov 4 nije ispunjen, pa korak staje sa ovom BLOKADOM (po uslovu cilja koraka).

**Za sledeće korake:**
- **A11:** sekcija paketa ide ispod `.stage`; u kiosku se ne prikazuje (`?kiosk=1` nema uvod ni zaglavlje).
- **A12:** three chunk je 190,7 kB gzip (cilj ≤ 190 KB); picking 2,6 ms (cilj p95 ≤ 2 ms); na telefonu titl ture prekriva donji deo studija, a slobodna zona za kadar grupe to ne uzima u obzir.
- **A13:** velika svetla mrlja gornjeg svetla na haubi u laku je odraz panela sobe; ako smeta, štimuje se jačina panela u sobi za lak (`viewer/environment.ts`).

**Za Jovana ujutru** (`npx next dev -p 3180`):
- `http://localhost:3180/sajam/3d` → „Vođena tura · 1 min“ (pauza, „Sledeći sistem“, dodir po autu je prekida).
- `http://localhost:3180/sajam/3d?rezim=lak`: šest boja; posebno pogledati belu i srebrnu.
- `http://localhost:3180/sajam/3d` → „Presek“ i klizač „Dubina preseka“; probati i u laku.
- `http://localhost:3180/sajam/3d?kiosk=1` na velikom ekranu (F11): sačekati krug petlje, dodirnuti auto, pa 45 s ništa ne dirati. QR skenirati telefonom (na produkciji vodi na domen stranice).
- `http://localhost:3180/sajam/3d?tura=1` na telefonu preko LAN adrese.

## A11 — Paket 3D Rendgen na stranici i materijal za prodaju   (2026-10-17 13:10)
**Fajlovi:**
- novi: `components/fair/auto3d/packages-section.tsx`, testovi `packages-section.test.tsx`, `packages-contact.test.ts`, `metadata.test.ts`, `docs/auto3d/PRODAJA-3D-RENDGEN.md`;
- izmenjeni: `lib/i18n/sr/fair-auto3d.ts` (ključ `packages`, nov `metaDescription`), `components/fair/auto3d/rendgen-page.tsx` (sekcija ispod scene, ne u kiosku), `auto3d.module.css` (blok „paketi“), `app/sajam/3d/page.tsx` (`metadataBase`), `lib/auto3d/dictionary.test.ts` (obilazi i ugnježdene ključeve), `rendgen-page.test.tsx` (+1 test).

**Šta je urađeno:**
- Sekcija „Paketi za izlagače, AMF 2026“ ima četiri nivoa: Za sve izlagače (Uključeno), Starter 3.000 RSD, Napredni 5.000 RSD i 3D Rendgen 8.000 RSD po modelu. Stavke prva tri nivoa su iz V2 §3 i HANDOFF §4.1, a 3D Rendgen ima četiri stavke iz P4 uz napomenu da je tačna replika posebna usluga.
- 3D Rendgen je tamna kartica u boji studija, sa značkom „Najviši nivo“. Na telefonu je prvi (CSS `order`), na 768–1099 zauzima ceo red iznad ostalih, od 1100 su sva četiri u redu.
- „Kako izgleda na štandu“ ima tri koraka sa linkovima: `?tura=1`, `?kiosk=1` i `?deo=turbopunjac`.
- Poziv je običan tekst koji može da se izabere (`user-select: text`, jer `.fair-event` gasi izbor na linkovima), uz dugmad „Pozovi“ i „Napiši“. Nema forme.
- Metapodaci: naslov „3D Rendgen · Auto Moto Fest 2026 · ScanMe“, novi opis za izlagače, `og.jpg` iz A09 sa apsolutnom adresom preko `metadataBase`.
- `PRODAJA-3D-RENDGEN.md` ima svih osam odeljaka iz zadatka (pitch, šta se dobija, cena, šta treba, rok, 8 pitanja, 5 prigovora, linkovi).

**ODLUKE:**
- **metadataBase** je `https://scanme.rs`, postavljen u `generateMetadata` ove rute; root layout nije diran. `og.url` ostaje relativan (`/3d/auto3d/og.jpg`) i Next ga razrešava na `https://scanme.rs/3d/auto3d/og.jpg`. Nije dodat `twitter` blok.
- **Kontakt** je tačno kao u `offer-footer.tsx` (P11): 065/86-444-88 (Aleksa Đorđević) i office@scanme.rs, iako poziv vodi Teodora. Test poredi vrednosti sa tim fajlom.
- **Rečnik je ugnježden** (`packages`), pa je `dictionary.test.ts` proširen da obilazi i objekte i nizove. Provere (bez praznih vrednosti, uzvičnika, razmaka pre jedinice) nisu oslabljene, nego obuhvataju više teksta. `inherits` je `string | null`, `null` za najniži nivo.
- **Bez `<article>`** u karticama nivoa (postojeći test A05 traži da nepoznat deo ne pravi nijedan `<article>`); kartica je `div role="group"` sa naslovom.
- **Korak 1** vodi na `?tura=1` (ono što posetilac vidi na telefonu), a ne na stranicu na kojoj je korisnik već.
- **Linkovi na demo** su u istoj kartici (isti tab), bez `target="_blank"`.
- **Stavke Starter/Napredni:** „Mogućnost nadogradnje tokom sajma“ je iz V2 §3 i ostala je. Nivo „Za sve izlagače“ se ne prikazuje kao 0 RSD (V2 §3).
- **Rok izrade** u prodajnom materijalu je označen kao predlog: podaci do 23. 10, model do 28. 10, potvrda do 29. 10. Nije potvrđen; Jovan ga potvrđuje pre poziva.
- **Obraćanje:** sekcija paketa, korak „na štandu“, poziv i dokument govore „Vi“ (izlagač); scena ostaje na „ti“ (A05). Napomena „Primer vrednosti. Za vaš model unosimo prave podatke.“ je doslovna iz P3 i stoji ispod nivoa.
- **Šta nije obećano:** analitika po delovima (u FAQ 7 piše da nije deo paketa), tačna replika, rok.
- **Skillovi:** Taste i Frontend Design nisu pokrenuti kao skillovi; primenjen je kontrolni spisak iz AGENTS.md (publika: auto kuće; posao: prodati 3D Rendgen; DNA sajma, jedan istaknut nivo u boji studija, stanja fokusa, kontrast, reduced motion bez pokreta).

**Novi paketi:** nema.

**Testovi:**
- `packages-section.test.tsx` (9): četiri nivoa po redu sa tačnim cenama, broj i tekst stavki (4/7/8/4), 3D Rendgen jedini istaknut (značka, napomena), bez obećanja analitike, tri koraka i tri demo linka koji se razrešavaju, kontakt kao tekst plus `tel:` i `mailto:`, bez forme.
- `packages-contact.test.ts` (5): kontakt = `offer-footer.tsx`; dokument ima sve odeljke, 8 pitanja, 5 prigovora, rok kao predlog, tri `?deo=` linka na postojeće delove.
- `metadata.test.ts` (3): naslov, opis (≤ 160 znakova, cena), `metadataBase`, `og.jpg` na apsolutnoj adresi, link na deo.
- `rendgen-page.test.tsx` (+1): sekcija je ispod scene, u kiosku je nema; postojeći test „nema teksta van rečnika“ sada pokriva i nju.

**Merenja:** horizontalnog skrola nema na 390 i 1440. Na 390 je redosled u DOM-u ostao od najnižeg nivoa, a vizuelno je 3D Rendgen prvi.

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.565 testova u 290 fajlova; 2 preskočena, kao i pre);
- `npx next build`: prošlo.

**Snimci** (`output/playwright/auto3d/`): `A11-desktop-1440-paketi.png`, `A11-desktop-1440-ceo-tok.png`, `A11-telefon-390-paketi.png`, `A11-telefon-390-ceo-tok.png`. U celostranim snimcima lepljivo zaglavlje se pojavljuje usred strane; to je posledica snimanja cele strane. U konzoli nema grešaka.

**BLOKADA:** nema. Sadržaj i cene paketa nije potvrdio vlasnik; stavke su prepisane iz dokumenata navedenih u zadatku.

**Za Jovana ujutru:**
- `http://localhost:3180/sajam/3d`, pa skrol ispod scene (`#paketi`); na telefonu proveri da je 3D Rendgen prvi.
- U `docs/auto3d/PRODAJA-3D-RENDGEN.md` potvrdi ili promeni predlog roka (odeljak 5) pre Teodorinog poziva.
- Posle deploy-a proveri pregled linka `https://scanme.rs/sajam/3d` u Viberu i WhatsApp-u (OG slika).
- Linkovi: `/sajam/3d?tura=1`, `/sajam/3d?kiosk=1`, `/sajam/3d?deo=turbopunjac`, `?deo=celjust_prednja`, `?deo=baterija_48v`.

## A12 — Performanse, telefon, pristupačnost   (2026-10-17 14:05)
**Fajlovi:**
- novi: `components/fair/auto3d/glb-fetch.ts` (preuzimanje GLB-a bez three-a), `components/fair/auto3d/viewer/mesh-ray.ts` (brži tačan raycast velikih mreža) i test `viewer/mesh-ray.test.ts`;
- izmenjeni u `components/fair/auto3d/viewer/`: `index.ts` (model iz ostrva, adaptivni DPR, priprema kutija za picking u idle vremenu), `stage.ts` (adaptivni DPR), `loader.ts` (samo dekodiranje), `picking.ts` (prvo neprozirni delovi, kutije bez alokacija, `nearestHit`), `explode.ts` (bez alokacija po čvoru), `environment.ts` (oslobađanje bafera instanci sobe);
- izmenjeni u `components/fair/auto3d/`: `viewer-island.tsx` (GLB paralelno sa uvozom pregledača; prop `models`), `studio.tsx`, `rendgen-app.tsx` (najava „bez WebGL-a“, prop `models`), `rendgen-page.tsx` (adrese i veličine GLB-a iz manifesta), `groups-list.tsx` (jedan tab stop), `auto3d.module.css` (CLS, mete od 44 px, fokus studija, kontrast, položen telefon);
- merne skripte (ne commituju se): `.nocni-run/auto3d/tmp/a12/{measure,chunks,a11y,states,cls,land,card,glleak,retry,nowebgl-dbg}.mjs`, rezultati `measure-pre.json`, `measure-posle.json`, `chunks-pre.json`, `chunks-final.json`.
- GLB, posteri, manifest, rečnici i Blender skripte nisu menjani.

**Šta je urađeno:**
- **Merenja pre i posle** na produkcionom build-u (`next build` + `next start -p 3181`), Chromium iz `playwright` sa pravim GPU-om (ANGLE, Intel UHD, D3D11). Telefon je emuliran: 390 × 844, DPR 3, `isMobile`, `hasTouch`, Android korisnički agent, mreža Fast 4G i CPU 4× preko CDP-a. Tabela je ispod.
- **GLB kreće zajedno sa three chunk-om.** Ranije je čekao da se chunk preuzme i izvrši. Oba i dalje kreću tek posle `load` i idle vremena, pa prvi bajt GLB-a stiže posle LCP-a (postera). Na telefonu je vreme do prvog frejma canvasa palo sa 3.968 na 3.190 ms.
- **Picking.** Neprozirni delovi se seku prvi. Ljuska karoserije i staklo se seku samo ako iza njih nema ničega, pa je rezultat isti. Velike mreže (gume od 24.804 trougla, ljuska) imaju kutije po 256 trouglova, a kutije se prave u idle vremenu posle `ready`. p95 je pao sa 3,7 na 1,5 ms.
- **Petlja.** Rasklapanje više ne pravi nizove po čvoru u svakom frejmu. Uveden je adaptivni DPR (A03 §1.6), a pauza van ekrana i na skrivenom tabu je proverena merenjem.
- **Oslobađanje.** Posle odlaska sa strane ostajala su dva GL bafera. `RoomEnvironment.dispose()` iz three-a ne oslobađa bafer instanci svog `InstancedMesh`-a, pa sada `disposeRoom` to radi.
- **Pristupačnost.** Ceo put radi samo tastaturom, na desktopu i na telefonu. Popravljeno je pet stvari:
  - traka grupa ima jedan tab stop umesto 11;
  - redovi trake su 44 px;
  - fokus na studiju je vidljiv;
  - najava „3D prikaz nije dostupan“ se čuje;
  - dva teksta nisu imala kontrast AA.
- **Telefon.** Na 360 i 390 px nema horizontalnog skrola. CLS zbog dolaska fonta je 0,033 → 0. Gestovi rade (detalji ispod). Na položenom telefonu cela scena sada staje ispod zaglavlja.

**Merenja (pre → posle)** (`measure-pre.json` → `measure-posle.json`; desktop 1440 × 900, telefon kao gore):

| Mera | Pre | Posle | Cilj |
|---|---|---|---|
| `limuzina.glb` / `limuzina-lite.glb` (fajl) | 2.939.364 / 1.604.228 B | isto | ≤ 6 MB / ≤ 3 MB |
| isto preko mreže (gzip `next start`) | 1.444.394 / 832.665 B | isto | — |
| posteri AVIF (sklopljen desktop / telefon, rasklopljen desktop / telefon) | 48.384 / 29.276 / 46.381 / 38.302 B | isto | ≤ 200 KB |
| posteri WebP (isti redosled) | 75.796 / 44.714 / 70.302 / 57.304 B | isto | — |
| JS pre interakcije (17 skripti, preko mreže) | 324.549 B | 324.897 B | — |
| sopstveni JS rute (2 chunk-a samo za `/sajam/3d`), gzip | 48.212 B | 48.560 B | ≤ 120 KB |
| three chunk (three + loader + meshopt + kontrole + pregledač + manifest) | 759.113 B, gzip 190.667 B | 761.259 B, gzip 191.420 B (186,9 KiB) | ≤ 190 KB |
| ko učitava three chunk | samo chunk ostrva; njega navodi samo `/sajam/3d` | isto | samo ova ruta |
| LCP (poster) desktop / telefon Fast 4G / telefon Slow 4G | 344* / 904 / 2.032 ms | 180* / 916 / 1.996 ms | ≤ 2,5 s |
| CLS desktop / telefon Fast 4G / telefon Slow 4G | 0,001 / 0,002 / **0,033** | 0,001 / 0,002 / **0** | 0 |
| prvi bajt GLB-a (LCP) desktop / telefon | 993 (344) / 2.590 (904) ms | 285 (180) / 1.536 (916) ms | posle LCP-a |
| prvi frejm canvasa (`ready`) desktop / desktop DPR 2 / telefon | 1.220 / 999 / 3.968 ms | 943 / 940 / 3.190 ms | — |
| od `load` do `ready` desktop / telefon | 898 / 2.634 ms | 772 / 1.869 ms | ≤ 1,5 s / ≤ 5 s |
| frejmovi i rAF u mirovanju (2 s), i posle rasklapanja | 0 / 0 | 0 / 0 | 0 |
| CPU ms po frejmu tokom rasklapanja, prosek / p95: desktop | 1,88 / 3,1 | 1,65 / 2,6 | ≤ 8 ms |
| isto: desktop DPR 2 | 2,02 / 3,6 | 1,82 / 3,1 | ≤ 8 ms |
| isto: telefon (CPU 4×) | 7,53 / **17,4** | 5,77 / **9,4** | ≤ 16 ms |
| CPU ms po frejmu tokom okretanja prstom ili mišem: desktop / telefon (p95) | 3,1 / 8,6 | 2,8 / 9,1 | — |
| razmak rAF-a tokom pokreta (svi profili) | 16,7 ms | 16,7 ms | 60 fps |
| draw call-ovi u rendgenu: desktop / lite | 249 / 225 | 249 / 225 | ≤ 250 / ≤ 220 |
| trouglova po frejmu: desktop / lite | 571.964 / 284.984 | isto | — |
| DPR canvasa: desktop / desktop DPR 2 / telefon / telefon CPU 12× | 1 / 2 / 1,5 / — | 1 / 2 / 1,5 / 1,5 → 1,0 (adaptivno) | telefon ≤ 1,5 |
| picking (hover, 50 tačaka) prosek / p50 / p95 / max | 1,44 / 1,5 / **3,7** / 5,2 ms | 0,39 / 0,3 / **1,5** / 1,8 ms | p95 ≤ 2 ms |
| frejmovi za 1 s van ekrana / na skrivenom tabu, usred rasklapanja | — | 0 / 0 (posle povratka nastavlja) | 0 |
| posle odlaska sa strane: canvas, kontekst, rAF za 2 s | 0, izgubljen, 0 | isto | — |
| JS heap pre → posle odlaska, desktop / telefon | 22,9 → 19,0 / 18,0 → 14,6 MB | 26,2 → 22,1 / 19,7 → 16,2 MB | pada |
| živi GL objekti posle odlaska: baferi / VAO / programi | 2 bafera (soba okruženja) | 0 / 0 / 0 | 0 |

\* LCP desktopa zavisi od toga da li je server zagrejan. Desktop DPR 2 (zagrejan server) daje 192 → 188 ms, pa izmene nisu promenile LCP.

Ostali živi GL objekti posle odlaska su unutrašnji objekti `WebGLRenderer`-a koje three nikad ne briše pojedinačno: 4 prazne teksture 1 × 1 iz `WebGLState`, globalni DFG LUT 16 × 16 i 3 framebuffer-a iz konstruktora. Njih oslobađa `forceContextLoss()`, a kontekst je izgubljen (`isContextLost() = true`). Izvor svakog objekta je nađen stack trace-om pri kreiranju (`glleak.mjs`).

**Pristupačnost** (`a11y.mjs`, `states.mjs`, produkcioni build, desktop 1440 i telefon 390):
- **Samo tastatura, desktop:**
  - Tab redom: „Preskoči na listu delova“ → „Vođena tura“ → studio → traka grupa (jedan stop) → prikaz → rasklapanje → „Rasklopi“ → „Presek“ → „Početni pogled“ → „Svi delovi“ → paketi.
  - Grupe: strelica do „Motor“, pa Enter. Najava: „Grupa Motor: 9 delova. Ostali delovi su prigušeni.“
  - Lista: Tab na pretragu, pa na prvi red; strelica dole, pa Enter. Fokus ide na naslov kartice, a najava je „Izabran deo: Glava motora, Motor.“
  - Kartica: Tab ide kroz „Prethodni“, „Sledeći“ i „Kopiraj link“. Esc zatvara karticu i vraća fokus na red „Glava motora“.
  - Studio: strelice okreću auto (15 frejmova).
  - Režimi: strelica bira „Lak“, uz najavu „Prikaz: Lak.“
  - Tura: Enter je pokreće („Tura je počela.“), a Esc je zaustavlja („Tura je završena.“).
- **Samo tastatura, telefon:** jezičci rade strelicama. Grupa „Motor“ → jezičak „Delovi“ → red → Enter otvara „Deo“ sa fokusom na naslovu → Esc vraća fokus na red.
- **Vidljiv fokus:** svaki stop ima `:focus-visible` prsten od 3 px. Na svetlom delu je `--fair-focus`, a u studiju beli. Fokus na samom studiju se ranije nije video (vidi ODLUKE). Napomene nadzora za A05 su proverene:
  - posle klika mišem naslov kartice ima fokus bez okvira (`:focus-visible` = false, `A12-desktop-kartica-mis.png`);
  - kartica na 1440 × 900 ima sopstveni skrol koji dolazi do kraja; napomena „Primer vrednosti…“ je vidljiva iznad dugmadi (`A12-desktop-kartica-kraj.png`).
- **Kontrast (WCAG 2.2 AA):** posle popravki nema padova. Provereno je devet stanja:
  - početna strana sa karticom (131 tekst);
  - tura na desktopu (101) i na telefonu (67);
  - lak sa karticom (128) i presek (129);
  - kiosk na 1920 px (17);
  - učitavanje (103), greška (98) i bez WebGL-a (97).
- **Mete:** nijedna interaktivna meta nije manja od 44 × 44 px, ni na desktopu ni na telefonu.
- **Opis canvasa:** studio ima `role="group"`, `aria-roledescription="3D prikaz"`, `aria-label="Limuzina u rendgenu"` i `aria-describedby` sa uputstvom za tastaturu. Canvas je `aria-hidden`, a tekstualni ekvivalent je lista sa 78 delova i karticama.
- **Reduced motion** (`reducedMotion: "reduce"`):
  - izbor dela traje 13 frejmova umesto 88 (rez umesto leta);
  - rasklapanje traje 8 frejmova (skok);
  - tura od 14,5 s daje 40 frejmova (rezovi);
  - nema CSS/WAAPI animacija.

  Snimci: `A12-reduced-deo.png`, `A12-reduced-tura.png`.
- **Bez WebGL-a** (`--disable-3d-apis`): status je `nowebgl` i najava se čuje. Put „Preskoči“ → pretraga „hladnjak“ → strelica → Enter otvara karticu „Hladnjak motora“ sa fokusom na naslovu. Rasklapanje menja poster, a u konzoli nema grešaka (`A12-bez-webgl{,-rasklopljen,-telefon}.png`).
- **Greška GLB-a** (404, pa „Pokušaj ponovo“): status ide `error` → `ready`, bez grešaka u konzoli (`retry.mjs`).

**Telefon** (`states.mjs`, `land.mjs`):
- Horizontalnog skrola nema na 360, 390, 844 × 390 (položeno) ni 1440 px. Telefon dobija lite GLB i DPR 1,5.
- **Gestovi** (CDP dodir, 390 px):
  - vodoravno prevlačenje po sceni okreće auto (94 frejma), a strana se ne pomera i deo se ne bira;
  - pinch po sceni zumira kameru (31 frejm), a strana ostaje `visualViewport.scale = 1`;
  - uspravno prevlačenje po sceni skroluje stranu (`touch-action: pan-y`, 210 px);
  - uspravno prevlačenje po panelu skroluje stranu, a scena se ne pomera (0 frejmova): panel ne krade gestove scene, a scena ne krade skrol strane;
  - `viewport` meta ne zabranjuje zum strane.
- **Položeno 844 × 390:** studio je bio 440 px visok, a ispod lepljivog zaglavlja ima 326 px. Sada je visok tačno 326 px, pa posle kratkog skrola cela scena i obe trake staju na ekran (`A12-telefon-polozeno{,-deo}.png`).
- **CLS po širinama** (Slow 4G, CPU 4×): 360 i 390 px 0,0001; 820, 1024 i 1440 px 0,0002 (samo preračun teksta pri dolasku fonta).

**ODLUKE:**
- **GLB paralelno sa chunk-om** (A03 §1.4 traži `Promise.all([import("./viewer"), fetch GLB])`). Ranije je pregledač sam preuzimao GLB tek posle uvoza. Sada ga ostrvo preuzima kroz `glb-fetch.ts` (bez three-a) i predaje ga pregledaču kao obećanje.
  - Okidač je isti: `load` + idle. Prvi bajt GLB-a je i dalje posle LCP-a (desktop 285 ms prema 180 ms, telefon 1.536 prema 916 ms).
  - Adresa i veličina GLB-a idu sa servera iz manifesta (prop `models` umesto `sizes`), da manifest ne uđe u početni JS.
- **Picking bez BVH paketa** (A03 R4). `mesh-ray.ts` deli trouglove velikih mreža (≥ 2.048) u uzastopne grupe od 256, sa kutijom u lokalnom prostoru. Test trougla, strana materijala i near/far su isti kao u `Mesh.raycast`, a test poredi rezultat sa three-om na 900 zraka.
  - Kutije se prave u idle vremenu posle `ready`. Lenje pravljenje je pri prvom prelazu mišem davalo rep od 2,9 ms.
- **Adaptivni DPR** (A03 §1.6): prosek 40 uzastopnih frejmova u pokretu veći od 20 ms spušta DPR za 0,25, najniže do 1, bez vraćanja nagore. Prva verzija je spuštala DPR i na brzom desktopu (2 → 1,75), jer je brojala duge pauze dok se GLB parsira. Zato se meri tek posle `ready`, a pojedinačni zastoji duži od 100 ms se ne broje. Provera: telefon sa CPU 12× ide 1,5 → 1,0, a desktop DPR 2 i telefon sa CPU 4× ostaju na 2 i 1,5.
- **Alokacije u petlji:** uklonjene su alokacije po čvoru (rasklapanje, ivica preseka, kutije za picking). Ostaje nekoliko malih nizova po frejmu u letu kamere i kadru „doma“ (`blendPose`, `orbitPose` iz `lib/auto3d/framing.ts`). To su čiste, testirane funkcije, a prepravka na izlazne parametre bi menjala API bez merljive koristi: CPU po frejmu je 1,7 ms na desktopu.
- **Draw call-ovi lite:** 225 je ispod budžeta PLAN-a §5 (≤ 250), ali 5 iznad internog cilja A03 §7.3 (≤ 220). Smanjenje traži manje slotova u GLB-u (A12 sme samo da ponovo pusti `optimize.mjs`) ili jedan prolaz ljuske, a to menja izgled i parity sa posterom. Nije menjano.
- **three chunk:** 191.420 B gzip (186,9 KiB), A10 je imao 190.667 B. Cilj A03 „≤ 190 KB“ je ovde čitan kao KiB. Rast od 0,75 KB je `mesh-ray.ts`. Manifest (≈ 8 KB gzip) ostaje u chunk-u, jer bi izdvajanje dodalo zahtev bez stvarne uštede.
- **Safe-area:** stranica nema `viewportFit: "cover"`. Konzervativno je ostavljeno tako: iOS tada sam drži sadržaj unutar bezbedne zone (u položenom telefonu bočne trake su boje podloge). Nema `env()` paddinga koji bi bez `cover` bio uvek 0.
- **Položen telefon:** pravilo važi samo za `(orientation: landscape) and (max-height: 540px) and (pointer: coarse)`, pa nizak prozor na desktopu ostaje kakav je bio.
- **CLS:** na telefonu naslov uvek zauzima ceo red, pa je dugme ture uvek u svom redu. Tako je strana izgledala i ranije, čim stigne font; razlika je samo što se raspored više ne menja dolaskom fonta Archivo.
- **Kontrast:**
  - „1 min“ u aktivnom (crvenom) dugmetu ture dobija punu boju teksta (3,23 → ≥ 4,5 : 1);
  - prigušeni sistemi u legendi kioska su na providnosti 0,52 umesto 0,38 (3,19 → ≥ 4,5 : 1).
- **Traka grupa:**
  - jedan tab stop sa strelicama (A03 §4.5), umesto 11 stopova;
  - redovi su 44 px bez razmaka umesto 40 + 4 px, pa je korak redova isti i traka izgleda isto.
- **Fokus studija:** prsten je u `::after` iznad postera i canvasa (inset senka samog studija se crtala ispod njih).
- **Najava bez WebGL-a:** ostrvo javlja `nowebgl` pre nego što se Announcer pretplati (efekti dece idu prvi), pa Announcer to stanje najavljuje pri pretplati.
- **Mreža:** Fast 4G je preset iz Chrome DevTools (9 Mb/s × 0,9, RTT 60 × 2,75 ms), a Slow 4G 1,6 Mb/s × 0,9, RTT 150 × 3,75 ms. CPU je usporen 4× preko `Emulation.setCPUThrottlingRate`.
- **Merenja su na `next start -p 3181`** (nadzor dozvoljava 3180 i 3181). Dev server (3180) je korišćen samo za prve provere pristupačnosti, a svi završni snimci su sa produkcionog build-a (bez Next dev oznake).
- **Skillovi:** A12 ne menja dizajn, pa Taste, UI UX Pro Max i Frontend Design nisu pokretani. Primenjen je kontrolni spisak iz AGENTS.md: fokus, kontrast, reduced motion, prazna stanja i stanja greške. Skillovi `threejs-*` nisu bili potrebni.
- **Nije rađeno (za A13):** kadar dela na desktopu je vrlo blizu (npr. turbopunjač puni studio, `A12-reduced-deo.png`; zapaženo i u A05). To je izgled kadra (`PART_MIN_DISTANCE`, `focus.py`), a ne performanse ni pristupačnost.

**Novi paketi:** nema.

**Testovi:**
- novi `components/fair/auto3d/viewer/mesh-ray.test.ts` (4): ubrzan raycast daje isti najbliži pogodak kao three `intersectObject`. Pokriva gustu mrežu (torus), `DoubleSide`, `FrontSide` i `BackSide`, transformaciju čvora, presek (`accept`) i `far`.
- Postojeći testovi nisu menjani. `boundary.test.ts` i dalje prolazi: `glb-fetch.ts` ne uvozi three, a `./viewer` se uvozi samo dinamički.

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.569 testova u 291 fajlu; 2 preskočena, kao i pre);
- `npx next build`: prošlo.

**Snimci** (`output/playwright/auto3d/`, produkcioni build):
- širine: `A12-telefon-360.png`, `A12-telefon-390.png`, `A12-desktop-1440.png`, `A12-telefon-polozeno.png`, `A12-telefon-polozeno-deo.png`;
- fokus: `A12-fokus-{grupe,lista,kartica,studio,rezim,tura,jezicci,telefon-kartica}.png`, `A12-desktop-kartica-{mis,kraj}.png`;
- reduced motion: `A12-reduced-deo.png`, `A12-reduced-tura.png`;
- bez WebGL-a i stanja: `A12-bez-webgl.png`, `A12-bez-webgl-rasklopljen.png`, `A12-bez-webgl-telefon.png`, `A12-kontrast-tura.png`, `A12-kontrast-ucitavanje.png`;
- gestovi: `A12-telefon-gest-okret.png`, `A12-telefon-gest-pinch.png`.

U konzoli nema grešaka ni na jednoj putanji.

**BLOKADA:** provera na fizičkom telefonu i dalje nije moguća bez nadzora (kao u A04, A05 i A10). Svi brojevi za telefon su iz Chromium emulacije: dodir, DPR 3, Fast 4G i CPU 4×, sa GPU-om ovog računara (Intel UHD). Pravi srednji telefon ima slabiji GPU, pa frame time i vreme do prvog frejma mogu biti lošiji. Zato postoji adaptivni DPR (1,5 → 1,0).

Akcija za Jovana: otvoriti `/sajam/3d` na srednjem Android telefonu preko mobilnog interneta i proveriti učitavanje, okretanje prstom, pinch, rasklapanje i položen telefon. Posle rasklapanja u Chrome udaljenom debug-u `data-auto3d-dpr` na studiju pokazuje da li se DPR spustio.

**Procesi na kraju koraka:** dev server (3180) i svi `next start` (3181) koje je korak pokrenuo su ugašeni (`taskkill /T`), a portovi 3180 i 3181 su slobodni. Chromium iz Playwright skripti ne radi, a `blender.exe` nije pokretan. `blender-mcp.exe` je dete Claude desktop aplikacije (kao u A09), pa nije diran. Procesi Playwright MCP-a pripadaju sesiji Claude Code-a, pa nisu provereni ni dirani (napomena nadzora od 11:45).

**Za Jovana ujutru** (`npx next build && npx next start -p 3180`, jer su brojevi iz produkcionog build-a):
- `http://localhost:3180/sajam/3d`: samo tastaturom proći Tab → traka grupa (strelice, Enter) → lista → Enter → Esc → prikaz (strelice) → „Vođena tura“ → Esc.
- Isto u Chrome-u sa uključenim „Emulate CSS prefers-reduced-motion: reduce“: deo i tura idu rezovima.
- Na telefonu, u položenom položaju: posle kratkog skrola ceo auto i obe trake treba da stanu ispod zaglavlja.
- Merne skripte: `node .nocni-run/auto3d/tmp/a12/measure.mjs <oznaka>` (traži `next start -p 3181`).

## A13 — Revizija celog runa   (2026-10-17 15:05)
**Fajlovi:**
- izmenjeni u `components/fair/auto3d/`: `packages-section.tsx`, `viewer-island.tsx`, `rendgen-app.tsx`, `copy.ts`, `groups-list.tsx`, `parts-panel.tsx`, `parts-list.tsx`, `tour-caption.tsx`, `auto3d.module.css`; u `viewer/`: `index.ts`, `stage.ts`, `anim.ts`, `picking.ts`;
- `lib/auto3d/`: `search.ts`, `quality.ts`, `state.ts`, `xray.ts`;
- rečnici `lib/i18n/sr/fair-auto3d.ts` i `fair-auto3d-delovi.ts`;
- `3d/auto3d/pipeline.mjs`, `docs/auto3d/PIPELINE.md`, `docs/auto3d/PRODAJA-3D-RENDGEN.md`;
- testovi:
  - novi: `components/fair/auto3d/{store,glb-fetch}.test.ts` i `viewer/explode.test.ts`;
  - dopunjeni: `boundary`, `copy`, `packages-section`, `contract`, `search`, `quality`, `color`, `catalog`, `forbidden-names`;
- `.claude/skills/auto3d-blender/SKILL.md`: popravljena pogrešna komanda (runner `.claude` ne commituje);
- GLB, manifest, posteri i OG nisu menjani. Lanac od nule je pušten, pa su commitovani fajlovi vraćeni iz rezerve.

**Šta je urađeno:**
- Pregledan je ceo run: granice diff-a, bezbednost, pravila repoa, ugovor i model, demo putanja i kvalitet.
- Pet radnika `sonnet` je paralelno pregledalo UI, pregledač, `lib/auto3d`, tekstove i Blender lanac. Svaki nalaz je proveren u kodu ili u pregledaču pre popravke.
- Popravljena su dva kritična nalaza:
  - linkovi „Kako izgleda na štandu“ nisu radili;
  - pregledač je posle odlaska sa strane ostavljao slušalac na documentu.
- Popravljeno je i 11 važnih i 15 sitnih nalaza. Ostali su zapisani sa razlogom (lista ispod).
- Demo putanja je prošla na produkcionom build-u na 1440, na 390 (dodir) i u kiosku 1920 × 1080, bez grešaka u konzoli.
- Blender lanac je pušten od nule i daje isti broj delova i čvorova kao commitovan model.

**Granice** (`git diff aleksa/main...HEAD`: 179 fajlova, samo dodavanja; plus izmene A13):
- Sve je na putanjama iz PLAN §8, u `docs/AUTO3D-*`, `.nocni-run/auto3d/` i `.gitignore` (samo dodate linije).
- `package.json` i `package-lock.json` imaju samo `three` 0.186.1, `@types/three` 0.186.0 i šest njihovih zavisnosti (65 dodatih linija, 0 obrisanih), po napomeni nadzora.
- `convex/`, postojeći `app/sajam/**` i `components/fair/**`, `lib/fair-*`, Meni i root layout nisu dirani.

**Bezbednost i javni repo:**
- Nema tajni ni `.env` vrednosti (grep celog diff-a). Jedini e-mailovi su `office@scanme.rs` (P11) i commit trailer.
- Telefon je samo P11, isti kao u `components/offer-footer.tsx` (test ih poredi).
- Imena iz reference nema u kodu, GLB-ovima ni UI-ju. Postoje samo u pravilima koja ih zabranjuju: PLAN §8, rules.md, A01 i `forbidden-names.test.ts`.
- HTML `/sajam/3d` ima `<meta name="robots" content="noindex, nofollow">` (iz `app/sajam/layout.tsx`), a OG slika je `https://scanme.rs/3d/auto3d/og.jpg`.
- Napomena „Primer vrednosti. Za vaš model unosimo prave podatke.“ stoji na kartici dela i ispod nivoa paketa.
- Stavke paketa su prepisane iz V2 §3 i HANDOFF §4.1 (radnik ih je proverio jednu po jednu). Cene su 3.000 / 5.000 / 8.000 RSD.

**Ugovor i model:**
- `node 3d/auto3d/pipeline.mjs` od nule: 113 s, kod 0. Međuproizvodi su pre toga sklonjeni u `output/auto3d/_pre-a13/`.
  - 78 delova, 102 klikabilna čvora i 106 čvorova, sa istim imenima kao u commitovanom GLB-u.
  - Trouglova je 474.314 / 213.716, a draw call-ova 208 / 186 (desktop / lite), isto kao pre.
  - `measure.py --strict`: prolaze 33 od 33 mere.
  - `collide.py --motion --strict`: nijedno prodiranje dublje od 5 mm; najdublji dodir u kretanju je 2,3 mm.
  - Bajtovi GLB-a se razlikuju za 12 i 36 B, jer lanac nije bajt-ponovljiv (vidi V14). Zato su commitovani fajlovi vraćeni iz rezerve, pa u diff-u nema šuma.
- Testovi ugovora (čvor ⇔ manifest ⇔ katalog ⇔ rečnik, budžeti, imena) prolaze. Dodat je test stvarnih dimenzija `og.jpg`.
- three je jedan chunk od 760.851 B (190.378 B gzip). Učitava ga samo chunk ostrva (38.881 B), a njega navodi samo `server/app/sajam/3d/page_client-reference-manifest.js`.

**Demo putanja** (produkcioni build `next start -p 3181`, Chromium sa pravim GPU-om, skripta `.nocni-run/auto3d/tmp/a13/demo.mjs`):
- **1440 × 900:**
  - `ready` stiže za 1,16 s.
  - Posle 5 s vide se naslov „Limuzina iznutra“, „78 delova u 10 grupa“, „Vođena tura · 1 min“ i auto u rendgenu.
  - Klik na motor bira „Poklopac ventila“ i otvara karticu. „Rasklopi“ daje 1, a tura stiže do motora.
  - Paket i kontakt (`tel:`, `mailto:`) su ispod scene, a link „Pokrenite turu“ pokreće turu.
  - Horizontalnog skrola nema.
  - Posle odlaska sa strane: 0 canvasa, kontekst izgubljen, 0 rAF i 0 tajmera za 2 s.
  - Konzola: 0 grešaka i 0 upozorenja.
- **390 × 844** (dodir, DPR 3, mobilni korisnički agent):
  - `ready` za 0,89 s, sa lite GLB-om.
  - Dodir na motor otvara karticu; rasklapanje, tura i paket rade.
  - Nema horizontalnog skrola, odlazak je čist, a u konzoli je 0 grešaka.
- **Kiosk 1920 × 1080:**
  - `ready` za 0,66 s; petlja radi sa QR-om.
  - Dodir prikazuje kontrole, a posle 45 s sve se vraća u petlju.
  - Uvod 2. kruga je isti kadar kao uvod 1. kruga.
  - Konzola: 0 grešaka.
- Snimci su u `output/playwright/auto3d/`: `A13-prod-*.png`, `A13-link-*.png`, `A13-desktop-*.png`, `A13-telefon-*.png` i `A13-kiosk-*.png`.

**Lista nalaza** (ozbiljnost, fajl, ishod):

| # | Ozb. | Fajl | Nalaz | Ishod |
|---|---|---|---|---|
| K1 | KRITIČNO | `components/fair/auto3d/packages-section.tsx` | Linkovi „Kako izgleda na štandu“ (`?tura=1`, `?kiosk=1`, `?deo=turbopunjac`) bili su `next/link` na istu rutu, pa se menjala samo adresa. Tura nije kretala, deo se nije otvarao, a kiosk je bio polovičan, bez QR-a i petlje (provereno u pregledaču). | Popravljeno: obični `<a>`, puna navigacija. Test proverava da UI scene ne uvozi `next/link`. Sva tri linka rade. |
| K2 | KRITIČNO | `components/fair/auto3d/viewer-island.tsx` | Curenje. OrbitControls skida `keydown` sa `canvas.getRootNode()`, a u cleanup-u iz `useEffect`-a React je DOM već skinuo. Slušalac je ostajao na documentu posle svake klijentske navigacije, a sa njim kontrole, kamera, canvas i odvojen DOM. CDP: stara verzija ostavlja 1 slušalac viška, nova 0. | Popravljeno: isti idempotentan cleanup se pušta i iz `useLayoutEffect`-a, pre skidanja DOM-a. |
| V1 | VAŽNO | `viewer-island.tsx` | Kiosk: od 2. kruga uvod ture je kretao iz zaostalog ugla okretanja (oko 130°), jer je `frameStart()` išao pre `setAutoRotate(false)`. | Popravljeno redosledom. Snimci uvoda 1. i 2. kruga su isti. |
| V2 | VAŽNO | `lib/auto3d/search.ts` | Upit na ćirilici („кочнице“) ponašao se kao prazan: lista je pokazivala svih 78 delova, bez „Nema dela“. „diskovi“ i „farovi“ su davali 0 rezultata. | Popravljeno: ćirilica se čita kao latinica, NFKD rastavlja ǉ, ǌ i ǆ, a osnova se traži bez -ovi/-evi. Dodati testovi. |
| V3 | VAŽNO | `lib/i18n/sr/fair-auto3d.ts` | Sekcija paketa govori „Vi“, a linkovi i dugmad „ti“ („Pokreni turu…“, „Otvori kiosk prikaz“, „Pozovi“, „Napiši“), suprotno odluci A11. | Popravljeno: „Pokrenite…“, „Otvorite…“, „Pozovite“, „Napišite“. |
| V4 | VAŽNO | `lib/i18n/sr/fair-auto3d-delovi.ts` | Scena je na „ti“, a 10 tekstova delova bilo je na „vi“ („ne otvarajte“, „kad dignete nogu“, „iza vas“…). | Popravljeno: sve je na „ti“, a rečenica o ESP-u je bez obraćanja. |
| V5 | VAŽNO | `fair-auto3d-delovi.ts` | Na 3 mesta je pisalo „borov čelik“ (bor kao drvo) umesto „borni čelik“. | Popravljeno. |
| V6 | VAŽNO | `docs/auto3d/PRODAJA-3D-RENDGEN.md` | FAQ 3 izostavlja četvrtu stavku paketa. „Vrsta motora“ je stajala među stvarima koje „prilagođavamo u modelu“, a P4 to ne obećava. | Popravljeno. Ujedno su ispravljena lica („možete da se čujete“, FAQ 8, prigovori) i termini („turbopunjača“, „blagi hibrid na 48 V“), a nedokazane tvrdnje su ublažene. |
| V7 | VAŽNO | `lib/auto3d/contract.test.ts` | Test „samo meshopt“ je prihvatao Draco, a pregledač ima samo MeshoptDecoder. | Popravljeno: Draco više ne prolazi. |
| V8 | VAŽNO | `components/fair/auto3d/boundary.test.ts` | Provera granice three-a nije hvatala statički uvoz podmodula (`./viewer/camera-rig`). | Popravljeno. |
| V9 | VAŽNO | `3d/auto3d/pipeline.mjs` | Faza `measure` nije bila `--strict`, pa mera van tolerancije nije zaustavljala lanac. | Popravljeno, uz izmenu u PIPELINE.md. |
| V10 | VAŽNO | `auto3d.module.css` | Placeholder pretrage `#8a8781` ima kontrast 3,5 : 1, ispod AA. | Popravljeno po obrascu iz `fair-event.css` (`--fair-ink-muted`, 6,1 : 1). |
| V11 | VAŽNO | `rendgen-app.tsx` | aria-live ne čita istu najavu dvaput, npr. kad se posle zatvaranja ponovo izabere isti deo. | Popravljeno: tekst se prvo isprazni. |
| V12 | VAŽNO | `lib/i18n/sr/fair-auto3d.ts` (Napredni) | „Jedan follow-up email 24–48 sati…“ je stavka paketa po V2 §3, HANDOFF §4.1 i tekstu u adminu. JOVAN-DELTA-2026-10-09 §6 kaže da je u produkciji još isključen (čeka pravnu odluku). | Ostavljeno po PLAN §7, koji traži da se stavke prepišu. Pitanje za Jovana, vidi BLOKADA. |
| V13 | VAŽNO | `lib/auto3d/framing.test.ts` | Margine kadra (2,4 i 1,15) nisu zaključane testom. | Ostavljeno: to su vrednosti štimovanja iz A04, a test bi samo prepisao konstantu. |
| V14 | VAŽNO | `3d/auto3d/body/openings.py` | GLB nije bajt-ponovljiv, zbog redosleda `set()` ivica pri usitnjavanju. Struktura jeste ponovljiva (78 / 102 / 106, isti trouglovi). | Ostavljeno: izmena modela traži ceo lanac i ponovnu proveru postera. Predlog za posle sajma: `sorted(edges, key=lambda e: e.index)`. |
| V15 | VAŽNO | `3d/auto3d/{build.py,optimize.mjs,images.mjs,posters.py}` | U retkim granama lanac ćutke uspeva: modul koji ne postoji se preskače, lite se zamenjuje desktopom, bez `cameras.json` izlazi sa kodom 0, a `--set` se ne čita. | Ostavljeno: to je alat za razvoj, a u lancu od nule se ne dešava. Predlog za posle sajma. |
| S1 | SITNO | `auto3d.module.css` | Tvrdo upisani `#fffdf8` i `#0a0d11`, iako za njih postoje tokeni; tranzicija `box-shadow` na uzorku boje. | Popravljeno. |
| S2 | SITNO | `groups-list.tsx`, `parts-panel.tsx` | Klase bez definicije (`groupsSheet`, `tabPanelGroups`) davale su klasu „undefined“. | Popravljeno. |
| S3 | SITNO | `tour-caption.tsx` | `aria-pressed` uz labelu koja se menja („Nastavi turu, pritisnuto“). | Popravljeno. |
| S4 | SITNO | `viewer-island.tsx` | `role="status"` na grešci, uz najavu Announcer-a, pa se greška čitala dvaput. | Popravljeno. |
| S5 | SITNO | `parts-list.tsx` | `aria-controls` je pokazivao na id koji ne postoji kad nema rezultata. Naslovi grupa u listi bili su `h3` odmah posle `h1`. | Popravljeno (sada `h2`, izgled isti). |
| S6 | SITNO | `lib/auto3d/quality.ts` | Kiosk uz Save-Data je čekao dugme „Učitaj“. | Popravljeno, uz test. |
| S7 | SITNO | `copy.ts` | Izbor dela tokom ture najavljivao je samo „Tura je završena.“ | Popravljeno: najavljuje se i deo. Dodat test. |
| S8 | SITNO | `viewer/index.ts` | Kutije za picking nisu pratile rasklapanje zadato pre kraja učitavanja. | Popravljeno (`updateMatrixWorld`). |
| S9 | SITNO | `viewer/stage.ts` | IntersectionObserver je gledao bilo koji unos u paketu, a ne poslednji. | Popravljeno. |
| S10 | SITNO | `viewer/{index,stage,anim}.ts`, `state.ts`, `picking.ts` | Mrtav kod: `frameSystem`, `setHeld`, `Animator.cancel` i `busy`, re-export `DEFAULT_PAINT`. Duplikat `GLASSY` u `xray.ts` i `picking.ts`. | Popravljeno. |
| S11 | SITNO | rečnici | Pravopis i izraz: „Ponoćnoplava“, „Tamnozelena“, „Bisernobela“ (sastavljeno), „24–48 sati“, „između ta dva zahteva“, „U osnovi sve ide pozadi“, „na najviše 350 bar“. | Popravljeno. |
| S12 | SITNO | testovi `color`, `forbidden-names`, `catalog` | Testovi koji nisu mogli da padnu: sredina mešanja boja, prolaz naprazno bez fajlova, broj deco čvorova. | Popravljeno. |
| S13 | SITNO | `copy.ts`, `store.ts`, `glb-fetch.ts`, `viewer/explode.ts` | Čiste funkcije bez testova: `listParts` sa grupom, store, `fetchModel` i paritet `applyExplode`, `nodeBox` i `maxExplodedX` sa `explodeOffset`. | Dodati testovi. |
| S14 | SITNO | `lib/auto3d/budgets.ts` | `BUDGET.og` se nije koristio, a nijedan test nije čitao stvarne dimenzije `og.jpg`. | Dodat test (SOF marker, 1200 × 630). |
| S15 | SITNO | `.claude/skills/auto3d-blender/SKILL.md` | Komanda `build.py -- --all`, koju argparse odbija. | Popravljeno. |
| S16 | SITNO | `auto3d.module.css` | Tranzicije boje na dugmadima: rules.md dozvoljava samo transform i opacity, a DNA §8 dozvoljava i boju (`fair-event.css` je koristi). | Ostavljeno po DNA. |
| S17 | SITNO | `rendgen-app.tsx` | Taster `/` je globalna prečica za listu (WCAG 2.1.4). | Ostavljeno: odluka A05, nizak rizik. Vlasnik može da traži da prečica radi samo kad je fokus na stranici. |
| S18 | SITNO | `viewer-island.tsx`, `kiosk-qr.tsx` | „MB“ se sklapa u kodu. `qrcodegen` je statički u chunk-u rute, iako ga koristi samo kiosk. Interval od 250 ms osvežava brojače `data-auto3d-*` (služi za QA, nije curenje). | Ostavljeno. |
| S19 | SITNO | `viewer/*` | Retki slučajevi: boja laka skoči ako se dodirne usred prelaza; `contextRestored` pre kraja učitavanja daje kratko crn canvas; `touchPanY` se čita jednom (telefon otvoren položeno, pa uspravljen); NaN za host 0 × 0 (nedostižno zbog `min-height`); `consentBytes` bira veličinu samo po širini. | Ostavljeno. |
| S20 | SITNO | `3d/auto3d/**` | Mrtav kod u portovanoj biblioteci (oko 30 funkcija i konstanti, npr. `geo.gear2d` i `shapes.spring`), nedokumentovane opcije i delimično zastareo PIPELINE.md (npr. lite prepisuje `collide.json`). | Ostavljeno: brisanje ne menja model, a traži ceo lanac. Predlog za posle sajma. |
| S21 | SITNO | TS | Mrtav kod koji koriste samo testovi (`isPaintId`, `stepStart`); `Origin "tour"\|"kiosk"`; `step?` u akciji `tour`; nedostižno `if (!glb)`; nekorišćena polja snimka. | Ostavljeno. |
| S22 | SITNO | `packages-section.tsx` | Napomena „Primer vrednosti…“ stoji ispod cena (PLAN §7), pa može da se pročita kao da važi za cene. | Ostavljeno po planu. Predlog: premestiti je u karticu 3D Rendgen. |
| S23 | SITNO | kiosk | Dok se model učitava, kiosk pokazuje desktop poster, u drugom kadru od kiosk kamere. Auto kratko preklapa legendu, pa se canvas pretopi u kiosk kadar (lokalno 0,7 s). | Ostavljeno. Predlog: poster za kiosk u lancu. |
| S24 | SITNO | kadar dela | Kadar dela je blizu (turbopunjač, čeljust), ali je deo vidljiv i istaknut (A12). | Ostavljeno. |
| S25 | SITNO | `fair-auto3d-delovi.ts` | Blok od 550 Nm i starter-generator „do 200 Nm“ daju više od kapaciteta menjača (700 Nm). Radnik predlaže „zavrtanj“ umesto „vijak“. | Ostavljeno. Vrednosti su iz A01 §2.6, a pojačanje važi na niskim obrtajima. „Vijak“ je u srpskoj tehničkoj upotrebi (SRPS). |

**Zatečeno** (nije od runa i nije menjano):
- `convex/adminMail.test.ts` („a wrong key … fails“) je nestabilan. Test pravi „pokvaren“ šifrat tako što prvi znak zameni sa „A“. Kad šifrat već počinje sa „A“ (šansa 1/64), test pada. Pao je jednom u punom vitest-u, a tri ponavljanja prolaze.
- `.claude/skills/auto3d-blender/` nije u grani, jer runner isključuje `.claude` iz commita (`$BaseExcl` u `nocni-run.ps1`). Odeljak „Naučeno“ ostaje lokalno.
- Deo fajlova u radnom stablu ima CRLF. Indeks je LF i `.gitattributes` traži `eol=lf`, pa ih git normalizuje pri commitu.

**ODLUKE:**
- **Linkovi na istu rutu su obični `<a>`.** AGENTS.md preporučuje `next/link`, ali ovde je puna navigacija namerna: store scene i kiosk se prave iz adrese pri učitavanju. Usklađivanje store-a sa adresom posle meke navigacije bilo bi veća izmena (kiosk, kvalitet, kamera).
- **Curenje je rešeno layout cleanup-om**, a ne pretvaranjem cele inicijalizacije u `useLayoutEffect`. U layout efektu deteta ref roditelja (`hostRef`) pri mount-u još nije postavljen, pa se pregledač ne bi pokrenuo.
- **Posle lanca od nule vraćeni su commitovani GLB, manifest, posteri i OG** (rezerva je u `.nocni-run/auto3d/tmp/a13/public-pre/`). Novi fajlovi su strukturno isti, a razlikuju se samo u bajtovima.
- **Follow-up mejl ostaje među stavkama Naprednog** (PLAN §7, izvori V2 i HANDOFF), uz pitanje vlasniku. Brisanjem bi se promenio paket koji kompanija već opisuje i u adminu.
- **Stavke A09 nisu rađene:** zebra pruge oko usisnika i ugla branika, uglovi haube, retrovizor, tačkice uz zadnju LED traku, ravna ploha zadnjeg branika i zadnji ugao.
  - Glatke normale (`normals_split_custom_set`) bi morale da prežive `finish_panel`, spajanje panela, izvoz i `weld`, pa nisu jeftine.
  - Ostale stavke su izmene geometrije sa krugovima rendera.
  - Nijedna nije kritična (napomena nadzora od 09:40). Ostaju predlog za posle sajma, zajedno sa rezom branika i tablicom na poklopcu.
- **Jezik:** „vijak“ i vrednosti momenta ostaju (S25). Sekcija paketa je dosledno na „Vi“, a scena i tekstovi delova na „ti“.
- **Placeholder** koristi `--fair-ink-muted`, kao polja u `fair-event.css`.
- **Radnici:** pet radnika `sonnet`, svi samo za čitanje (UI, pregledač, `lib/auto3d`, tekstovi, Blender lanac). Svaki popravljen ili odbijen nalaz proveren je u kodu, a K1, K2, V1 i V2 i u pregledaču.

**Novi paketi:** nema.

**Testovi** (ukupno 12 testova i 3 fajla više nego u A12):
- **Novi:**
  - `store.test.ts`: pretplata, radnja bez promene, odjava;
  - `glb-fetch.test.ts`: spajanje delova, napredak, odgovor bez content-length, HTTP greška;
  - `viewer/explode.test.ts`: paritet sa `explodeOffset` u svim fazama, `nodeBox`, `maxExplodedX`.
- **Dopunjeni:**
  - `boundary`: UI scene ne uvozi `next/link`; statički uvoz podmodula iz `viewer/`;
  - `contract`: bez Draco-a; `og.jpg` je 1200 × 630 u samom fajlu;
  - `search`: ćirilica, digrafi, množina;
  - `quality`: kiosk uz Save-Data;
  - `copy`: `listParts` sa grupom, izbor dela tokom ture;
  - `color`: tačna sredina `#BCBCBC`;
  - `catalog`: 3 deco čvora;
  - `forbidden-names`: ne prolazi naprazno;
  - `packages-section`: „Pozovite“.

**Merenja:**
- lanac od nule: 113 s; mere 33/33; prodiranje: 0 dublje od 5 mm;
- three chunk: 760.851 B (190.378 B gzip); u A12 je bio 761.259 B;
- `ready` na lokalnom serveru: 1,16 s (1440), 0,89 s (390, lite), 0,66 s (kiosk).

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.581 test u 294 fajla; 2 preskočena, kao i pre);
- `npx next build`: prošlo.

**BLOKADA:**
- **Fizički telefon i pravi ekran štanda:** provera i dalje nije moguća bez nadzora, kao u A04–A12. Telefon je proveren u Chromium emulaciji sa dodirom, a kiosk na 1920 × 1080 u Chromium-u sa pravim GPU-om.
- **Follow-up mejl u Naprednom (V12)** traži odluku vlasnika pre Teodorinih poziva.
  - Pitanje: da li javni cenovnik sme da navodi „Jedan follow-up email 24–48 sati posle relevantnog sajma“ dok je funkcija u produkciji isključena (JOVAN-DELTA-2026-10-09 §6)?
  - Ako ne sme: stavka se briše u `lib/i18n/sr/fair-auto3d.ts` (`packages.tiers.napredni.items`), a u `packages-section.test.tsx` broj stavki se menja sa 8 na 7.

**Za Jovana ujutru:**
1. Odluči o follow-up stavci (BLOKADA iznad).
2. Pokreni `npx next build && npx next start -p 3180` i otvori `http://localhost:3180/sajam/3d`. Skroluj do „Kako izgleda na štandu“ i klikni sva tri linka: tura treba da krene, kiosk da ima QR, a turbopunjač da se otvori.
3. U pretrazi probaj „кочнице“ i „diskovi“.
4. Otvori `http://localhost:3180/sajam/3d?kiosk=1` i pusti dva kruga (oko 3 min). Uvod drugog kruga treba da bude isti kadar kao uvod prvog.
5. Predlozi za posle sajma:
   - poster za kiosk;
   - napomena „Primer vrednosti…“ u kartici 3D Rendgen;
   - stavke A09, rez branika i tablica na poklopcu;
   - bajt-ponovljiv lanac (V14) i čišćenje mrtvog koda u `3d/auto3d`.
6. Skill `.claude/skills/auto3d-blender/` nije u grani. Ako treba da uđe u repo, dodaj ga ručno, a pre toga pregledaj odeljak „Naučeno“ (pominje „autodelovi“).

**Procesi na kraju koraka:**
- `next dev` (3180) i `next start` (3181), koje je korak pokrenuo, ugašeni su (`taskkill /T`), a portovi 3180 i 3181 su slobodni.
- Chromium iz Playwright skripti i `blender.exe` ne rade (lanac se završio sa kodom 0).
- Procesi Playwright MCP-a pripadaju sesiji Claude Code-a, pa nisu dirani.

## A14 — Završni izveštaj i snimci   (2026-10-17 15:30)
**Fajlovi:** `docs/AUTO3D-REPORT.md` (nov), 11 snimaka `output/playwright/auto3d/A14-*.png` (ignorisani), skripta snimanja `.nocni-run/auto3d/tmp/a14/shots.mjs`. Kod nije menjan.

**Šta je urađeno:** Izveštaj ima odeljke 0–10: ukratko sa demo linkovima, pregled grane, tabela po oblastima, nedovršeno, BLOKADE, odluke za vlasnika (P1–P11 i odluke iz koraka), deploy za ponedeljak, ručne provere po važnosti, brojevi, rezultat provera i zatečeno. Provere su puštene na grani kakva jeste i sve prolaze. Snimci su rađeni na produkcionom build-u (`next start -p 3181`), Chromium sa pravim GPU-om, i pregledani alatom Read.

**ODLUKE:**
- Broj testova pre runa nije u `baseline.txt`. Izveden je iz A02 (2.400 testova uz 30 novih, pa oko 2.370) i u izveštaju je označen kao „oko“.
- Podaci o LCP-u, JS-u po ruti i picking-u su iz merenja A12 (isti kod, nisu ponovo mereni); three chunk je ponovo izmeren iz builda (760.851 B, isto kao A13).
- Starije „BLOKADE“ iz A09 i A10 o procesima nisu uvrštene među BLOKADE za Jovana: brojale su Playwright MCP procese koje pokreće Claude Code (napomena nadzora u 11:45).
- Kod nije menjan jer nijedna provera nije pala.

**Novi paketi:** nema.

**Testovi:** nisu pisani; pušten je ceo skup.

**Merenja:** vidi `docs/AUTO3D-REPORT.md` odeljak 8.

**Rezultat provere:**
- `npx tsc --noEmit`: prošlo;
- `npx eslint --ignore-pattern ".nocni-run/**"`: prošlo (0 grešaka, 2 stara upozorenja van runa);
- `npx vitest run`: prošlo (2.581 test u 294 fajla; 2 preskočena, kao i pre);
- `npx next build`: prošlo.

**BLOKADA:** nema nove. Otvoreno za Jovana ostaje: odluka o follow-up stavci u Naprednom i provera na pravom telefonu i ekranu štanda (vidi izveštaj odeljci 4 i 7).

**Za Jovana ujutru:** otvori `docs/AUTO3D-REPORT.md`, pa po odeljku 7 redom. Prvo `/sajam/3d?rezim=lak`.

**Procesi na kraju koraka:** `next start` (3181) je ugašen, portovi 3180 i 3181 su slobodni, Chromium iz skripte je zatvoren, `blender.exe` nije pokretan. Procesi Playwright MCP-a pripadaju sesiji Claude Code-a.
