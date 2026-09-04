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
    [switch]$Draft,
    # Перезалить файлы, которые уже лежат в релизе. Нужно, когда сборку
    # пришлось пересобрать под тем же номером версии — например, её забраковал
    # антивирус по эвристике, и новый двоичный файл проходит.
    [switch]$ReplaceAssets
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
# Два источника, по приоритету:
#   1) переменная окружения GITHUB_TOKEN — для разового запуска;
#   2) DPAPI-файл, созданный scripts\save_release_token.ps1.
#
# Второй вариант позволяет запускать публикацию, ни разу не показывая токен:
# он расшифровывается прямо в SecureString и нигде не печатается.
$token = $null
$tokenSource = ""

if ($env:GITHUB_TOKEN) {
    $token = $env:GITHUB_TOKEN
    $tokenSource = "переменная окружения GITHUB_TOKEN"
} else {
    $tokenPath = Join-Path $env:LOCALAPPDATA "Zapret2-GUI\release-token.xml"
    if (Test-Path $tokenPath) {
        try {
            $secure = Import-Clixml -Path $tokenPath
            $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            try {
                $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
            } finally {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
            }
            $tokenSource = "сохранённый токен ($tokenPath)"
        } catch {
            Write-Host "Не удалось расшифровать сохранённый токен: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Сохраните заново: scripts\save_release_token.ps1" -ForegroundColor Yellow
            exit 1
        }
    }
}

if (-not $token) {
    Write-Host "Токен не найден." -ForegroundColor Red
    Write-Host "Сохраните его один раз (ввод скрытый, в репозиторий не попадёт):" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\save_release_token.ps1" -ForegroundColor Yellow
    Write-Host 'Либо разово:  $env:GITHUB_TOKEN = "ваш_токен"' -ForegroundColor DarkGray
    exit 1
}
Write-Host "   источник токена: $tokenSource" -ForegroundColor DarkGray
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

# Релиз мог остаться с прошлого запуска без ассетов: заливка exe падает,
# если файл занят — например, приложение этой же версии только что запустили.
# Удалять такой релиз незачем, надо долить недостающее.
$release = $null
if ($existing) {
    Write-Host "Релиз $tag уже существует (id $($existing.id)) — дозаливаем файлы." -ForegroundColor Yellow
    $release = $existing
}

# --- 7. Создаём релиз -------------------------------------------------
if (-not $release) {
Write-Host "== Создание релиза..." -ForegroundColor Cyan
$payload = @{
    tag_name = $tag
    name     = "Zapret2 Control Center $tag"
    body     = $body
    draft    = [bool]$Draft
    prerelease = $false
} | ConvertTo-Json -Depth 3

try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" `
        -Method Post -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($payload)) `
        -ContentType "application/json"
} catch {
    # Сообщение исключения печатаем без заголовков: там лежит токен.
    Write-Host "Не удалось создать релиз: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host ("HTTP " + [int]$_.Exception.Response.StatusCode) -ForegroundColor Red
    }
    exit 1
}

Write-Host "   id $($release.id)" -ForegroundColor DarkGray
}

# --- 8. Заливаем файлы ------------------------------------------------
# Что уже лежит в релизе: повторная заливка того же имени вернула бы 422.
$already = @()
try {
    $assets = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/$($release.id)/assets" -Headers $headers
    foreach ($a in $assets) { $already += $a.name }
} catch { }

function Send-Asset([string]$path, [string]$contentType) {
    $name = Split-Path $path -Leaf

    if ($already -contains $name) {
        if (-not $ReplaceAssets) {
            Write-Host "== $name уже в релизе, пропускаем" -ForegroundColor DarkGray
            return
        }
        # Заменить ассет на месте нельзя: GitHub на повторное имя отвечает 422,
        # поэтому сначала удаляем старый.
        $old = $assets | Where-Object { $_.name -eq $name }
        foreach ($a in $old) {
            Write-Host "== Удаление прежнего $name (id $($a.id))..." -ForegroundColor Yellow
            try {
                Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/assets/$($a.id)" `
                    -Method Delete -Headers $headers | Out-Null
            } catch {
                Write-Host "Не удалось удалить прежний ${name}: $($_.Exception.Message)" -ForegroundColor Red
                exit 1
            }
        }
    }

    $uri = ($release.upload_url -replace '\{\?name,label\}', '') + "?name=$name"
    Write-Host "== Загрузка $name..." -ForegroundColor Cyan

    # Заливаем всегда с копии во временном каталоге.
    #
    # Invoke-RestMethod -InFile открывает файл без разрешения на совместное
    # чтение, поэтому запущенная сборка этой же версии (обычное дело: её
    # только что поставили и проверяют) намертво блокирует публикацию.
    # Copy-Item читать запущенный exe умеет.
    $temp = Join-Path ([IO.Path]::GetTempPath()) ("zapret2-upload-" + [Guid]::NewGuid().ToString("N") + "-" + $name)
    try {
        Copy-Item -LiteralPath $path -Destination $temp -Force
    } catch {
        Write-Host "Не удалось скопировать ${name} для загрузки: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }

    try {
        Invoke-RestMethod -Uri $uri -Method Post -Headers $headers `
            -InFile $temp -ContentType $contentType | Out-Null
        Write-Host "   готово" -ForegroundColor DarkGray
    } catch {
        Write-Host "Не удалось залить ${name}: $($_.Exception.Message)" -ForegroundColor Red
        Remove-Item $temp -Force -ErrorAction SilentlyContinue
        exit 1
    }

    Remove-Item $temp -Force -ErrorAction SilentlyContinue
}

Send-Asset $exe "application/vnd.microsoft.portable-executable"
Send-Asset $sumsPath "text/plain"

Write-Host ""
Write-Host "Релиз опубликован: $($release.html_url)" -ForegroundColor Green
Write-Host "Приложение старых версий увидит его при проверке обновлений." -ForegroundColor Green
