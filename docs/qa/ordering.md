# Ordering — QA, pristupačnost, perf (TASK-70b)

RFC-004 §4 TASK-70b. Sve provere u ovom dokumentu su rađene u pregledaču, na
**živim** stranicama servisiranim sa `next dev` (localhost:3000) protiv
stvarnog Convex deployment-a `expert-pelican-136`, sa podacima iz
`orderingDevSeed:seed` (`npx convex run orderingDevSeed:seed --deployment
expert-pelican-136`, `CONVEX_DEPLOY_KEY=""`): biznis "Poručivanje primer —
Kafana Dva Jelena", kôd lokala `905D6HBG`, kartice `R7JR1F81` (Sto 7) i
`M3ZMP68A` (Sto 12), PIN `1234`. Gost je uvek ulazio kroz pravi hop
`/r/<cardCode>/o?venue=<venueCode>`, nikad direktno na `/o/<code>`.

Otvorene stranice: `/r/R7JR1F81/o?venue=905D6HBG` → `/o/905D6HBG` (gost),
`/r/M3ZMP68A/o?venue=905D6HBG` → `/o/905D6HBG` (drugi gost, isti kod, drugi
sto), `/panel/905D6HBG` (panel). Širine: 1280×800 (tablet od 10"), 375×812
(telefon), i podrazumevana širina pregledača za merenja koja ne zavise od
layouta. Obe teme (svetla i tamna, preko dugmeta u panelu/gostu) su
provereno.

## 1. Panel — upotrebljivost pod pritiskom

**Cilj dodira dugmadi Prihvati / Stiže / Završeno.** Izmereno stvarnim
`getBoundingClientRect()` na živom panelu (ne po pretpostavci iz klase):
svako od dugmadi Prihvati / Stiže / Završeno je **413×48px** na 1280px širini
i **276×48px** na 375px širini. TASK-68 je tvrdio 48px — **potvrđeno merenjem,
tačno**. Ostala dugmad u panelu (Pauziraj/Nastavi, Zatvori smenu, Uključi
zvuk) su takođe 48px na obe širine; nema dugmeta u panelu ispod 44px.

**Tablet 1280×800 i telefon 375×812.** Na 1280px red čekanja je dvokolonska
mreža (`grid-cols-2`, po sto); na 375px je jednokolonska, bez horizontalnog
skrola (`document.documentElement.scrollWidth === clientWidth === 375`
izmereno skriptom). Nijedno dugme se ne seče niti prelama van vidljive
oblasti ni na jednoj širini.

**Red čekanja je prohodan tastaturom.** Sva dugmad u redu su prirodni
`<button>` elementi bez `tabindex` trikova — redosled tabulacije prati
vizuelni/DOM redosled bez posebnog koda za to. Provereno stvarnim `Tab`
pritiscima (ne samo čitanjem DOM-a): fokus vidljivo prelazi kroz
Pauziraj → Zatvori smenu → Uključi zvuk → Prihvati (Sto 7, prvi zahtev) →
..., sa vidljivim fokus-prstenom pregledača (`outline: solid 1.6px`) na
svakom dugmetu.

**Novi zahtev se najavljuje preko `aria-live`.** U `waiter-panel.tsx`
postoji `<p aria-live="assertive" className="sr-only">{announcement}</p>`
koja se puni na svaki novi zahtev. Provereno uživo: dok je panel otvoren u
jednom tabu, iz drugog taba je poslat poziv konobaru sa stvarnog gosta (Sto
12, kroz pravi hop). Panel je primio zahtev **uživo, bez osvežavanja**, i
`aria-live="assertive"` region je sadržao tačno **"Nov zahtev — Sto 12"**.
Ovo je jedini kanal za konobara koji ne gleda ekran non-stop kad je zvuk
utišan — radi.

**Zvuk posle ponovnog učitavanja.** Već zabeleženo u
[BLOCKED.md](../tasks/BLOCKED.md) #5 (ponašanje pretraživača, ne greška):
potvrđeno uživo — posle učitavanja iz kolačića (bez PIN gesta) panel
prikazuje baner "Uključi zvuk" i zvuk radi tek posle tog dodira. Nije
ponovo popravljano ovde jer već ima ispravan fallback (baner).

## 2. Gost, `/o/<code>`

**Prohodnost tastaturom i pristupačna imena.** Sva dugmad su prirodni
`<button>`; dugmad za količinu nose eksplicitan `aria-label` po stavci
(npr. "Povećaj količinu — Domaće pivo 0.5"), provereno u accessibility stablu
uživo, ne samo čitanjem izvora. `Tab` navigacija stvarno stiže do razlog-čipova
(npr. do "Pomoć", sa `aria-pressed="false"` koje se menja na dodir/Enter).
Cilj dodira: razlog-čipovi i dugmad za količinu su **44×44px** na 375px
širini (izmereno), dugme za poziv/porudžbinu **48px** visine — sve iznad
minimuma za dodir jednom rukom.

**"Poručivanje trenutno nije dostupno" — NALAZ, POPRAVLJENO.** Stanje se
prikazivalo ispravno vizuelno, ali sekcija nije bila u `aria-live` regionu:
gost čiji je čitač ekrana već na stranici (npr. je čekao dok se smena
zatvarala) ne bi čuo ništa kad se dostupnost promeni iz `true` u `false` —
poruka bi samo tiho promenila DOM. Ovo je tačno slučaj koji zadatak traži:
"gost koji ne vidi ekran mora da sazna da porudžbina nema kome da ode."

Popravljeno u [`components/ordering/ordering-guest.tsx`](../../components/ordering/ordering-guest.tsx):
dodat `role="status" aria-live="polite"` na sekciju koja se prikazuje kad
`acceptingRequests` postane `false` (samo na tu granu — grana za "nema
identiteta" je fiksna za ceo boravak na stranici, iz kolačića, i ne menja se
uživo, pa joj ne treba live region). Provereno uživo: sa otvorenim gostom na
Sto 12, panel je pauziran preko dugmeta "Pauziraj poručivanje"; gost je bez
osvežavanja prešao u stanje "Poručivanje trenutno nije dostupno", i skripta
je potvrdila `role="status"` + `aria-live="polite"` na tom elementu sa punim
tekstom poruke. Vraćeno u "Nastavi poručivanje" posle provere.

**Živi status (Poslato → Prihvaćeno → Stiže).** `ul aria-live="polite"` u
`request-status-list.tsx` već postoji i najavljuje promene statusa; poziv
konobaru poslat sa Sto 12 je odmah prikazao "Poziv je poslat konobaru." i
karticu "Poslato" na gostovoj strani (uživo, bez osvežavanja) — potvrđeno u
accessibility stablu.

## 3. Kontrast — AA

Automatska provera je urađena skriptom u pregledaču (WCAG relativna
luminantnost, formula iz specifikacije), nad **svim** vidljivim tekstualnim
čvorovima na obe stranice, u obe teme, sastavljajući stvarnu pozadinu kroz
sve providne slojeve roditelja (transparentne/`rgba` pozadine se ne uzimaju
kao belo po difoltu — kompozituju se sa pravim roditeljem). Pragovi: 4.5:1 za
normalan tekst, 3.0:1 za veliki tekst (≥24px ili ≥18.66px bold).

| Stranica | Tema | Neuspešnih elemenata |
|---|---|---:|
| `/panel/905D6HBG` | tamna | 0 |
| `/panel/905D6HBG` | svetla | 0 |
| `/o/905D6HBG` | svetla | 0 |
| `/o/905D6HBG` | tamna | 0 |

Najniži pojedinačni odnos primećen ručnom proverom: dugme "Prihvati"
(pozadina `#c6ff4a`, tekst `rgb(11,12,10)`) — **~16.6:1**, daleko iznad AA.

**Napomena o "akcentnoj boji lokala."** Zadatak traži merenje na stvarnim
tokenima lokala jer akcentna boja po lokalu može da padne ispod AA. Za
poručivanje u v1 to nije primenjivo: `/o/[code]` i `/panel/[venueCode]` ne
čitaju nikakvu po-lokalu podesivu boju (nema `accentColor`/`brandColor` polja
u `orderingConfig` niti u kodu ovih stranica — provereno grep-om). Obe
stranice koriste **isti, globalni** dizajn-token skup (isti kao ostatak
aplikacije) za svaki lokal; to je token koji je gore izmeren, u obe teme, sa
nulom neuspeha. Ako se po-lokalu boja ikad doda ovom proizvodu, ova provera
mora da se ponovi na toj boji — ovde zabeleženo da to danas ne postoji.

## 4. Merenje sa brojevima

Vidi [docs/perf/ordering-first-paint.md](../perf/ordering-first-paint.md) za
metodologiju, uzorke (n=10 po stranici) i p50/p95. Presuda tamo: gost p50
425ms / p95 480ms, panel (topao) p50 286ms / p95 361ms, na `next dev` protiv
stvarnog Convex deployment-a — nije produkcioni broj, ali je pošten pod
ograničenjima opisanim u tom dokumentu (Paint Timing API nije dostupan u
ovom harnessu jer se automatizovani tab prijavljuje kao `visibilityState:
"hidden"`, pa Chromium ne beleži paint; korišćen je `domInteractive` kao
zamena, obrazloženo tamo).

## Sažetak nalaza

| # | Nalaz | Status |
|---|---|---|
| 1 | Dugmad Prihvati/Stiže/Završeno su stvarno 48px (ne samo po tvrdnji) | Potvrđeno, bez izmene |
| 2 | Red čekanja je tastaturom prohodan sa vidljivim fokusom | Potvrđeno, bez izmene |
| 3 | Nov zahtev se najavljuje preko `aria-live="assertive"` u panelu | Potvrđeno, bez izmene |
| 4 | Kontrast AA na oba ekrana, obe teme, svi tekstualni čvorovi | Potvrđeno, bez izmene |
| 5 | "Poručivanje trenutno nije dostupno" nije bilo u live regionu | **Popravljeno** (`role="status" aria-live="polite"` u `ordering-guest.tsx`) |
| 6 | Paint Timing API nedostupan u ovom QA harnessu (pozadinski tab) | Zabeleženo kao ograničenje alata, ne aplikacije; `domInteractive` korišćen kao zamena |
| 7 | Nema po-lokalu podesive akcentne boje u v1 poručivanja | Zabeleženo — provera se ponavlja ako se ta mogućnost doda |

Ništa iz ovog taska nije dodalo novu funkcionalnost; jedina izmena koda je
popravka #5.
