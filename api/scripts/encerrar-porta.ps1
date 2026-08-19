# Encerra so o processo (e a arvore dele) que esta ouvindo numa porta
# especifica deste projeto -- nunca "todo wrangler" ou "todo workerd" da
# maquina. Corrige o problema de processos zumbis descrito em
# docs/DEVELOPMENT.md: um `wrangler dev` que morre mal deixa um
# `workerd.exe` orfao respondendo na mesma porta, e matar por nome de
# processo (pkill wrangler) tambem mata sessoes de OUTROS projetos rodando
# na mesma maquina.
#
# Uso: powershell -File encerrar-porta.ps1 -Porta 8787
param(
  [Parameter(Mandatory = $true)][int]$Porta
)

function Get-ArvoreDoProcesso($pidInicial) {
  $vistos = New-Object System.Collections.Generic.HashSet[int]
  $fila = New-Object System.Collections.Generic.Queue[int]
  $fila.Enqueue($pidInicial)
  while ($fila.Count -gt 0) {
    $atual = $fila.Dequeue()
    if (-not $vistos.Add($atual)) { continue }
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $atual" |
      ForEach-Object { $fila.Enqueue($_.ProcessId) }
  }
  return $vistos
}

$conexoes = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
if (-not $conexoes) {
  Write-Output "porta $Porta ja estava livre"
  exit 0
}

$donos = $conexoes | Select-Object -ExpandProperty OwningProcess -Unique
$alvo = New-Object System.Collections.Generic.HashSet[int]
foreach ($d in $donos) {
  # sobe ate achar a raiz da arvore do wrangler (bash/node/cmd que lancou),
  # nao so o dono literal da porta -- senao o supervisor reaparece e sobe
  # um workerd.exe novo na mesma porta.
  $p = Get-CimInstance Win32_Process -Filter "ProcessId = $d" -ErrorAction SilentlyContinue
  $raiz = $d
  while ($p -and $p.CommandLine -match 'wrangler|workerd|node|npx|npm|cmd\.exe' -and $p.ParentProcessId) {
    $pai = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.ParentProcessId)" -ErrorAction SilentlyContinue
    if (-not $pai -or $pai.CommandLine -notmatch 'wrangler|workerd|node|npx|npm|cmd\.exe|bash\.exe') { break }
    $raiz = $pai.ProcessId
    $p = $pai
  }
  Get-ArvoreDoProcesso $raiz | ForEach-Object { [void]$alvo.Add($_) }
}

foreach ($id in $alvo) {
  try { Stop-Process -Id $id -Force -ErrorAction Stop; Write-Output "encerrado $id" }
  catch { Write-Output "ja nao existia $id" }
}

Start-Sleep -Seconds 1
if (Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue) {
  Write-Output "AVISO: porta $Porta continua ocupada -- pode haver outro processo alheio a este projeto nela"
  exit 1
}
Write-Output "porta $Porta livre"
