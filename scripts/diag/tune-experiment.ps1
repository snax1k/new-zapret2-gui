# =====================================================================
#  Почему автоподбор врёт: эксперимент на живом ядре
#
#  Запускать через tune-experiment.bat при ЗАКРЫТОЙ программе. Нужны
#  права администратора (драйвер WinDivert) — скрипт сам попросит UAC.
#  Длится около шести минут. Результат — claude-tune.txt рядом.
#
#  Отвечает на три вопроса, каждый отдельной фазой:
#
#   1. ПРОГРЕВ. Сколько времени проходит от запуска ядра до первого
#      успешного обхода. Подбор ждёт 600 мс — если ядру нужно больше,
#      первые пробы каждого варианта проваливаются зря.
#
#   2. НАКАЗАНИЕ. Подбор первым делом открывает заблокированные
#      соединения (эталон «без обхода») — к тем же адресам, на которых
#      потом проверяет все стратегии. Если после этого DPI какое-то время
#      режет этот адрес даже при рабочем обходе, эталон сам отравляет
#      подбор. Сравнивается отравленный адрес с нетронутым, раз в 30 с.
#
#   3. ШТОРМ. Полсотни проб подряд — не приводят ли они сами по себе к
#      отказам.
#
#  Все пробы идут напрямую, с привязкой к физической карте, мимо
#  системного прокси и туннелей. Ядро фильтрует только имена Discord и
#  только на физической карте — остальной трафик машины не трогается.
# =====================================================================

$ErrorActionPreference = "Continue"
$self = $MyInvocation.MyCommand.Path
$out = Join-Path $PSScriptRoot "claude-tune.txt"

# --- права администратора ---------------------------------------------
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Ядру нужен драйвер WinDivert, а для него права администратора."
    Write-Host "Сейчас появится запрос Windows — эксперимент откроется в отдельном окне."
    Start-Process powershell -Verb RunAs -Wait -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$self`"")
    exit
}

function W($text) {
    Write-Host $text
    Add-Content -Path $out -Value $text -Encoding UTF8
}

function Finish() {
    Write-Host ""
    Write-Host "Нажмите Enter, чтобы закрыть окно."
    [void](Read-Host)
}

# --- ядро ---------------------------------------------------------------
$bin = Join-Path $env:LOCALAPPDATA "Zapret2-GUI\bin"
$winwsExe = Join-Path $bin "winws.exe"
if (-not (Test-Path $winwsExe)) {
    W "Не найдено ядро: $winwsExe. Запустите программу хотя бы раз, чтобы она распаковала его."
    Finish; exit
}
if (Get-Process winws -ErrorAction SilentlyContinue) {
    W "Ядро уже запущено. Закройте программу полностью (трей -> Выход) и запустите эксперимент снова."
    Finish; exit
}

# --- физическая карта -----------------------------------------------------
$markers = @('tun','tap','vpn','wireguard','wintun','openvpn','tailscale',
             'zerotier','hamachi','radmin','proton','nord','express','socks',
             'loopback','virtual','pseudo','teredo','isatap')
$bindIp = $null; $ifIdx = 0; $ifName = ""
foreach ($ni in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($ni.OperationalStatus -ne 'Up') { continue }
    if ($ni.NetworkInterfaceType -eq 'Loopback') { continue }
    $text = ($ni.Description + ' ' + $ni.Name).ToLower()
    $hit = $false
    foreach ($m in $markers) { if ($text.Contains($m)) { $hit = $true; break } }
    if ($hit) { continue }
    $props = $ni.GetIPProperties()
    $gw = $props.GatewayAddresses | Where-Object {
        $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.ToString() -ne '0.0.0.0' }
    if (-not $gw) { continue }
    $ip = $props.UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1
    if ($ip) {
        $bindIp = $ip.Address.ToString(); $ifName = $ni.Name
        $ifIdx = $props.GetIPv4Properties().Index
        break
    }
}
if (-not $bindIp) { W "Не нашлась физическая сетевая карта с выходом в интернет."; Finish; exit }

# --- пробы с настоящими таймаутами -----------------------------------------
Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;

public static class TuneX
{
    public static string Tls(string bind, string ip, string sni, int tlsMs)
    {
        var sw = Stopwatch.StartNew();
        TcpClient tcp = null;
        try
        {
            tcp = new TcpClient(new IPEndPoint(IPAddress.Parse(bind), 0));
            var c = tcp.ConnectAsync(ip, 443);
            if (!c.Wait(4000)) return "FAIL tcp-timeout " + sw.ElapsedMilliseconds;
            var ssl = new SslStream(tcp.GetStream(), false, delegate { return true; });
            var t = ssl.AuthenticateAsClientAsync(sni, null, SslProtocols.Tls12, false);
            if (!t.Wait(tlsMs)) return "FAIL tls-hang " + sw.ElapsedMilliseconds;
            return "OK " + sw.ElapsedMilliseconds;
        }
        catch (Exception ex)
        {
            var e = ex; while (e.InnerException != null) e = e.InnerException;
            string m = e.Message.Split('\n')[0].Trim();
            if (m.Length > 70) m = m.Substring(0, 70);
            return "FAIL " + e.GetType().Name + " " + sw.ElapsedMilliseconds + " " + m;
        }
        finally { if (tcp != null) { try { tcp.Close(); } catch { } } }
    }

    public static bool Tcp(string bind, string ip, int ms)
    {
        TcpClient tcp = null;
        try
        {
            tcp = new TcpClient(new IPEndPoint(IPAddress.Parse(bind), 0));
            var c = tcp.ConnectAsync(ip, 443);
            return c.Wait(ms) && tcp.Connected;
        }
        catch { return false; }
        finally { if (tcp != null) { try { tcp.Close(); } catch { } } }
    }
}
"@

# Стратегия, которая у этого пользователя работает для Discord (22.09).
# Один профиль, только имена Discord, только физическая карта.
$coreArgs = "--wf-iface=$ifIdx --wf-tcp=443 --filter-tcp=443 " +
    "--hostlist-domains=discord.com,discord.gg,discordapp.com,discordapp.net " +
    "--ip-id=zero --dpi-desync=multidisorder --dpi-desync-split-pos=1,midsld,host+1,sniext+1"

$script:core = $null
$script:coreClock = $null
function Start-Core {
    $script:core = Start-Process -FilePath $winwsExe -ArgumentList $coreArgs -WorkingDirectory $bin `
        -WindowStyle Hidden -PassThru
    $script:coreClock = [Diagnostics.Stopwatch]::StartNew()
}
function Stop-Core {
    if ($script:core) {
        try { Stop-Process -Id $script:core.Id -Force -ErrorAction SilentlyContinue } catch { }
        try { $script:core.WaitForExit(3000) | Out-Null } catch { }
        $script:core = $null
    }
    Get-Process winws -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
function CoreMs { if ($script:coreClock) { return $script:coreClock.ElapsedMilliseconds } else { return -1 } }
function Alive { return ($script:core -and -not $script:core.HasExited) }

$clock = [Diagnostics.Stopwatch]::StartNew()
function T { return ("{0,6:0.0}с" -f ($clock.ElapsedMilliseconds / 1000.0)) }

try {
    W ""
    W "================================================================="
    W ("ЭКСПЕРИМЕНТ от " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    W "================================================================="
    W ("карта: $ifName, ifIndex=$ifIdx, пробы с $bindIp")
    W ("ядро: winws.exe $coreArgs")

    # --- пул адресов: пара (адрес, своё имя) -------------------------------
    W ""
    W "--- 0. ПУЛ АДРЕСОВ ---"
    $hosts = @('discord.com','gateway.discord.gg','updates.discord.com','cdn.discordapp.com','media.discordapp.net')
    $pool = New-Object System.Collections.ArrayList
    $seen = @{}
    foreach ($h in $hosts) {
        try { $addrs = [System.Net.Dns]::GetHostAddresses($h) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } }
        catch { W "  DNS $h — ошибка"; continue }
        foreach ($a in $addrs) {
            $s = $a.ToString()
            if ($seen.ContainsKey($s)) { continue }
            $seen[$s] = 1
            if ([TuneX]::Tcp($bindIp, $s, 2500)) { [void]$pool.Add(@{ Ip = $s; Host = $h }) }
            else { W "  $s ($h) — TCP не отвечает, пропущен" }
        }
    }
    W ("  живых адресов: " + $pool.Count)
    if ($pool.Count -lt 2) { W "  Живых адресов Discord нет — сравнивать нечего. Проверьте сеть."; return }
    if ($pool.Count -lt 10) { W "  Мало адресов для чистого эксперимента (нужно 10): часть проб пойдёт на повторные адреса." }
    $i = 0
    foreach ($p in $pool) { W ("  [{0}] {1}  {2}" -f $i, $p.Ip, $p.Host); $i++ }
    function P($n) { return $pool[$n % $pool.Count] }

    # --- 1. эталон: как подбор, при выключенном ядре ----------------------
    W ""
    W "--- 1. ЭТАЛОН БЕЗ ОБХОДА (ядро выключено) — так начинает подбор ---"
    $p0 = P 0
    W ("{0}  [0] контроль, чужое имя www.cloudflare.com: {1}" -f (T), [TuneX]::Tls($bindIp, $p0.Ip, "www.cloudflare.com", 6000))
    W ("{0}  [0] {1}, попытка 1: {2}" -f (T), $p0.Host, [TuneX]::Tls($bindIp, $p0.Ip, $p0.Host, 6000))
    W ("{0}  [0] {1}, попытка 2: {2}" -f (T), $p0.Host, [TuneX]::Tls($bindIp, $p0.Ip, $p0.Host, 6000))
    $poisonAt = $clock.ElapsedMilliseconds
    W "  адрес [0] теперь «отравлен» — к нему только что ходили с заблокированным именем"

    # --- 2. прогрев --------------------------------------------------------
    W ""
    W "--- 2. ПРОГРЕВ: пробы на свежих адресах сразу после запуска ядра ---"
    W "  (подбор ждёт 600 мс; смотрим, с какого момента обход начинает работать)"
    Start-Core
    foreach ($n in 1..5) {
        $p = P $n
        $at = CoreMs
        $r = [TuneX]::Tls($bindIp, $p.Ip, $p.Host, 3000)
        W ("{0}  ядро живёт {1,5} мс  [{2}] {3,-22} {4}" -f (T), $at, $n, $p.Host, $r)
        if (-not (Alive)) { W "  ЯДРО УМЕРЛО — эксперимент дальше не имеет смысла"; break }
    }

    # --- 3. наказание ------------------------------------------------------
    W ""
    W "--- 3. НАКАЗАНИЕ: отравленный адрес [0] против нетронутого [6] ---"
    W "  (ядро уже прогрето; раз в 30 с, пока [0] не пройдёт дважды подряд или 5 мин)"
    while ((CoreMs) -lt 8000) { Start-Sleep -Milliseconds 200 }
    $p6 = P 6
    $okRow = 0
    for ($k = 0; $k -le 10; $k++) {
        $since = [int](($clock.ElapsedMilliseconds - $poisonAt) / 1000)
        $r0 = [TuneX]::Tls($bindIp, $p0.Ip, $p0.Host, 6000)
        $r6 = [TuneX]::Tls($bindIp, $p6.Ip, $p6.Host, 6000)
        W ("{0}  через {1,3} с после отравления   [0]: {2,-26}  [6]: {3}" -f (T), $since, $r0, $r6)
        if ($r0.StartsWith("OK")) { $okRow++ } else { $okRow = 0 }
        if ($okRow -ge 2) { break }
        if (-not (Alive)) { W "  ЯДРО УМЕРЛО"; break }
        if ($k -lt 10) { Start-Sleep -Seconds 30 }
    }

    # --- 4. перезапуск, как между вариантами подбора ------------------------
    W ""
    W "--- 4. ПЕРЕЗАПУСК ЯДРА, как между вариантами подбора ---"
    foreach ($wait in @(600, 1500, 3000)) {
        Stop-Core
        Start-Sleep -Milliseconds 300
        Start-Core
        Start-Sleep -Milliseconds $wait
        $n = 7
        $p = P $n
        W ("{0}  пауза {1,4} мс после запуска  [{2}] {3,-22} {4}" -f (T), $wait, $n, $p.Host, [TuneX]::Tls($bindIp, $p.Ip, $p.Host, 6000))
    }

    # --- 5. шторм -------------------------------------------------------------
    W ""
    W "--- 5. ШТОРМ: 24 пробы подряд на один адрес с паузой 250 мс ---"
    Start-Sleep -Seconds 2
    $p8 = P 8
    $line = ""; $good = 0
    for ($s = 1; $s -le 24; $s++) {
        $r = [TuneX]::Tls($bindIp, $p8.Ip, $p8.Host, 6000)
        if ($r.StartsWith("OK")) { $good++; $line += "+" } else { $line += "x"; W ("{0}  проба {1}: {2}" -f (T), $s, $r) }
        Start-Sleep -Milliseconds 250
    }
    W ("  [8] {0}: {1}  — успешно {2} из 24" -f $p8.Host, $line, $good)
    $p9 = P 9
    W ("{0}  после шторма, свежий адрес [9] {1}: {2}" -f (T), $p9.Host, [TuneX]::Tls($bindIp, $p9.Ip, $p9.Host, 6000))
    W ("{0}  после шторма, отравленный [0]:           {1}" -f (T), [TuneX]::Tls($bindIp, $p0.Ip, $p0.Host, 6000))

    W ""
    W ("КОНЕЦ ЭКСПЕРИМЕНТА, длился {0:0} с. Файл: {1}" -f ($clock.ElapsedMilliseconds / 1000.0), $out)
    W "================================================================="
}
finally {
    Stop-Core
    # Драйвер только останавливаем, не удаляем: так же поступает программа.
    try { & sc.exe stop WinDivert | Out-Null } catch { }
}
Finish
