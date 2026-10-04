param([switch]$Reports, [switch]$SkipRuntime)
$ErrorActionPreference = 'Stop'
$intelligenceRoot = Split-Path -Parent $PSScriptRoot
$intelligencePython = Join-Path $intelligenceRoot '.venv-seo\Scripts\python.exe'
if (-not $SkipRuntime) {
    if (-not (Test-Path -LiteralPath $intelligencePython)) {
        & py -m venv (Join-Path $intelligenceRoot '.venv-seo')
        if ($LASTEXITCODE -ne 0) { throw 'Isolated Python runtime creation failed.' }
    }
    & $intelligencePython -m pip install -r (Join-Path $intelligenceRoot 'intelligence\requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Local core dependency installation failed.' }
    if ($Reports) {
        & $intelligencePython -m pip install -r (Join-Path $intelligenceRoot 'intelligence\requirements-reports.txt')
        if ($LASTEXITCODE -ne 0) { throw 'Optional local reporting installation failed.' }
    }
    & $intelligencePython -m pip check
    if ($LASTEXITCODE -ne 0) { throw 'Local dependencies are inconsistent.' }
}
$intelligenceConfig = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.config\marquesa-seo'
if (-not (Test-Path -LiteralPath $intelligenceConfig)) {
    New-Item -ItemType Directory -Path $intelligenceConfig | Out-Null
    # Restrict only the newly created dedicated directory, never an existing one.
    $intelligenceAcl = [System.Security.AccessControl.DirectorySecurity]::new()
    $intelligenceAcl.SetAccessRuleProtection($true, $false)
    $intelligenceUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $intelligenceSystemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    foreach ($intelligenceSid in @($intelligenceUserSid, $intelligenceSystemSid)) {
        $intelligenceRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $intelligenceSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $intelligenceAcl.AddAccessRule($intelligenceRule)
    }
    $intelligenceAcl.SetOwner($intelligenceUserSid)
    Set-Acl -LiteralPath $intelligenceConfig -AclObject $intelligenceAcl
}
$intelligenceEnvFile = Join-Path $intelligenceConfig '.env'
if (-not (Test-Path -LiteralPath $intelligenceEnvFile)) {
    Copy-Item -LiteralPath (Join-Path $intelligenceRoot 'intelligence\.env.example') -Destination $intelligenceEnvFile
}
Write-Output "External configuration ready: $intelligenceEnvFile"
Write-Output 'No credentials were generated. Existing configuration was preserved. No global environment settings changed.'
