$ErrorActionPreference = 'Stop'

function Read-EnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo de ambiente ausente: $Path"
  }

  $values = @{}
  foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $Path))) {
    if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
    $key = $matches[1]
    $value = $matches[2].Trim()
    if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    } elseif ($value.Length -ge 2 -and $value.StartsWith("'") -and $value.EndsWith("'")) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

$localEnvPath = Join-Path $PSScriptRoot '..\apps\api\.env'
$productionEnvPath = Join-Path $PSScriptRoot '..\apps\api\.env.production'
$localEnv = Read-EnvFile $localEnvPath
$productionEnv = Read-EnvFile $productionEnvPath

foreach ($name in @('DATABASE_URL', 'DIRECT_URL')) {
  if (-not $localEnv[$name]) { throw "$name ausente em apps/api/.env (ambiente local/teste)." }
  if (-not $productionEnv[$name]) { throw "$name ausente em apps/api/.env.production." }
}

function Normalized-DatabaseHost([string]$ConnectionString) {
  $dbHost = ([Uri]$ConnectionString).Host
  return $dbHost -replace '-pooler(?=\.)', ''
}

$localHost = Normalized-DatabaseHost $localEnv['DATABASE_URL']
$productionHost = Normalized-DatabaseHost $productionEnv['DATABASE_URL']
if ($localHost -eq $productionHost) {
  throw 'O banco local/teste aponta para o mesmo host da produção. Execução local bloqueada.'
}

# Local e testes usam a base de teste declarada em apps/api/.env.
# As variáveis explícitas também evitam que um DATABASE_URL herdado do shell
# sobrescreva essa separação (dotenv não substitui variáveis já definidas).
$env:NODE_ENV = 'development'
$env:DATABASE_URL = $localEnv['DATABASE_URL']
$env:DIRECT_URL = $localEnv['DIRECT_URL']

npm run dev -w @plataforma/api
exit $LASTEXITCODE
