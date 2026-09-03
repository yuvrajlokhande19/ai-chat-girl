$host.UI.RawUI.WindowTitle = "Chloe AI Launcher"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $projectDir) { $projectDir = "C:\Users\lokha\Downloads\Ai Chat girl" }

$vitePort = 3000
$viteUrl = "http://localhost:$vitePort"
$ollamaApi = "http://127.0.0.1:11434"

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
    Write-Host "  [L]  Open Browser (if server running)" -ForegroundColor Cyan
    Write-Host "  [Q]  Quit" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor DarkGray
    Write-Host ""
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
    $running = Get-Process -Name node -ErrorAction SilentlyContinue
    if ($running) {
        Write-Host "  Vite already running on port $vitePort." -ForegroundColor Green
        return
    }
    Write-Host "  Starting Vite dev server on port $vitePort..." -ForegroundColor Yellow
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = "cmd.exe"
    $processInfo.Arguments = "/c cd /d `"$projectDir`" && npx vite --port $vitePort --host"
    $processInfo.UseShellExecute = $true
    $processInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
    [System.Diagnostics.Process]::Start($processInfo) | Out-Null
    Start-Sleep 4
    Write-Host "  Vite server started." -ForegroundColor Green
}

function Stop-Servers {
    Write-Host "  Stopping Vite (node)..." -ForegroundColor Yellow
    Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "  Servers stopped." -ForegroundColor Green
}

function Open-Browser {
    Write-Host "  Opening browser at $viteUrl ..." -ForegroundColor Yellow
    Start-Process $viteUrl
}

# === MAIN LOOP ===
while ($true) {
    Show-Menu
    $choice = Read-Host "  Select option"

    switch ($choice.ToUpper()) {
        "O" {
            Write-Host ""
            Start-OllamaIfneeded
            Start-ViteServer
            Open-Browser
            Write-Host ""
            Write-Host "  Chloe is running at $viteUrl" -ForegroundColor Green
            Write-Host ""
            pause
        }
        "R" {
            Write-Host ""
            Stop-Servers
            Start-Sleep 1
            Start-OllamaIfneeded
            Start-ViteServer
            Open-Browser
            Write-Host ""
            Write-Host "  Server restarted!" -ForegroundColor Green
            Write-Host ""
            pause
        }
        "S" {
            Write-Host ""
            Stop-Servers
            Write-Host ""
            pause
        }
        "M" {
            Write-Host ""
            Write-Host "  Checking Ollama model..." -ForegroundColor Magenta
            $modelExists = ollama list 2>$null | Select-String -Pattern "gemma-teenager"
            if (-not $modelExists) {
                Write-Host "  Creating model from gemma4:latest..." -ForegroundColor Yellow
                ollama pull gemma4:latest
                ollama create gemma-teenager -f "$projectDir\config\Modelfile"
                Write-Host "  Model created!" -ForegroundColor Green
            } else {
                Write-Host "  Model gemma-teenager already exists." -ForegroundColor Green
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
            $nodeRunning = Get-Process -Name node -ErrorAction SilentlyContinue
            if ($nodeRunning) { Write-Host "  [OK] Vite server running" -ForegroundColor Green }
            else { Write-Host "  [OFF] Vite server not running" -ForegroundColor Red }
            try {
                $r = Invoke-RestMethod -Uri "$ollamaApi/api/tags" -Method GET -ErrorAction Stop -TimeoutSec 3
                Write-Host "  [OK] Ollama API responding" -ForegroundColor Green
            } catch {
                Write-Host "  [OFF] Ollama API not reachable" -ForegroundColor Red
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
