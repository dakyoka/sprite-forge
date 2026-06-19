# SpriteForge Setup Script (idempotent)
# Safe to re-run. ASCII-only on purpose to avoid PowerShell encoding issues.
param(
    [switch]$SkipTrellis,   # skip the heavy TRELLIS install/patch stage
    [switch]$SkipFrontend   # skip npm install
)
$ErrorActionPreference = "Stop"

function Write-Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!!]  $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  [NG]  $msg" -ForegroundColor Red; exit 1 }

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

Write-Host ""
Write-Host "  SpriteForge (SF) - Auto Setup" -ForegroundColor Yellow
Write-Host "  2D Sprite => 3D Model Pipeline (GPU-adaptive)" -ForegroundColor Yellow
Write-Host ""

# ---------------------------------------------------------------------------
# STEP 1: Python
# ---------------------------------------------------------------------------
Write-Step 1 "Checking Python 3.10+"
$pyExe = $null
foreach ($c in @("py -3.12", "py -3.11", "py -3.10", "python")) {
    try {
        $v = (cmd /c "$c --version" 2>&1)
        if ($v -match "Python 3\.1[0-9]" -or $v -match "Python 3\.[2-9]\d") { $pyExe = $c; break }
    } catch {}
}
if (-not $pyExe) { Write-Fail "Python 3.10+ not found. Install from https://www.python.org" }
Write-OK "Python OK ($pyExe)"

# ---------------------------------------------------------------------------
# STEP 2: Node.js
# ---------------------------------------------------------------------------
Write-Step 2 "Checking Node.js"
try {
    $nv = (node --version 2>&1)
    Write-OK "Node.js $nv"
} catch {
    Write-Fail "Node.js not found. Install from https://nodejs.org"
}

# ---------------------------------------------------------------------------
# STEP 3: Git
# ---------------------------------------------------------------------------
Write-Step 3 "Checking Git"
try {
    $gv = (git --version 2>&1)
    Write-OK "$gv"
} catch {
    Write-Fail "Git not found. Install from https://git-scm.com"
}

# ---------------------------------------------------------------------------
# STEP 4: .env
# ---------------------------------------------------------------------------
Write-Step 4 "Creating .env"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-OK "Created .env from .env.example"
    Write-Warn "Edit .env and set SF_GODOT_EXPORT_PATH to your Godot project path"
} else {
    Write-OK ".env already exists (skipped)"
}

# ---------------------------------------------------------------------------
# STEP 5: Backend venv + lightweight deps
# ---------------------------------------------------------------------------
Write-Step 5 "Backend Python venv + core packages"
Set-Location backend
if (-not (Test-Path ".venv")) {
    Write-Host "  Creating .venv..." -ForegroundColor Gray
    $null = (cmd /c "$pyExe -m venv .venv" 2>&1)
    Write-OK ".venv created"
} else {
    Write-OK ".venv already exists (skipped)"
}
$pip = ".\.venv\Scripts\pip.exe"
$py  = ".\.venv\Scripts\python.exe"
Write-Host "  Installing core packages (requirements.txt)..." -ForegroundColor Gray
& $pip install -r requirements.txt -q
Write-OK "Core packages installed"
Set-Location $RepoRoot

# ---------------------------------------------------------------------------
# STEP 6: TRELLIS stack (torch + deps + prebuilt wheels + clone + patches)
# ---------------------------------------------------------------------------
if ($SkipTrellis) {
    Write-Step 6 "TRELLIS stack (SKIPPED via -SkipTrellis)"
} else {
    Write-Step 6 "TRELLIS stack: torch 2.6.0+cu124, deps, prebuilt wheels"
    Set-Location backend
    $pip = ".\.venv\Scripts\pip.exe"
    $py  = ".\.venv\Scripts\python.exe"

    # 6a. torch 2.6.0+cu124 (replace CPU build if present)
    Write-Host "  Checking torch..." -ForegroundColor Gray
    $torchVer = ""
    try { $torchVer = (& $py -c "import torch; print(torch.__version__)" 2>$null) } catch {}
    if ($torchVer -like "2.6.0+cu124*") {
        Write-OK "torch $torchVer (skipped)"
    } else {
        if ($torchVer) { Write-Warn "Found torch '$torchVer' (not cu124) - reinstalling" }
        Write-Host "  Installing torch 2.6.0+cu124 (large download)..." -ForegroundColor Gray
        & $pip install --force-reinstall torch==2.6.0 torchvision --index-url https://download.pytorch.org/whl/cu124
        Write-OK "torch 2.6.0+cu124 installed"
    }

    # 6b. TRELLIS runtime deps
    Write-Host "  Installing TRELLIS runtime deps (requirements-trellis.txt)..." -ForegroundColor Gray
    & $pip install -r requirements-trellis.txt
    Write-OK "TRELLIS runtime deps installed"

    # 6c. nvdiffrast prebuilt (torch-version-matched wheel)
    Write-Host "  Checking nvdiffrast..." -ForegroundColor Gray
    $hasNvdr = (& $py -c "import importlib.util,sys; sys.stdout.write('1' if importlib.util.find_spec('nvdiffrast') else '0')" 2>$null)
    if ($hasNvdr -eq "1") {
        Write-OK "nvdiffrast (skipped)"
    } else {
        & $pip install --extra-index-url https://miropsota.github.io/torch_packages_builder nvdiffrast==0.4.0+253ac4fpt2.6.0cu124
        Write-OK "nvdiffrast installed"
    }

    # 6d. diff_gaussian_rasterization prebuilt (must match torch version exactly)
    Write-Host "  Installing diff_gaussian_rasterization (force-reinstall, no-deps)..." -ForegroundColor Gray
    & $pip install --force-reinstall --no-deps --extra-index-url https://miropsota.github.io/torch_packages_builder diff_gaussian_rasterization==0.0.1+9c5c202pt2.6.0cu124
    Write-OK "diff_gaussian_rasterization installed"

    Set-Location $RepoRoot

    # 6e. Clone TRELLIS (path from config/settings.json -> trellis_path)
    $trellisPath = "H:/TRELLIS"
    try {
        $cfg = (Get-Content "config/settings.json" -Raw | ConvertFrom-Json)
        if ($cfg.trellis_path) { $trellisPath = $cfg.trellis_path }
    } catch { Write-Warn "Could not read config/settings.json; using default $trellisPath" }
    Write-Host "  TRELLIS path: $trellisPath" -ForegroundColor Gray

    if (Test-Path (Join-Path $trellisPath "trellis")) {
        Write-OK "TRELLIS already cloned (skipped)"
    } else {
        Write-Host "  Cloning microsoft/TRELLIS..." -ForegroundColor Gray
        git clone --recurse-submodules https://github.com/microsoft/TRELLIS.git $trellisPath
        Write-OK "TRELLIS cloned"
    }
    Write-Host "  Updating submodules..." -ForegroundColor Gray
    git -C $trellisPath submodule update --init --recursive
    Write-OK "Submodules ready"

    # 6f. Apply TRELLIS patches (idempotent)
    Write-Host "  Applying TRELLIS patches..." -ForegroundColor Gray
    $env:TRELLIS_PATH = $trellisPath
    & $py "scripts/apply_trellis_patches.py" --trellis-path $trellisPath
    if ($LASTEXITCODE -ne 0) { Write-Fail "TRELLIS patch step failed (see messages above)" }
    Write-OK "TRELLIS patches applied"
}

# ---------------------------------------------------------------------------
# STEP 7: Frontend
# ---------------------------------------------------------------------------
if ($SkipFrontend) {
    Write-Step 7 "Frontend (SKIPPED via -SkipFrontend)"
} else {
    Write-Step 7 "Frontend npm install"
    Set-Location frontend
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Running npm install..." -ForegroundColor Gray
        npm install --silent
        Write-OK "npm install done"
    } else {
        Write-OK "node_modules already exists (skipped)"
    }
    if (-not (Test-Path ".env.local")) {
        "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" | Out-File -Encoding ascii ".env.local"
        Write-OK ".env.local created"
    }
    Set-Location $RepoRoot
}

# ---------------------------------------------------------------------------
# STEP 8: Blender check (optional, used in post-processing step)
# ---------------------------------------------------------------------------
Write-Step 8 "Checking Blender (optional)"
$bPaths = @("blender",
    "C:\Program Files\Blender Foundation\Blender 4.2\blender.exe",
    "C:\Program Files\Blender Foundation\Blender 4.1\blender.exe")
$bFound = $false
foreach ($p in $bPaths) {
    if (Get-Command $p -ErrorAction SilentlyContinue) { $bFound = $true; break }
    if (Test-Path $p) { $bFound = $true; break }
}
if ($bFound) { Write-OK "Blender found" }
else { Write-Warn "Blender not found (needed for the post-processing step). https://www.blender.org" }

# ---------------------------------------------------------------------------
# STEP 9: TRELLIS import verify
# ---------------------------------------------------------------------------
Write-Step 9 "Verifying TRELLIS import"
if ($SkipTrellis) {
    Write-Warn "Skipped (TRELLIS stage was skipped)"
} else {
    $trellisPath = "H:/TRELLIS"
    try {
        $cfg = (Get-Content "config/settings.json" -Raw | ConvertFrom-Json)
        if ($cfg.trellis_path) { $trellisPath = $cfg.trellis_path }
    } catch {}
    $env:TRELLIS_PATH = $trellisPath
    $env:ATTN_BACKEND = "xformers"
    $env:SPARSE_BACKEND = "spconv"
    $env:SPCONV_ALGO = "native"
    $py = ".\backend\.venv\Scripts\python.exe"
    $verify = (& $py -c "import sys; sys.path.append(r'$trellisPath'); import trellis; print('ok')" 2>&1)
    if ($verify -match "ok") { Write-OK "TRELLIS import OK" }
    else {
        Write-Warn "TRELLIS import failed (GPU/driver may be required at runtime):"
        Write-Host "    $verify" -ForegroundColor Gray
    }
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  How to start:" -ForegroundColor Cyan
Write-Host "    Terminal 1: cd backend; .\.venv\Scripts\uvicorn app.main:app --reload --reload-dir app --port 8000" -ForegroundColor White
Write-Host "    Terminal 2: cd frontend; npm run dev" -ForegroundColor White
Write-Host "    Browser:    http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "  GPU profile is auto-selected from VRAM (see config/settings.json -> gpu_presets)." -ForegroundColor Gray
Write-Host ""
