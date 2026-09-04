# =====================================================================
#  Публикация релиза в GitHub Releases
#
#  Создаёт тег и релиз, заливает собранный exe и SHA256SUMS.txt.
#  Приложение при проверке обновлений ищет в релизе именно эти два файла:
#  без SHA256SUMS.txt установка из интерфейса не выполняется.
#
#  Токен берётся из переменной окружения и в репозиторий не попадает.
#  Создать: github.com/settings/tokens -> Fine-grained -> доступ к этому
#  репозиторию, право Contents: Read and write.
#
#      $env:GITHUB_TOKEN = "ghp_..."
#      powershell -ExecutionPolicy Bypass -File scripts\publish_release.ps1
#
#  Токен живёт только в текущем окне PowerShell и стирается при его закрытии.
# =====================================================================
param(
    [string]$Version = "",
    [string]$Repo = "snax1k/new-zapret2-gui",
    [switch]$Draft
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# --- 1. Версия -------------------------------------------------------
if (-not $Version) {
    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    $Version = $pkg.version
}
$tag = "v$Version"
Write-Host "== Релиз $tag для $Repo" -ForegroundColor Cyan

# --- 2. Токен --------------------------------------------------------
$token = $env:GITHUB_TOKEN
if (-not $token) {
    Write-Host "Не задан GITHUB_TOKEN." -ForegroundColor Red
    Write-Host 'Выполните в этом окне:  $env:GITHUB_TOKEN = "ваш_токен"' -ForegroundColor Yellow
    exit 1
}
$headers = @{
    Authorization          = "Bearer $token"
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent"           = "Zapret2-Release-Script"
}

# --- 3. Файлы сборки -------------------------------------------------
$dir = Join-Path $root "release-v$Version"
$exe = Join-Path $dir "Zapret2-GUI-v$Version-portable.exe"
if (-not (Test-Path $exe)) {
    Write-Host "Не найден $exe" -ForegroundColor Red
    Write-Host "Сначала соберите: powershell -ExecutionPolicy Bypass -File scripts\build.ps1" -ForegroundColor Yellow
    exit 1
}

# --- 4. Контрольная сумма --------------------------------------------
# Файл создаёт build.ps1 рядом со сборкой. Пересчитываем и сверяем: если
# exe правили после сборки, заливать его нельзя.
$sumsPath = Join-Path $dir "SHA256SUMS.txt"
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
if (Test-Path $sumsPath) {
    $stored = (Get-Content $sumsPath -Raw).Trim().Split(' ')[0].ToLower()
    if ($stored -ne $hash) {
        Write-Host "SHA256SUMS.txt не соответствует exe — пересоберите." -ForegroundColor Red
        Write-Host ("  в файле: " + $stored)
        Write-Host ("  реально: " + $hash)
        exit 1
    }
} else {
    "$hash  Zapret2-GUI-v$Version-portable.exe" | Out-File $sumsPath -Encoding ascii -NoNewline
}
Write-Host "   SHA-256: $hash" -ForegroundColor DarkGray

# --- 5. Описание релиза ----------------------------------------------
$notesPath = Join-Path $dir "README.txt"
if (Test-Path $notesPath) {
    $body = "``````" + [Environment]::NewLine + (Get-Content $notesPath -Raw -Encoding UTF8) + [Environment]::NewLine + "``````"
} else {
    $body = "Сборка $tag"
}

# --- 6. Проверяем, нет ли уже такого релиза --------------------------
$existing = $null
try {
    $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$tag" -Headers $headers
} catch { }

if ($existing) {
    Write-Host "Релиз $tag уже существует (id $($existing.id))." -ForegroundColor Yellow
    Write-Host "Удалите его на GitHub или поднимите версию." -ForegroundColor Yellow
    exit 1
}

# --- 7. Создаём релиз -------------------------------------------------
Write-Host "== Создание релиза..." -ForegroundColor Cyan
$payload = @{
    tag_name = $tag
    name     = "Zapret2 Control Center $tag"
    body     = $body
    draft    = [bool]$Draft
    prerelease = $false
} | ConvertTo-Json -Depth 3

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" `
    -Method Post -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($payload)) `
    -ContentType "application/json"

Write-Host "   id $($release.id)" -ForegroundColor DarkGray

# --- 8. Заливаем файлы ------------------------------------------------
function Send-Asset([string]$path, [string]$contentType) {
    $name = Split-Path $path -Leaf
    $uri = ($release.upload_url -replace '\{\?name,label\}', '') + "?name=$name"
    Write-Host "== Загрузка $name..." -ForegroundColor Cyan
    Invoke-RestMethod -Uri $uri -Method Post -Headers $headers `
        -InFile $path -ContentType $contentType | Out-Null
    Write-Host "   готово" -ForegroundColor DarkGray
}

Send-Asset $exe "application/vnd.microsoft.portable-executable"
Send-Asset $sumsPath "text/plain"

Write-Host ""
Write-Host "Релиз опубликован: $($release.html_url)" -ForegroundColor Green
Write-Host "Приложение старых версий увидит его при проверке обновлений." -ForegroundColor Green
