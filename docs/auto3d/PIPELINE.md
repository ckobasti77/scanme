# AUTO3D: kako se limuzina pravi od nule

Model se pravi samo iz skripti u `3d/auto3d/`. U `.blend` se ništa ne menja ručno. Plan i ugovor: `docs/auto3d/planovi/A01.md`.

## Šta treba

- **Blender 5.1.1:** putanja je u `BLENDER_EXE`. Ako promenljiva ne postoji, koristi se `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`.
- **Node 22+:** `catalog-json.mjs` uvozi TypeScript katalog direktno, jer Node sam uklanja tipove.
- **Mreža za `npx -y @gltf-transform/cli@4.5.1`:** paket se ne dodaje u `package.json`. Bez mreže, `node 3d/auto3d/optimize.mjs --copy` pravi nekompresovanu kopiju, samo za probu.

## Jedna komanda (od nule)

```
node 3d/auto3d/pipeline.mjs
```

Faze idu redom i lanac staje na prvoj grešci.

| Faza | Šta radi | Izlaz | Trajanje |
|---|---|---|---|
| `catalog` | `lib/auto3d/catalog.ts` → JSON za Blender | `output/auto3d/catalog.json` | < 1 s |
| `build` | gradi scenu (desktop, pa lite) | `output/auto3d/limuzina.blend`, `limuzina-lite.blend`, `pivots.json` | 2 + 2 s |
| `measure` | mere iz scene prema PLAN §3, `--strict` (mera van tolerancije zaustavlja lanac) | `output/auto3d/measure.json` + tabela `MERA` | 2 s |
| `collide` | prodiranje delova sklopljeno i u rasklapanju (40 koraka), `--strict`; spisak detalja | `output/auto3d/collide.json` + linije `SUDAR` | 6 + 3 s |
| `export` | sirovi GLB i osnova manifesta | `output/auto3d/limuzina[-lite].raw.glb`, `manifest.base.json`, `manifest.lite.json` | 2 + 2 s |
| `optimize` | `dedup` → `prune` → `weld` → `meshopt` (medium) i konačni manifest | `public/3d/auto3d/limuzina.glb`, `limuzina-lite.glb`, `limuzina.manifest.json` | 10–40 s (prvi `npx` duže) |
| `render` | QA pogledi (lak i rendgen) | `output/auto3d/renders/pipeline/` | 15–20 s |
| `posters` | posteri i OG master iz kamera manifesta: samo auto u rendgenu, providna pozadina; kamere u `cameras.json` | `output/auto3d/posters/*.png`, `cameras.json` | 9 s |
| `images` | pozadina `#0A0D11`, pod i kontaktna senka istom formulom kao pregledač (bez tone mapping-a, mešanje u sRGB), pa auto preko njih; AVIF, WebP i OG JPEG preko `sharp`; manifest dobija postere | `public/3d/auto3d/poster-*.avif/.webp`, `og.jpg` | 15 s |

Ceo lanac na RTX 4060 Laptop traje oko 80–105 s (A09: 79 s). Samo GLB i manifest:

```
node 3d/auto3d/pipeline.mjs catalog build export optimize
```

## Pojedinačne komande

```
node 3d/auto3d/catalog-json.mjs
node 3d/auto3d/blender.mjs 3d/auto3d/build.py -- --quality desktop
node 3d/auto3d/blender.mjs 3d/auto3d/build.py -- --quality lite
node 3d/auto3d/blender.mjs 3d/auto3d/build.py -- --quality desktop --only karoserija,elektrika
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/measure.py -- --strict
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/collide.py -- --motion --steps 120 --inventory
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/export.py -- --quality desktop
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina-lite.blend 3d/auto3d/export.py -- --quality lite
node 3d/auto3d/optimize.mjs
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/render.py -- --set qa --modes lak,rendgen --views side,front34,rear34,front,top,xray34,exploded34,kostur34,under --tag A06/k1
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/render.py -- --set closeup --focus kocnice --tag A07/k1
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/render.py -- --set closeup --modes lak,rendgen --focus napred,pozadi,tocak,bok --tag A07/k3
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/render.py -- --set qa --modes kostur --views side,front34,rear34,under --tag A08/k2
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/render.py -- --set closeup --modes kostur --focus motor --az 35 --el 28 --solo --tag A08/k6
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/posters.py -- --set all
node 3d/auto3d/images.mjs
node 3d/auto3d/contact-sheet.mjs output/auto3d/renders/A06/k1 output/auto3d/renders/A06/k1/sheet.png 4
node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/stats.py
npx vitest run lib/auto3d
```

`--only <sistem>` gradi ponovo samo čvorove tih sistema u postojećem `.blend` fajlu. Posle toga treba pustiti `export` i `optimize`.

**`collide.py`** (A08):
- Za svaki par delova meri dubinu prodiranja: koliko trougao jednog dela prelazi ravan drugog, najveća vrednost po paru. Uz dubinu ide i mesto (`kod [x, y, z]`).
- Do 5 mm je `DODIR`, a preko 5 mm `SUDAR`. Dozvoljeni spojevi su u `config/contacts.py`: `CONTACTS` za mehaniku, `BODY_CONTACTS` za dodir sa karoserijom. Pod (`deco__karoserija__pod`) se proverava kao karoserija.
- `--motion --steps N` proverava rasklapanje u N jednakih koraka. Prijavljuje se par koji je nov i dublji od 5 mm, ili koji je za više od 5 mm dublji nego sklopljen.
- `--strict` vraća kod 1 kad postoji sudar.
- Lanac koristi 40 koraka; pre kraja koraka pusti jednom 120, jer tanki delovi prođu jedan kroz drugi između retkih uzoraka.

**`render.py`:**
- Režim `kostur` prikazuje PBR materijale bez karoserije.
- `--solo` u krupnom kadru sakriva sve osim fokusa.
- `--az` i `--el` idu u ime fajla.
- Neprovidan pod se sakriva za pogled `under`, za `exploded34` i za krupne kadrove sa el < −2. Tada se pali i svetlo odozdo.
- Režim `zebra` (A09) zamenjuje lak vodoravnim prugama refleksije: talas, udubljenje ili fasetirana mreža lome pruge, a glatka površina ih vodi u neprekidnim krivama. Prvi alat za „refleksija mora da teče“.

**Posteri (A09):** pregledač crta pod i pozadinu bez tone mapping-a, a Blender bi ih propustio kroz Khronos PBR Neutral i potamneo (`#0A0D11` je ispadala `#000409`). Zato Blender renderuje samo auto (providna pozadina, ista kamera i ista rendgen ljuska, zadnja lica 0,7 kao na webu), a `images.mjs` za svaki piksel baca zrak iz iste kamere na pod (disk 7 m, `#151A21`, providnost 255 → 200 na 0,45 → 0) i elipsu senke (2,5 × 5,6 m, crna 0,6). Pod se pretapa u pozadinu u donjih 10 % i bočnih 5 % slike, da ispod `contain` postera nema šava bez WebGL-a.

## Gde je šta

| Fajl | Uloga |
|---|---|
| `blender.mjs` | pokreće Blender (`-b --factory-startup --python-exit-code 1`); 2 = nema Blendera, 124 = isteklo vreme (20 min) |
| `build.py` | ulaz; redosled modula; proxy kutija za čvor koji niko nije napravio (izvoz ga odbija) |
| `config/dims.py` | mere iz PLAN §3 i tvrde tačke (osovine, točkovi, diskovi) |
| `config/body.py` | 14 ključnih linija kaveza, redovi (z sme da zavisi od kolone: dogleg, rez branika, lučne ivice), tačke nosa i repa na osi, otvor maske, fuge |
| `config/hardpoints.py` | raspored mehanike i enterijera |
| `config/explode.py`, `focus.py`, `contacts.py`, `xray.py` | rasklapanje, fokus kamere, dozvoljeni dodiri, izgled rendgena |
| `lib/cage.py` | kavez (glavna rešetka + kape nosa i repa obavijene Bezier-om) → Mirror → Subdivision → lukovi, paneli sa fugom 4,7 mm, prirubnicom i zaobljenim rubom; spoljne ivice panela idu u `output/auto3d/gap_edges.json` za merenje fuga |
| `body/shell.py` | paneli, stakla (sa crnim okvirom: trake kaveza 7 i 9), skelet, pod, obloge lukova; u panele spaja kvake, usisnike, spliter, difuzor (A09: karbonska zadnja maska sa otvorima za izlaze) i podlogu zadnje tablice |
| `body/openings.py` | otvori farova i LED trake, stop svetala, usisnika i zadnje tablice (A09: bez prednje tablice i izreza za izduv): (u, v) parametar ugla nosa i repa, usitnjavanje pojasa + Phong vraćanje na glatku površinu, brisanje i poravnanje ivice na obris |
| `body/lights.py` | farovi (sočivo, kućište, DRL linija, projektori, LED reflektori), LED trake, stop svetla (kontura, 3D lamele, svetlo za vožnju unazad) |
| `body/grille.py`, `body/mirrors.py`, `body/trim.py` | maska (okvir, hromirani rub, A09: vodoravne lamele i nosač prednje tablice); retrovizori; kvake, usisnici, spliter, difuzor, zadnja tablica, brisači |
| `body/details.py`, `body/wheels.py` | ulaz za masku, retrovizore i svetla; felne (10 dvostrukih konkavnih krakova) i gume (profil, šara, reljef bez teksta, `mat_rubber`) |
| `parts/*.py` | kočnice, vešanje, motor, usis i izduv, hlađenje, prenos, energija, elektrika, enterijer |
| `lib/parts.py` | imena čvorova (`part__<sistem>__<deo>[__<inst>]`), extras, lite spajanje materijala |
| `export.py`, `optimize.mjs` | GLB i manifest iz scene |

## Pravila

- Izlaz Blendera ide u `output/auto3d/` i ne commituje se. Commituje se samo `public/3d/auto3d/`.
- Posle A02 id-jevi delova, imena čvorova, ključevi extras, ključevi manifesta i imena materijala su zamrznuti. Novi deo se dodaje u katalog, rečnik i testove zajedno.
- Svaka ulazna skripta ima `sys.dont_write_bytecode = True`, a `.gitignore` ignoriše `3d/auto3d/**/__pycache__/`.
