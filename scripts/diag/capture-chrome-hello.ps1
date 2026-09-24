# =====================================================================
#  Переснять образец приветствия Chromium для проб автоподбора
#
#  Edge открывает https://discord.com:18443/, а адрес discord.com ему
#  подменяется на 127.0.0.1. Браузер честно отправляет своё приветствие
#  TLS на локальный сокет — оно и есть образец. Никуда наружу ничего не
#  уходит, прав администратора не нужно.
#
#  Результат — src-native\chrome-hello.b64.txt: готовые строки для
#  TemplateB64 в src-native\ChromeHello.cs. Их надо вставить вместо старых
#  и поправить ChromeHello.Origin (версия браузера и дата).
#
#  Когда переснимать: если Chromium заметно поменял приветствие (новый
#  обмен ключами, другой размер). Версия Edge печатается в начале.
# =====================================================================
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outTxt = Join-Path $root "src-native\chrome-hello.b64.txt"

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { throw "Не найден Edge: $edge" }
Write-Host ("Edge " + (Get-Item $edge).VersionInfo.ProductVersion)

$port = 18443
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
$listener.Start()

# Отдельный профиль и без прокси: иначе Edge пойдёт через системный прокси
# и приветствие достанется ему, а не нам.
$edgeProfile = Join-Path $env:TEMP "zapret2-hello-profile"
$edgeProc = Start-Process -FilePath $edge -PassThru -ArgumentList @(
    "--headless=new", "--disable-gpu", "--no-proxy-server",
    "--user-data-dir=`"$edgeProfile`"",
    "--host-resolver-rules=`"MAP discord.com 127.0.0.1`"",
    "https://discord.com:$port/")

try {
    $task = $listener.AcceptTcpClientAsync()
    if (-not $task.Wait(15000)) { throw "Edge не подключился за 15 с" }
    $client = $task.Result
    $stream = $client.GetStream()
    $stream.ReadTimeout = 10000
    $buf = New-Object byte[] 65536
    $n = 0
    while ($n -lt 5 -or $n -lt (5 + ($buf[3] * 256 + $buf[4]))) {
        $r = $stream.Read($buf, $n, $buf.Length - $n)
        if ($r -le 0) { break }
        $n += $r
    }
    $total = 5 + ($buf[3] * 256 + $buf[4])
    $client.Close()
    if ($buf[0] -ne 0x16 -or $buf[5] -ne 1) { throw "Поймано не приветствие TLS" }

    $rec = New-Object byte[] $total
    [Array]::Copy($buf, $rec, $total)
    $b64 = [Convert]::ToBase64String($rec)
    $lines = @()
    for ($i = 0; $i -lt $b64.Length; $i += 96) {
        $lines += '            "' + $b64.Substring($i, [Math]::Min(96, $b64.Length - $i)) + '" +'
    }
    $lines[-1] = $lines[-1].Substring(0, $lines[-1].Length - 2) + ';'
    [IO.File]::WriteAllText($outTxt, ($lines -join "`n") + "`n")
    Write-Host "Поймано $total байт -> $outTxt"
}
finally {
    $listener.Stop()
    Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
        Where-Object { $_.CommandLine -like "*zapret2-hello-profile*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
