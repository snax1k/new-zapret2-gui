# Проверка строк запуска winws БЕЗ загрузки драйвера WinDivert.
# --wf-save заставляет ядро разобрать все аргументы, собрать фильтр и выйти,
# так что проверяются пути к спискам, .bin-пейлоадам и синтаксис всех опций.
# Прогоняются все варианты «Стратегия YouTube и Google» из интерфейса.
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

$cases = [ordered]@{
  "seqovl681 — seqovl 681" = "--wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-65535 --filter-udp=443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=quic_initial_www_google_com.bin --new --filter-udp=19294-19344,50000-65535 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6 --new --filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=443 --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --ip-id=zero --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --ipset={LISTS}/ipset-telegram.txt --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin"
  "seqovl-midsld — disorder + seqovl на midsld" = "--wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-65535 --filter-udp=443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=quic_initial_www_google_com.bin --new --filter-udp=19294-19344,50000-65535 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6 --new --filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=443 --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --ip-id=zero --dpi-desync=multidisorder --dpi-desync-split-pos=midsld --dpi-desync-split-seqovl=midsld-1 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --ipset={LISTS}/ipset-telegram.txt --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin"
  "fake-md5sig — fake + multidisorder (md5sig)" = "--wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-65535 --filter-udp=443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=quic_initial_www_google_com.bin --new --filter-udp=19294-19344,50000-65535 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6 --new --filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=443 --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --ip-id=zero --dpi-desync=fake,multidisorder --dpi-desync-split-pos=1,midsld --dpi-desync-repeats=6 --dpi-desync-fooling=md5sig --dpi-desync-fake-tls=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --ipset={LISTS}/ipset-telegram.txt --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin"
  "fake-badseq — fake + multisplit (badseq)" = "--wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-65535 --filter-udp=443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=quic_initial_www_google_com.bin --new --filter-udp=19294-19344,50000-65535 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6 --new --filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=443 --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --ip-id=zero --dpi-desync=fake,multisplit --dpi-desync-split-pos=1,midsld --dpi-desync-repeats=6 --dpi-desync-fooling=badseq --dpi-desync-fake-tls=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --ipset={LISTS}/ipset-telegram.txt --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin"
  "fake-autottl — fake + автоподбор TTL" = "--wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-65535 --filter-udp=443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=quic_initial_www_google_com.bin --new --filter-udp=19294-19344,50000-65535 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6 --new --filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=443 --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --ip-id=zero --dpi-desync=fake,multisplit --dpi-desync-split-pos=1,midsld --dpi-desync-repeats=6 --dpi-desync-autottl=2:3-12 --dpi-desync-fake-tls=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --ipset={LISTS}/ipset-telegram.txt --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin"
  "multidisorder — multidisorder без фейков" = "--wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-65535 --filter-udp=443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=quic_initial_www_google_com.bin --new --filter-udp=19294-19344,50000-65535 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6 --new --filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=443 --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --ip-id=zero --dpi-desync=multidisorder --dpi-desync-split-pos=1,midsld,host+1,sniext+1 --new --filter-tcp=80,443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --ipset={LISTS}/ipset-telegram.txt --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin"
  "off — Выключено (эталон)" = "--wf-tcp=80,443,2053,2083,2087,2096,8443 --wf-udp=443,19294-19344,50000-65535 --filter-udp=443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist={LISTS}/list-google.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fake-quic=quic_initial_www_google_com.bin --new --filter-udp=19294-19344,50000-65535 --filter-l7=discord,stun --dpi-desync=fake --dpi-desync-repeats=6 --new --filter-tcp=2053,2083,2087,2096,8443 --hostlist-domains=discord.media --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=681 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --hostlist={LISTS}/list-general.txt --hostlist={LISTS}/list-user.txt --hostlist-exclude={LISTS}/list-exclude.txt --hostlist-exclude={LISTS}/list-exclude-user.txt --dpi-desync=multisplit --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin --new --filter-tcp=80,443 --ipset={LISTS}/ipset-telegram.txt --dpi-desync=multisplit --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl=568 --dpi-desync-split-seqovl-pattern=tls_clienthello_www_google_com.bin"
}

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
