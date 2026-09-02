$host.UI.RawUI.WindowTitle = "Chloe AI Launcher"
Clear-Host
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "       CHLOE AI - Launcher Menu" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [O]  Open Chloe (Start Server)" -ForegroundColor Green
Write-Host "  [R]  Restart Server" -ForegroundColor Yellow
Write-Host "  [S]  Stop Server" -ForegroundColor Red
Write-Host "  [M]  Setup Model (Create Ollama Model)" -ForegroundColor Magenta
Write-Host "  [C]  Check Services Status" -ForegroundColor Blue
Write-Host "  [L]  Open Browser" -ForegroundColor Cyan
Write-Host "  [Q]  Quit" -ForegroundColor Gray
Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkGray
Write-Host ""

$choice = Read-Host "  Select option"

$projectDir = $PSScriptRoot
if (-not $projectDir) { $projectDir = "C:\Users\lokha\Downloads\Ai Chat girl" }

$vitePort = 3000

function Start-ViteServer {
    Write-Host "  Starting Vite dev server..." -ForegroundColor Yellow
    # Start Vite and capture the port it actually uses
    $viteProcess = Start-Process cmd -ArgumentList "/c cd /d `"$projectDir`" && npx vite --host --port $vitePort" -PassThru
    Start-Sleep 3
    
    # Try to detect actual port from output (Vite may use different port if 3000 is busy)
    # For now, try common ports
    $global:viteUrl = "http://localhost:$vitePort"
    return $viteProcess
}

switch ($choice.ToUpper()) {
    "O" {
        Write-Host ""
        Write-Host "  Starting Ollama..." -ForegroundColor Yellow
        $ollamaRunning = Get-Process -Name ollama -ErrorAction SilentlyContinue
        if (-not $ollamaRunning) {
            Start-Process ollama -ArgumentList "serve" -WindowStyle Minimized
            Start-Sleep 3
            Write-Host "  Ollama started." -ForegroundColor Green
        } else {
            Write-Host "  Ollama already running." -ForegroundColor Green
        }

        Write-Host "  Starting Vite dev server..." -ForegroundColor Yellow
        Start-ViteServer
        Start-Sleep 4

        Write-Host "  Opening browser..." -ForegroundColor Yellow
        Start-Process $global:viteUrl
        Write-Host ""
        Write-Host "  Chloe is running at $global:viteUrl" -ForegroundColor Green
        Write-Host ""
        pause
    }
    "R" {
        Write-Host ""
        Write-Host "  Stopping existing servers..." -ForegroundColor Yellow
        Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep 2

        Write-Host "  Restarting Ollama..." -ForegroundColor Yellow
        $ollamaRunning = Get-Process -Name ollama -ErrorAction SilentlyContinue
        if (-not $ollamaRunning) {
            Start-Process ollama -ArgumentList "serve" -WindowStyle Minimized
            Start-Sleep 3
        }

        Write-Host "  Restarting Vite..." -ForegroundColor Yellow
        Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep 2
        Start-ViteServer
        Start-Sleep 4
        Start-Process $global:viteUrl

        Write-Host "  Server restarted!" -ForegroundColor Green
        Write-Host ""
        pause
    }
    "S" {
        Write-Host ""
        Write-Host "  Stopping all servers..." -ForegroundColor Red
        Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
        Write-Host "  Servers stopped." -ForegroundColor Green
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
        if ($ollamaRunning) { Write-Host "  [OK] Ollama is running" -ForegroundColor Green }
        else { Write-Host "  [OFF] Ollama is not running" -ForegroundColor Red }

        $nodeRunning = Get-Process -Name node -ErrorAction SilentlyContinue
        if ($nodeRunning) { Write-Host "  [OK] Vite server is running" -ForegroundColor Green }
        else { Write-Host "  [OFF] Vite server is not running" -ForegroundColor Red }

        try {
            $r = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method GET -ErrorAction Stop -TimeoutSec 3
            Write-Host "  [OK] Ollama API responding" -ForegroundColor Green
        } catch {
            Write-Host "  [OFF] Ollama API not reachable" -ForegroundColor Red
        }
        Write-Host ""
        pause
    }
    "L" {
        if ($global:viteUrl) { Start-Process $global:viteUrl } else { Start-Process "http://localhost:3000" }
    }
    "Q" {
        exit
    }
    default {
        Write-Host "  Invalid option. Try again." -ForegroundColor Red
        Start-Sleep 1
    }
}

Write-Host ""
& $PSCommandPath