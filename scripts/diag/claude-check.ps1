# =====================================================================
#  Сбор данных о доступности Discord для разбора
#
#  Запускать через claude-check.bat. Результат дописывается в
#  claude-info.txt рядом со скриптом — каждый запуск отдельным блоком,
#  чтобы можно было прогнать несколько пресетов подряд и сравнить.
#
#  Главное, ради чего всё это: пробы идут НАПРЯМУЮ, с привязкой к
#  физической сетевой карте, мимо системного прокси и туннелей. Иначе
#  измерялся бы прокси, а не канал провайдера.
# =====================================================================
param([string]$Label = "")

$ErrorActionPreference = "Continue"
$out = Join-Path $PSScriptRoot "claude-info.txt"

function W($text) {
    Write-Host $text
    Add-Content -Path $out -Value $text -Encoding UTF8
}

# --- что проверяем ----------------------------------------------------
$targets = @(
    @{ Host = "discord.com";          Why = "главный сайт" },
    @{ Host = "gateway.discord.gg";   Why = "веб-сокет, через него идёт вход" },
    @{ Host = "updates.discord.com";  Why = "обновления, с него начинается запуск" },
    @{ Host = "cdn.discordapp.com";   Why = "картинки и вложения" },
    @{ Host = "www.youtube.com";      Why = "для сравнения" }
)

# --- физическая карта: к ней привязываем сокеты -----------------------
$markers = @('tun','tap','vpn','wireguard','wintun','openvpn','tailscale',
             'zerotier','hamachi','radmin','proton','nord','express','socks',
             'loopback','virtual','pseudo','teredo','isatap')

$bindIp = $null
$bindName = ""
foreach ($ni in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($ni.OperationalStatus -ne 'Up') { continue }
    if ($ni.NetworkInterfaceType -eq 'Loopback') { continue }
    $text = ($ni.Description + ' ' + $ni.Name).ToLower()
    $hit = $false
    foreach ($m in $markers) { if ($text.Contains($m)) { $hit = $true; break } }
    if ($hit) { continue }
    $props = $ni.GetIPProperties()
    $gw = $props.GatewayAddresses | Where-Object {
        $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.ToString() -ne '0.0.0.0'
    }
    if (-not $gw) { continue }
    $ip = $props.UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1
    if ($ip) { $bindIp = $ip.Address.ToString(); $bindName = $ni.Name; break }
}

# --- пробы ------------------------------------------------------------
function TcpProbe($ip, $timeoutMs) {
    $res = @{ Ok = $false; Ms = 0; Err = "" }
    $c = $null
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        if ($bindIp) {
            $local = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($bindIp), 0)
            $c = New-Object System.Net.Sockets.TcpClient($local)
        } else {
            $c = New-Object System.Net.Sockets.TcpClient
        }
        $iar = $c.BeginConnect($ip, 443, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($timeoutMs)) {
            $sw.Stop(); $res.Ms = $sw.ElapsedMilliseconds; $res.Err = "таймаут"
            return $res
        }
        $c.EndConnect($iar)
        $sw.Stop()
        $res.Ok = $true; $res.Ms = $sw.ElapsedMilliseconds
    } catch {
        $sw.Stop(); $res.Ms = $sw.ElapsedMilliseconds
        $res.Err = $_.Exception.Message
        if ($_.Exception.InnerException) { $res.Err = $_.Exception.InnerException.Message }
    } finally {
        if ($c) { $c.Close() }
    }
    return $res
}

function TlsProbe($ip, $sni, $timeoutMs) {
    $res = @{ Ok = $false; TcpMs = 0; TlsMs = 0; Cert = ""; Err = "" }
    $c = $null
    $t0 = [Diagnostics.Stopwatch]::StartNew()
    try {
        if ($bindIp) {
            $local = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($bindIp), 0)
            $c = New-Object System.Net.Sockets.TcpClient($local)
        } else {
            $c = New-Object System.Net.Sockets.TcpClient
        }
        $iar = $c.BeginConnect($ip, 443, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne(5000)) {
            $t0.Stop(); $res.TcpMs = $t0.ElapsedMilliseconds; $res.Err = "TCP таймаут"
            return $res
        }
        $c.EndConnect($iar)
        $t0.Stop(); $res.TcpMs = $t0.ElapsedMilliseconds

        $ssl = New-Object System.Net.Security.SslStream($c.GetStream(), $false, { $true })
        $t1 = [Diagnostics.Stopwatch]::StartNew()
        try {
            $ssl.AuthenticateAsClient($sni, $null, [System.Security.Authentication.SslProtocols]::Tls12, $false)
            $t1.Stop()
            $res.Ok = $true; $res.TlsMs = $t1.ElapsedMilliseconds
            if ($ssl.RemoteCertificate) { $res.Cert = $ssl.RemoteCertificate.Subject }
        } catch {
            $t1.Stop(); $res.TlsMs = $t1.ElapsedMilliseconds
            $res.Err = $_.Exception.Message
            if ($_.Exception.InnerException) { $res.Err = $_.Exception.InnerException.Message }
        }
    } catch {
        $res.Err = $_.Exception.Message
    } finally {
        if ($c) { $c.Close() }
    }
    return $res
}

# =====================================================================
#  Отчёт
# =====================================================================
W ""
W "================================================================="
W ("ПРОГОН от " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
if ($Label) { W ("ПОМЕТКА ПОЛЬЗОВАТЕЛЯ: " + $Label) }
W "================================================================="

# --- 1. Окружение -----------------------------------------------------
W ""
W "--- 1. ОКРУЖЕНИЕ ---"

$winws = @(Get-Process winws -ErrorAction SilentlyContinue)
W ("winws запущен: " + $(if ($winws.Count -gt 0) { "ДА, процессов " + $winws.Count } else { "НЕТ — обход выключен" }))

$app = @(Get-Process -Name "Zapret2-GUI-*" -ErrorAction SilentlyContinue)
if ($app.Count -gt 0) { W ("приложение: " + $app[0].ProcessName) } else { W "приложение: не запущено" }

$marker = Join-Path $env:LOCALAPPDATA "Zapret2-GUI\unpacked-version.txt"
if (Test-Path $marker) { W ("версия по маркеру: " + (Get-Content $marker -Raw).Trim()) }

$reg = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
W ("системный прокси: ProxyEnable=" + $reg.ProxyEnable + " ProxyServer=" + $reg.ProxyServer)

$listen = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
          Where-Object { $_.LocalPort -in @(1080,1081,8080,8888,10808,10809,10810) }
if ($listen) {
    foreach ($x in $listen) {
        $pname = (Get-Process -Id $x.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        W ("  локальный прокси слушает: " + $x.LocalAddress + ":" + $x.LocalPort + "  процесс " + $pname)
    }
} else {
    W "  локальных прокси на типовых портах не слушает никто"
}

W "адаптеры в состоянии Up:"
foreach ($a in (Get-NetAdapter | Where-Object { $_.Status -eq 'Up' })) {
    W ("  ifIndex=" + $a.ifIndex + "  " + $a.Name + "  (" + $a.InterfaceDescription + ")")
}

Add-Type @"
using System; using System.Runtime.InteropServices;
public class ClaudeRt { [DllImport("iphlpapi.dll")] public static extern int GetBestInterfaceEx(byte[] sa, out int idx); }
"@ -ErrorAction SilentlyContinue
$sa = New-Object byte[] 16; $sa[0] = 2; $sa[4] = 1; $sa[5] = 1; $sa[6] = 1; $sa[7] = 1
$eg = 0
[void][ClaudeRt]::GetBestInterfaceEx($sa, [ref]$eg)
W ("выход в интернет по таблице маршрутизации: ifIndex=" + $eg)
W ("пробы привязаны к: " + $(if ($bindIp) { $bindIp + " (" + $bindName + ")" } else { "НЕ ПРИВЯЗАНЫ — карта не найдена" }))

# --- 2. Что настроено в приложении ------------------------------------
W ""
W "--- 2. НАСТРОЙКИ ПРИЛОЖЕНИЯ ---"
$settings = Join-Path $env:LOCALAPPDATA "Zapret2-GUI\settings.json"
if (Test-Path $settings) {
    try {
        $cfg = Get-Content $settings -Raw -Encoding UTF8 | ConvertFrom-Json
        $t = $cfg.'zapret2_toggles_v5'
        if ($t) {
            $tt = $t | ConvertFrom-Json
            W ("стратегия сайтов и Discord: " + $tt.sitesStrategy)
            W ("стратегия YouTube:          " + $tt.youtubeStrategy)
            W ("QUIC/UDP 443: " + $tt.quicDesync + "   Discord RTC: " + $tt.discordVoice)
            W ("весь трафик (All): " + $tt.allTrafficMode + "   авто-TTL: " + $tt.autoTtl)
        }
        W ("активный пресет: " + $cfg.'zapret2_active_preset_v5')
    } catch { W ("не удалось разобрать settings.json: " + $_.Exception.Message) }
} else {
    W "settings.json не найден"
}

$log = Join-Path $env:LOCALAPPDATA "Zapret2-GUI\logs\zapret2.log"
if (Test-Path $log) {
    $cmd = Select-String -Path $log -Pattern 'winws\.exe --wf' | Select-Object -Last 1
    if ($cmd) {
        W "последняя командная строка ядра:"
        W ("  " + $cmd.Line.Substring($cmd.Line.IndexOf('winws.exe')))
    }
}

# --- 3. Пробы ---------------------------------------------------------
W ""
W "--- 3. ДОСТУПНОСТЬ (три попытки на цель, прямой путь) ---"

foreach ($t in $targets) {
    $h = $t.Host
    W ""
    W ("### " + $h + "   [" + $t.Why + "]")

    $ips = @()
    try { $ips = @((Resolve-DnsName $h -Type A -ErrorAction Stop).IPAddress) } catch { }
    if ($ips.Count -eq 0) {
        W "  DNS не вернул адресов — проверять нечего"
        continue
    }
    W ("  DNS: " + ($ips -join ", "))

    # какие адреса вообще живы
    $alive = @()
    foreach ($ip in $ips) {
        $r = TcpProbe $ip 4000
        if ($r.Ok) {
            W ("  TCP " + $ip + " — установлено за " + $r.Ms + " мс")
            $alive += $ip
        } else {
            W ("  TCP " + $ip + " — НЕ отвечает (" + $r.Err + ", " + $r.Ms + " мс)")
        }
    }
    if ($alive.Count -eq 0) {
        W "  ни один адрес не принимает соединение — это блок по адресу, не по имени"
        continue
    }

    $ip = $alive[0]
    W ("  дальше работаем с " + $ip)

    for ($i = 1; $i -le 3; $i++) {
        $r = TlsProbe $ip $h 6000
        if ($r.Ok) {
            W ("  попытка " + $i + ": OK  TCP " + $r.TcpMs + " мс, TLS " + $r.TlsMs + " мс, cert=" + $r.Cert)
        } else {
            W ("  попытка " + $i + ": ПРОВАЛ  TCP " + $r.TcpMs + " мс, оборвалось через " + $r.TlsMs + " мс")
            W ("             причина: " + $r.Err)
        }
        Start-Sleep -Milliseconds 400
    }

    # контроль: то же соединение, но с чужим именем
    $ctl = TlsProbe $ip "www.microsoft.com" 6000
    if ($ctl.Ok) {
        W ("  контроль с чужим именем: ОТВЕТИЛ за " + $ctl.TlsMs + " мс -> режут именно по имени сайта")
    } else {
        W ("  контроль с чужим именем: тоже провал через " + $ctl.TlsMs + " мс (" + $ctl.Err + ")")
    }
}

# --- 4. Хвост журнала ядра -------------------------------------------
W ""
W "--- 4. ЖУРНАЛ ЯДРА: интересные строки за последние минуты ---"
if (Test-Path $log) {
    $since = (Get-Date).AddMinutes(-6)
    $lines = Get-Content $log -Tail 4000 | Where-Object {
        $_ -match 'flags=R|dpi desync|multisplit pos|multidisorder|hostname:|162\.159\.|Autotune|winws\.exe завершился|driver'
    } | Select-Object -Last 120
    if ($lines) { foreach ($l in $lines) { W ("  " + $l) } }
    else { W "  подходящих строк нет" }
} else {
    W "  журнал не найден"
}

W ""
W ("КОНЕЦ ПРОГОНА. Файл: " + $out)
W "================================================================="
