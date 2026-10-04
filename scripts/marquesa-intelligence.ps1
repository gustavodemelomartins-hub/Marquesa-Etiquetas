# Codex-first entry point. No Claude installation, shell evaluation or secrets.
$ErrorActionPreference = 'Stop'
$intelligenceRoot = Split-Path -Parent $PSScriptRoot
$intelligencePython = Join-Path $intelligenceRoot '.venv-seo\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $intelligencePython)) {
    throw 'Local runtime missing. Run scripts/setup-marquesa-intelligence.ps1.'
}
$env:PYTHONPATH = Join-Path $intelligenceRoot 'intelligence'
$env:MPLCONFIGDIR = Join-Path $intelligenceRoot '.local\intelligence\matplotlib'
$env:PYTHONIOENCODING = 'utf-8'
& $intelligencePython -m marquesa_intelligence @args
exit $LASTEXITCODE
