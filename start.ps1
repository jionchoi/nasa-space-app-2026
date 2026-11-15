# One-command run (Windows PowerShell): backend on :8000 and frontend on :5173. Ctrl+C stops both.
# First run creates backend\.venv and installs dependencies; later runs start straight away.
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Set-Location "$Root\backend"
if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Setting up backend\.venv (first run)..."
  python -m venv .venv
  .\.venv\Scripts\pip install -q -r requirements.txt
}
$backend = Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000" -PassThru -NoNewWindow

try {
  Set-Location "$Root\frontend"
  if (-not (Test-Path "node_modules")) { Write-Host "Installing frontend packages (first run)..."; npm install }
  Write-Host "Open http://localhost:5173"
  npm run dev
} finally {
  Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
  Set-Location $Root
}
