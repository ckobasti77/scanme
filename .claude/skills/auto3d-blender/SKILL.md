---
name: auto3d-blender
description: Build realistic, unbranded 3D cars (body, panels, glass, lights, wheels, mechanicals, interior) headlessly in Blender from versioned Python scripts. Export a clickable-part GLB, manifest and posters for a three.js X-ray viewer. Use for any Blender or GLB work on ScanMe 3D cars ("3D Rendgen", "3D auto", rendgen auta), including per-dealer custom models.
---

# 3D cars in Blender for the ScanMe X-ray viewer

This skill covers how to build a car that people who know cars accept as real. A fair visitor who knows cars spots a fake in one second. Silhouette, stance and wheel fitment decide that second; detail comes after.

## 1. Golden rules

1. **Scripts only.** Blender runs headless from versioned Python in `3d/auto3d/`.
   - Rebuilding from zero must reproduce the asset.
   - No manual edits in a `.blend`.
   - Blender MCP tools, if present, are for inspection only.
2. **Numbers first.** Every proportion comes from the dimension table in the plan, and a measuring script verifies it from the scene. Tolerance is ±2 %.
3. **Look at every render.** After each geometry or material change, render the QA views and open the PNGs with Read. Write down the 5 worst "fake car" tells (§5) and fix them before moving on. At least 3 rounds per body step.
4. **Contract is frozen.**
   - Node names, `part_id`s, extras and manifest shape (§9) do not change after the foundation step.
   - Geometry may change freely.
   - The manifest is generated from the scene, never hand-written.
5. **No brand.** No logo, badge, lettering or signature design element of any real manufacturer, such as a grille shape or light graphic people recognize. Leave emblem areas empty.
6. **Real scale:** 1 Blender unit = 1 m.

## 2. Running Blender

- Executable: env `BLENDER_EXE` (Windows: `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`, version 5.1.1). The path has spaces, so always quote it.
- Wrapper (preferred): `node 3d/auto3d/blender.mjs 3d/auto3d/build.py -- --quality desktop` (the whole chain: `node 3d/auto3d/pipeline.mjs`)
- Direct (Git Bash): `"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P 3d/auto3d/build.py -- --quality desktop`
- Arguments go after `--`: `argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []`.
- `--python-exit-code 1` makes exceptions fail the command. Always check the exit code and stderr.
- Keep each command under about 20 min. Split render batches and print progress lines.
- Check API names against the running version (`bpy.app.version`). When unsure, list the properties, for example `bpy.ops.export_scene.gltf.get_rna_type().properties.keys()` or `bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items.keys()`.

## 3. Layout (ScanMe)

```
3d/auto3d/
  blender.mjs          wrapper: finds BLENDER_EXE, runs -b --factory-startup --python-exit-code 1
  build.py             entry: reset scene, build everything or --only <system>, save output/auto3d/<model>.blend
  lib/                 scene, naming + extras helpers, materials (slots), geometry helpers, measuring
  body/                parametric body surface, panels, glass, lights, grille, mirrors, wheels
  parts/               mechanicals and interior per system
  export.py            GLB (desktop + lite) + manifest from scene data
  render.py            QA views, posters, OG image
public/3d/auto3d/      limuzina.glb, limuzina-lite.glb, limuzina.manifest.json, poster-*.avif/webp, og.jpg  (committed)
output/auto3d/         .blend, QA renders (git-ignored, never committed)
```

## 4. Body: the method that works from a script

Blender is Z-up. The glTF exporter maps Blender (x, y, z) to glTF (x, z, −y). For glTF "+Z = front, +X = left, +Y = up", build the car in Blender with **front = −Y, left = +X, up = +Z**. The origin is on the ground, at mid-wheelbase.

### 4.1 Parametric surface from sections (recommended)

This method is precise, smooth and easy to cut into panels.

1. **Stations.** Pick 12–20 positions along the length:
   - front tip and bumper;
   - front axle;
   - A-pillar base;
   - mid-door;
   - B-pillar;
   - C-pillar base;
   - rear axle;
   - trunk edge;
   - rear tip.
2. **Sections.** At each station, define the half cross-section as a smooth 2D curve (lateral y vs. height z), going from the rocker up through:
   - door bottom;
   - character line;
   - shoulder;
   - beltline;
   - glass;
   - roof centre.

   Use cubic or Catmull-Rom splines with control points from the plan. Put a tight radius where a character line must read sharp.
3. **Profiles.** Make the sections follow three driving curves along the length:
   - the side silhouette (roof, beltline and rocker heights vs. x);
   - the plan view (half-width at shoulder and at rocker vs. x);
   - the tumblehome (glass inward lean).

   At the ends, collapse the sections into a rounded nose and tail.
4. **Sample a dense grid.** Use about 300–500 stations × 120–200 points per half-section, then mirror. Because the grid is parametric (u along the length, v around the section), every later operation becomes a mask in (u, v):
   - **Panels:** select faces by (u, v) ranges along real panel lines (hood, fenders, 4 doors, roof, trunk lid, bumpers, sills) and separate them.
   - **Gaps:** delete a 4–5 mm strip of faces along each panel line before separating.
   - **Windows:** separate the DLO region as glass. Inset it 8–15 mm into a black frame (shadow line) and give the glass 4–5 mm thickness.
   - **Wheel arches:** delete faces inside a cylinder around each axle. The radius is the tire radius plus a 25–35 mm gap at the top. Then add a flared arch lip: a swept profile along the arch edge.
5. **Thickness and edges.**
   - Solidify the panels 2–3 mm, with a bevel on open edges.
   - Use smooth shading with a Weighted Normal modifier.
   - In X-ray the fresnel rim lights panel edges, so clean edges are what sell realism.

**Alternative:** a low-poly subdivision cage, mirrored, with edge loops on the character lines, creases, and support loops at panel boundaries. Use it for organic forms (mirror caps, seats). For the main body, cutting panels from a cage is harder in code.

### 4.2 Proportions that read "premium sedan" (example values; the plan has the binding table)

- Long dash-to-axle (about 1.0 m).
- Cab set back.
- Low, wide stance: track about 84 % of the width.
- Wheels about 49 % of body height (21" with a 0.71 m outer diameter on a 1.44 m tall car).
- Short front overhang, longer rear overhang.
- Beltline about 2/3 of the height, so the glasshouse is about 1/3.
- Windshield at about 60–63° from vertical; fastback roof into a short deck with a spoiler lip.
- A shoulder "muscle" over the rear wheel, about 20–30 mm proud of the door surface.

## 5. Fake-car tells: check every round

| Tell | How to check |
|---|---|
| Wheels too small or tires too narrow | Measure the outer diameter and the wheel/body height ratio |
| Too much gap between tire and arch, wheels sunk inboard | Measure the arch gap (25–35 mm) and tire face vs. body side (2–15 mm inboard) |
| Floating car | Tires touch z = 0 with a small contact flattening |
| Tall, boxy body, oversized glasshouse | Beltline/height ratio, side silhouette render |
| No panel gaps, uniform sharp edges | Close-up render; gaps must read in both lacquer and X-ray |
| Faceted surfaces, wobbly reflections | Lacquer render with an HDRI or strip lights; reflection lines must flow |
| Missing details | Mirrors, handles, wipers, light internals, grille depth, exhaust tips |
| Glass flush with paint or invisible | DLO inset and frame visible in profile |
| Mechanicals through the body or through each other | BVH overlap script (`mathutils.bvhtree.BVHTree.overlap`), list > 5 mm |

For the cold critique, give the renders to a `sonnet` worker with no context: "These are renders of a car. List 10 things that show it is not a real car, worst first."

## 6. Details that sell it

- **Lights.** Each lamp has:
  - a dark housing;
  - an inner reflector or projector;
  - an emissive LED strip (`mat_led`);
  - a clear lens (`mat_lens`) with thickness.

  A full-width light bar should be thin (10–20 mm) and continuous.
- **Grille.** A 3D cell array (hex or mesh) recessed 30–60 mm behind the frame, with no logo. Side intakes get vertical vanes.
- **Wheels.**
  - Spokes are made once and arrayed radially; double spokes, with a concave face.
  - The tire is lathed from a sidewall profile with a bulge and rim protector; tread grooves come from an array.
  - The brake disc has vents and holes; the caliper is a rounded block with pistons implied.
  - Each corner needs a correct pivot for explode.
- **Mirrors.** A thin stalk, a cap with a split line, and mirror glass.
- **Handles.** Flush handles get a 2 mm gap outline.
- **Glass.** Visible thickness and a light tint. Never let glass hide the X-ray interior: keep its opacity low in the web X-ray mode.

## 7. Mechanicals and interior

- Port from the reference parts library when available, but rescale and re-place for this car. The engine is longitudinal behind the front axle; the tank is under the rear seat; the 12 V battery is in the trunk.
- Each system must be recognizable at close range:
  - engine: block ribs, head, cam cover, manifolds, turbo snail housings;
  - suspension: arms, springs and dampers;
  - brakes: discs and calipers;
  - exhaust: cats, mufflers, tips;
  - cooling: radiator core fins (texture-free: thin box array or normal detail).
- Use curves with bevel for hoses, harnesses, brake lines and exhaust pipes.
- No interpenetration. The overlap script runs in QA and its result goes into the progress notes.

## 8. Materials (glTF-friendly)

- Use Principled BSDF with flat values (base color, metallic, roughness, emission, alpha, coat, transmission). Procedural node trees do not export, so bake them or avoid them.
- Material names are contract slots, for example:
  - `mat_body_paint`, `mat_glass`, `mat_lens`, `mat_chrome`, `mat_alu`, `mat_steel`, `mat_cast`;
  - `mat_rubber`, `mat_plastic`, `mat_carbon`, `mat_leather`, `mat_led`, `mat_brake_disc`, `mat_caliper`.
- three.js swaps `mat_body_paint` to the X-ray or lacquer look.
- Merge meshes per part per material to keep draw calls low (budget in the plan).

## 9. Contract (frozen after the foundation step)

- **Clickable nodes:** `part__<system>__<part_id>`. The `part_id` is unique snake_case ASCII and is the `?deo=` value in the URL. Helper nodes use `fx__`; non-clickable decoration uses `deco__`.
- **Extras on each clickable node:**
  - `part_id`, `system`;
  - `explode_dir`: normalized, in glTF space;
  - `explode_dist`: metres;
  - `explode_stage`: 0–3;
  - optional `focus`: `{dist, az, el}`.

  Export with `export_extras=True`.
- **Manifest:** `export.py` writes `public/3d/auto3d/<model>.manifest.json` from the scene, including:
  - version, units, axes, bbox;
  - systems and parts (id, node, system, centre, size, explode, focus);
  - files;
  - stats (triangles, draw calls, bytes).
- **Tests:** a Node test reads the GLB JSON chunk (no three.js) and checks node ⇔ manifest ⇔ catalog ⇔ dictionary, plus the budgets.

## 10. Export and optimization

- Typical export call:
  ```python
  bpy.ops.export_scene.gltf(filepath=..., export_format='GLB', export_apply=True, export_extras=True, export_yup=True, export_materials='EXPORT')
  ```
  Check argument names in 5.1.
- Optimize with a pinned CLI that never enters `package.json`:
  - `npx -y @gltf-transform/cli@4.5.1 optimize in.glb out.glb --compress meshopt` (check `--help` for flags);
  - then `npx -y @gltf-transform/cli@4.5.1 inspect out.glb` for stats.
  - The web side decodes with `three/examples/jsm/libs/meshopt_decoder.module.js`.
  - Fallback: Draco from the Blender exporter plus three's DRACOLoader.
- **Lite (phone) model:**
  - same clickable ids;
  - fewer segments (generate geometry with a `quality` parameter rather than decimating);
  - small parts merged per material.

## 11. Renders: QA, posters, OG

- **Engine.** EEVEE for QA, using the engine id valid in this version. Cycles with denoise is only for final posters, if time allows.
- **Studio.** Dark neutral background, key + rim + fill area lights, a ground plane with a shadow catcher.
- **Lacquer view.** Metallic paint with coat, to judge surfaces.
- **X-ray view in Blender, matching the web look:**
  - body: Layer Weight (facing) driving an ice-blue emission mixed with transparency;
  - glass almost invisible;
  - mechanicals in system colors.
- **QA views:**
  - side;
  - front 3/4;
  - rear 3/4;
  - front;
  - top;
  - X-ray 3/4;
  - exploded 3/4;
  - close-ups (front end, rear end, wheel, each system).

  Size 1600 × 1000. Output to `output/auto3d/renders/<step>/`.
- **Posters.** Same camera, field of view and framing as the web viewer's initial view, so the poster → canvas swap does not jump. Desktop and phone crops, assembled and exploded. Convert to AVIF/WebP with `sharp`.
- **OG.** 1200 × 630, X-ray car, with space left for the title. No baked-in text.

## 12. Per-dealer custom model (after a sale)

1. Collect from the dealer:
   - official dimensions: length, width, height, wheelbase, tracks, tire sizes;
   - side, front, rear and 3/4 photos;
   - paint color and code;
   - wheel design;
   - powertrain;
   - real specs per part (or the brochure).
2. Use the photos as camera background references in a setup script, then fit stations and profiles (§4.1) to the silhouette.
3. Keep the contract (ids, systems). Swap powertrain parts by variant: ICE, hybrid or EV (battery pack in the floor, e-motors on the axles).
4. Replace the "example values" texts with the dealer's real data. Keep their name off the model unless they supply a licensed logo.

## 13. Pitfalls (Blender 5.x)

- **Smoothing.** Auto Smooth was removed in 4.1+. Use `shade_smooth()` with the "Smooth by Angle" modifier or `set_sharp_from_angle`. Custom normals must survive export.
- **Background mode.** `bpy.ops` needs context in background mode. Prefer `bpy.data` and `bmesh`; when you need an operator, use `with bpy.context.temp_override(...)`.
- **Engine names.** Engine enum names changed across versions; read them at runtime.
- **Coplanar faces** z-fight. Offset decals and lenses by 0.5–1 mm.
- **Transforms.** Apply rotation and scale before export, but keep location: explode moves object locations.
- **Windows paths.** Paths have spaces. Use forward slashes in Python and quote paths in shell.
- **Long renders.** Split them; each command stays under about 20 min.

## 14. Naučeno (append here: date, step, what worked or failed)

- 2026-10-16, setup: skill created from the earlier autodelovi pipeline. That pipeline's sedan body was boxy and dated, so for realism use §4.1 instead of its bodyshell approach.
- 2026-10-17, A02: the body cage (stations × key-line columns, mirror, Subdivision level 2, panels cut after baking) works and is fast (body build < 1 s). Notes:
  - Blender 5.1.1 Mirror + Subdivision carries an INT face attribute (`panel`), `material_index` and UV maps onto every child face, so panel ids written on cage faces survive subdivision.
  - `bmesh.ops.inset_region(..., use_even_offset=True)` on thin strips (sills, sharp corners) throws vertices meters away. Use `use_even_offset=False` for the half-gap inset.
  - Subdivision moves panel-boundary corners a lot where neighbouring key points jump: the windshield base corner moved about 5 cm and the nose tip about 2 cm. Measure after baking and shift the key-line knots (`config/body.py`), not the measurement.
  - A gap measured as a chord across a bend (roof to rail strip) reads short (3.3 mm for a 4.7 mm inset). Put cut lines on flatter areas.
  - `bpy.utils.system_resource("DATAFILES", path=...)` returned an empty string. Join the path by hand: `os.path.join(system_resource("DATAFILES"), "studiolights", "world", "studio.exr")`.
  - The ported `Geo` class has `+=` but no `+`.
  - gltf-transform `meshopt` keeps names, extras and hierarchy when part nodes are mesh leaves. Quantization puts a uniform scale and offset on each leaf, so never assume node scale 1 at runtime.
  - `collide.py` uses BVH triangle overlap plus an allowlist (`config/contacts.py`). The first pass found 67 pairs, mostly engine-bay packaging; all are fixed except lamps passing through panels, which A07 must cut openings for.
- 2026-10-17, A06 (karoserija koja liči na pravi auto): šta je radilo za realizam.
  - **Kape nosa i repa bez Coons zakrpa.** Coons kapa daje naduven, kockast nos. Radi ovo: svaka donja ključna linija (prag, donja linija vrata, „stomak“, rame) se obavija oko ugla do ose kao Bezier u tlocrtu; kontrolni ugao je presek tangente linije sa čeonom ravni, ručke 0,5 / 0,28. Vertikale kape se završavaju na ivici haube (napred) i na usni poklopca (pozadi), pa ivica haube i usna ostaju prave petlje kaveza.
  - **Red kaveza sme da ima različit z po koloni** (L za donje, H za rame, U za gornje kolone, `belly` = sredina). Tako dogleg zadnjih vrata, rez branik/blatobran i lučne ivice haube, vetrobrana i usne idu koso ili u luku, bez novih stanica i bez stepenica.
  - **Potporne petlje uz ivice stakla su obavezne.** Bez njih subdivizija diže donju ivicu prozora ~35 mm i spušta gornju ~50 mm (vrednost temena se meša sa susedima na 11 i 35 cm). Kolone `belt_g` / `dlo_g` na 14 mm od ivice (najviše 30 % razmaka). Na licu kape se potporne kolone razmiču ka sredini susednih, inače prave vertikalni nabor preko nosa.
  - **Otvor maske je rupa u kavezu**, ne brisanje lica posle subdivizije: ivica ispadne glatka i zaobljena, a prirubnica od 40 mm ide pravo unazad.
  - **Materijal po traci kaveza, ne po visini.** Prag `y < prag` je u redu jer su redovi vodoravni, ali na zadnjem braniku se donje linije penju i podela po visini lica pravi stepenice. Atribut lica `band` (indeks trake) ide kroz Mirror + Subdivision kao i `panel`.
  - **Fuga se meri na spoljnoj ivici panela.** Vrh povratne prirubnice je takođe granično teme i na ispupčenom pregibu je bliži susedu, pa je medijana ispadala 3,5 mm. `finish_panel` vraća spoljnu ivicu posle uvlačenja; build je piše u `output/auto3d/gap_edges.json`, a `measure.py` je čita.
  - **Detalji prate površinu zrakom** (`BVHTree.ray_cast` po z na panele): farovi, LED trake i maska se ne pišu kao apsolutne koordinate koje zastare čim se karoserija promeni.
  - **Tumblehome po napomeni nadzora je 15°** (A01 je imao 24°). Zadnji „mišić“ +27 mm u odnosu na vrata ostaje u granici guma–telo 2–15 mm i širine ±2 %. Proširenje oko luka od 10 mm u traci od 7 cm pravi nabore na kosim redovima; 6 mm u 9 cm je čisto.
  - Deco koji nije u `collide.py` (pod, protivpožarni zid) proveri vizuelno: posle spuštanja haube zid je probijao haubu kao crna traka ispod vetrobrana.
  - Brz krug: `build.py -- --quality desktop` pa `render.py -- --set qa --modes lak --views side,front34,rear34,front,top --samples 16` (oko 20 s ukupno), zatim `measure.py`. Tabele menjaj malim Python skriptama nad `config/body.py` i posle svake izmene proveri mere.
- 2026-10-17, A07 (svetla, maska, točkovi, ukrasi):
  - **Otvor sa glatkom ivicom posle subdivizije:** (1) usitni lica u pojasu oko obrisa (`bmesh.ops.subdivide_edges`, cuts=1, dva puta), (2) obriši lica sa centrom u obrisu, (3) temena nove ivice pomeri na najbližu tačku obrisa i vrati zrakom na površinu. Obris je u (u, v): v = y, a u je dužina u tlocrtu (na čelu |x| − 0,55, oko ugla ugao oko tačke C × 0,40), pa jedan obris prati čelo, ugao i bok.
  - **Usitnjena temena moraju nazad na glatku površinu.** Nova temena leže na ravnim licima, pa njihova normala = normala lica i senčenje pravi talase. `smooth=1.0` u `subdivide_edges` pravi grbe. Radi Phong tessellation: najbliže prvobitno lice (`BVHTree.find_nearest`), težine `mathutils.interpolate.poly_3d_calc`, projekcija na tangentne ravni temena, α = 0,75.
  - **Ne pomeraj temena na granici sa drugim panelom** (ivica haube): otvor fara ide do same granice, a sočivo je 10 mm ispod nje. Tanka traka lima (11 mm) između otvora i haube dobija fugu i prirubnice sa obe strane i pravi šiljke.
  - **Sočivo i kućište se pomeraju po normali površine, ne po zraku parametra**: na uglu je zrak kos, pa sočivo bočno pređe preko prirubnice. Ivica otvora svetla ima kratku prirubnicu (4 mm), prednja ivica haube 6 mm; sočivo je 1 mm manje od otvora, a svetlo se završava gde je otvor niži od 12 mm (uzan vrh se ne iseče čisto). Posle toga `collide.py` daje 0 parova.
  - **Geo → objekat za spajanje u panel**: `bpy.data.objects.new(name, geo.to_mesh(name))`; `_join` u `shell.py` spaja po imenu materijala. Zrak koji promaši površinu (npr. ispod podvijene ivice branika) u fallback-u daje tačku 3 m daleko: uzorkuj više i spusti se pravo dole.
  - **Rendgen na webu crta svaki slot karoserije dvaput** (zadnja i prednja lica). Svaki novi materijal na delu karoserije = 2 draw call-a. A07: 262 → 250 kad su kućišta svetala, zadnja ploča maske, lopatice, kade i metlice brisača prešli na postojeće slotove.
  - Brz krug za detalje: `render.py -- --set closeup --modes lak --focus napred,pozadi,tocak,bok` (predlošci u `CLOSEUPS`), plus `--focus far --az 55 --el 6` za jedan deo. Hladnu kritiku radi radnik `sonnet` nad celim krugom; deo nalaza je izvan obima koraka (enterijer, površine karoserije), pa ih zapiši za sledeće korake.

- 2026-10-17, A08 (mehanika i enterijer):
  - **Prodiranje se meri dubinom, ne brojem trouglova.** Za svaki par trouglova koji se seku: koliko jedan prelazi ravan drugog (manja od dve strane), pa manja vrednost para, pa najveća po paru delova. Do 5 mm je `DODIR` (sme), preko 5 mm je `SUDAR`. Linija `SUDAR` nosi i mesto (`kod [x, y, z]`), bez toga se par ne nađe u motornom prostoru. Pod (`deco__karoserija__pod`) je sada u proveri kao karoserija; dodiri sa karoserijom idu u `BODY_CONTACTS`.
  - **Rasklapanje proveri gusto.** Na 11 uzoraka rasklapanje je bilo čisto, na 40 se pojavilo 19, pa 40 parova, na 120 još 4: tanak deo za korak od 2–3 cm prođe kroz drugi između dva uzorka. Faza `collide` radi `--motion --steps 40 --strict`, a pre kraja koraka pusti jednom `--steps 120`.
  - **Lanci redosleda nemaju rešenje bez sidra.** Usisne cevi, izduvna grana i turbo su se međusobno blokirali u svakom redosledu faza. Rešenje: delovi koji obavijaju blok (`usisne_cevi`, `izduvna_grana`) i `kablovski_snop`, `rezervoar` ostaju na mestu (dist 0), a ostalo se odvaja od njih. Kliznim spojevima (šipka spone u kućištu letve, poluosovina u tunelu kartera) daj 3–4 mm vazduha, inače rasklapanje struže.
  - **Ne zatvaraj nekonveksan loft lepezom.** Kapa lepezom (sedlo rezervoara iznad tunela) prekrije udubljenje i kardan „prolazi“ kroz kapu. Izvuci tlocrt po visini (`extrude` + matrica u `y`) sa CDT poklopcima ili sastavi od konveksnih delova.
  - **Zaokruži stanice lofta** (`round(z, 4)` u skupu): skoro iste stanice daju degenerisana lica i `validate()` menja broj lica.
  - **Spiralno kućište turba:** ugao početka spirale (`start_deg`) odredi tako da izlaz gleda ka cevi (turbina -310°, kompresor 390° za ovaj raspored), pa tek onda vuci cev od izlaza; obrnuto ne ide.
  - **QA mehanike:** `render.py -- --modes kostur` (PBR, bez karoserije) i `--solo` (samo fokus) za krupne kadrove sistema. Neprovidan pod u Blenderu krije sve ispod y = 0 (izduv, podokviri); za pogled odozdo i za `el < -2` pod se sakriva i pali svetlo odozdo. Na webu je disk poda bez upisa dubine, pa se ti delovi vide.
  - **Fokus proveri na stranici, ne samo u Blenderu.** Turbo iza prednjeg točka (az -70, el 15) je na webu bio iza providne gume; az -140, el 40 (iza točka, preko praga) daje čist kadar oba turba.
  - **Draw call-ovi:** mehanika i enterijer su stali u isti broj kao A07 (208) jer su sitni delovi (stubovi naslona, dugmad) prešli na postojeći `PLASTIC` umesto novog slota.

- 2026-10-17, A09 (revizija, izvoz, posteri):
  - **Zebra pre svake ocene površine.** `render.py -- --modes zebra` (pruge iz vektora refleksije, emisija). Odmah pokazuje ono što lak sakrije: ravna vrata su jedna crna površina, a usitnjena mreža oko otvora daje nazubljene ivice pruga. Talas pored tablice je bio od otvora tablice u licu; bez otvora (tablica na nosaču preko maske) talasa nema.
  - **Lice kao zid se ne leči profilom kape**, nego površinom: maska od donje linije branika do LED trake (rupa kaveza preko dve trake, `GRILLE_HOLE`), ivica haube 4 cm napred i 2 cm niže (obrva), lamele umesto rombova (velika zaobljena maska sa rombovima podseća na jednu marku). Pomeranje tačaka kape za 1–2 cm se posle subdivizije jedva vidi.
  - **`grille.opening()` uzima ivice otvora iz `gap_edges`:** kad je maska viša, u filter upadnu i ivice otvora farova, pa maska preraste u farove (33 mm prodiranja). Filtriraj po visini ispod donje ivice farova.
  - **Brisanje lica ostavlja usamljena temena** (`bmesh.ops.delete` po licima ne briše temena koja su već bila bez lica). `cage.extract` ih kopira u svaki panel i staklo, pa merenje stakla puca (vetrobran „do nosa“). Posle sečenja otvora obriši temena bez lica.
  - **Isturena ivica haube iznad fara menja rasklapanje:** far izlazi napred ispod nje i udari u ugao. Hauba ide u fazu 0 (zajedno sa farovima), a far i maska skoro vodoravno, jer je viša maska tik ispod farova. Interkuler koji je bliže hladnjaku mora da ide dalje i brže od njega.
  - **„Polica“ iznad zadnjeg branika nije stepenik** ako su ivice u ravni (`gap_edges`: razlika ≤ 0,6 mm). Ugao skeleta kao „kutija“ dolazi od linije ramena koja na repu pada 7 cm ispod usne; kad rame raste do ~1,02 m, ugao se smiruje.
  - **Posteri bez skoka na canvas:** pregledač ne tone-mapuje pod i pozadinu, a Blender (Khronos PBR Neutral) bi ih potamneo (`#0A0D11` → `#000409`). Auto se renderuje na providnoj pozadini, a pod, senka i pozadina se crtaju u `images.mjs` zrakom iz iste kamere (`cameras.json`), sa mešanjem u sRGB kao canvas. Pod se pretapa uz donju i bočne ivice, da ispod `contain` postera nema šava.
  - Formulu zadnje plohe (`rear_face_z`) ponovo izmeri zrakom kad menjaš zadnju kapu: na y 0,27 je ploha 30 mm napred od formule, pa maska difuzora mora da počne iza podvijene ivice branika.
