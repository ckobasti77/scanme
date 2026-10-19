# Pravila noćnog runa AUTO3D: važe za svaki korak

Radiš bez nadzora dok Jovan spava i niko ne može da ti odgovori na pitanje. Kad naiđeš na nejasnoću:
1. Izaberi najkonzervativniju opciju.
2. **Zapiši je** u svojoj sekciji u `docs/AUTO3D-PROGRESS.md`, u redu **ODLUKE:** (šta si izabrao i zašto).
3. Nastavi.

Ne improvizuj ćutke.

## Kontekst

ScanMe je QR platforma: Next.js 16, React 19, TypeScript, Tailwind v4, Convex. Na sajmovima automobila u Hali Čair ScanMe prodaje izlagačima pakete po izloženom modelu.

Ovaj run pravi:
- novi, najviši paket **„3D Rendgen“** (8.000 RSD po modelu);
- javnu preview stranicu `/sajam/3d` sa realističnom, univerzalnom limuzinom bez marke. Limuzina ima prozirnu karoseriju, klikabilne delove, grupe i specifikacije.

Teodora je u ponedeljak šalje i pokazuje auto kućama. Zato stranica mora da radi i na telefonu i na laptopu, i da odmah izgleda skupo.

Run **ne** pravi:
- backend za novi paket;
- izmene postojećih sajamskih strana;
- ništa u Meniju, adminu, Links ili Venue.

Repo je kopija ScanMe-a u folderu `auto3d-scanme`. Paralelno, u folderu `...\Web Dev Projects\scanme`, radi drugi noćni run (ScanMe Meni). Taj folder ne diraš ni za čitanje: sve što ti treba je u ovoj kopiji.

**Izvori istine:**
- `docs/AUTO3D-PLAN.md`: odluke (O1…), predlozi (P1…), obim, dizajn brief auta, ugovor i koraci.
- `docs/auto3d/planovi/<ID>.md`: tehnički planovi koje pišu plan koraci (A01 i A03).
- `docs/AUTO3D-PROGRESS.md`: šta su prethodni koraci uradili, ODLUKE i BLOKADE.

## Obavezno pročitaj pre pisanja koda

1. `AGENTS.md` (konvencije ScanMe-a: i18n rečnici, Server Components, lucide, Framer Motion i GSAP, bez lažne saglasnosti vlasnika).
2. Za svaki Next API koji koristiš: odgovarajući vodič u `node_modules/next/dist/docs/`. Next 16 se razlikuje od onoga što znaš: async `params` i `searchParams`, `proxy.ts` umesto middleware-a, metadata API.
3. `docs/AUTO3D-PLAN.md` i planove iz `docs/auto3d/planovi/` koje tvoj korak pominje.
4. `docs/AUTO3D-PROGRESS.md`.
5. Za UI: `docs/events/sajam-automobila-2026/FAIR-DESIGN-DNA.md` (tokeni i obrasci sajma) i `app/sajam/fair-event.css`.

## Skillovi

| Kada | Skill |
|---|---|
| Svaki rad u Blenderu ili na GLB-u | `.claude/skills/auto3d-blender/SKILL.md`. Pročitaj ga ceo pre prve Blender komande. Kad nešto naučiš na teži način (API Blendera 5.1, trik za realizam), dopiši to u odeljak „Naučeno“ tog skilla. |
| 3D pregledač | `.claude/skills/threejs-*` (fundamentals, materials, interaction, loaders, lighting, shaders, postprocessing), po potrebi |
| Ako koristiš GSAP | `.claude/skills/gsap-*` |

Kad se savet skilla sudari sa pravilima repoa ili ovim pravilima, pobeđuju pravila.

## Referenca (samo čitanje)

`.nocni-run/auto3d/tmp/izvor/autodelovi/` je kopija sajta autodelovi:
- `3d/blender/**`: Blender pipeline koji radi na Blenderu 5.1.1;
- `3d/scripts/**`;
- `docs/3D-CONTRACT.md`;
- `components/three/**` i `lib/three/**`: 3D hero na R3F-u;
- `renders/`: kako izgleda njihov rendgen.

Kod portuješ i prilagođavaš (ScanMe nema R3F, nego čist three). Nikad ne kopiraš imena: imena klijenta i proizvoda iz reference, „SKLOP“, `__sklop3d`, `sk-*`, eases `sk.*`. Njihova karoserija je zastarela i kockasta; za nju ne služi kao uzor, nego kao primer šta ne valja.

## Radnici (subagenti)

Glavne odluke i ključni kod radiš ti. Sitne, nezavisne poslove možeš dati radnicima preko alata `Agent`, paralelno kad su nezavisni:
- `model: "sonnet"`: hladna kritika rendera ili snimaka („šta odaje da auto nije pravi?“), pregled ekrana, pisanje teksta specifikacija po tvom šablonu, testovi po tvom opisu, pretraga po repou.
- `model: "haiku"`: najsitnije mehaničke provere (spisak fajlova, grep, prebrojavanje, provera stringova).

Radniku daješ tačne putanje i tačan zadatak, i svaki rezultat proveriš pre nego što ga prihvatiš. Radnici ne menjaju iste fajlove kao ti u isto vreme.

## Apsolutne zabrane

- **Git:** NE radi `git push`, `commit`, `reset`, `clean`, `checkout`, `switch`, `stash`, `rebase`, `merge`, `restore`, `remote`, `fetch`, `pull`. Runner sam pravi commit posle koraka. Čitanje je dozvoljeno: `git status`, `git diff`, `git log`, `git show`.
- **Produkcija i backend:**
  - NE pokreći nijednu Convex komandu (`npx convex …`, `npm run dev:convex`): `.env.local` pokazuje na DEV deployment koji koristi i drugi run.
  - NE radi `vercel` niti bilo kakav deploy.
  - Ništa nad bazom, nalozima ni plaćanjima.
- **Tajne:** NE čitaj, ne menjaj i ne prepisuj `.env*`. NE upisuj ključeve u kod ni u dokumente.
- **Van obima (ne menjaj):**
  - `convex/**`, `lib/fair-entitlements.ts`, `lib/fair-contract.ts`;
  - postojeće fajlove u `app/sajam/**` i `components/fair/**`, osim novih foldera `app/sajam/3d/` i `components/fair/auto3d/`;
  - `package.json`, `package-lock.json`, `proxy.ts`, `next.config.ts`, `tsconfig.json`, `vitest.config.*`, `eslint.config.mjs`;
  - `app/layout.tsx`, globalni CSS;
  - `components/menu/**`, `app/m/**`, admin, Links, Venue;
  - `harness/**`.

  Ako ti nešto od ovoga baš treba, napravi ostatak i upiši `BLOKADA:` sa razlogom.
- **Paketi:** NE instaliraj ništa (`npm install`, `npm ci`, `pip install` su zabranjeni).
  - Jedini izuzetak je jednokratno `npx -y @gltf-transform/cli@4.5.1 …` za optimizaciju GLB-a. Ono ne ulazi u `package.json`.
  - Sve ostalo je već tu: `three` 0.186.1 sa `examples/jsm`, `gsap`, `framer-motion`, `lucide-react`, `sharp`, `playwright`.
- **Drugi folderi:** NE piši van ovog repoa. Ne diraj `...\Web Dev Projects\scanme` ni `...\autodelovi`.
- **Disciplina:**
  - NE „popravljaj“ susedni kod koji nema veze sa zadatkom i ne briši tuđi kod.
  - NE gasi, ne preskači i ne briši testove ni assertion-e da bi provera prošla.
  - NE ostavljaj pokrenut dev server, Blender ni druge procese na kraju koraka.
  - Privremene fajlove drži u `.nocni-run/auto3d/tmp/`, a izlaz Blendera u `output/auto3d/`. Ne briši fajlove van ta dva mesta, osim kad to zadatak traži.

## Konvencije repoa

- **Server i klijent:** Server Components su podrazumevane. `"use client"` stavljaš na najmanju granicu kojoj trebaju stanje, efekti ili događaji.
- **three:** učitava se samo dinamičkim `import()` iz modula pregledača u `components/fair/auto3d/`. Nikad iz deljenog koda, i nikad tako da uđe u zajedničke chunk-ove drugih strana.
- **Tekstovi:** svaki tekst koji korisnik vidi ide kroz rečnike `lib/i18n/sr/fair-auto3d.ts` i `lib/i18n/sr/fair-auto3d-delovi.ts`. To su samostalni moduli sa `interface` + `as const satisfies`, po obrascu `lib/i18n/sr/landing-packages.ts`. U komponentama nema srpskog teksta direktno.
- **Jezik:**
  - srpska latinica, ekavica, ispravna slova č ć ž š đ;
  - glas iskusnog mehaničara koji priča kolegi;
  - bez emodžija, bez uzvičnika u reklamnom tonu, bez lorem-a;
  - bez vidljivog „TODO“;
  - bez izmišljenih podataka o firmi (kontakt samo po P11).
- **Formati:** `8.000 RSD`, `30. 10 – 1. 11. 2026.`, `540 Nm`, `1.850 kg`. Između broja i jedinice ide razmak.
- **Izgled:** okvir stranice prati sajamski DNA, preko tokena iz `.fair-event` (`app/sajam/fair-event.css`). 3D scena je tamni studio (P5). Ikonice su `lucide-react`, sa pristupačnim imenom kad svrha nije jasna iz teksta.
- **Pokret:** Framer Motion za lokalne prelaze UI-ja, GSAP samo za sekvence kamere i ture. Svaki pokret poštuje `prefers-reduced-motion`. Animiraju se samo `transform` i `opacity`.
- **Testovi:**
  - vitest;
  - čista logika ide u `lib/auto3d/**/*.test.ts`, a komponente u `components/fair/auto3d/**/*.test.{ts,tsx}`;
  - testovi koji čitaju fajlove (GLB, manifest) imaju prvi red `// @vitest-environment node`;
  - uzori su postojeći testovi u `components/fair/` i `lib/fair-map/`.

## Blender

- Pokrećeš ga samo kroz skripte iz repoa, preko `node 3d/auto3d/blender.mjs <skripta.py> -- <argumenti>` (pravi ga A02).
  - Do tada: `"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P <skripta.py> -- <argumenti>`.
  - Putanja ima razmake, pa je uvek u navodnicima.
- Jedna komanda traje najviše oko 20 minuta. Duže renderovanje deli na delove. Skripte ispisuju napredak.
- `.blend` i QA renderi idu u `output/auto3d/` (ignorisano). Commituje se samo ono iz `public/3d/auto3d/`.
- **Pogledaj svoje rendere.** Posle svake izmene geometrije ili materijala renderuj QA poglede i otvori PNG alatom Read. Sudi kao art direktor i popravi pre nego što kreneš dalje.
- Model se pravi **od nule iz skripti**, ponovljivo. Ručne izmene u `.blend` ne postoje.

## Vizuelna provera (koraci koji menjaju UI)

**Sa Playwright MCP-om:**
1. Pusti `npx next dev -p 3180` u pozadini.
2. Otvori `http://localhost:3180/sajam/3d`.
3. Proveri izmenjene ekrane na 390 × 844 i 1440 × 900, a za kiosk na 1920 × 1080.
4. Snimci idu u `output/playwright/auto3d/<ID>-*.png`.
5. Pogledaj ih alatom Read.
6. Na kraju ugasi dev server.

**Ako MCP ne prikaže WebGL** (crna ili prazna scena): napravi Node skriptu koja koristi `playwright` iz repoa sa Chromium argumentima `--ignore-gpu-blocklist --enable-unsafe-swiftshader`, i snimi isto. Zapiši u progress šta je radilo.

Stranica nema prijavu, pa nema ni izloga: sve se proverava na pravoj ruti.

## Definicija završenog koraka

Korak nije gotov dok ne prođu:

    npx tsc --noEmit
    npx eslint --ignore-pattern ".nocni-run/**"
    npx vitest run

Runner posle tebe ponovo pušta ove provere i `npm run build`. Ako padnu, vratiće ti grešku u istoj sesiji. Provera ili test koji su padali i PRE runa (`.nocni-run/auto3d/baseline.txt`) nisu tvoja odgovornost, ali ih ne kvari dodatno.

Ako nešto realno ne može (ograničenje platforme, fali podatak, traži odluku vlasnika), napravi ostatak i upiši `BLOKADA:` sa tačnim razlogom. Blokada je ispravan ishod, hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/AUTO3D-PROGRESS.md`

```
## <ID> — <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je urađeno:** 3–8 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Novi paketi:** nema (ili zašto jeste, uz BLOKADU)
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Merenja:** mere auta, veličine GLB-a, trouglovi (gde važi)
**Rezultat provere:** tsc / lint / vitest — prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom
**Za Jovana ujutru:** šta da proveri ručno (link sa parametrima)
```

Dopisuješ na kraj i ne brišeš tuđe sekcije.

## Poznate zamke u ovom repou

- **Generisani tipovi ruta.** `tsc` javlja `Cannot find name 'PageProps' / 'LayoutProps' / 'RouteContext'` kad fale tipovi koje Next generiše u `.next/types` ili `.next/dev/types`. Pokreni `npx next typegen` (ne menja kod) i proveri ponovo. Ne dodaj sopstvene deklaracije tih tipova.
- **`next-env.d.ts` se menja sam.** `next dev` i `next build` ga prebacuju između `.next/dev/types` i `.next/types`. Ne uređuj ga ručno; runner ga ne commituje.
- **Dev server.** Ugasi ga pre kraja koraka. Runner pre provera gasi zaostale procese ovog repoa, ali ugašen u sred pisanja ume da ostavi oštećen `.next/dev/types`. Ako se to desi, pokreni `npx next typegen`.
