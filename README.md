# Next.js Vibe Coding Starter

Čist početak za ljude koji žele da naprave moderan website razgovorom sa
Codexom, Claudeom, Cursorom ili drugim coding agentom — bez ručnog
podešavanja projekta.

## Početak za dva minuta

Potreban je Node.js 20.9 ili noviji.

```bash
git clone <URL-tvog-repozitorijuma>
cd nextjs-website-starter
npm ci
npm run dev
```

Otvori `http://localhost:3000`, zatim otvori isti folder u svom coding agentu.
Pre prve izmene reci agentu da pročita `AGENTS.md`.

## Prompt koji možeš odmah da nalepiš

```text
Read AGENTS.md first. Build a polished, responsive website for [opiši biznis,
publiku i cilj]. The key sections are [sekcije]. The visual direction is
[stil, reference ili boje]. Use real Serbian copy, accessible interactions,
and verify the result in the browser. Run npm run check before you finish.
```

Ne moraš znati imena komponenti ni fajlova. Opiši šta posetilac treba da vidi
i uradi; agent će izabrati odgovarajuću strukturu, UI i animacije.

## Provera pre GitHub-a

```bash
npm run check
```

Ova komanda pokreće lint i production build. Ista provera se automatski pokreće
na svakom GitHub push-u i pull request-u.

## Objavljivanje na Vercel

1. Napravi GitHub repozitorijum i pushuj ovaj folder.
2. Uloguj se na [Vercel](https://vercel.com/new) i izaberi **Add New → Project**.
3. Importuj GitHub repozitorijum i klikni **Deploy**. Vercel automatski prepoznaje Next.js.

Kada kasnije agent doda environment varijable, unesi iste vrednosti i u Vercel
Project Settings → Environment Variables. Nikada ne pushuj `.env.local`.

## Šta je već spremno

- Next.js 16, React 19, TypeScript i Tailwind CSS 4
- shadcn/ui osnova sa Radix pristupačnim komponentama
- GSAP, Framer Motion i Lucide ikonice
- neutralni dizajn tokeni i potpuno prazna početna ruta
- jasna pravila za UI/UX i bezbedan rad agenata u `AGENTS.md`

Convex, autentikacija, baza, CMS, analitika i test framework se dodaju samo kada
za konkretan website stvarno budu potrebni.

## ScanMe medija

Završni hero video postavlja se na:

```text
public/videos/scanme-hero.mp4
```

Opcioni poster postavlja se na:

```text
public/images/scanme-hero-poster.webp
```

Stranica pre izgradnje proverava da li datoteke postoje. Bez njih prikazuje
namerno dizajniran statički ScanMe kadar, bez neispravnog video zahteva. Nakon
dodavanja medija potrebno je ponovo pokrenuti build.

## Lokalni primer dinamičkog QR preusmerenja

Prvo pokrenite lokalni Convex:

```powershell
$env:CONVEX_AGENT_MODE='anonymous'
npx convex dev --once
```

Zatim postavite lokalni ključ od najmanje 16 karaktera i pozovite demo seed:

```powershell
npx convex env set SCANME_DEMO_SETUP_KEY <lokalni-kljuc>
npx convex run demo:seed '{"setupKey":"<lokalni-kljuc>"}'
```

Aktivan primer je `/primer-review`, a namerno isključen primer je
`/primer-neaktivan`. Odredište koristi jasno označen `DEMO_PLACE_ID` i nije
predstavljeno kao stvarni klijent. Pre produkcije postavite pravi Google Review
link kroz zaštićen administrativni proces i uklonite lokalni demo ključ.

## Lokalni primer ScanMe Venue stranice

Uz pokrenut Convex (`npx convex dev`) i postavljen ključ od najmanje 16
karaktera, jedan `npx convex run` pravi demo lokal sa aktivnim Venue profilom i
jednim događajem koji je **trenutno uživo**, sa reprezentativnim blokovima
(odbrojavanje, datum i vreme, program, galerija, profili, cenovnik, mapa,
rezervacije, deljenje). Tri komande od praznog checkout-a do editora:

```powershell
npx convex env set SCANME_VENUE_DEMO_SETUP_KEY <lokalni-kljuc>
npx convex run venueDevSeed:seed '{"setupKey":"<lokalni-kljuc>"}'
npm run dev
```

Zatim otvorite:

- javna stranica (odmah prikazuje „uživo“ stanje): `/venue-primer/venue`
- editor: `/venue-primer/venue/editor`

Seed je bezbedan za ponovno pokretanje — vraća postojeći demo umesto da pravi
duplikat. Lokal je jasno označen kao demo (`status: "demo"`, slug
`venue-primer`). Pre produkcije uklonite lokalni demo ključ.

Za pravi lokal Venue se dodeljuje kroz zaštićen admin ekran na `/admin/venue`
(bira se lokal i plan; deaktivacija čuva sav sadržaj).

## Zlatni harness (ScanMe Links regression net)

Harness dokazuje da se objavljene ScanMe Links stranice ne menjaju ni za bajt
(RFC-001 §2.11). Korpus je `/dev/template-gallery?harness=1`: svaki preset ×
varijacija × dozvoljena kategorija pozadine, kroz pravi produkcioni template.
Po slučaju se čuvaju normalizovani `outerHTML` i razrešene vrednosti
`--links-*` tokena — bez screenshot-ova i bez punog `getComputedStyle`, da
goldeni budu prenosivi između Windows-a i CI-ja.

Jednokratna priprema (preuzima Chromium za Playwright):

```powershell
npx playwright install chromium
```

Komande:

```powershell
npm run harness:capture   # renderuje korpus i upisuje goldene u harness/goldens/
npm run harness:check     # ponovo renderuje i poredi; izlazi sa greškom na svaku razliku
npm run harness:namespace # zabrana ukrštanja --links-/--venue- imenskih prostora
```

`npm run check` pokreće i `harness:namespace` i `harness:check`. Skripte same
podižu (i gase) `next dev` na portu 3199. Goldeni u `harness/goldens/` su
komitovani; posle namerne promene dizajn-izlaza pokrenite `harness:capture`
i komitujte novi snimak zajedno sa izmenom.
