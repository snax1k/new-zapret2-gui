[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Write-Host "Downloading zapret release zip..."
$url = "https://github.com/bol-van/zapret/releases/download/v72.13/zapret-v72.13.zip"
Invoke-WebRequest -Uri $url -OutFile "zapret-v72.13.zip"

Write-Host "Extracting..."
Expand-Archive -Path "zapret-v72.13.zip" -DestinationPath "zapret-raw" -Force
Remove-Item "zapret-v72.13.zip" -Force

if (-not (Test-Path "bin")) {
    New-Item -ItemType Directory -Path "bin"
}

# Locate binaries in zapret-raw/zapret-v72.13/binaries/windows-x86_64
$win64 = Get-ChildItem -Recurse "zapret-raw" | Where-Object { $_.PSIsContainer -and $_.FullName -like "*windows-x86_64*" }

if ($win64) {
    Get-ChildItem $win64.FullName | ForEach-Object {
        Copy-Item $_.FullName -Destination "bin" -Force
        Write-Host "Copied from win64: $($_.Name)"
    }
}

# Also copy files from zapret-raw (lists, fake payloads, etc.)
Get-ChildItem -Recurse "zapret-raw" | Where-Object { 
    $_.Extension -eq ".bin" -or $_.Name -like "*list*" -or $_.Name -eq "winws.exe" -or $_.Name -like "WinDivert*" 
} | ForEach-Object {
    Copy-Item $_.FullName -Destination "bin" -Force
    Write-Host "Copied: $($_.Name)"
}

Write-Host "Done! Bin folder content:"
Get-ChildItem "bin" | Select-Object Name, Length
