# Проверка доступности эндпоинтов Discord НЕЗАВИСИМО от клиента Discord.
#
# Отвечает на вопрос «обход мешает или Discord сам сломался»: гоняется один
# раз с выключенным обходом и один раз с включённым, результаты сравниваются.
#
#   powershell -ExecutionPolicy Bypass -File scripts\check_discord.ps1
#
# Права администратора не нужны.

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Хосты, к которым клиент Discord обращается при запуске. Порядок важен:
# именно в такой последовательности он их и дёргает.
$targets = @(
    @{ Name = "updates.discord.com";       Url = "https://updates.discord.com/distributions/app/manifests/latest?channel=stable&platform=win&arch=x64"; Profile = "5 (list-general.txt)" },
    @{ Name = "discord.com API";           Url = "https://discord.com/api/v9/gateway";        Profile = "5 (list-general.txt)" },
    @{ Name = "gateway.discord.gg";        Url = "https://gateway.discord.gg/";               Profile = "5 (list-general.txt)" },
    @{ Name = "stable.dl2.discordapp.net"; Url = "https://stable.dl2.discordapp.net/";        Profile = "4 (list-google.txt!)" },
    @{ Name = "cdn.discordapp.com";        Url = "https://cdn.discordapp.com/";               Profile = "5 (list-general.txt)" }
)

$winws = @(Get-Process -Name winws -ErrorAction SilentlyContinue)
if ($winws.Count -gt 0) {
    Write-Host ("ОБХОД ВКЛЮЧЁН (winws.exe PID " + ($winws[0].Id) + ")") -ForegroundColor Yellow
} else {
    Write-Host "ОБХОД ВЫКЛЮЧЕН (winws.exe не запущен)" -ForegroundColor Cyan
}
Write-Host ""

$bad = 0
foreach ($t in $targets) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $status = $null
    $err = $null
    try {
        $r = Invoke-WebRequest -Uri $t.Url -Method Head -TimeoutSec 15 -UseBasicParsing
        $status = [int]$r.StatusCode
    } catch [Net.WebException] {
        if ($_.Exception.Response) {
            # 401/403/404 означают, что соединение и TLS прошли — это успех.
            $status = [int]$_.Exception.Response.StatusCode
        } else {
            $err = $_.Exception.Message
        }
    } catch {
        $err = $_.Exception.Message
    }
    $sw.Stop()
    $ms = [int]$sw.ElapsedMilliseconds

    if ($status) {
        Write-Host ("  OK    {0,-28} HTTP {1}  {2} мс" -f $t.Name, $status, $ms) -ForegroundColor Green
    } else {
        $bad++
        Write-Host ("  СБОЙ  {0,-28} {1}" -f $t.Name, $err) -ForegroundColor Red
        Write-Host ("        обрабатывается профилем " + $t.Profile) -ForegroundColor DarkGray
    }
}

Write-Host ""
if ($bad -eq 0) {
    Write-Host "Все эндпоинты Discord доступны." -ForegroundColor Green
    if ($winws.Count -gt 0) {
        Write-Host "Обход при этом включён — значит он сети Discord не мешает," -ForegroundColor Green
        Write-Host "и причину зависшего апдейтера надо искать на стороне клиента." -ForegroundColor Green
    }
} else {
    Write-Host ("Недоступны: " + $bad) -ForegroundColor Red
    Write-Host "Прогоните этот же скрипт со ВТОРЫМ состоянием обхода и сравните." -ForegroundColor Yellow
}
