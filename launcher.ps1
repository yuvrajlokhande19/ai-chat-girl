$host.UI.RawUI.WindowTitle = "Chloe AI Launcher"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $projectDir) { $projectDir = "C:\Users\lokha\Downloads\Ai Chat girl" }

$vitePort = 3000
$viteUrl = "http://localhost:$vitePort"
$ollamaApi = "http://127.0.0.1:11434"
$hermesUrl = "http://127.0.0.1:9123"
$script:startedPids = @()

function Ensure-Config {
    $configFile = "$projectDir\src\config.js"
    if (Test-Path $configFile) { return }
    $example = "$projectDir\config.js.example"
    if (Test-Path $example) {
        Copy-Item $example $configFile
        Write-Host "  Created src\config.js from example. Fill in your Gemini + ElevenLabs keys there." -ForegroundColor Yellow
    } else {
        Write-Host "  WARNING: src\config.js missing and no config.js.example found." -ForegroundColor Red
    }
}

function Show-Menu {
    Clear-Host
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "       CHLOE AI - Launcher Menu" -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
Write-Host "  [O]  Open Chloe (Start Server + Browser)" -ForegroundColor Green
    Write-Host "  [R]  Restart Server" -ForegroundColor Yellow
    Write-Host "  [S]  Stop Server" -ForegroundColor Red
    Write-Host "  [M]  Setup Model (Create Ollama Model)" -ForegroundColor Magenta
    Write-Host "  [C]  Check Services Status" -ForegroundColor Blue
    Write-Host "  [H]  Start Hermes Bridge (laptop copilot)" -ForegroundColor Cyan
    Write-Host "  [L]  Open Browser (if server running)" -ForegroundColor Cyan
    Write-Host "  [Q]  Quit" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor DarkGray
    Write-Host ""
}

function Start-TTSServer {
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:8881/health" -Method GET -ErrorAction Stop -TimeoutSec 2 | Out-Null
        Write-Host "  Edge-TTS server already running." -ForegroundColor Green
        return
    } catch {
        # not running, start it
    }
    Write-Host "  Starting Edge-TTS server (Hindi voice)..." -ForegroundColor Yellow
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = "python"
    $processInfo.Arguments = "`"$projectDir\tts_server.py`""
    $processInfo.UseShellExecute = $true
    $processInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
    [System.Diagnostics.Process]::Start($processInfo) | Out-Null
    Start-Sleep 2
    Write-Host "  Edge-TTS server started on port 8881." -ForegroundColor Green
}

function Start-OllamaIfneeded {
    $running = Get-Process -Name ollama -ErrorAction SilentlyContinue
    if (-not $running) {
        Write-Host "  Starting Ollama..." -ForegroundColor Yellow
        Start-Process ollama -ArgumentList "serve" -WindowStyle Minimized
        Start-Sleep 3
        Write-Host "  Ollama started." -ForegroundColor Green
    } else {
        Write-Host "  Ollama already running." -ForegroundColor Green
    }
}

function Start-ViteServer {
    try {
        Invoke-WebRequest -Uri $viteUrl -Method GET -ErrorAction Stop -TimeoutSec 2 | Out-Null
        Write-Host "  Vite already running on port $vitePort." -ForegroundColor Green
        return
    } catch {
        # not running, start it
    }
    Write-Host "  Starting Vite dev server on port $vitePort..." -ForegroundColor Yellow
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = "node"
    $processInfo.Arguments = "`"$projectDir\node_modules\vite\bin\vite.js`" --port $vitePort --host"
    $processInfo.WorkingDirectory = $projectDir
    $processInfo.UseShellExecute = $true
    $processInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
    $proc = [System.Diagnostics.Process]::Start($processInfo)
    if ($proc) { $script:startedPids += $proc.Id }
    Start-Sleep 4
    Write-Host "  Vite server started." -ForegroundColor Green
}

function Start-HermesBridge {
    try {
        Invoke-RestMethod -Uri "$hermesUrl/health" -Method GET -ErrorAction Stop -TimeoutSec 2 | Out-Null
        Write-Host "  Hermes bridge already running on port 9123." -ForegroundColor Green
        return
    } catch {
        # not running, start it
    }
    Write-Host "  Starting Hermes bridge (Arohi's laptop copilot)..." -ForegroundColor Yellow
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = "node"
    $processInfo.Arguments = "`"$projectDir\bridge\hermes-bridge.cjs`""
    $processInfo.WorkingDirectory = $projectDir
    $processInfo.UseShellExecute = $true
    $processInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
    $proc = [System.Diagnostics.Process]::Start($processInfo)
    if ($proc) { $script:startedPids += $proc.Id }
    Start-Sleep 3
    try {
        Invoke-RestMethod -Uri "$hermesUrl/health" -Method GET -ErrorAction Stop -TimeoutSec 2 | Out-Null
        Write-Host "  Hermes bridge started on port 9123." -ForegroundColor Green
    } catch {
        Write-Host "  WARNING: Hermes bridge not answering on :9123 yet - check node is installed." -ForegroundColor Yellow
    }
}

function Stop-Servers {
    Write-Host "  Stopping Vite + Hermes bridge..." -ForegroundColor Yellow
    foreach ($procId in $script:startedPids) {
        Get-Process -Id $procId -ErrorAction SilentlyContinue | Stop-Process -Force
    }
    $script:startedPids = @()
    Start-Sleep 1
    Write-Host "  Servers stopped." -ForegroundColor Green
}

function Open-Browser {
    Write-Host "  Opening browser at $viteUrl ..." -ForegroundColor Yellow
    Start-Process $viteUrl
}

# === MAIN LOOP ===
Ensure-Config
while ($true) {
    Show-Menu
    $choice = Read-Host "  Select option"

    switch ($choice.ToUpper()) {
"O" {
            Write-Host ""
            Start-OllamaIfneeded
            Start-TTSServer
            Start-ViteServer
            Start-HermesBridge
            Open-Browser
            Write-Host ""
            Write-Host "  Chloe is running at $viteUrl" -ForegroundColor Green
            Write-Host "  Hermes (laptop copilot) started with Chloe." -ForegroundColor Green
            Write-Host ""
            pause
        }
        "R" {
            Write-Host ""
            Stop-Servers
            Start-Sleep 1
            Start-OllamaIfneeded
            Start-TTSServer
            Start-ViteServer
            Start-HermesBridge
            Open-Browser
            Write-Host ""
            Write-Host "  Server restarted! Chloe + Hermes running." -ForegroundColor Green
            Write-Host ""
            pause
        }
        "S" {
            Write-Host ""
            Stop-Servers
            Write-Host ""
            pause
        }
        "H" {
            Write-Host ""
            Start-HermesBridge
            Write-Host ""
            pause
        }
        "M" {
            Write-Host ""
            Write-Host "  Checking Ollama model..." -ForegroundColor Magenta
            $modelExists = ollama list 2>$null | Select-String -Pattern "gemma4"
            if (-not $modelExists) {
                Write-Host "  Downloading gemma4:latest..." -ForegroundColor Yellow
                ollama pull gemma4:latest
                Write-Host "  Model ready!" -ForegroundColor Green
            } else {
                Write-Host "  Model gemma4:latest already present." -ForegroundColor Green
            }
            Write-Host ""
            pause
        }
        "C" {
Write-Host ""
            Write-Host "  Checking services..." -ForegroundColor Blue
            $ollamaRunning = Get-Process -Name ollama -ErrorAction SilentlyContinue
            if ($ollamaRunning) { Write-Host "  [OK] Ollama process running" -ForegroundColor Green }
            else { Write-Host "  [OFF] Ollama not running" -ForegroundColor Red }
            try {
                Invoke-WebRequest -Uri $viteUrl -Method GET -ErrorAction Stop -TimeoutSec 3 | Out-Null
                Write-Host "  [OK] Vite server running (:3000)" -ForegroundColor Green
            } catch {
                Write-Host "  [OFF] Vite server not running (:3000)" -ForegroundColor Red
            }
            try {
                Invoke-RestMethod -Uri "$hermesUrl/health" -Method GET -ErrorAction Stop -TimeoutSec 3 | Out-Null
                Write-Host "  [OK] Hermes bridge running (:9123)" -ForegroundColor Green
            } catch {
                Write-Host "  [OFF] Hermes bridge not running (:9123)" -ForegroundColor Red
            }
            try {
                $r = Invoke-RestMethod -Uri "$ollamaApi/api/tags" -Method GET -ErrorAction Stop -TimeoutSec 3
                Write-Host "  [OK] Ollama API responding" -ForegroundColor Green
            } catch {
                Write-Host "  [OFF] Ollama API not reachable" -ForegroundColor Red
            }
            try {
                Invoke-WebRequest -Uri "http://127.0.0.1:8881/health" -Method GET -ErrorAction Stop -TimeoutSec 3 | Out-Null
                Write-Host "  [OK] Edge-TTS server running" -ForegroundColor Green
            } catch {
                Write-Host "  [OFF] Edge-TTS not reachable" -ForegroundColor Red
            }
            Write-Host ""
            pause
        }
        "L" {
            Open-Browser
        }
        "Q" {
            Write-Host ""
            Write-Host "  Bye!" -ForegroundColor Gray
            exit
        }
        default {
            Write-Host "  Invalid option." -ForegroundColor Red
            Start-Sleep 1
        }
    }
}

