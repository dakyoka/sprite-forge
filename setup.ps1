# SpriteForge Setup Script
param()
$ErrorActionPreference = "Stop"

function Write-Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Write-OK($msg)  { Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Warn($msg){ Write-Host "  [!!]  $msg" -ForegroundColor Yellow }
function Write-Fail($msg){ Write-Host "  [NG]  $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  SpriteForge (SF) - Auto Setup" -ForegroundColor Yellow
Write-Host "  2D Sprite => 3D Model Pipeline" -ForegroundColor Yellow
Write-Host ""

# STEP 1: Python
Write-Step 1 "Checking Python 3.10+"
$pyExe = $null
foreach ($c in @("py -3.12","py -3.11","py -3.10","python")) {
    try {
        $v = (cmd /c "$c --version" 2>&1)
        if ($v -match "Python 3\.1[0-9]" -or $v -match "Python 3\.[2-9]\d") { $pyExe = $c; break }
    } catch {}
}
if (-not $pyExe) { Write-Fail "Python 3.10+ not found. Install from https://www.python.org" }
Write-OK "Python OK ($pyExe)"

# STEP 2: Node.js
Write-Step 2 "Checking Node.js"
try {
    $nv = (node --version 2>&1)
    Write-OK "Node.js $nv"
} catch {
    Write-Fail "Node.js not found. Install from https://nodejs.org"
}

# STEP 3: .env
Write-Step 3 "Creating .env"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-OK "Created .env from .env.example"
    Write-Warn "Edit .env and set SF_GODOT_EXPORT_PATH to your Godot project path"
} else {
    Write-OK ".env already exists (skipped)"
}

# STEP 4: Backend venv + lightweight deps
Write-Step 4 "Backend Python venv + pip install (lightweight only)"
Set-Location backend
if (-not (Test-Path ".venv")) {
    Write-Host "  Creating .venv..." -ForegroundColor Gray
    $null = (cmd /c "$pyExe -m venv .venv" 2>&1)
    Write-OK ".venv created"
} else {
    Write-OK ".venv already exists (skipped)"
}
Write-Host "  Installing core packages..." -ForegroundColor Gray
.\.venv\Scripts\pip.exe install -r requirements.txt -q
Write-OK "Core packages installed"
Write-Warn "ML packages (torch, rembg, etc.) are in requirements-ml.txt - install separately when GPU is ready"
Set-Location ..

# STEP 5: Frontend
Write-Step 5 "Frontend npm install"
Set-Location frontend
if (-not (Test-Path "node_modules")) {
    Write-Host "  Running npm install..." -ForegroundColor Gray
    npm install --silent
    Write-OK "npm install done"
} else {
    Write-OK "node_modules already exists (skipped)"
}
if (-not (Test-Path ".env.local")) {
    "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" | Out-File -Encoding utf8 ".env.local"
    Write-OK ".env.local created"
}
Set-Location ..

# STEP 6: Blender check
Write-Step 6 "Checking Blender"
$bPaths = @("blender","C:\Program Files\Blender Foundation\Blender 4.2\blender.exe","C:\Program Files\Blender Foundation\Blender 4.1\blender.exe")
$bFound = $false
foreach ($p in $bPaths) {
    if (Get-Command $p -ErrorAction SilentlyContinue) { $bFound = $true; break }
    if (Test-Path $p) { $bFound = $true; break }
}
if ($bFound) { Write-OK "Blender found" }
else { Write-Warn "Blender not found. Install from https://www.blender.org (needed for step 5 of pipeline)" }

# STEP 7: TRELLIS check
Write-Step 7 "Checking TRELLIS"
try {
    $tr = (backend\.venv\Scripts\python.exe -c "import trellis; print('ok')" 2>&1)
    if ($tr -match "ok") { Write-OK "TRELLIS installed" }
    else { throw "not installed" }
} catch {
    Write-Warn "TRELLIS not installed (needed for 3D generation step)"
    Write-Host "  Install TRELLIS when ready (RTX 3060 12GB+ required):" -ForegroundColor Yellow
    Write-Host "    git clone https://github.com/microsoft/TRELLIS.git" -ForegroundColor Gray
    Write-Host "    cd TRELLIS; pip install -e `".[train]`"" -ForegroundColor Gray
    Write-Host "  See SETUP.md for full instructions" -ForegroundColor Gray
}

# Done
Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  How to start:" -ForegroundColor Cyan
Write-Host "    Terminal 1: cd backend; .\.venv\Scripts\uvicorn app.main:app --reload --reload-dir app --port 8000" -ForegroundColor White
Write-Host "    Terminal 2: cd frontend; npm run dev" -ForegroundColor White
Write-Host "    Browser:    http://localhost:3000" -ForegroundColor White
Write-Host ""