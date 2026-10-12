# Проверка строк запуска winws БЕЗ загрузки драйвера WinDivert.
# --wf-save заставляет ядро разобрать все аргументы, собрать фильтр и выйти,
# так что проверяются пути к спискам, .bin-пейлоадам и синтаксис всех опций.
# Прогоняются все варианты библиотеки стратегий из интерфейса.
# Требуются права администратора (winws.exe помечен requireAdministrator).
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$bin  = Join-Path $root "bin"
$save = Join-Path $env:TEMP "zapret2_wf.txt"
$log  = Join-Path $env:TEMP "zapret2_verify.log"
if (Test-Path $log) { Remove-Item $log -Force }
function Log([string]$m) { Write-Host $m; Add-Content -Path $log -Value $m -Encoding UTF8 }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Log "verify_args start; bin=$bin; admin=$isAdmin"

# {LISTS} заменяется на абсолютный путь к host-list — так же, как это делает
# приложение перед запуском ядра.
$listsDir = (Join-Path $root "host-list").Replace([char]92, '/')
function Resolve-Lists([string]$c) {
  return [regex]::Replace($c, '(--[a-z0-9\-]+=)\{LISTS\}/(\S+)', {
    param($m)
    $m.Groups[1].Value + '"' + $listsDir + '/' + $m.Groups[2].Value + '"'
  })
}

# Командная строка пресета; {YT} — опции профиля YouTube, их подставляет
# каждая стратегия. Сами стратегии берутся из src/lib/zapretCommand.ts через
# dump_strategies.mjs — так проверяется ровно то, что попадёт в exe.
$template = "--wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-50100 --filter-udp=443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=quic_initial_www_google_com.bin --new --filter-udp=19294-19344,50000-50100 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6 --new --filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=443 --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt {YT} --new --filter-tcp=80,443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --ipset={LISTS}/ipset-telegram.txt --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin"
$offCase = "--wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-50100 --filter-udp=443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=quic_initial_www_google_com.bin --new --filter-udp=19294-19344,50000-50100 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6 --new --filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --ipset={LISTS}/ipset-telegram.txt --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin"

# node пишет UTF-8, а PowerShell 5.1 по умолчанию читает в кодировке консоли.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$json = & node (Join-Path $PSScriptRoot "dump_strategies.mjs")
if ($LASTEXITCODE -ne 0 -or -not $json) { throw "Не удалось прочитать библиотеку стратегий (нужен node и npm install)" }
$strategies = $json | ConvertFrom-Json

$cases = [ordered]@{}
foreach ($s in $strategies) {
  $name = $s.id + " — " + $s.label
  if ($s.id -eq "off") { $cases[$name] = $offCase }
  else { $cases[$name] = $template.Replace("{YT}", $s.options) }
}
Log ("Стратегий в библиотеке: " + $cases.Count)

$failed = 0
foreach ($name in $cases.Keys) {
  $cmdline = Resolve-Lists $cases[$name]

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = Join-Path $bin "winws.exe"
  $psi.Arguments = $cmdline + ' --wf-save="' + $save + '"'
  $psi.WorkingDirectory = $bin
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true

  Log ""
  Log ("=== " + $name + " ===")
  try { $p = [System.Diagnostics.Process]::Start($psi) }
  catch { Log ("ЗАПУСК НЕ УДАЛСЯ: " + $_.Exception.Message); $failed++; continue }

  $out = $p.StandardOutput.ReadToEnd()
  $err = $p.StandardError.ReadToEnd()
  $p.WaitForExit(15000) | Out-Null

  Log ("ExitCode: " + $p.ExitCode)
  if ($p.ExitCode -ne 0) {
    $failed++
    Log ("winws.exe " + $cmdline)
    if ($out.Trim()) { Log ("STDOUT: " + $out.Trim()) }
    if ($err.Trim()) { Log ("STDERR: " + $err.Trim()) }
  } else {
    $profiles = ([regex]::Matches($out, "we have (\d+) user defined desync profile")) |
                ForEach-Object { $_.Groups[1].Value }
    if ($profiles) { Log ("Профилей: " + $profiles[0]) }
  }
}

Log ""
if ($failed -eq 0) { Log "ИТОГ: все стратегии разобраны без ошибок." }
else { Log ("ИТОГ: неудачных стратегий — " + $failed) }
Log ("Полный лог: " + $log)
