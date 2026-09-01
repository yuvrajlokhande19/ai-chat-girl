Write-Host "=== Chloe AI - Backend Setup ===" -ForegroundColor Cyan

$MODEL_NAME = "gemma-teenager"
$BASE_MODEL = "gemma4:latest"

Write-Host ""
Write-Host "Step 1: Checking Ollama..." -ForegroundColor Yellow
try {
    $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method GET -ErrorAction Stop
    Write-Host "Ollama server is running." -ForegroundColor Green
} catch {
    Write-Host "ERROR: Ollama server not reachable!" -ForegroundColor Red
    Write-Host "Fix: Open a new terminal and run: ollama serve" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Step 2: Checking model $MODEL_NAME..." -ForegroundColor Yellow
$modelExists = $tags.models | Where-Object { $_.name -like "$MODEL_NAME*" }
if (-not $modelExists) {
    Write-Host "Model $MODEL_NAME not found. Creating from $BASE_MODEL..." -ForegroundColor Yellow
    try {
        ollama create $MODEL_NAME -f "$PSScriptRoot\config\Modelfile"
        Write-Host "Model $MODEL_NAME created successfully!" -ForegroundColor Green
    } catch {
        Write-Host "ERROR creating model: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Model $MODEL_NAME exists." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== All checks passed! ===" -ForegroundColor Green
Write-Host "Run: npm run dev" -ForegroundColor Cyan