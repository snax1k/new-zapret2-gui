$exe = "c:\Users\snax1k\Documents\Мои проекты\New Zapret2\bin\winws.exe"
$workDir = "c:\Users\snax1k\Documents\Мои проекты\New Zapret2\bin"
$args = "--wf-tcp=80,443 --wf-udp=443,50000-65535 --filter-tcp=80,443 --dpi-desync=fake,split2 --dpi-desync-split-pos=2 --dpi-desync-fooling=badseq --dpi-desync-repeats=6 --dpi-desync-fake-tls=tls_clienthello_iana_org.bin --new --filter-udp=50000-65535 --dpi-desync=fake --dpi-desync-any-protocol --dpi-desync-cutoff=d4"

Write-Host "Running winws with args: $args"
$p = Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $workDir -NoNewWindow -PassThru
Start-Sleep -Seconds 1
Write-Host "HasExited: $($p.HasExited)"
if ($p.HasExited) {
    Write-Host "ExitCode: $($p.ExitCode)"
} else {
    Write-Host "RUNNING OK!"
    Stop-Process -Id $p.Id -Force
}
