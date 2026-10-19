# AUTO3D: završni izveštaj noćnog runa (16–17. 10. 2026.)

Za Jovana. Grana `codex/jovan-auto3d-2026-10-16`, 14 commitova (po jedan po koraku A01–A13, plus početni). Ništa nije pushovano ni deployovano. Detalji po koracima su u `docs/AUTO3D-PROGRESS.md`.

## 0. Ukratko

- Stranica `/sajam/3d` radi: limuzina bez marke u rendgenu, laku i kosturu, sa 78 klikabilnih delova u 10 grupa, karticom i specifikacijom za svaki deo.
- Tu su i rasklapanje, presek, vođena tura od 60 s, kiosk režim sa QR-om i direktni linkovi na delove.
- Ispod scene je sekcija paketa sa četiri nivoa. 3D Rendgen je 8.000 RSD po modelu i istaknut je. Materijal za Teodoru je u `docs/auto3d/PRODAJA-3D-RENDGEN.md`.
- Nova grana ne dira Convex, postojeće sajamske strane ni Meni. Convex deploy nije potreban.
- Provere prolaze: tsc, eslint (0 grešaka), vitest (2.581 test), `next build`.
- Run nije mogao da vidi pravi telefon, pregled linka u Viberu ni pravi veliki ekran. To je na tebi (odeljak 7).
- Pre Teodorinih poziva treba tvoja odluka o stavci „follow-up email“ u Naprednom (odeljak 4).

**Demo linkovi** (na produkciji domen je `scanme.rs`, lokalno `http://localhost:3180`):
- `/sajam/3d?rezim=lak`: najbolji prvi utisak, duboki grafit sa sjajem i farovima.
- `/sajam/3d`: rendgen, podrazumevan pogled.
- `/sajam/3d?deo=turbopunjac`: kartica dela sa specifikacijom.
- `/sajam/3d?tura=1`: vođena tura od jednog minuta.
- `/sajam/3d?kiosk=1`: za ekran na štandu.

## 1. Kako da pregledaš granu

```
git log --oneline aleksa/main..codex/jovan-auto3d-2026-10-16
git diff --stat aleksa/main...codex/jovan-auto3d-2026-10-16
```

Lokalno:

```
npx next dev -p 3180
```

pa `http://localhost:3180/sajam/3d`. Brojevi performansi su iz produkcionog build-a (`npx next build && npx next start -p 3180`).

Diff ima 182 fajla, 33.574 dodate linije, nijedna obrisana. 179 fajlova je novo, a tri su izmenjena: `.gitignore`, `package.json`, `package-lock.json`.

## 2. Šta je urađeno, po oblasti

| Oblast | Šta | Koraci | Snimci |
|---|---|---|---|
| Auto | Limuzina bez marke, pravljena od nule iz Blender skripti (`3d/auto3d/`). Parametarska karoserija sa panelima i fugama, farovi, maska, stakla, točkovi 21", enterijer, mehanika i elektrika. 78 delova, 10 sistema. Ceo lanac jednom komandom (`node 3d/auto3d/pipeline.mjs`, oko 2 min). | A01, A02, A06, A07, A08, A09 | `A14-desktop-1440-lak`, `A14-desktop-1440-rendgen`, `A14-desktop-1440-rasklopljeno` |
| Pregledač | Čist three.js: rendgen, lak, kostur, hover, izbor dela, let kamere, rasklapanje, filter grupe, presek, boja laka. Učitava se dinamički, samo na ovoj ruti. | A03, A04, A10 | `A14-desktop-1440-rendgen`, `A14-desktop-1440-kartica-dela` |
| Stranica | `/sajam/3d`: grupe, lista sa pretragom, kartica dela, jezičci na telefonu, `?deo=` i `?grupa=` linkovi, dugme „Kopiraj link“, poster kao LCP, rezerva bez WebGL-a i bez JS-a, OG slika. | A05, A09, A11 | `A14-desktop-1440-kartica-dela`, `A14-telefon-390-rendgen`, `A14-telefon-390-kartica-dela` |
| Režimi i tura | Tri režima, šest boja laka, presek sa klizačem, vođena tura od 60 s sa titlom. | A10 | `A14-desktop-1440-lak`, `A14-telefon-390-lak`, `A14-desktop-1440-tura` |
| Kiosk | `?kiosk=1` na 1920 × 1080: petlja tura → orbita → rasklapanje, QR „Nastavi na telefonu“, povratak posle 45 s bez dodira. Soak od 20 min bez rasta memorije. | A10 | `A14-kiosk-1920` |
| Paket | Sekcija sa četiri nivoa i cenama, „Kako izgleda na štandu“, kontakt iz `offer-footer.tsx`, metapodaci. Prodajni materijal za Teodoru. | A11 | `A14-desktop-1440-paketi`, `A14-telefon-390-paketi` |
| Performanse | GLB kreće paralelno sa chunk-om, brži picking, adaptivni DPR, curenja zatvorena, pristupačnost (tastatura, kontrast, mete 44 px, reduced motion), položen telefon. Revizija celog runa: 2 kritična, 11 važnih i 15 sitnih nalaza popravljeno. | A12, A13 | svi snimci iznad |

Snimci su u `output/playwright/auto3d/` (ignorisano u gitu), 11 komada `A14-*.png`: desktop 1440 (rendgen, rasklopljeno, lak, kartica dela, tura, paketi), kiosk 1920, telefon 390 (rendgen, lak, kartica dela, paketi).

## 3. Šta nije urađeno ili je delimično

- **Pravi telefon i pravi ekran štanda nisu provereni.** Telefon je proveren u Chromium emulaciji (390 × 844, dodir, DPR 3, Fast 4G, CPU 4×), ali sa GPU-om ovog računara. Pravi srednji telefon je sporiji; zato postoji adaptivni DPR.
- **Pregled linka u Viberu i WhatsApp-u** nije proveren. Domen još ne služi stranicu, a `og.jpg` je tek posle deploy-a na `https://scanme.rs/3d/auto3d/og.jpg`.
- **Detalji karoserije iz A09 koje su ostali:** nazubljene pruge refleksije oko bočnih usisnika i ugla branika, uglovi haube spreda, retrovizor, tačkice uz zadnju LED traku i velika ravna ploha zadnjeg branika. Nijedan nije kritičan. Zadnji ugao (usna iznad branika) je rešen samo delimično.
- **Backend za paket ne postoji.** Novi nivo nije u `lib/fair-entitlements.ts` ni u Convex-u (van obima). Posle prve prodaje to rade Jovan i Aleksa.
- **Kiosk poster:** dok se model učitava, kiosk pokazuje desktop poster u drugom kadru. Posle 0,7 s se pretopi u kiosk kadar.
- **Model po autu izlagača** (O8) nije deo runa.
- **Skill `.claude/skills/auto3d-blender/`** nije u grani, jer runner isključuje `.claude` iz commita. Odeljak „Naučeno“ ostaje lokalno.
- **Odloženo za posle sajma:** bajt-ponovljiv lanac (GLB se razlikuje za nekoliko bajtova pri svakom pokretanju, struktura je ista), čišćenje mrtvog koda u `3d/auto3d/**`, poster za kiosk, rez zadnjeg branika i tablica na poklopcu.

## 4. BLOKADE: šta traži Jovana

1. **Follow-up email u Naprednom.** Sekcija paketa navodi „Jedan follow-up email 24–48 sati posle relevantnog sajma“. To je stavka Naprednog po `CLAUDE-MAPA-BACKEND-KONTEKST-V2.md` §3 i `BACKEND-HANDOFF.md` §4.1. Ali `JOVAN-DELTA-2026-10-09` §6 kaže da je funkcija u produkciji još isključena (čeka pravnu odluku).
   - Pitanje: sme li javni cenovnik da je navodi?
   - Ako ne sme: obriši stavku u `lib/i18n/sr/fair-auto3d.ts` (`packages.tiers.napredni.items`) i u `packages-section.test.tsx` promeni broj stavki sa 8 na 7.
2. **Fizički telefon i ekran štanda:** vidi odeljak 7. Run to ne može da uradi bez nadzora.

Nema drugih blokada. Starije „blokade“ iz A09 i A10 o procesima brojale su Playwright MCP procese koje pokreće Claude Code, a ne run. Nisu stvarne i ništa ne traže.

## 5. Odluke koje traže stav vlasnika

Predlozi P1–P11 iz `docs/AUTO3D-PLAN.md` su sprovedeni onako kako su napisani. Čekaju potvrdu.

| # | Šta | Gde se menja | Korak |
|---|---|---|---|
| P1 | Ruta `/sajam/3d`, javna, `noindex` iz `app/sajam/layout.tsx`. Parametri `?deo`, `?grupa`, `?rezim`, `?tura`, `?kiosk`. | `app/sajam/3d/`, `lib/auto3d/url-state.ts` | A04, A05, A10 |
| P2 | Velika premium sportska limuzina, mere iz PLAN §3, bez logoa i natpisa. | `3d/auto3d/config/` | A02, A06–A09 |
| P3 | Specifikacije su primer vrednosti. Napomena „Primer vrednosti. Za vaš model unosimo prave podatke.“ | `lib/i18n/sr/fair-auto3d-delovi.ts` | A02, A05, A11 |
| P4 | Sadržaj 3D Rendgena: sve iz Naprednog, plus 3D stranica modela, kiosk i linkovi na delove. Prilagođavanje klase, boje, točkova, pogona i specifikacija. Tačna replika je posebna usluga. | `lib/i18n/sr/fair-auto3d.ts` | A11 |
| P5 | Tamni studio, ledeni rendgen, okvir po sajamskom DNA. | `components/fair/auto3d/` | A04, A05 |
| P6 | Nema novih paketa osim `three` i `@types/three` (dodao nadzor). GLB kroz `@gltf-transform/cli@4.5.1` jednokratno. | `package.json` | A01, nadzor |
| P7 | Snimci i QA renderi se ne commituju. Commituju se GLB, manifest, posteri i OG. | `.gitignore`, `public/3d/auto3d/` | A02 |
| P8 | Run bez limita budžeta. | `.nocni-run/auto3d/config.json` | — |
| P9 | Pogon: R6 3,0 l biturbo, blagi hibrid 48 V, 8-brzinski automatik, AWD. | `3d/auto3d/parts/`, rečnik delova | A02, A08 |
| P10 | Tekstovi kroz `lib/i18n/sr/fair-auto3d.ts` i `fair-auto3d-delovi.ts`, bez izmene zajedničkog registra. | `lib/i18n/sr/` | A02, A04 |
| P11 | Kontakt je isti kao u `offer-footer.tsx`: 065/86-444-88 (Aleksa Đorđević) i `office@scanme.rs`, iako poziva Teodora. Test ih poredi. | `lib/i18n/sr/fair-auto3d.ts` (`packages`) | A11 |
| O-1 | Follow-up email u Naprednom ostaje dok ne odlučiš (odeljak 4). | `lib/i18n/sr/fair-auto3d.ts` | A13 |
| O-2 | Rok izrade u prodajnom materijalu je samo predlog: podaci do 23. 10, model do 28. 10, potvrda do 29. 10. Potvrdi ili promeni pre poziva. | `docs/auto3d/PRODAJA-3D-RENDGEN.md` §5 | A11 |
| O-3 | `metadataBase` je `https://scanme.rs`, postavljen samo u `generateMetadata` ove rute. | `app/sajam/3d/page.tsx` | A11 |
| O-4 | Podrazumevana boja laka je duboki grafit `#2A2E35` (po napomeni nadzora), ne ledeno srebro. | `lib/auto3d/paints.ts` | A10 |
| O-5 | Obraćanje: sekcija paketa i prodajni materijal govore „Vi“, scena i tekstovi delova „ti“. | rečnici | A05, A11, A13 |
| O-6 | Napomena „Primer vrednosti…“ stoji ispod nivoa paketa, pa može da se pročita kao da važi za cene. Predlog je da se premesti u karticu 3D Rendgen. | `packages-section.tsx` | A13 |
| O-7 | Linkovi „Kako izgleda na štandu“ su obični `<a>` (puna navigacija), ne `next/link`. Store scene i kiosk se prave iz adrese pri učitavanju. | `packages-section.tsx` | A13 |
| O-8 | Taster `/` otvara listu delova kao globalna prečica (WCAG 2.1.4). Može da važi samo kad je fokus na stranici. | `rendgen-app.tsx` | A05, A13 |
| O-9 | QR u kiosku kodira `location.origin + /sajam/3d`, bez upisanog domena. | `kiosk-qr.tsx` | A10 |
| O-10 | Prednja tablica postoji kao nosač preko donjeg dela maske, bez teksta. Rešetka maske su vodoravne lamele (romb je podsećao na jednu marku). | `3d/auto3d/body/grille.py` | A07, A09 |
| O-11 | Vrednosti u kartici nekih delova prelaze kapacitet drugih (blok 550 Nm, menjač 700 Nm uz starter-generator). Ostavljeno kao primer vrednosti. | `lib/i18n/sr/fair-auto3d-delovi.ts` | A13 |
| O-12 | Lite model ima 225 draw call-ova u rendgenu. To je ispod budžeta iz PLAN §5 (≤ 250), ali 5 iznad internog cilja (≤ 220). | `3d/auto3d/` | A12 |

## 6. Deploy za ponedeljak

Tačnim redom. Ništa od ovoga se ne radi u runu.

1. **Push grane** `codex/jovan-auto3d-2026-10-16`.
2. **Aleksa spaja u `main`.** Grana dodaje samo nove fajlove i menja tri postojeća:
   - `.gitignore` (dodate linije);
   - `package.json` i `package-lock.json`: `three` 0.186.1, `@types/three` 0.186.0 i šest njihovih zavisnosti (dodao nadzor).
   - Grana `codex/jovan-admin-v2-2026-10-11` ima iste verzije, pa spajanje daje isti red, bez konflikta.
   - Grana nosi i 22 run fajla u `.nocni-run/auto3d/` (pravila, promptovi, skripte runnera). Nisu potrebni produkciji, a ne smetaju.
3. **Vercel build** instalira zavisnosti sam. Posle spajanja preporuka je `npm ci` lokalno.
4. **Convex deploy NIJE potreban.** Nijedan fajl u `convex/**` nije menjan.
5. **Provera linka na produkciji:** `https://scanme.rs/sajam/3d`, pa `?rezim=lak`, `?tura=1`, `?kiosk=1`, `?deo=turbopunjac`. Zatim pregled linka u Viberu i WhatsApp-u.

## 7. Šta ručno proveravaš

Po važnosti.

1. **Pravi telefon, Android i iPhone**, preko mobilnog interneta: `/sajam/3d` i `/sajam/3d?rezim=lak`. Proveri učitavanje, okretanje prstom, dodir na deo, pinch, rasklapanje i položen telefon. Da li skrol strane radi uspravnim prevlačenjem preko scene? Ako je auto trzav, `data-auto3d-dpr` na studiju (udaljeni debug) pokazuje da li se DPR spustio.
2. **Odluka o follow-up stavci** (odeljak 4), pa po potrebi izmena rečnika.
3. **Pregled linka u Viberu i WhatsApp-u** posle deploy-a: `https://scanme.rs/sajam/3d`. Treba da se vidi naslov „3D Rendgen · Auto Moto Fest 2026 · ScanMe“ i slika auta u desnoj polovini.
4. **Rok u prodajnom materijalu:** `docs/auto3d/PRODAJA-3D-RENDGEN.md` §5. Potvrdi ili promeni.
5. **Cene i stavke paketa** na `/sajam/3d#paketi`: 3.000 / 5.000 / 8.000 RSD. Stavke prva tri nivoa su prepisane iz V2 §3 i HANDOFF §4.1.
6. **Kiosk na pravom velikom ekranu** (F11): `/sajam/3d?kiosk=1`. Pusti dva kruga (oko 3 min). Dodirni auto, pa 45 s ništa ne diraj. Skeniraj QR telefonom.
7. **Tri linka „Kako izgleda na štandu“** pri dnu strane: tura treba da krene, kiosk da ima QR, turbopunjač da se otvori.
8. **Izgled auta, oko pregledač:** `?rezim=lak` (sve boje, posebno belu i srebrnu), lice, zadnji kraj i lukovi. Zatim `?rezim=kostur` i „Rasklopi“.
9. **Pretraga delova:** „kocnica“, „kočnice“, „диск“ (ćirilica), „diskovi“.
10. **Tastatura i reduced motion:** Tab kroz celu stranu, a u Chrome-u uključi „Emulate prefers-reduced-motion“: deo i tura idu rezovima.
11. **Kartica dela na 1440 px:** kadar je blizak (turbopunjač, čeljust), a deo je vidljiv. Reci da li ti je prebliz.

## 8. Brojevi

**Mere auta** (`measure.py --strict`, sve 33 mere u toleranciji ±2 % ili zadatom opsegu):

| Mera | Vrednost | Cilj |
|---|---|---|
| dužina | 4,964 m | 4,98 |
| širina / sa retrovizorima | 1,955 / 2,130 m | 1,94 / 2,13 |
| visina | 1,436 m | 1,44 |
| međuosovinsko | 2,980 m | 2,98 |
| prepusti napred / pozadi | 0,892 / 1,092 m | 0,89 / 1,11 |
| trag napred / pozadi | 1,630 / 1,650 m | 1,63 / 1,65 |
| klirens | 0,130 m | 0,13 |
| gume (spoljni prečnik) | Ø 0,712 / 0,704 m | — |
| nagib vetrobrana / zadnjeg stakla | 61,9° / 25,2° | 60–63° / 25–30° |
| razmak guma–luk | 32,3 mm | 25–35 mm |
| fuge između panela | 4,7 mm (svih 9 parova) | 4–5 mm |

**Delovi i sistemi:** 10 sistema, 78 delova, 102 klikabilna čvora, 106 čvorova u GLB-u. Nijedan deo nije zamenjen oblikom-čuvarom mesta.

**GLB:**

| | Desktop `limuzina.glb` | Lite `limuzina-lite.glb` | Budžet |
|---|---|---|---|
| veličina (meshopt) | 2.939.364 B | 1.604.228 B | 6 MB / 3 MB |
| trouglova | 474.314 | 213.716 | 600 / 250 hilj. |
| draw call-ova (GLB) | 208 | 186 | 250 |

Posteri AVIF su 29–48 KB (budžet 200 KB), `og.jpg` 38,7 KB, 1200 × 630.

**JS:**
- Sopstveni JS rute `/sajam/3d` (dva chunk-a koje nijedna druga ruta ne navodi): 48.560 B gzip (A12).
- Three chunk: 760.851 B, 190.378 B gzip (potvrđeno u ovom buildu). Učitava ga samo chunk ostrva, a njega navodi samo `/sajam/3d`.
- Draw call-ovi u rendgenu na webu: 249 desktop, 225 lite.

**LCP** (poster, produkcioni build, A12): desktop 180 ms, telefon Fast 4G 916 ms, telefon Slow 4G 1.996 ms. CLS 0 na telefonu. Od `load` do prvog frejma canvasa: 772 ms desktop, 1.869 ms telefon. Picking p95 1,5 ms. U mirovanju 0 frejmova.

**Testovi:**
- Pre runa: oko 2.370 testova u 262 fajla (A02 beleži 2.400 uz 30 novih; baseline nema brojeve). Svi su prolazili.
- Posle: 2.581 test prošao, 2 preskočena (preskočena su bila i pre), 294 fajla. Oko 211 testova više.

## 9. Rezultat provera

Pušteno u A14, na grani kakva je (`327d08c` plus ovaj izveštaj).

| Provera | Rezultat |
|---|---|
| `npx tsc --noEmit` | prošlo |
| `npx eslint --ignore-pattern ".nocni-run/**"` | prošlo, 0 grešaka, 2 stara upozorenja van runa (`venue-admin.tsx`, `purchaseLifecycle.test.ts`) |
| `npx vitest run` | prošlo, 2.581 test, 294 fajla, 2 preskočena |
| `npx next build` | prošlo, ruta `/sajam/3d` je dinamička (ƒ) |
| Snimci na produkcionom build-u | 11 snimaka (1440, 1920, 390), konzola: 0 grešaka i 0 upozorenja |

Kod nije menjan u A14.

## 10. Zatečeno

Nije od runa i nije menjano.

- `convex/adminMail.test.ts` („a wrong key … fails“) je nestabilan. Test kvari šifrat zamenom prvog znaka sa „A“, pa pada kad šifrat već počinje sa „A“ (šansa 1/64). U A13 je jednom pao, a tri ponavljanja prolaze.
- Dva stara upozorenja eslint-a: nekorišćen `useMemo` u `components/admin/venue-admin.tsx` i nekorišćen `price` u `convex/purchaseLifecycle.test.ts`.
- Deo fajlova u radnom stablu ima CRLF, a indeks je LF (`.gitattributes` traži `eol=lf`). Git ih normalizuje pri commitu.
- `next-env.d.ts` je izmenjen u radnom stablu (Next ga sam prebacuje). Runner ga ne commituje.
- Skillovi u `.claude/skills/` (gsap, threejs, auto3d-blender) su neprikačeni u gitu. Odeljak „Naučeno“ u `auto3d-blender` pominje ime sa reference, pa ga pregledaj pre nego što ga dodaš u repo.
