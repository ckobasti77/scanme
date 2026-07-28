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
