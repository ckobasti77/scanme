# =============================================================================
#  NightRun.ps1  --  nocni lanac TASK-66 .. TASK-70b (+ TASK-59), pa deploy.
#
#  Pokretanje:  cd "C:\Users\admin\Desktop\Web Dev Projects\scanme-mvp"
#               powershell -ExecutionPolicy Bypass -File .\scripts\tasks\NightRun.ps1
#
#  Bezbednosne mere, jer niko ne gleda:
#   - lanac STAJE na prvom crvenom (pad agenta ILI pad "npm run check").
#   - svaki task je zaseban commit i push => tacka za povratak.
#   - Fable se koristi TACNO JEDNOM (TASK-68) i tek kao 4. korak, da su tri
#     taska vec bankovana ako Fable pojede budzet i prekine sesiju.
#   - deploy na produkciju ide SAMO ako su svi koraci prosli i ako su
#     "npm run check" i ceo vitest zeleni.
#   - NE pusta TASK-60 (perf merenje trazi nadzor), ni TASK-61 i TASK-71
#     (terminalni flipovi; 61 dira access.ts i sest Record<ServiceType> mapa).
#
#  Napomena o zastavicama: iz ovog okruzenja ne mogu da proverim da li tvoj
#  CLI ima --effort i rezim (plan/goal/auto) kao zastavice. --model je dokazan
#  iz tvog Prompts.ps1. Zato effort i rezim idu KAO TEKST na pocetku prompta.
#  Ako tvoj CLI ima te zastavice, upali $UseFlags nize i dopuni $FlagFor.
# =============================================================================

param([string[]]$From)      # npr:  -From 68   ili  -From 68,69,70
$ErrorActionPreference = 'Continue'

# ----------------------------- podesavanja -----------------------------------
$Repo      = "C:\Users\admin\Desktop\Web Dev Projects\scanme-mvp"
$Remote    = "aleksadjor3"
$Branch    = "feat/venue-memories"
$ProdRemote= "origin"
$ProdBranch= "main"
$ClaudeExe = "claude"
$BaseArgs  = @('--permission-mode','bypassPermissions')
$DoDeploy  = $true        # $false ako neces deploy na kraju
$UseFlags  = $false       # $true samo ako tvoj CLI ima --effort i rezim
# -----------------------------------------------------------------------------

$LogDir = Join-Path $Repo "scripts\tasks\logs"
$Sum    = Join-Path $LogDir "NIGHT-SUMMARY.md"

Set-Location $Repo
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Say([string]$m, [string]$c = 'Gray') { Write-Host $m -ForegroundColor $c }

# Next.js 16 ODBIJA da digne drugi dev server iz istog direktorijuma, cak i na
# drugom portu. Zato harness:check (koji dize svoj na 3199) puca dok "next dev"
# radi na 3000. Gasimo ga pre provere i vracamo posle -- admin sesija je kolacic
# u browseru i prezivljava restart.
function Stop-Dev {
    $pids = @()
    foreach ($port in 3000,3199) {
        $pids += (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess
    }
    $pids = $pids | Sort-Object -Unique
    foreach ($procId in $pids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
    if ($pids) { Start-Sleep -Seconds 2; Say "    dev server ugasen (PID: $($pids -join ', '))" 'DarkGray' }
}
function Start-Dev {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $Repo -WindowStyle Minimized
    Start-Sleep -Seconds 8
    Say "    dev server vracen na localhost:3000" 'DarkGray'
}
function Note([string]$m) { $m | Add-Content -Path $Sum -Encoding UTF8 }

# ------------------------------- preflight -----------------------------------
Say "=== PREFLIGHT ===" 'Cyan'
# NE gasimo node: vlasnik je ostavio "next dev" na localhost:3000 sa prijavljenom
# admin sesijom, da agent moze da proverava u browseru. Ako harness zatrazi port
# i pukne, agentu je u preambuli dozvoljeno da ga privremeno ugasi i vrati --
# admin sesija je kolacic u browseru i prezivljava restart servera.
$devUp = $false
try {
    $devUp = (Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue)
} catch { $devUp = $false }
if ($devUp) { Say "  dev server radi na localhost:3000 -- ostavljam ga za browser proveru" 'Green' }
else        { Say "  dev server NIJE na localhost:3000 -- agent radi bez browser provere" 'Yellow' }

# Zaostale git brave i privremeni objekti (ostaju kad se git prekine ili kad
# ga pokrene proces koji ne sme da brise). Bez ovoga svaka git komanda puca.
$stale = @()
$stale += Get-ChildItem -Path (Join-Path $Repo ".git") -Filter "*.lock" -File -ErrorAction SilentlyContinue
$stale += Get-ChildItem -Path (Join-Path $Repo ".git\objects") -Filter "*.lock" -File -Recurse -ErrorAction SilentlyContinue
$stale += Get-ChildItem -Path (Join-Path $Repo ".git\objects") -Filter "tmp_obj_*" -File -Recurse -ErrorAction SilentlyContinue
foreach ($f in $stale) { Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue }
if ($stale.Count -gt 0) { Say "  ocisceno $($stale.Count) zaostalih git fajlova (brave, tmp objekti)" 'Yellow' }

git worktree prune | Out-Null

$cur = (git rev-parse --abbrev-ref HEAD).Trim()
if ($cur -ne $Branch) { Say "STOP: grana je '$cur', ocekivana '$Branch'." 'Red'; exit 1 }
# Logovi lanca se ne racunaju u "prljavo stablo" -- skripta ih sama pise.
$dirty = git status --porcelain -- . ':(exclude)scripts/tasks/logs'
if ($dirty) { Say "STOP: radno stablo nije cisto." 'Red'; $dirty; exit 1 }

$startSha = (git rev-parse --short HEAD).Trim()
"# Nocni lanac -- $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Set-Content -Path $Sum -Encoding UTF8
Note "Pocetni commit: $startSha na $Branch"
Note ""
Note "| # | Task | Model | Effort | Rezim | Ishod | Min | Commit |"
Note "|---|------|-------|--------|-------|-------|-----|--------|"
Say "  ok -- $Branch @ $startSha, stablo cisto" 'Green'

# ------------------------------- preambula -----------------------------------
$Preamble = @'

--- OBAVEZNO PRE POCETKA ---
Procitaj docs/tasks/AGENT-PREAMBLE.md i postuj ga doslovno do poslednje tacke.
To su komande koje radis sam, gejtovi koji moraju proci, sta ne smes da diras,
i kako proveravas u browseru. Ne pocinji dok ga nisi procitao.
'@

# --------------------------------- koraci ------------------------------------
$Steps = @(

@{ Id='66'; Name='dve akcije gosta'; Model='opus'; Effort='xhigh'; Mode='plan'; Goal=@'
TASK-66 iz docs/architecture/RFC-004-ordering-waiter-panel.md, sekcija 4 -- dve akcije gosta.

Procitaj RFC-004 sekcije 2.1 (dva nivoa), 2.5 (drugi gost za istim stolom), 2.6
(jedno onemoguceno stanje, dva uzroka), 2.9 (zastita od zloupotrebe) i registar
rizika. Zatim procitaj sta postoji: convex/orderingShifts.ts (TASK-65,
materijalizovan stale), convex/ordering.ts (TASK-64, sposobnost i prekidaci),
convex/cards.ts (TASK-63, hop i mint sa cardId), convex/lib/rateLimits.ts.

ULAZI:
1. Dve akcije gosta: poziv konobaru i porudzbina. Obe pisu u serviceRequests
   (+ serviceRequestItems za porudzbinu) i rutiraju se OTVORENOJ smeni.
2. Minimalna gostova povrsina na /o/[code] da su akcije dohvatljive. Zivi status
   Poslato -> Prihvaceno -> Stize je TASK-67; ovde samo da akcija ode i da gost
   vidi da je otisla.
3. Rate limitovi preko postojeceg rate-limitera: porudzbina po guestId, poziv
   konobaru po cardId. Unosi su vec pripremljeni u convex/lib/rateLimits.ts.
4. Svaki zahtev NOSI i cardId i guestId. Bez cardId nema stola -- to je ceo
   smisao TASK-63 i ovde se ne sme izgubiti.

SRZ TASKA, najlakse je ovo pokvariti -- JEDNO ONEMOGUCENO STANJE, DVA UZROKA:
Gostova povrsina za porucivanje je omogucena AKO I SAMO AKO postoji sveza,
ne-stale otvorena smena I konobar nije rucno pauzirao. Onemogucena je kad je
BILO STA od toga netacno:
  - uzrok A, nehotican: otkucaj je zastareo (tablet ugasen, uspavan, van mreze);
  - uzrok B, namerni: nema otvorene smene ili je konobar pauzirao.
OBA prikazuju gostu ISTU, mirnu poruku -- "Porucivanje trenutno nije dostupno" --
i, gde lokal ima dugme, i dalje nude poziv konobaru. Gostu se NIKAD ne prikazuje
koji je uzrok; remedija je ista (privuci konobarovu paznju), a otkrivanje uzroka
donosi zbunjenost i prebacivanje krivice. Razlika A/B je DIJAGNOSTICKA i vidi se
samo u panelu i vlasnikovom pregledu, da vlasnik zna da li da probudi tablet ili
otvori smenu.
Stanje se cita iz MATERIJALIZOVANIH bulova (TASK-65), nikad iz Date.now() u
upitu -- reaktivan upit se ne pokrece ponovo samo zato sto je vreme proteklo.

DRUGI GOST ZA ISTIM STOLOM (2.5): dozvoljeno i normalno, sto je cetvorosed. Nema
zakljucavanja stola, nema "jedna aktivna porudzbina po stolu". Gost vidi SAMO
svoje zahteve (po guestId); konobar vidi ceo sto grupisan po cardId.

TESTOVI KOJI SU KRITERIJUM:
- poziv i porudzbina svaki upisuju TACNO JEDAN red, rutiran otvorenoj smeni;
- porucivanje je onemoguceno kad je smena stale, ILI pauzirana, ILI je nema --
  i u sva tri slucaja gost dobija ISTU poruku;
- poplava zahteva je odbijena sa vidljivom porukom, ne tiho;
- zahtev nosi i cardId i guestId;
- drugi gost za istim stolom moze da poruci i ne vidi tudje zahteve.

BROWSER (localhost:3000, prijavljen si kao admin): napravi kroz admin karticu
tipa table_ordering za neki lokal, ukljuci porucivanje u panelu vlasnika, pa
otvori /r/<kod> i potvrdi da te odvede na /o/<kod>. Proveri OBA stanja: sa
otvorenom smenom (akcije rade) i bez nje (ista mirna poruka). Snimi u izvestaj
sta si video.

NE ULAZI: zivi status i akcija na 7 minuta (TASK-67); panel konobara (TASK-68);
NIKAKVO placanje, nikakav ukupan iznos, nikakvo zatvaranje racuna -- srpska
e-fiskalizacija, sekcija 2.3. Cene su informativne i nigde se ne sabiraju.
'@ },

@{ Id='67'; Name='zivi status i rok od 7 minuta'; Model='opus'; Effort='high'; Mode='plan'; Goal=@'
TASK-67 iz RFC-004 sekcija 4 -- zivi status gosta i rok od 7 minuta.

Procitaj RFC-004 sekcije 2.5, 2.6, 2.8 i registar rizika. Zatim procitaj
convex/orderingShifts.ts (TASK-65): obrazac runAt zakazivanja + no-op ako je u
medjuvremenu stiglo nesto novije + cron kao rezerva. Preslikavas TAJ obrazac,
ne izmisljas nov.

ULAZI:
1. Zivi status gosta: Poslato -> Prihvaceno -> Stize, preko useQuery. SSR pa
   pretplata. Promena statusa na panelu stize do drugog otvorenog klijenta BEZ
   reloada.
2. Rok od 7 minuta: ako porudzbina nije prihvacena, gost dobija AKCIJU, ne samo
   obavestenje.
3. NIKAD tiho otkazivanje. Neprihvacena porudzbina OSTAJE na cekanju i posle
   roka -- samo dobija akcionu karticu. To je izricita odluka vlasnika.

TVRDO PRAVILO: rok se materijalizuje preko runAt zakazivanja, isto kao stale u
TASK-65. Upit NE SME da racuna istek iz Date.now() -- reaktivan upit se ne
pokrece ponovo samo zato sto je vreme proteklo, pa bi gost gledao "ceka se"
zauvek, a to je tacno onaj tihi kvar zbog kog ceo ovaj model postoji.

TESTOVI KOJI SU KRITERIJUM:
- promena statusa na panelu stize do drugog otvorenog klijenta bez reloada;
- na pragu roka status postaje akciona kartica, a zahtev OSTAJE pending
  (nema auto-otkazivanja);
- gost vidi samo svoje zahteve.

Prag od 7 minuta i tacna ponudjena akcija su vlasnikova odluka (RFC-004 sekcija
5, pitanje 3). Uzmi 7 minuta kao PLACEHOLDER, oznaci ga komentarom kao takvog i
upisi u docs/tasks/BLOCKED.md da ceka potvrdu.

BROWSER (localhost:3000, admin): otvori /o/<kod> u dva prozora i potvrdi ocima
da promena statusa u jednom stize u drugi BEZ reloada. To je jedina prava
provera zive reaktivnosti.

NE ULAZI: panel konobara (TASK-68). Nikakvo placanje ni ukupan iznos.
'@ },

@{ Id='59'; Name='upit mejlom za Meni'; Model='sonnet'; Effort='low'; Mode='goal'; Goal=@'
TASK-59 iz docs/architecture/RFC-003-scanme-menu.md, sekcija 4 -- upit mejlom
vlasniku lokala.

Procitaj RFC-003 sekciju 2.10. Zatim nadji postojeci mejl sav u repou (Resend
akcija koju koriste druge povrsine) i procitaj
components/menu/menu-item-sheet.tsx (TASK-53).

ULAZI: akcija "Upit" u listu stavke salje TACNO JEDAN mejl vlasniku lokala kroz
postojeci mejl sav. Ne pravis nov mejl sloj.

NE ULAZI: nikakva korpa, nikakav ukupan iznos, nikakav checkout. Meni NIJE
prodavnica -- to je odluka iz sekcije 2.10 i ne sme se zaobici.

KRITERIJUM: akcija salje tacno jedan mejl; nigde u javnom renderu ne postoji
korpa ni zbir; svi novi stringovi idu kroz recnik (povrsina menu, koju je
TASK-57 vec napravio), bez inline srpskog teksta u kodu.

BROWSER (localhost:3000, admin): otvori javni meni nekog lokala, otvori list
stavke i klikni Upit. Potvrdi da nigde nema korpe ni zbira.

NE diras: gejtovanje planova, semu, rute kartica, ni bilo sta iz serije
porucivanja.
'@ },

@{ Id='68'; Name='panel konobara'; Model='fable'; Effort='high'; Mode='plan'; Goal=@'
TASK-68 iz RFC-004 sekcija 4 -- panel konobara na /panel/[venueCode].

Ovo je najveca UI povrsina serije. Rizik nije jedna teska odluka nego SIRINA u
kojoj greska cuti, pa idi metodicno.

Procitaj RFC-004 sekcije 2.7 (smena, PIN, panel) i 2.10 (zvuk, vibracija,
zakljucan tablet), pa procitaj convex/orderingShifts.ts (TASK-65: openShift,
heartbeat, pauseOrdering, resumeOrdering, nosilac smene) i convex/ordering.ts.

ULAZI:
1. Prijava PIN-om. Mintovan nosilac smene ide u HttpOnly kolacic -- TASK-65 ga
   vraca sirovog pozivaocu bas zato sto ga TI postavljas u kolacic.
2. Zivi red cekanja, sa OGRANICENIM take (obrazac WALL_WINDOW iz Memories zida),
   grupisan PO STOLU preko cardId.
3. Akcije: Prihvati, Stize, Zavrseno. One voze gostov zivi status iz TASK-67.
4. Rucno pauziranje i nastavak porucivanja (gusva, kraj smene).
5. Zvucni signal i vibracija na nov zahtev. Audio se otkljucava PIN gestom --
   bez korisnickog gesta browser ne pusta zvuk, i PIN prijava je taj gest.
   Wake Lock da se tablet ne uspava dok je panel otvoren.
6. Zakasneli zahtevi (preko roka) sortiraju se na VRH reda.

ODZIV: panel se koristi jednom rukom, u gusvi, na jeftinom tabletu. Mora raditi
na tabletu od 10 inca I na telefonu od 375px. Ciljevi dodira najmanje 44px.

NE ULAZI: nikakva izmena backend mutacija iz TASK-65 i TASK-66 -- one postoje,
ti ih zoves. Nikakvo placanje, nikakav ukupan iznos, nikakvo zatvaranje racuna.
Nikakav kuhinjski ekran (RFC-004 2.11 ga je izricito odbacio za v1).

BROWSER (localhost:3000, admin) -- OVDE JE OBAVEZNO, ne opciono: otvori
/panel/<venueCode>, prijavi se PIN-om, otvori smenu. U drugom prozoru posalji
porudzbinu sa /o/<kod> i potvrdi da se pojavila u redu cekanja UZIVO. Klikni
Prihvati, pa Stize, pa Zavrseno i potvrdi da gostov prozor prati. Proveri
izgled na 1280px i na 375px. Ovo je najveca povrsina u seriji i testovi je ne
pokrivaju -- sto nisi video, nisi napravio.

KRITERIJUM: prijava PIN-om radi; red cekanja je ziv i grupisan po stolu; sve tri
akcije voze gostov status; nov zahtev se oglasi (audio otkljucan PIN gestom);
zakasneli su na vrhu; panel je upotrebljiv na 375px i na tabletu.
'@ },

@{ Id='69'; Name='i18n povrsine porucivanja'; Model='sonnet'; Effort='low'; Mode='goal'; Goal=@'
TASK-69 iz RFC-004 sekcija 4 -- i18n povrsine ordering, ordering-panel i
ordering-admin.

Procitaj RFC-004 sekciju 2.15. Zatim pogledaj zateceno stanje PRE nego sto isto
napises: lib/i18n/sr/ordering-admin.ts vec postoji (TASK-64), lib/i18n/types.ts
i lib/i18n/index.ts nose tipizovan sistem recnika bez biblioteke. NE PRAVIS
POSTOJECE IZNOVA -- prosirujes.

ULAZI:
1. Prosiri postojecu ordering-admin povrsinu ako je nepotpuna.
2. Napravi ordering povrsinu (gost) i ordering-panel povrsinu (konobar):
   Dict interfejs + sr fajl + upis u SR mapu.
3. Prodji kroz app/o/**, app/panel/**, i sve komponente porucivanja i zameni
   svaki preostali inline srpski tekst pozivom recnika.
4. Srpski, EKAVICA. Ne ijekavica. Tvrdo pravilo vlasnika.

NE ULAZI: nikakva izmena ponasanja. Ovo je zamena literala pozivima recnika,
ne refaktor.

KRITERIJUM: sav tekst porucivanja cita se kroz getDict/fmt; namerno uklonjen
kljuc RUSI "npm run check" (dokazi da si to proverio pa vratio); nema inline
srpskog teksta u novom kodu.
'@ },

@{ Id='70'; Name='otvrdnjavanje i test da nema placanja'; Model='sonnet'; Effort='medium'; Mode='goal'; Goal=@'
TASK-70 iz RFC-004 sekcija 4 -- otvrdnjavanje.

Procitaj RFC-004 sekcije 2.3 (nema placanja u aplikaciji), 2.9 (rate limitovi) i
2.6 (prisustvo), pa registar rizika.

ULAZI:
1. TEST DA NEMA PLACANJA. Convex-test koji tvrdi da u celom modelu porucivanja
   NE POSTOJI nijedna putanja tipa "iznos koji se duguje", "placeno", "zatvori
   racun", niti bilo kakvo sabiranje cena. Ovo nije kozmetika: srpska
   e-fiskalizacija je pravno ogranicenje, i ovaj test je brana koja sprecava da
   neko za sest meseci "samo doda dugme za placanje".
2. Matrica rate limitova: gornje granice po guestId i po cardId, sa testovima i
   za dozvoljen i za odbijen slucaj.
3. Ivicni slucajevi prisustva: izgubljen otkucaj I izgubljen runAt -- oba mora
   da pokupi cron rezerva iz TASK-65. Dokazi testom.

NE ULAZI: nikakva nova funkcionalnost. Ovo je task koji pise testove i zatvara
rupe, ne gradi povrsine.

KRITERIJUM: sva tri testa iznad prolaze; nijedan postojeci test se ne menja.
'@ },

@{ Id='70b'; Name='QA, pristupacnost i perf panela i gosta'; Model='sonnet'; Effort='medium'; Mode='goal'; Goal=@'
TASK-70b iz RFC-004 sekcija 4 -- QA, pristupacnost i performanse panela i gosta.

ULAZI:
1. Panel je upotrebljiv jednom rukom na tabletu od 10 inca I na telefonu od
   375px; dugmad Prihvati / Stize / Zavrseno imaju cilj dodira najmanje 44px.
2. Red cekanja je prohodan tastaturom, a nov zahtev se najavljuje preko
   aria-live -- konobar ne gleda ekran non-stop.
3. Kontrast prolazi AA na jeftinom ekranu pri punom osvetljenju.
4. Gostova povrsina /o/[code]: prohodna tastaturom, akcije imaju pristupacna
   imena, stanje "nije dostupno" se saopstava i citacu ekrana.
5. Izmeren prvi paint za gostovu stranicu i za panel; nalaz se upisuje u
   docs/perf/ordering-first-paint.md sa provenijencijom (kako je mereno, koliko
   uzoraka, p50 i p95) i presudom.
6. QA nalaz u docs/qa/ordering.md.

BROWSER (localhost:3000, admin) -- ceo ovaj task se radi u browseru. Meri na
zivim stranicama /o/<kod> i /panel/<venueCode>, ne na fikstura stranicama.

KRITERIJUM: oba dokumenta postoje i sadrze BROJEVE, ne utiske. Merenje koje
zivi samo u chatu ne postoji. Svaki nadjen nedostatak je ili popravljen ili
zapisan sa razlogom zasto nije.
'@ }

)

# --------------------------------- petlja ------------------------------------
$FlagFor = { param($s) @() }        # popuni samo ako $UseFlags = $true
$allOk   = $true
$done    = 0
if ($From) { $Steps = $Steps | Where-Object { $From -contains $_.Id }; Say "Nastavak samo za: $($From -join ', ')" 'Cyan' }

foreach ($s in $Steps) {

    $header = @"
REZIM: $($s.Mode)
EFFORT: $($s.Effort)

"@
    if ($s.Mode -eq 'plan') {
        $header += "Prvo napravi plan izvrsenja, proveri ga protiv RFC-a i postojeceg koda, pa ga tek onda sprovedi.`n`n"
    }
    if ($s.Effort -eq 'xhigh' -or $s.Effort -eq 'high') {
        $header += "Ovo je task gde greska CUTI -- ne pada ni na jednom testu, nego se pojavi kod klijenta mesecima kasnije. Radi sporo i proveravaj svaku pretpostavku protiv koda, ne protiv secanja.`n`n"
    }

    $full = $header + $s.Goal + $Preamble
    $log  = Join-Path $LogDir ("night-task-{0}.log" -f $s.Id)
    $extra = if ($UseFlags) { & $FlagFor $s } else { @() }

    Write-Host ""
    Say "=== TASK-$($s.Id) -- $($s.Name)" 'Green'
    Say "    model=$($s.Model)  effort=$($s.Effort)  rezim=$($s.Mode)  ($($full.Length) znakova)" 'DarkGray'

    $mdl = $s.Model
    $t0 = Get-Date
    & $ClaudeExe -p $full --model $mdl @BaseArgs @extra 2>&1 | Tee-Object -FilePath $log
    $exit = $LASTEXITCODE
    $mins = [int]((Get-Date) - $t0).TotalMinutes

    if ($exit -ne 0) {
        git add -A | Out-Null
        git commit -m "TASK-$($s.Id): WIP -- agent exit $exit (nocni lanac stao)" | Out-Null
        Note "| $($s.Id) | $($s.Name) | $($s.Model) | $($s.Effort) | $($s.Mode) | **AGENT PUKAO (exit $exit)** | $mins | WIP |"
        Say "LANAC STAO na TASK-$($s.Id): agent exit $exit. Log: $log" 'Red'
        $allOk = $false; break
    }

    Say "    npm run check ..." 'DarkGray'
    $chk = Join-Path $LogDir ("night-task-{0}-check.log" -f $s.Id)
    Stop-Dev
    npm run check 2>&1 | Tee-Object -FilePath $chk | Out-Null
    $checkExit = $LASTEXITCODE
    Start-Dev
    if ($checkExit -ne 0) {
        git add -A | Out-Null
        git commit -m "TASK-$($s.Id): WIP -- npm run check pao (nocni lanac stao)" | Out-Null
        Note "| $($s.Id) | $($s.Name) | $($s.Model) | $($s.Effort) | $($s.Mode) | **CHECK PAO** | $mins | WIP |"
        Say "LANAC STAO na TASK-$($s.Id): npm run check pao. Log: $chk" 'Red'
        $allOk = $false; break
    }

    $frozen = git diff --stat components/scanme-links lib/scanme-links*
    if ($frozen) {
        Note "| $($s.Id) | $($s.Name) | $($s.Model) | $($s.Effort) | $($s.Mode) | **FREEZE GEJT PAO** | $mins | -- |"
        Say "LANAC STAO na TASK-$($s.Id): dirnut zamrznut ScanMe Links." 'Red'
        $allOk = $false; break
    }

    git add -A -- . ':(exclude)scripts/tasks/logs' | Out-Null
    if ((git status --porcelain -- . ':(exclude)scripts/tasks/logs')) { git commit -m "TASK-$($s.Id): $($s.Name) (nocni lanac, dopuna)" | Out-Null }
    git push $Remote $Branch 2>&1 | Out-Null

    $sha = (git rev-parse --short HEAD).Trim()
    Note "| $($s.Id) | $($s.Name) | $($s.Model) | $($s.Effort) | $($s.Mode) | zeleno | $mins | $sha |"
    Say "    ok -- $sha  (${mins}min)" 'Green'
    $done++
}

# --------------------------------- deploy ------------------------------------
Note ""
if (-not $allOk) {
    Note "**Lanac stao posle $done taskova.** Deploy NIJE radjen. Procitaj poslednji night-task-*.log."
    Say "" ; Say "Gotovo sa greskom. $done/$($Steps.Count) taskova. Deploy preskocen." 'Red'
    Say "Summary: $Sum" 'Yellow'
    exit 1
}

Note "Svih $done taskova zeleno."
Say "" ; Say "=== SVI TASKOVI ZELENI. Finalna provera pre deploya. ===" 'Cyan'

Stop-Dev
npm run test 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "night-vitest.log") | Out-Null
if ($LASTEXITCODE -ne 0) {
    Note "**Ceo vitest PAO posle lanca. Deploy preskocen.** Log: night-vitest.log"
    Say "Vitest pao. Deploy preskocen." 'Red'; exit 1
}
Note "Ceo vitest zelen."

if (-not $DoDeploy) {
    Note 'Deploy iskljucen podesavanjem (DoDeploy = false).'
    Say "Deploy iskljucen. Gotovo." 'Yellow'; exit 0
}

Say "=== DEPLOY NA PRODUKCIJU ===" 'Cyan'
$dlog = Join-Path $LogDir "night-deploy.log"

git checkout $ProdBranch 2>&1 | Tee-Object -FilePath $dlog
git pull $ProdRemote $ProdBranch 2>&1 | Tee-Object -FilePath $dlog -Append
git merge --no-ff $Branch -m "Merge ${Branch}: TASK-66..70b (nocni lanac $(Get-Date -Format 'yyyy-MM-dd'))" 2>&1 | Tee-Object -FilePath $dlog -Append
if ($LASTEXITCODE -ne 0) {
    Note "**Merge u $ProdBranch PAO (konflikt). Deploy stao.** Log: night-deploy.log"
    Say "Merge pao. Vracam se na $Branch." 'Red'
    git merge --abort 2>&1 | Out-Null
    git checkout $Branch 2>&1 | Out-Null
    exit 1
}

Stop-Dev
npm run check 2>&1 | Tee-Object -FilePath $dlog -Append | Out-Null
if ($LASTEXITCODE -ne 0) {
    Note "**npm run check pao NA MAIN posle merge-a. Nista nije gurnuto.**"
    Say "check pao na main. Nista nije gurnuto." 'Red'
    git checkout $Branch 2>&1 | Out-Null
    exit 1
}

git push $ProdRemote $ProdBranch 2>&1 | Tee-Object -FilePath $dlog -Append
git push $Remote $ProdBranch 2>&1 | Tee-Object -FilePath $dlog -Append
Note "Front: gurnut $ProdBranch na $ProdRemote (Vercel produkcijski build je krenuo)."

# Convex backend. Ako CLI ne poznaje --yes, probaj bez njega.
npx convex deploy --yes 2>&1 | Tee-Object -FilePath $dlog -Append
if ($LASTEXITCODE -ne 0) {
    Say "convex deploy --yes nije prosao, pokusavam bez zastavice ..." 'Yellow'
    npx convex deploy 2>&1 | Tee-Object -FilePath $dlog -Append
}
if ($LASTEXITCODE -ne 0) {
    Note "**Convex deploy PAO.** Front je gurnut, backend NIJE. Log: night-deploy.log"
    Say "Convex deploy pao. Front je gore, backend nije." 'Red'
    git checkout $Branch 2>&1 | Out-Null
    exit 1
}
Note "Backend: npx convex deploy prosao."

git checkout $Branch 2>&1 | Out-Null
$endSha = (git rev-parse --short $ProdBranch).Trim()
Note ""
Note "Deploy gotov. $ProdBranch = $endSha. Kraj: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Say "" ; Say "=== GOTOVO. $done taskova + deploy. main = $endSha ===" 'Green'
Say "Summary: $Sum" 'Yellow'
