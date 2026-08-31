# Blokirane odluke i pitanja za vlasnika

Ovde se upisuju odluke koje traže vlasnika, sa brojem taska. Task nastavlja sa
ostatkom posla i ne pogađa.

---

## TASK-28 — motor u marketing i ponudu, gašenje SAAS_PRICING

### 1. Privremena semantika tirova na marketing/ponuda površini (za potvrdu)

`SAAS_PRICING` je ugašen. Stari model je imao **dve usluge × dva tira po usluzi**
(`review`/`links` × `starter`/`premium`), gde je svaki tir imao svoju cenu.
Novi motor (`lib/pricing`) nema tir po usluzi — usluga ima **jednu** cenu
(Osa A), a plan (`basic`/`premium`/`enterprise`) je **nalog-nivo** (Osa B).

Da bih ugasio `SAAS_PRICING` a da ne prepravljam ceo tok (to je zadatak 7–8 iz
§4), preslikao sam postojeća dva plaćena tira na osu plana:

- `starter` → plan **basic** (besplatan plan; cena = samo cena usluge)
- `premium` → plan **premium** (cena usluge + linija Premium plana)

Sve cene sada dolaze iz motora (`saasFirstTermPrice` u `lib/scanme-pricing.ts`,
koji zove `price()` iz `lib/pricing`). Marketing „Od" cene, konfigurator i
pregled čitaju isti motor — jedan izvor cene.

**Pitanje za vlasnika:** ovo je *privremeno* preslikavanje dok se ne izgrade
koraci 7–8 (Basic/Premium kolone, četvorokoračni tok). Kopija na karticama i
dalje kaže „Starter/Premium" po usluzi; semantika je sada „nalog plan". Kada
dođu zadaci 7–8, potvrditi da se marketing stranica u potpunosti prebacuje na
model „pet usluga (Osa A) + plan (Osa B)" i da se `PublicTierId`
(`starter`/`premium`) povuče iz UI-ja (ostaje samo radi parsiranja starih
v1–v4 offer URL-ova). Ništa nije zakucano — brojevi su placeholderi u
`lib/pricing/constants.ts`.

### 2. „−17%" bedž na godišnjem tumblu (`components/pricing-plans.tsx`)

Bedž „−17%" pored „Godišnje" je zakucan marketinški procenat, nije cena, pa ga
motor ne računa. Ostavljen je netaknut (van opsega zadatka 2). Kada se cene
popune, proveriti da li stvarna godišnja ušteda po motoru odgovara tom broju,
ili ga zameniti izračunatom vrednošću.

### 3. RFC-002 dokument je bio van stabla

`docs/architecture/RFC-002-pricing-and-purchase.md` nije postojao ni na
`feat/venue-memories` ni na `claude/rfc-002-pricing-purchase-9c065c` — živeo je
samo kao *neispraćen* fajl u worktree-u `rfc-002-pricing-purchase-9c065c`
(deliverable TASK-26 nije bio komitovan). Uneo sam ga u stablo u ovom komitu jer
ga svi naredni zadaci (29–39) referenciraju. Ako postoji novija verzija kod
vlasnika, prepisati.

### 4. `harness:check` pada zbog baga u Node-u v24.8.0 (BLOKIRA `npm run check`)

**Ovo NIJE greška u kodu ovog zadatka i NIJE drift goldena.** `npm run check`
prolazi kroz `lint`, `build`, `harness:namespace` i sve testove
(`vitest`: 540 prošlo, uključujući cenovnu zlatnu tabelu), ali `harness:check`
ne može da se izvrši: dev server se **nativно** ruši čim aplikacija napravi
prvi odlazni TLS poziv tokom SSR-a:

```
next-server (v16.2.12): X509_STORE *NewRootCertStore(void) at src\crypto\crypto_context.cc:914
Assertion failed: (1) == (X509_STORE_add_cert(store, cert))
```

Uzrok: `proxy.ts` (Convex Auth middleware) zove `convexAuth.isAuthenticated()`
na svakoj ruti, što preko `undici` fetch-a otvara HTTPS ka Convex deploy-u.
Node v24.8.0 se ruši u `NewRootCertStore` (bundled root-cert store) — poznat
bag u toj verziji Node-a. Deterministički se reprodukuje na svakom pokretanju.

**Provereno da nije moje:** ništa što sam dirao (`lib/pricing`,
`lib/scanme-pricing`) ne uvozi se na render putanji goldena (dev galerija /
`components/scanme-links`), a `harness:namespace` prolazi — moje izmene ne mogu
da promene ScanMe Links goldene. TASK-27 nikad nije uspeo da pokrene
`harness:check` (port 3199 zauzet), pa je ovo prvi put da se bag uopšte vidi.

**Šta sam probao (bez uspeha, bez trajnih izmena):** `--use-system-ca` i dalje
ruši (Node svejedno gradi bundled store); `--use-openssl-ca` bi ugasio
proveru sertifikata na Windows-u (bezbednosna izmena — nisam je radio).

**Odluka za vlasnika (jedno od):**
1. Pokrenuti pod Node LTS-om (v22 ili v20) gde bag ne postoji — najčistije.
2. Nadograditi Node na zakrpljenu v24.x kad izađe.
3. Prihvatiti da `harness:check` ostaje van dohvata na ovoj mašini i pokretati
   goldene u CI-ju sa ispravnim Node-om.

Do te odluke, `harness:check` (a time i `npm run check` u celini) ostaje crven
iz čisto sredinskih razloga; sve ostalo u lancu provere je zeleno.
