# =====================================================================
#  Однократное сохранение токена GitHub для публикации релизов
#
#  Запускать ВАМ и только вручную:
#
#      powershell -ExecutionPolicy Bypass -File scripts\save_release_token.ps1
#
#  Токен вводится в скрытое поле, никуда не печатается и сохраняется
#  зашифрованным через DPAPI в
#      %LOCALAPPDATA%\Zapret2-GUI\release-token.xml
#
#  DPAPI привязывает шифрование к вашей учётной записи Windows и этой
#  машине: файл нельзя расшифровать ни под другим пользователем, ни на
#  другом компьютере, даже скопировав. Каталог лежит вне репозитория,
#  поэтому в git не попадёт физически.
#
#  После этого scripts\publish_release.ps1 берёт токен отсюда сам, и
#  вводить его каждый раз не нужно.
#
#  Токен нужен минимальный: github.com/settings/tokens -> Fine-grained,
#  Repository access -> только new-zapret2-gui,
#  Permissions -> Contents: Read and write. Больше ничего.
#  Поставьте срок жизни — 90 дней достаточно.
#
#  Отозвать в любой момент: github.com/settings/tokens -> Revoke.
#  Удалить локально: scripts\save_release_token.ps1 -Remove
# =====================================================================
param(
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$dir = Join-Path $env:LOCALAPPDATA "Zapret2-GUI"
$path = Join-Path $dir "release-token.xml"

if ($Remove) {
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "Сохранённый токен удалён." -ForegroundColor Green
    } else {
        Write-Host "Сохранённого токена не было." -ForegroundColor Yellow
    }
    Write-Host "Не забудьте отозвать его на github.com/settings/tokens" -ForegroundColor Yellow
    exit 0
}

if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

if (Test-Path $path) {
    Write-Host "Токен уже сохранён: $path" -ForegroundColor Yellow
    $answer = Read-Host "Перезаписать? (y/N)"
    if ($answer -ne "y") { Write-Host "Отменено."; exit 0 }
}

Write-Host ""
Write-Host "Вставьте токен GitHub (ввод скрыт, Enter для подтверждения):" -ForegroundColor Cyan
$secure = Read-Host -AsSecureString

if ($secure.Length -eq 0) {
    Write-Host "Пустой ввод — ничего не сохранено." -ForegroundColor Red
    exit 1
}

# Export-Clixml для SecureString шифрует содержимое через DPAPI.
$secure | Export-Clixml -Path $path
Write-Host ""
Write-Host "Токен сохранён и зашифрован: $path" -ForegroundColor Green
Write-Host "Расшифровать его может только ваша учётная запись на этой машине." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Теперь публикация выполняется без ввода токена:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\publish_release.ps1"
