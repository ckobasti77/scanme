# ADMIN-14 — lokalna verifikacija

Datum: 2026-09-15. Scope: kompletan ADMIN-14 Finansije, neophodne veze sa postojećim ADMIN-03/06/11 izvorima i isti account-scoped obračun na profilu klijenta.

## Preflight i zaštita opsega

- Grana: `codex/admin-v1`.
- Početni HEAD: `15073bb456803f3a5bee784742adda6015f96216`.
- Početni i završni jedini vanopsežni untracked fajl: `output/pdf/scanme-menu-cenovnik-i-projekcija.pdf`.
- PDF nije čitan, menjan ili stage-ovan. Nisu korišćeni reset, stash ili odbacivanje postojećih izmena.
- Predviđen je jedan završni lokalni commit: `feat(admin): implement ADMIN-14 finance operations`; konačan hash je u Git istoriji i završnom izveštaju.

## Finansijski ugovor i bounded model

- Naplaćeno je cash-basis: receipt u `paidAt` mesecu, minus reversal; refund ostaje zasebna stavka. Godišnja uplata se ne razmazuje po mesecima.
- Očekivano počinje sledećim kalendarskim mesecom. Aktivne/grace pretplate koriste samo eksplicitni agreement/discount/waiver, a preostali potvrđeni fizički iznos ostaje `undated` dok stvarni datum ne postoji.
- Profit je `received after reversal - refunds - known direct costs`. Rezultat je `null/incomplete` kada nedostaje obavezni trošak; upisan trošak od 0 RSD je poznata činjenica.
- Sve granice su Europe/Belgrade poluotvoreni intervali `[start, end)`, uključujući DST, kraj meseca i prelaz godine.
- Payment allocations nose immutable category/service/period snapshot. Jedan digest/list row predstavlja jednu uplatu; denormalizovani filter redovi ne menjaju iznos niti dupliraju uplatu.
- Mesečni/dnevni receipt rollup-i, expected rollup-i, cost rollup-i i tačni coverage facts drže read put indeksiranim. Javne liste koriste cursor pagination; javni produkcioni moduli nemaju `.collect()`, per-row join ili filter posle proizvoljno odsečene stranice.
- Backfill seam je interni, cursor-bounded na najviše 25 stavki, retry-safe i ima read-only `dryRun`. Nije pokrenut nad deploymentom.

## Obavezna matrica dokaza

Brojevi odgovaraju 31 scenariju iz zadatka. Glavni dokazi su u `convex/adminFinance.test.ts`, `lib/admin-v1/finance.test.ts`, `components/admin/admin-finance.test.tsx` i navedenim regresijama.

| # | Dokaz |
| --- | --- |
| 1–3 | Cash-basis i mixed-allocation testovi: samo stvarna uplata ulazi u zbir, kategorije prate allocation iznose, a mixed SaaS/Premium uplata ostaje jedan list row. |
| 4 | Godišnja uplata ulazi cela u `paidAt` mesec; detalj čuva `annual`, `coveredStart` i `coveredEnd`. |
| 5–6 | Delimični refund je allocation-exact, immutable i ne briše/duplira uplatu; reversal uklanja pogrešan receipt bez pretvaranja u refund ili drugi cash događaj. |
| 7–10 | Expected testovi počinju sledećim mesecom, ne menjaju Naplaćeno, projektuju aktivni renewal, a inactive/cancelled izvore uklanjaju. |
| 11–13 | Aktivna fizička operacija projektuje samo `requiredMinor - settledMinor`; cancelled/nepostojeća draft operacija ne ulazi; stvarno nepoznat datum ostaje `undated`. |
| 14–15 | Čisti filter ugovor odbija service filter za Profit, a Naplaćeno/Očekivano prihvataju Links/Review/Menu samo unutar SaaS kategorije; filtrirana payment lista je server-side. |
| 16–18 | Fizički profit odbija stvarni proizvodni trošak i refund; SaaS odbija poznati hosting/backend; Premium ima samo receipt/refund i nema izmišljeni rashod. |
| 19–21 | Missing production/hosting/backend/classification daje `null/incomplete`; eksplicitna nula daje complete; total nasleđuje incomplete iz uključene kategorije. |
| 22 | Friend tag sam ne menja cenu; selektivni waiver target dokazuju ADMIN-14 test i ADMIN-03 regresije iz `convex/subscriptions.test.ts`. |
| 23–24 | Stvarni individualni agreement menja samo buduće obaveze; istorijski receipt/detalj ostaje na immutable allocation snapshotu. |
| 25 | Metode plaćanja sabiraju isti Naplaćeno denominator; largest-remainder raspodela daje stabilnih tačno 100,00% i UI prikazuje denominator i istorijski period. |
| 26–27 | Server baca grešku ako chart bucket-i ne daju glavni zbir; UI ima tabelarni fallback. Category zbir je eksplicitno jednak vršnoj Naplaćeno sumi. |
| 28 | Unit testovi pokrivaju Belgrade DST mart/oktobar, poluotvorenu mesečnu granicu, prelaz decembar/januar i prestupni februar. |
| 29 | Globalni i account-scoped rezultat za isti jedini nalog poredi collected, expected, profit, categories i methods; profil poziva isti `overview` sa `accountId`. |
| 30 | Negativni testovi pokrivaju unauthenticated/non-admin, cross-account reference, negativan iznos, pogrešnu valutu, idempotency conflict, refund overallocation i correction bez razloga. Audit/cost istorija ostaje append-only kroz cost/correction/reversal redove. |
| 31 | Fixture sa 75 uplata prolazi tri backfill strane od po 25 i list strane od po 17 bez preskakanja ili duplikata. Statička provera potvrđuje nula produkcionih `.collect()` poziva i indeksirane/materializovane read putanje. |

## Komande i ishodi

```text
npx.cmd convex codegen
npx.cmd vitest run convex/adminFinance.test.ts components/admin/admin-finance.test.tsx lib/admin-v1/finance.test.ts convex/adminV1.test.ts lib/admin-v1/contracts.test.ts convex/subscriptions.test.ts convex/adminOperational.test.ts lib/admin-v1/admin-clients-ui.test.ts convex/adminClientProfiles.test.ts convex/adminOrders.test.ts
npx.cmd tsc -p convex/tsconfig.json --noEmit
npm.cmd run check
git diff --check
git diff --cached --check
```

| Provera | Rezultat |
| --- | --- |
| ADMIN-14 i relevantne ADMIN-01/03/06/11 regresije | **PASS, 148/148 testova u 10/10 fajlova**. ADMIN-14 ciljano: **26/26 u 3/3 fajla**. |
| Strogi Convex TypeScript | **PASS**, `npx.cmd tsc -p convex/tsconfig.json --noEmit`. |
| Convex codegen | Finalno **PASS**: definicije/server kod i component bundle su generisani, stanje dev deploymenta je preuzeto, analysis handshake je prikazao `Uploading functions to Convex`, lokalni TypeScript bindings su generisani i TypeScript je prošao. Nije pozvan `convex deploy`/`convex dev` niti `finishPush`. Jedan međukorak je uhvatio TypeScript narrowing grešku u novom coverage indeksu; ispravljena je i finalni codegen je prošao. |
| ESLint / Next build / namespace / golden harness | **PASS** kroz završni `npm.cmd run check`; dva ranija, vanopsežna warning-a (`venue-admin.tsx` i `purchaseLifecycle.test.ts`), nula grešaka; 43 statičke stranice; namespace gate pass; **177 slučajeva × 2 viewporta** byte-for-byte. Prvi pokušaj check-a je prekinuo samo zato što je browser-QA dev server još držao Next dev lock; taj verifikovani proces je ugašen i cela komanda je ponovljena uspešno. |
| Whitespace i staged pregled | `git diff --check` i završni `git diff --cached --check` moraju biti PASS; eksplicitna ADMIN-14 lista se pregleda pre commita. |

## Browser QA

Korišćena je već postojeća Opera sa jasno označenom dev-only rutom `/dev/admin-finance-preview`, koja renderuje istu produkcionu `FinanceSurface` komponentu. Produkcioni `/admin/finansije` nije dobio preview/auth bypass. Browser niti browser dependency nisu instalirani ili preuzeti.

| Viewport | Rezultat |
| --- | --- |
| 1440×1000 | Tri summary kartice, tabovi, periodi/filteri, chart + metode i desktop tabela; `scrollWidth == clientWidth`, bez horizontalnog overflowa. |
| 1920×1080 | Ista hijerarhija i tri kartice, chart/method panel i tabele bez horizontalnog overflowa. |
| 390×844 | Summary/category redovi se slažu vertikalno, payment tabela prelazi u tri kartice, kontrole se prelamaju bez horizontalnog overflowa. Profil klijenta takođe nema horizontalni overflow. |
| 375×812 | Tri payment kartice, nula vidljivih desktop payment tabela, detalj širine 343 px sa vertikalnim skrolom i bez horizontalnog overflowa. |

Interakcije: proverena su sva tri taba, istorijski/budući period, Links filter, odsustvo service filtera u Profitu, chart `details` tabela, stvarni payment-method denominator, mixed godišnja uplata, refund razlog/actor audit, cost dijalog, incomplete stanje i client-profile sažetak/global link. Escape zatvara oba dijaloga i fokus vraća payment/cost okidaču. Prvi Tab fokusira skip-link vidljivim `2px solid` outline-om. Kompajlirani CSS sadrži sedam `prefers-reduced-motion` pravila; nove tranzicije i dijalozi imaju `motion-reduce` gašenje. Posle hydration ispravke nije zabeležena nijedna nova console greška.

## Operativne granice

- Nije pokrenut ADMIN-14 backfill/migracija nad dev ili prod deploymentom; data mutation testovi rade isključivo u izolovanom `convex-test` okruženju.
- Nema deploya, seeda, live migracije, reseta, push-a, Zoho/ADMIN-09C rada niti provider integracije.
- Nema tvrdnje o produkcionoj latenciji, trošku, poreskom/FX obračunu ili stvarnim cenama koje nisu eksplicitno evidentirane.
- Jedini preostali ručni korak je zasebno odobren dry-run i kasniji cursor backfill prema `ADMIN-14-MIGRACIJA.md`; nije deo ovog lokalnog commita.

**ADMIN-15 nije započet.**
