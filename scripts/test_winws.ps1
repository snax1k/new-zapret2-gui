$exe = "$env:LOCALAPPDATA\Zapret2-GUI\bin\winws.exe"
$workDir = "$env:LOCALAPPDATA\Zapret2-GUI\bin"
$args = "--wf-tcp=80,443 --wf-udp=443,50000-65535 --filter-tcp=80,443 --dpi-desync=fake,split2 --dpi-desync-split-pos=2 --dpi-desync-fooling=badseq --dpi-desync-repeats=6 --dpi-desync-fake-tls=tls_clienthello_iana_org.bin --new --filter-udp=50000-65535 --dpi-desync=fake --dpi-desync-any-protocol --dpi-desync-cutoff=d4"

Write-Host "Testing winws executable at: $exe"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exe
$psi.Arguments = $args
$psi.WorkingDirectory = $workDir
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Milliseconds 1500

Write-Host "HasExited: $($proc.HasExited)"
if ($proc.HasExited) {
    Write-Host "ExitCode: $($proc.ExitCode)"
    $out = $proc.StandardOutput.ReadToEnd()
    $err = $proc.StandardError.ReadToEnd()
    Write-Host "STDOUT: $out"
    Write-Host "STDERR: $err"
} else {
    Write-Host "SUCCESS! winws is running smoothly with PID $($proc.Id)!"
    $proc.Kill()
}
