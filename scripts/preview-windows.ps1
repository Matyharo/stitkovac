param(
  [Parameter(Mandatory=$true)][string]$ProjectPath,
  [string]$SourceDatabase,
  [string]$PreviewPath,
  [int]$Port = 3001
)
$ErrorActionPreference = 'Stop'
$ProjectPath = [IO.Path]::GetFullPath($ProjectPath)
if (-not $PreviewPath) { $PreviewPath = "$ProjectPath-audit" }
$PreviewPath = [IO.Path]::GetFullPath($PreviewPath)
if ($Port -lt 1024 -or $Port -gt 65535 -or $Port -eq 3000) { throw 'Pouzijte samostatny port 1024-65535, napr. 3001.' }
if (Test-Path $PreviewPath) { throw "Cilovy adresar uz existuje: $PreviewPath. Pro novou instalaci zvolte jiny -PreviewPath." }
foreach ($command in @('git.exe','node.exe','npm.cmd')) { if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Chybi prikaz $command. Je potreba Git a Node.js 22+." } }
$major = [int]((& node.exe --version).TrimStart('v').Split('.')[0])
if ($major -lt 22) { throw 'Je potreba Node.js 22 nebo novejsi.' }
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } finally { $listener.Stop() }
$envPath = Join-Path $ProjectPath '.env'
if (-not (Test-Path $envPath -PathType Leaf)) { throw "Chybi konfigurace: $envPath" }
$configuration = [IO.File]::ReadAllText($envPath)
if (-not $SourceDatabase) {
  $schemaPath = Join-Path $ProjectPath 'prisma\schema.prisma'
  $schema = [IO.File]::ReadAllText($schemaPath)
  if ($schema -match 'url\s*=\s*"file:([^"]+)"') { $databasePart = $Matches[1] }
  elseif ($configuration -match '(?m)^\s*DATABASE_URL\s*=\s*"?(file:[^"\r\n]+)') { $databasePart = $Matches[1].Substring(5) }
  else { throw 'Cestu databaze nelze zjistit. Pridejte parametr -SourceDatabase s plnou cestou.' }
  if ([IO.Path]::IsPathRooted($databasePart)) { $SourceDatabase = $databasePart }
  else { $SourceDatabase = Join-Path (Split-Path $schemaPath) $databasePart }
}
$SourceDatabase = [IO.Path]::GetFullPath($SourceDatabase)
if (-not (Test-Path $SourceDatabase -PathType Leaf)) { throw "Zdrojova databaze nenalezena: $SourceDatabase" }
Write-Host "Zdroj dat: $SourceDatabase"
Write-Host "Samostatna testovaci instalace: $PreviewPath"
& git.exe clone --branch fix/technical-audit --single-branch https://github.com/Matyharo/stitkovac.git $PreviewPath
if ($LASTEXITCODE -ne 0) { throw 'Stazeni testovaci vetve selhalo.' }
Push-Location $PreviewPath
try {
  $env:DATABASE_URL = 'file:' + (Join-Path $PreviewPath 'prisma\preview.db').Replace('\','/')
  [Environment]::SetEnvironmentVariable('NODE_ENV', $null, 'Process')
  & npm.cmd ci --include=dev
  if ($LASTEXITCODE -ne 0) { throw 'Instalace zavislosti selhala.' }
  & npx.cmd prisma generate
  if ($LASTEXITCODE -ne 0) { throw 'Generovani databazoveho klienta selhalo.' }
  $target = Join-Path $PreviewPath 'prisma\preview.db'
  & node.exe --import tsx scripts/createPreviewDatabase.ts $SourceDatabase $target
  if ($LASTEXITCODE -ne 0) { throw 'Konzistentni kopie databaze selhala.' }
  $configuration = [regex]::Replace($configuration, '(?m)^\s*(DATABASE_URL|SESSION_SECRET|SESSION_COOKIE_NAME|SESSION_COOKIE_SECURE|BACKUP_DIRECTORY|OFFSITE_BACKUP_DIRECTORY)\s*=.*\r?\n?', '')
  $secret = & node.exe -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
  if ($LASTEXITCODE -ne 0) { throw 'Vytvoreni testovaciho klice selhalo.' }
  $url = 'file:' + $target.Replace('\','/')
  $backup = (Join-Path $PreviewPath 'prisma\database-backups').Replace('\','/')
  $cookie = 'stitkovac_preview_' + $Port
  $configuration += "`nDATABASE_URL=`"$url`"`nSESSION_SECRET=$secret`nSESSION_COOKIE_NAME=$cookie`nSESSION_COOKIE_SECURE=false`nBACKUP_DIRECTORY=`"$backup`"`nOFFSITE_BACKUP_DIRECTORY=`n"
  [IO.File]::WriteAllText((Join-Path $PreviewPath '.env'), $configuration, [Text.UTF8Encoding]::new($false))
  # Remove inherited deployment settings only inside this child PowerShell process.
  foreach ($key in @('DATABASE_URL','SESSION_SECRET','SESSION_COOKIE_NAME','SESSION_COOKIE_SECURE','BACKUP_DIRECTORY','OFFSITE_BACKUP_DIRECTORY')) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
  & npm.cmd run db:deploy
  if ($LASTEXITCODE -ne 0) { throw 'Migrace testovaci databaze selhala.' }
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Build selhal. Puvodni aplikace zustala zachovana.' }
  Write-Host "Testovaci aplikace: http://localhost:$Port - prihlaseni stejnymi uzivateli."
  Write-Host 'Puvodni aplikaci na portu 3000 tento skript nezastavuje ani neprepisuje.'
  & npm.cmd run start -- --hostname 127.0.0.1 --port $Port
} finally { Pop-Location }
