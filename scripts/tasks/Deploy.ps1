# =============================================================================
#  Deploy.ps1 -- pun deploy: feat/venue-memories -> main -> Vercel + Convex.
#
#  Pokretanje:  cd "C:\Users\admin\Desktop\Web Dev Projects\scanme-mvp"
#               powershell -ExecutionPolicy Bypass -File .\scripts\tasks\Deploy.ps1
#
#  Bezbednosne mere:
#   - STAJE na prvoj gresci; ako merge pukne, radi merge --abort i vraca granu.
#   - "npm run check" se pokrece DVA puta: na grani, pa PONOVO na main-u posle
#     merge-a. Nista se ne gura dok main nije zelen.
#   - "npx convex deploy" ide BEZ --yes: CLI sam ispisuje na koji deployment ide
#     i trazi potvrdu. Procitaj taj red pre nego sto odobris.
#   - Posle Convex deploya pokrece menuAdmin.backfillMenuProfiles (TASK-61) --
#     bez toga postojeci meniji nemaju serviceProfile na produkciji.
#   - Dev server se gasi oko svake provere (Next 16 ne dozvoljava drugi dev
#     server iz istog direktorijuma) i vraca na kraju.
# =============================================================================

$ErrorActionPreference = 'Continue'

$Repo       = "C:\Users\admin\Desktop\Web Dev Projects\scanme-mvp"
$Branch     = "feat/venue-memories"
$ProdBranch = "main"
$ProdRemote = "origin"
$AltRemote  = "aleksadjor3"

Set-Location $Repo
function Say([string]$m, [string]$c = 'Gray') { Write-Host $m -ForegroundColor $c }
function Stop-Dev {
    $procIds = @()
    foreach ($port in 3000,3199) {
        $procIds += (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess
    }
    $procIds = $procIds | Sort-Object -Unique
    foreach ($p in $procIds) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
    if ($procIds) { Start-Sleep -Seconds 2 }
}

# ------------------------------- 1. preflight --------------------------------
Say "=== 1/7 PREFLIGHT ===" 'Cyan'
Get-ChildItem (Join-Path $Repo ".git") -Filter *.lock -File -Recurse -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
git worktree prune | Out-Null

$cur = (git rev-parse --abbrev-ref HEAD).Trim()
if ($cur -ne $Branch) { Say "STOP: grana je '$cur', ocekivana '$Branch'." 'Red'; exit 1 }
$dirty = git status --porcelain -- . ':(exclude)scripts/tasks/logs'
if ($dirty) { Say "STOP: radno stablo nije cisto." 'Red'; $dirty; exit 1 }
Say "  ok -- $Branch @ $((git rev-parse --short HEAD).Trim()), stablo cisto" 'Green'

# ------------------------- 2. provere na grani -------------------------------
Say "=== 2/7 PROVERE NA GRANI ===" 'Cyan'
Stop-Dev
npm run check
if ($LASTEXITCODE -ne 0) { Say "STOP: npm run check pao na grani. Nista nije dirano." 'Red'; exit 1 }
npm run test
if ($LASTEXITCODE -ne 0) { Say "STOP: vitest pao na grani. Nista nije dirano." 'Red'; exit 1 }
Say "  ok -- check i vitest zeleni" 'Green'

# ------------------------------ 3. sta ide ----------------------------------
Say "=== 3/7 STA SE SPAJA U $ProdBranch ===" 'Cyan'
git fetch $ProdRemote $ProdBranch 2>&1 | Out-Null
git log --oneline "$ProdRemote/$ProdBranch..$Branch"
$count = (git rev-list --count "$ProdRemote/$ProdBranch..$Branch")
Say "  $count commit(a) ide na produkciju." 'Yellow'
$ans = Read-Host "  Nastavi? (da/ne)"
if ($ans -ne 'da') { Say "Prekinuto na tvoj zahtev." 'Yellow'; exit 0 }

# -------------------------------- 4. merge -----------------------------------
Say "=== 4/7 MERGE ===" 'Cyan'
git checkout $ProdBranch
git pull $ProdRemote $ProdBranch
git merge --no-ff $Branch -m "Merge ${Branch}: Meni + Porucivanje (TASK-45..72)"
if ($LASTEXITCODE -ne 0) {
    Say "STOP: merge konflikt. Vracam se na granu, nista nije gurnuto." 'Red'
    git merge --abort | Out-Null
    git checkout $Branch | Out-Null
    exit 1
}
Say "  ok -- spojeno lokalno" 'Green'

# --------------------------- 5. provera na main-u ----------------------------
Say "=== 5/7 PROVERA NA MAIN-U ===" 'Cyan'
Stop-Dev
npm run check
if ($LASTEXITCODE -ne 0) {
    Say "STOP: npm run check pao NA MAIN. Nista nije gurnuto." 'Red'
    Say "Merge stoji lokalno. Popravi pa ponovi, ili 'git reset --hard $ProdRemote/$ProdBranch'." 'Yellow'
    exit 1
}
Say "  ok -- main zelen" 'Green'

# --------------------------- 6. front (Vercel) -------------------------------
Say "=== 6/7 FRONT -- push na $ProdRemote/$ProdBranch (pokrece Vercel build) ===" 'Cyan'
git push $ProdRemote $ProdBranch
if ($LASTEXITCODE -ne 0) { Say "STOP: push na $ProdRemote pao." 'Red'; exit 1 }
git push $AltRemote $ProdBranch 2>&1 | Out-Null
Say "  ok -- gurnuto. Vercel build je krenuo; prati ga na Vercel dashboardu." 'Green'

# --------------------------- 7. backend (Convex) -----------------------------
Say "=== 7/7 BACKEND -- Convex ===" 'Cyan'
Say "  PAZNJA: CLI ce sada ispisati NA KOJI DEPLOYMENT ide i traziti potvrdu." 'Yellow'
Say "  Procitaj taj red. Ako nije produkcijski deployment, odbij." 'Yellow'
npx convex deploy
if ($LASTEXITCODE -ne 0) {
    Say "Convex deploy nije prosao. FRONT JE GURNUT, BACKEND NIJE." 'Red'
    Say "Ovo je nesaglasno stanje -- resi Convex pre nego sto ostavis." 'Red'
    git checkout $Branch | Out-Null
    exit 1
}
Say "  ok -- Convex deployovan" 'Green'

Say "  backfillMenuProfiles (TASK-61) ..." 'DarkGray'
npx convex run --prod menuAdmin:backfillMenuProfiles '{}'
if ($LASTEXITCODE -ne 0) {
    Say "  UPOZORENJE: backfill nije prosao. Meniji napravljeni pre TASK-61 nemaju" 'Yellow'
    Say "  serviceProfile dok se ne pokrene. Pokreni rucno pa proveri." 'Yellow'
} else { Say "  ok -- backfill prosao" 'Green' }

git checkout $Branch | Out-Null
Say ""
Say "=== GOTOVO. main = $((git rev-parse --short $ProdBranch).Trim()) ===" 'Green'
Say "Vercel: prati build na dashboardu. Convex: gore." 'Yellow'
