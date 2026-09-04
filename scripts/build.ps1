# =====================================================================
#  Сборка Zapret2 Control Center — portable single-file exe
#  Запуск:  powershell -ExecutionPolicy Bypass -File scripts\build.ps1
# =====================================================================
param(
    [string]$Version = "0.1.3"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host "== Корень проекта: $root" -ForegroundColor Cyan

# --- 0. Версия должна совпадать в трёх местах -----------------------
# Приложение сравнивает свою версию с тегом последнего релиза на GitHub.
# Если AppVersion в NativeApp.cs и APP_VERSION в AppContext.tsx разойдутся,
# проверка обновлений начнёт врать: предлагать уже установленное либо
# молчать о вышедшем.
$nativeMatch = Select-String -Path "src-native\NativeApp.cs" -Pattern 'AppVersion\s*=\s*"([\d.]+)"' | Select-Object -First 1
$webMatch = Select-String -Path "src\context\AppContext.tsx" -Pattern "APP_VERSION\s*=\s*'([\d.]+)'" | Select-Object -First 1
$pkgMatch = Select-String -Path "package.json" -Pattern '"version"\s*:\s*"([\d.]+)"' | Select-Object -First 1
if (-not $nativeMatch -or -not $webMatch -or -not $pkgMatch) { throw "Не удалось прочитать версию из исходников" }
$nativeVer = $nativeMatch.Matches[0].Groups[1].Value
$webVer = $webMatch.Matches[0].Groups[1].Value
$pkgVer = $pkgMatch.Matches[0].Groups[1].Value

if ($nativeVer -ne $Version -or $webVer -ne $Version -or $pkgVer -ne $Version) {
    Write-Host "Версии разошлись:" -ForegroundColor Red
    Write-Host ("  build.ps1      : " + $Version)
    Write-Host ("  NativeApp.cs   : " + $nativeVer)
    Write-Host ("  AppContext.tsx : " + $webVer)
    Write-Host ("  package.json   : " + $pkgVer)
    throw "Приведите версии к одному значению перед сборкой"
}

# Версию нельзя писать в вёрстке руками: заголовок окна и стартовая запись
# в логе берут её из APP_VERSION, иначе она тихо расходится со сборкой.
$hardcoded = Select-String -Path "src\components\*.tsx", "src\views\*.tsx" -Pattern 'v\d+\.\d+\.\d+-portable'
if ($hardcoded) {
    Write-Host "Версия зашита в разметке:" -ForegroundColor Red
    $hardcoded | ForEach-Object { Write-Host ("  " + $_.Path + ":" + $_.LineNumber) }
    throw "Замените зашитую версию на APP_VERSION"
}
Write-Host "== Версия $Version согласована во всех четырёх местах" -ForegroundColor DarkGray

# --- 1. Сборка веб-интерфейса (Vite) --------------------------------
Write-Host "== [1/5] Сборка фронтенда (tsc + vite build)..." -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install завершился с ошибкой" }
}
& npm run build
if ($LASTEXITCODE -ne 0) { throw "vite build завершился с ошибкой" }

# --- 2. Упаковка ресурсов -------------------------------------------
Write-Host "== [2/5] Упаковка dist.zip и bin.zip..." -ForegroundColor Cyan

if (Test-Path "dist.zip") { Remove-Item "dist.zip" -Force }
Compress-Archive -Path "dist\*" -DestinationPath "dist.zip" -CompressionLevel Optimal

if (Test-Path "bin.zip") { Remove-Item "bin.zip" -Force }
# В архив попадают только файлы верхнего уровня bin\ (winws.exe, WinDivert,
# .bin-пейлоады). Вложенные каталоги с примерами не нужны.
$binFiles = Get-ChildItem "bin" -File | ForEach-Object { $_.FullName }
Compress-Archive -Path $binFiles -DestinationPath "bin.zip" -CompressionLevel Optimal

# Списки доменов лежат отдельно от ядра: bin\ перезаписывается целиком при
# каждом запуске, а в host-list\ рядом с поставляемыми списками живут
# пользовательские файлы, которые затирать нельзя.
if (Test-Path "lists.zip") { Remove-Item "lists.zip" -Force }
$listFiles = Get-ChildItem "host-list" -File | Where-Object { $_.Name -notlike "*-user.txt" } | ForEach-Object { $_.FullName }
Compress-Archive -Path $listFiles -DestinationPath "lists.zip" -CompressionLevel Optimal

if (-not (Test-Path "bin\winws.exe")) { throw "bin\winws.exe отсутствует — ядро не будет работать" }
if (-not (Test-Path "bin\WinDivert64.sys")) { throw "bin\WinDivert64.sys отсутствует" }
if (-not (Test-Path "bin\cygwin1.dll")) { throw "bin\cygwin1.dll отсутствует (winws — cygwin-сборка)" }
foreach ($l in @("list-general.txt", "list-google.txt", "list-exclude.txt", "ipset-telegram.txt")) {
    if (-not (Test-Path "host-list\$l")) { throw "host-list\$l отсутствует" }
}

# --- 3. Поиск компилятора C# ----------------------------------------
Write-Host "== [3/5] Поиск csc.exe..." -ForegroundColor Cyan
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "Не найден csc.exe по пути $csc (нужен .NET Framework 4.x)" }
Write-Host "   $csc"

# --- 4. Компиляция exe ----------------------------------------------
Write-Host "== [4/5] Компиляция Zapret2-GUI-v$Version-portable.exe..." -ForegroundColor Cyan

$outDir = Join-Path $root "release-v$Version"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$outExe = Join-Path $outDir "Zapret2-GUI-v$Version-portable.exe"

$wv2 = Join-Path $root "packages\webview2"
$refCore = Join-Path $wv2 "lib\net462\Microsoft.Web.WebView2.Core.dll"
$refForms = Join-Path $wv2 "lib\net462\Microsoft.Web.WebView2.WinForms.dll"
$loader = Join-Path $wv2 "runtimes\win-x64\native\WebView2Loader.dll"

foreach ($f in @($refCore, $refForms, $loader)) {
    if (-not (Test-Path $f)) { throw "Не найдена зависимость WebView2: $f" }
}

$cscArgs = @(
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    "/optimize+",
    "/win32icon:app.ico",
    "/win32manifest:app.manifest",
    "/out:$outExe",
    "/reference:$refCore",
    "/reference:$refForms",
    "/reference:System.dll",
    "/reference:System.Core.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.IO.Compression.dll",
    "/reference:System.IO.Compression.FileSystem.dll",
    # Ресурсы читаются по этим именам в NativeApp.cs — переименовывать нельзя.
    "/resource:dist.zip,dist.zip",
    "/resource:bin.zip,bin.zip",
    "/resource:lists.zip,lists.zip",
    "/resource:$refCore,Microsoft.Web.WebView2.Core.dll",
    "/resource:$refForms,Microsoft.Web.WebView2.WinForms.dll",
    "/resource:$loader,WebView2Loader.dll",
    "src-native\NativeApp.cs"
)

& $csc $cscArgs
if ($LASTEXITCODE -ne 0) { throw "Компиляция завершилась с ошибкой (код $LASTEXITCODE)" }

# --- 5. Контрольная сумма --------------------------------------------
# Кладётся рядом со сборкой сразу: её заливает scripts\publish_release.ps1,
# и по ней же приложение проверяет скачанный файл перед установкой. Без
# SHA256SUMS.txt в релизе установка из интерфейса не выполняется.
$hash = (Get-FileHash $outExe -Algorithm SHA256).Hash.ToLower()
$sums = Join-Path $outDir "SHA256SUMS.txt"
"$hash  Zapret2-GUI-v$Version-portable.exe" | Out-File $sums -Encoding ascii -NoNewline
Write-Host "== SHA-256: $hash" -ForegroundColor DarkGray

# --- 6. Итог ---------------------------------------------------------
Write-Host "== [5/5] Готово" -ForegroundColor Green
$info = Get-Item $outExe
Write-Host ("   {0}  ({1:N2} МБ)" -f $info.FullName, ($info.Length / 1MB)) -ForegroundColor Green
