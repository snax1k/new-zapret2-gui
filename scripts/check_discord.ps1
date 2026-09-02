# Проверка доступности эндпоинтов Discord НЕЗАВИСИМО от клиента Discord.
#
# Каждый адрес проверяется ДВУМЯ путями: напрямую и через системный прокси,
# если он настроен. Это принципиально: при включённом системном прокси весь
# HTTP(S)-трафик уходит на 127.0.0.1, то есть в loopback, а фильтр WinDivert
# начинается с "!loopback" — zapret такой трафик не видит и повлиять на него
# не может. Скрипт, проверяющий только один путь, в этой ситуации врёт.
#
#   powershell -ExecutionPolicy Bypass -File scripts\check_discord.ps1
#
# Права администратора не нужны.

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Хосты, к которым клиент Discord обращается при запуске.
$targets = @(
    @{ Name = "updates.discord.com";       Url = "https://updates.discord.com/distributions/app/manifests/latest?channel=stable&platform=win&arch=x64" },
    @{ Name = "discord.com API";           Url = "https://discord.com/api/v9/gateway" },
    @{ Name = "gateway.discord.gg";        Url = "https://gateway.discord.gg/" },
    @{ Name = "stable.dl2.discordapp.net"; Url = "https://stable.dl2.discordapp.net/" },
    @{ Name = "cdn.discordapp.com";        Url = "https://cdn.discordapp.com/" }
)

# --- Состояние обхода ------------------------------------------------------
$winws = @(Get-Process -Name winws -ErrorAction SilentlyContinue)
if ($winws.Count -gt 0) {
    Write-Host ("ОБХОД ВКЛЮЧЁН (winws.exe PID " + $winws[0].Id + ")") -ForegroundColor Yellow
} else {
    Write-Host "ОБХОД ВЫКЛЮЧЕН (winws.exe не запущен)" -ForegroundColor Cyan
}

# --- Системный прокси ------------------------------------------------------
$proxyUrl = $null
$ini = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
if ($ini -and $ini.ProxyEnable -eq 1 -and $ini.ProxyServer) {
    $ps = [string]$ini.ProxyServer
    if ($ps -notmatch '=') { $proxyUrl = "http://" + $ps }
    else {
        foreach ($part in $ps.Split(';')) {
            if ($part -match '^https?=(.+)$') { $proxyUrl = "http://" + $matches[1]; break }
        }
    }
}

if ($proxyUrl) {
    Write-Host ("СИСТЕМНЫЙ ПРОКСИ ВКЛЮЧЁН: " + $proxyUrl) -ForegroundColor Magenta
    if ($proxyUrl -match ':(\d+)') {
        $port = [int]$matches[1]
        $lis = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($lis.Count -gt 0) {
            $owner = Get-Process -Id $lis[0].OwningProcess -ErrorAction SilentlyContinue
            Write-Host ("  порт слушает: " + $(if ($owner) { $owner.ProcessName + " (PID " + $owner.Id + ")" } else { "неизвестный процесс" })) -ForegroundColor DarkGray
        } else {
            Write-Host "  порт НИКТО НЕ СЛУШАЕТ — прокси-клиент не запущен" -ForegroundColor Red
        }
    }
    Write-Host "  Внимание: трафик через прокси идёт в loopback, zapret его НЕ ВИДИТ." -ForegroundColor DarkGray
} else {
    Write-Host "Системный прокси выключен." -ForegroundColor Cyan
}
Write-Host ""

# --- Проверка --------------------------------------------------------------
function Test-Endpoint([string]$url, $proxy) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $a = @{ Uri = $url; Method = "Head"; TimeoutSec = 15; UseBasicParsing = $true }
        if ($proxy) { $a["Proxy"] = $proxy } else { $a["Proxy"] = $null; $a["UseDefaultCredentials"] = $false }
        $r = Invoke-WebRequest @a
        $sw.Stop()
        return @{ Ok = $true; Text = ("HTTP " + [int]$r.StatusCode + "  " + [int]$sw.ElapsedMilliseconds + " мс") }
    } catch [Net.WebException] {
        $sw.Stop()
        # 401/403/404 значат, что TCP и TLS прошли — для нас это успех.
        if ($_.Exception.Response) {
            return @{ Ok = $true; Text = ("HTTP " + [int]$_.Exception.Response.StatusCode + "  " + [int]$sw.ElapsedMilliseconds + " мс") }
        }
        return @{ Ok = $false; Text = $_.Exception.Message }
    } catch {
        $sw.Stop()
        return @{ Ok = $false; Text = $_.Exception.Message }
    }
}

Write-Host ("  {0,-28} {1,-24} {2}" -f "АДРЕС", "НАПРЯМУЮ", "ЧЕРЕЗ ПРОКСИ") -ForegroundColor DarkGray

$directOk = 0
$proxyOk = 0
foreach ($t in $targets) {
    # Явный $null в -Proxy отключает системный прокси для этого запроса.
    $d = Test-Endpoint $t.Url $null
    if ($d.Ok) { $directOk++ }

    $p = $null
    if ($proxyUrl) {
        $p = Test-Endpoint $t.Url $proxyUrl
        if ($p.Ok) { $proxyOk++ }
    }

    $dText = $(if ($d.Ok) { $d.Text } else { "СБОЙ" })
    $pText = $(if ($proxyUrl) { $(if ($p.Ok) { $p.Text } else { "СБОЙ" }) } else { "—" })
    $color = $(if ($d.Ok -or ($p -and $p.Ok)) { "Green" } else { "Red" })
    Write-Host ("  {0,-28} {1,-24} {2}" -f $t.Name, $dText, $pText) -ForegroundColor $color
}

# --- Вывод -----------------------------------------------------------------
$n = $targets.Count
Write-Host ""
Write-Host ("Напрямую доступно: " + $directOk + " из " + $n)
if ($proxyUrl) { Write-Host ("Через прокси:      " + $proxyOk + " из " + $n) }
Write-Host ""

if ($directOk -eq $n) {
    Write-Host "Discord доступен напрямую — обход для него не нужен." -ForegroundColor Green
} elseif ($proxyUrl -and $proxyOk -eq $n) {
    Write-Host "Discord работает ТОЛЬКО через прокси — это НОРМА, а не поломка." -ForegroundColor Yellow
    Write-Host "Разделение труда: TCP Discord (вход, чат, апдейтер) идёт через" -ForegroundColor Yellow
    Write-Host "прокси и в loopback, поэтому zapret его не видит и не трогает." -ForegroundColor Yellow
    Write-Host "Голос Discord — это UDP, он через HTTP-прокси не идёт и остаётся" -ForegroundColor Yellow
    Write-Host "задачей zapret (профиль 2)." -ForegroundColor Yellow
    Write-Host "Вывод: если Discord не входит или крутит апдейтер — причина в" -ForegroundColor Yellow
    Write-Host "прокси, и переключение стратегий обхода тут не поможет." -ForegroundColor Yellow
} elseif ($directOk -gt 0) {
    Write-Host "Часть адресов недоступна напрямую — смотрите таблицу выше." -ForegroundColor Yellow
} else {
    Write-Host "Discord недоступен ни напрямую, ни через прокси." -ForegroundColor Red
}
