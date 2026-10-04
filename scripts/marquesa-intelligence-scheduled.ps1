# Prepared daily task action. Not registered by this script or setup.
# Due checks keep performance collection weekly. Never invokes an LLM.
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'marquesa-intelligence.ps1') collect --due --windows '28,90' --sources 'commerce,storefront,gsc,ga4,pagespeed,crux'
exit $LASTEXITCODE
