# Pravila noćnog runa MENI — važe za svaki korak

Radiš nenadzirano dok Jovan spava i niko ne može da ti odgovori na pitanje. Kad naiđeš na nejasnoću:
1. Izaberi najkonzervativniju opciju.
2. **Zapiši je** u svojoj sekciji u `docs/MENI-PROGRESS.md`, u redu **ODLUKE:** (šta si izabrao i zašto). Ako izbor pripada vlasniku proizvoda (poslovno pravilo, pravni tekst, cena, politika privatnosti), dopiši ga i kao otvoreno pitanje u `docs/tasks/BLOCKED.md` pod naslovom `## SCANME MENU V1 — <ID>`.
3. Nastavi.

Ne improvizuj tiho. Nikad ne piši da je vlasnik nešto potvrdio (AGENTS.md).

## Kontekst
ScanMe je Next.js 16 + Convex aplikacija (ScanMe Links, Venue, Memories, Sajam, interni admin, klijentski panel). Ovaj run gradi **ugostiteljski V1 proizvoda ScanMe Menu** po master specifikaciji, vertikalu po vertikalu: model podataka, autorizacija, backend, UI, testovi i provera u browseru za svaku celinu. Rezultat je lokalna grana sa jednim commitom po koraku; ništa ne ide u produkciju.

Nije cilj (master §19–§20): režim Usluge, Prodaja i preuzimanje, online plaćanje, SMS, galerije i video, page builder, Enterprise integracije, produkcioni deploy, migracija ili seed podataka.

Izvori istine, ovim redom kad se ne slažu:
1. stavke **ZAKLJUČANO** u masteru `ScanMe-Menu-Jovan-Claude-Handoff/docs/SCANME-MENU-MASTER-SPEC.md`;
2. ostala pravila mastera;
3. handoff `ScanMe-Menu-Jovan-Claude-Handoff/docs/scanme-menu-handoff/SCANME-MENU-JOVAN-CLAUDE-HANDOFF.md`;
4. korekcije u `ScanMe-Menu-Jovan-Claude-Handoff/docs/scanme-menu-handoff/mockups/README.md`, pa tek onda slike u istom folderu;
5. RFC-003, RFC-004 i zatečeni kod.

Pored njih:
- `docs/MENI-PLAN.md`: odluke (O1…), predlozi (P1…), obim, zaključana pravila po oblastima, izlog, koraci.
- `docs/meni/planovi/<ID>.md`: tehnički planovi plan koraka (K01 je arhitektura celog runa; K09 editor; K12 javni meni; K19 QR, gost i konobar; K24 rezervacije i panel).
- `docs/MENI-PROGRESS.md`: šta su prethodni koraci uradili, ODLUKE i BLOKADE.
- `docs/menu/MENU-ARHITEKTURA.md` (recept, od K02) i `docs/menu/MENU-UX.md` (UX standard, od K07): ugovor za sve korake. Kad promeniš ponašanje koje opisuju, ažuriraj ih.

Handoff paket samo čitaš. Master ne menjaš; predlog izmene specifikacije ide u ODLUKE (K35 ga skuplja).

Prethodni koraci možda nisu uspeli do kraja (korak sa BLOKADOM je vraćen u git stash i nema ga u kodu). Ne pretpostavljaj da nešto postoji: proveri u kodu i u progress-u; ako fali, uradi minimum koji ti treba ili upiši BLOKADA.

## Obavezno pročitaj pre pisanja koda
1. `AGENTS.md`. Next.js 16 ima promene koje ne znaš iz treninga: pre koda pročitaj odgovarajući vodič u `node_modules/next/dist/docs/`.
2. Pre bilo koje izmene u `convex/`: `convex/_generated/ai/guidelines.md`.
3. `docs/MENI-PLAN.md`, `docs/meni/planovi/K01.md` i plan oblasti koji pominje tvoj prompt.
4. Kraj `docs/MENI-PROGRESS.md` (sekcije prethodnih koraka, posebno ODLUKE i BLOKADE).
5. Odeljke mastera koje navodi tvoj prompt.

## Skillovi
Koristi skill samo ako stvarno postoji u ovoj sesiji; ne tvrdi da si koristio skill koji nemaš.
- UI (redosled iz AGENTS.md): `anthropic-skills:design-taste-frontend` → `anthropic-skills:ui-ux-pro-max` → `frontend-design:frontend-design`. Pregled: `anthropic-skills:impeccable`, `design:design-critique`. Pristupačnost: `design:accessibility-review`. Tekst: `design:ux-copy`. Grafikoni: `dataviz`.
- Convex: `convex`, `convex-authz` (autorizacija), `convex-test` (testovi), `convex-migration-helper` (widen–migrate–narrow), `convex-performance-audit`, `convex-crons`.
- Nikad skillove koji rade deploy, seed ili diraju produkciju (npr. `anthropic-skills:deploy-to-production`, `convex-ship`, `convex-seed`, `convex-env`, `vercel:*`).

Kad se savet skilla sudari sa pravilima repoa ili ovim pravilima, pobeđuju pravila.

## Radnici (subagenti)
Glavne odluke, deljene fajlove i ključni kod radiš ti. Sitne, nezavisne poslove daješ radnicima preko alata `Agent`, paralelno kad su nezavisni:
- `model: "sonnet"`: kod po receptu na **disjunktnom** spisku fajlova, testovi po tvom opisu, kritika snimaka (UX, pristupačnost), bezbednosni pregled autorizacije.
- `model: "haiku"`: najsitnije mehaničke provere (inventar fajlova, grep, prebrojavanje, trijaža palih testova, snimci alatom `snimi.mjs`).

Najviše 5 radnika piše kod istovremeno; nijedan fajl nije kod dva radnika; deljene fajlove (`convex/schema.ts`, `lib/i18n/types.ts`, recept, tokeni, registar ruta) menjaš samo ti. Radniku daj cilj, tačan spisak fajlova, deo recepta, kriterijum gotovosti i šta da vrati. Radnici ne puštaju ceo test, build ni dev server (samo `npx vitest run <putanje>`). Ne koristi `isolation: "worktree"`. Rezultat radnika uvek proveriš (diff i testovi) pre nego što ga prihvatiš.

## Apsolutne zabrane
- **Git:** NE radi `git push`, `git commit`, `git add`, `git reset`, `git clean`, `git checkout`, `git switch`, `git stash`, `git restore`, `git rebase`, `git merge`, `git branch`, `git tag`, `git pull`, `git fetch`. Smeš `git status`, `git diff`, `git log`, `git show`. Runner sam pravi commit posle koraka.
- **Produkcija i deploy:** NE radi `npx convex deploy`, `npx convex dev` (ni sa `--once`: ništa ne ide ni na DEV deployment), `npx convex run`, `npx convex env`, `npx convex import`, `npx convex export`, `npx convex data`, `vercel`, ništa sa `--prod`, nijednu deploy skriptu. Ne pozivaš Convex funkcije na deploymentu iz skripti (ConvexHttpClient, fetch, curl). Ne šalješ stvarne mejlove ni poruke i ne zoveš spoljne plaćene API-je. Dozvoljeno: `npx convex codegen` (ne menja deployment) posle dodavanja ili preimenovanja modula u `convex/`. Ako codegen ne radi (mreža ili prijava), dopiši novi modul ručno u `convex/_generated/api.d.ts` po postojećem obrascu i upiši ODLUKU.
- **Tajne:** ne čitaš `.env.local` ni druge `.env*` osim `.env.example`, ne postavljaš env varijable i ne upisuješ ključeve u kod ni dokumente. Nova promenljiva okruženja dobija dokumentovan placeholder u `.env.example` (i `v.optional(v.string())` u `convex/convex.config.ts` ako je čita Convex); funkcija bez ključa je isključena i to jasno kaže korisniku.
- **Šema samo raste (widen):** nove tabele, nova `v.optional(...)` polja i novi indeksi. Ne uklanjaš i ne preimenuješ polja i tabele, opciono polje ne postaje obavezno, unija se ne sužava. Migracije pišeš kao idempotentne funkcije u serijama i dokazuješ ih testovima, ali ih **ne puštaš**.
- **Van obima — ne menjaš:**
  - Sajam: `app/sajam/**`, `components/fair/**`, `lib/fair-*`, `lib/fair-*/**`, `convex/fair*`, `convex/lib/fair*`, `lib/i18n/sr/fair-*`, `lib/i18n/sr/event-*`, `docs/events/**`, `docs/sajam/**`, `scripts/sajam/**`;
  - ScanMe Links render i harness: `components/scanme-links/**`, `lib/scanme-links*`, `convex/scanMeLinks*`, `harness/**`;
  - Venue, Memories i Links editor: `components/venue/**`, `components/memories/**`, `app/[slug]/venue/**`, `app/[slug]/editor/**`, `app/m/**`, `app/zid/**`, `convex/venue*.ts`, `convex/memories*`;
  - interni admin, osim `app/admin/usluge/meni/**` i `components/admin/menu-*`;
  - landing, prelaunch i kupovina: `app/page.tsx`, `app/prelaunch/**`, `app/ponuda/**`, `app/kupovina/**`, `components/prelaunch-*`, `components/landing-*`; `public/**`; cene drugih proizvoda;
  - `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `.agents/**`, ceo `ScanMe-Menu-Jovan-Claude-Handoff/**`, fajlovi runa u `.nocni-run/meni/` (osim fajla `STOP` u K02).

  Card resolver (`app/r/**`, `convex/cards.ts`, `convex/lib/access*.ts`) koriste i druge usluge i **sajamski QR kodovi u upotrebi**: menjaš ga samo u koracima koji to traže, kompatibilno, uz regresione testove postojećih tipova kartica. Venue rezervacije (`convex/venueReservations.ts`) su drugi proizvod: Menu rezervacije ih ne lome. AGENTS.md pravilo za Sajam važi: ako bi korak morao da promeni nešto što Sajam koristi, ne radi to, nego upiši BLOKADA.
- **Konfiguracija:** ne menjaš `package.json`, `package-lock.json`, `next.config.*`, `tsconfig.json`, `vitest.config.*`, `eslint.config.*`, `postcss.config.*`, `components.json`, `convex.json`, `proxy.ts`, `app/layout.tsx` i `app/globals.css` osim kad prompt koraka izričito kaže; `convex/convex.config.ts` samo za nove opcione env deklaracije.
- **Paketi:** NE uvodi nove pakete i ne pokreći `npm install`. Koristi postojeće: shadcn/ui u `components/ui`, `lucide-react`, `framer-motion` (GSAP samo za svrsishodan timeline), `@dnd-kit/*`, `sharp`, `culori`, `@material/material-color-utilities`, `@fontsource*`, `sonner`. Ako paket deluje neophodno, uradi bez njega i upiši ODLUKU.
- **Disciplina:**
  - NE „popravljaj" susedni kod koji nema veze sa zadatkom i ne briši tuđi kod (AGENTS.md: hirurške izmene).
  - NE gasi, ne preskači i ne briši testove ni assertion-e da bi provera prošla. Test koji proverava staro ponašanje menjaš samo namerno, sa razlogom u ODLUKAMA.
  - NE regeneriši goldene (`harness:capture`; pricing golden samo u K03).
  - NE ostavljaj pokrenut dev server ni druge procese na kraju koraka; ne gasi tuđe procese (`taskkill`, `Stop-Process`, `pkill`).
  - Privremene fajlove i pomoćne skripte drži u `tmp/meni/` (git, lint i tsc ga ignorišu); skripte piši kao `.mjs`. Ne briši fajlove van njega osim kad to zadatak traži.
  - Ne koristi alat `Workflow` ni zakazane zadatke.

## Konvencije repoa
- App Router i Server Components po defaultu; `"use client"` na najmanjoj granici. Tailwind i shadcn/ui iz `components/ui`; ikonice `lucide-react` (sa pristupačnim imenom kad svrha nije jasna iz teksta); Framer Motion za lokalne prelaze; `next/image` za slike, `next/link` za interne linkove.
- Svaki **nov** tekst koji korisnik vidi ide kroz `lib/i18n`: ključ u `Dict` interfejsu površine (`lib/i18n/types.ts`) i u `lib/i18n/sr/*` modulu, čita se sa `getDict(surface)` / `fmt(...)`. Srpski, latinica, jasan netehničkom korisniku. Postojeće Menu površine: `menu`, `menu-editor`, `menu-admin`, `ordering`, `ordering-panel`, `ordering-admin`; nove imenuj po receptu.
- Nov kod (osim kad recept kaže drugačije): čista logika u `lib/menu/**`; UI u `components/menu/**` po oblastima; novi Convex moduli sa jasnim imenima, validatori u `convex/lib/`, testovi pored modula.
- Cene: RSD u celim dinarima je izvor istine; prikaz `1.490 RSD`; EUR samo informativno, `~ 12,70 EUR`.
- Vreme i datumi: Beograd (`lib/belgrade-time.ts`); dan za analitiku po beogradskom vremenu.
- Fixtures: izmišljeni lokali („Demo restoran", „Kafana kod Mike", „Hotel Primer"), izmišljene cene, `gost@example.com`, `+381 60 000 0000`. Nikad pravi klijenti, pravi kontakti ni podaci iz sajamskih dokumenata. Repo je **javan**.
- Teme: klijentski panel, editor i konobarski panel poštuju temu aplikacije (`data-theme="light|dark"` na `<html>` i klasa `dark`); javni meni koristi paletu lokala (svetlu ili tamnu), ne temu aplikacije.
- Tri identiteta, jedan kvalitet (detalji u `docs/menu/MENU-UX.md`):
  1. **klijentski panel i editor** — ScanMe identitet: topao svetao okvir, crna i ScanMe zelena kao jaki akcenti, mirne zaobljene kartice (mockup 00 i 01; obrasci iz `docs/admin/DASHBOARD-STANDARD.md`, bez gamifikacije i 3D-a); jedan pažljivo osmišljen način rada, kontekstualne kontrole, napredno tek kad zatreba;
  2. **javni meni** — identitet lokala, nikad podrazumevana ScanMe paleta; brz, čitljiv, mobilni prvi; ne sme da izgleda kao generički template; prestižni lokal dobija miran, tipografski rezultat;
  3. **konobarski panel** — operativan: visok kontrast, glavne radnje najmanje 48 px, stanje uvek ikonica + boja + tekst, živi tajmeri, najmanje koraka do radnje.
- Za sve površine: desktop 1440, tablet 1024 i 768, telefon 390, projektovani namerno, bez vodoravnog skrola; tastatura i vidljiv fokus; kontrast teksta najmanje 4.5:1; mete na telefonu najmanje 44 px; `prefers-reduced-motion`; loading, empty, error i offline stanja gde imaju smisla; pokret samo objašnjava promenu stanja.
- Korekcije mockupova i lista „nikad kao podrazumevano" (master §20) su u `docs/MENI-PLAN.md` §3 i važe uvek.

## Testovi
- Vitest radi u `edge-runtime` okruženju, **bez DOM-a**. Logiku izdvoji u čiste funkcije i testiraj nju; markup proveravaj kroz `renderToStaticMarkup` (po uzoru na `components/menu/menu-render.test.tsx`), Convex kroz `convex-test` (po uzoru na `convex/menu.test.ts` i `convex/orderingRequests.test.ts`).
- Pokreću se samo fajlovi iz `include` u `vitest.config.ts`: `convex/**/*.test.ts`, `lib/**/*.test.ts`, `components/menu/**/*.test.tsx` (mora `.tsx`), `components/admin/**/*.test.tsx` i ostali navedeni. Test u `app/**`, `components/ordering/**` ili `components/client-panel/**` se NE pokreće: logiku stavi u `lib/menu/**`, a komponentne testove u `components/menu/**`.
- Svaka nova Convex query/mutation/action ima test dozvoljenih i zabranjenih radnji po ulogama i test tenant izolacije (drugi nalog, drugi lokal, pogrešan QR ili PIN ne vidi i ne menja tuđe podatke).
- Ciljano pokreći `npx vitest run <putanje>`; ceo skup pred kraj koraka.

## Izlog (dev rute) i vizuelna provera
- Ekrani iza prijave se proveravaju kroz izlog: `/dev/menu-editor-preview`, `/dev/menu-public-preview`, `/dev/menu-lokal-preview`, `/dev/menu-konobar-preview`, `/dev/menu-panel-preview`. Rute montiraju **prave** komponente sa tipiziranim fixtures, ne traže prijavu, u produkciji vraćaju `notFound()` (`if (process.env.NODE_ENV === "production") notFound();`, kao postojeće dev rute) i nisu indeksirane. Parametri su u `docs/MENI-PLAN.md` §7; nepoznat parametar daje podrazumevano stanje, nikad grešku; postojeći parametri (`state=empty`, `design=dark`) i dalje rade. UI praviš kao prezentacione komponente (podaci kroz props); stranice samo povezuju upite. Svaki korak koji menja UI dodaje svoja stanja u izlog.
- Dev server: `npm run dev -- -p 3170` u pozadini (Bash alat sa `run_in_background`); sačekaj da `http://localhost:3170/dev/menu-public-preview` odgovori; na kraju ga ugasi alatom `TaskStop`. Ne puštaj `npm run harness:check` dok tvoj dev server radi (runner ga pušta posle koraka).
- Snimci: `node .nocni-run/meni/alati/snimi.mjs --url http://localhost:3170 --rute "<rute>" --sirine 1440,390 --teme svetla,tamna --izlaz output/playwright/meni/<ID>`; dodaj `1024,768` kad korak traži tablet. Alat ispisuje JSON po snimku (status, vodoravni skrol, greške konzole, male mete, slike bez alt). Pogledaj snimke (Read na PNG) pre nego što o njima išta tvrdiš.
- Playwright MCP (kad je dostupan) koristiš za interakcije. Za prevlačenje, dugi pritisak, tastaturu, modale, tajmere i offline možeš da napišeš sopstvenu Playwright skriptu u `tmp/meni/` (`.mjs`, `import { chromium } from "playwright"`) i pokreneš je sa `node`.
- Pravi `/admin`, klijentski panel i konobarski panel traže prijavu: ne prijavljuješ se, ne unosiš lozinke i ne menjaš auth tok.
- Snimci idu u `output/playwright/meni/` (git ih ignoriše).
- Bez browsera (alat ne radi): upiši to u progress i osloni se na testove.

## Definicija završenog koraka
Korak nije gotov dok ne prođu:

    node .nocni-run/meni/alati/typecheck.mjs
    npx eslint --ignore-pattern ".nocni-run/**"
    npx vitest run --testTimeout=30000 --hookTimeout=60000
    npm run harness:namespace

Runner posle tebe ponovo pušta te provere, plus `npm run build` i `npm run harness:check` (zlatni snimci ScanMe Links renderera); ako padnu, vratiće ti grešku u istoj sesiji. Ako si menjao rute ili server kod, pusti i `npm run build` pre kraja (ugasi dev server pre toga). Provera ili test koji su padali i PRE runa (`.nocni-run/meni/baseline.txt`) nisu tvoja odgovornost, ali ih ne kvari dodatno.

Ako `typecheck` prijavi grešku iz `.next/dev/types` (zastareli tipovi dev servera posle preimenovanja rute), obriši samo folder `.next/dev/types` ili ponovo pokreni dev server.

Ako nešto realno ne može (ograničenje platforme, fali podatak ili ključ, traži odluku vlasnika), napravi ostatak i upiši `BLOKADA:` sa tačnim razlogom. Blokada je ispravan ishod, hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/MENI-PROGRESS.md`
```
## <ID> — <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je urađeno:** 3–8 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Novi paketi:** nema (run ne uvodi pakete)
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Snimci:** folder i šta pokazuju (ili „nema UI izmena")
**Rezultat provere:** typecheck, lint, test, namespace — prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom
**Za Jovana ujutru:** šta da proveri ručno
```
Dopisuješ na kraj i ne brišeš tuđe sekcije.
