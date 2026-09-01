# =====================================================================
#  Сборка Zapret2 Control Center — portable single-file exe
#  Запуск:  powershell -ExecutionPolicy Bypass -File scripts\build.ps1
# =====================================================================
param(
    [string]$Version = "0.0.8"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host "== Корень проекта: $root" -ForegroundColor Cyan

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

# --- 5. Итог ---------------------------------------------------------
Write-Host "== [5/5] Готово" -ForegroundColor Green
$info = Get-Item $outExe
Write-Host ("   {0}  ({1:N2} МБ)" -f $info.FullName, ($info.Length / 1MB)) -ForegroundColor Green
