$ErrorActionPreference = 'Stop'

$workspaceRoot = $PSScriptRoot
$backendDirectory = Join-Path $workspaceRoot 'backend'
$frontendDirectory = Join-Path $workspaceRoot 'frontend'
$pythonExecutable = Join-Path $backendDirectory '.venv\Scripts\python.exe'
$toolsDirectory = Join-Path $workspaceRoot '.tools'
$cloudflaredExecutable = Join-Path $toolsDirectory 'cloudflared.exe'
$cloudflaredUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
$outLog = Join-Path $toolsDirectory 'cloudflared-out.log'
$errorLog = Join-Path $toolsDirectory 'cloudflared-error.log'

if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    throw 'backend 가상환경이 없습니다. backend에서 python -m venv .venv 후 requirements.txt를 설치해주세요.'
}
if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory 'node_modules'))) {
    throw 'frontend/node_modules가 없습니다. frontend에서 npm install을 먼저 실행해주세요.'
}

New-Item -ItemType Directory -Path $toolsDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $cloudflaredExecutable)) {
    Write-Host '휴대폰용 HTTPS 도구를 내려받고 있어요...'
    Invoke-WebRequest -Uri $cloudflaredUrl -OutFile $cloudflaredExecutable
}
Remove-Item -LiteralPath $outLog, $errorLog -Force -ErrorAction SilentlyContinue

$backendProcess = $null
$frontendProcess = $null
$backendListening = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
$frontendListening = Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue
if (-not $backendListening) {
    $backendProcess = Start-Process -FilePath $pythonExecutable `
        -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload' `
        -WorkingDirectory $backendDirectory -WindowStyle Hidden -PassThru
} else {
    Write-Host '이미 실행 중인 8000 백엔드를 사용합니다.'
}
if (-not $frontendListening) {
    $frontendProcess = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run', 'dev' `
        -WorkingDirectory $frontendDirectory -WindowStyle Hidden -PassThru
} else {
    Write-Host '이미 실행 중인 5173 프론트엔드를 사용합니다.'
}

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue) {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw '프론트엔드가 5173 포트에서 시작되지 않았습니다.' }

    $tunnelProcess = Start-Process -FilePath $cloudflaredExecutable `
        -ArgumentList 'tunnel', '--url', 'http://127.0.0.1:5173', '--no-autoupdate' `
        -WorkingDirectory $workspaceRoot -WindowStyle Hidden -RedirectStandardOutput $outLog `
        -RedirectStandardError $errorLog -PassThru

    $publicUrl = $null
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        $logs = @()
        if (Test-Path -LiteralPath $outLog) { $logs += Get-Content -LiteralPath $outLog -Raw }
        if (Test-Path -LiteralPath $errorLog) { $logs += Get-Content -LiteralPath $errorLog -Raw }
        $match = [regex]::Match(($logs -join "`n"), 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
            $publicUrl = $match.Value
            break
        }
        if ($tunnelProcess.HasExited) { throw 'HTTPS 터널 시작에 실패했습니다. .tools 로그를 확인해주세요.' }
        Start-Sleep -Milliseconds 500
    }
    if (-not $publicUrl) { throw 'HTTPS 주소를 제한 시간 안에 받지 못했습니다.' }

    Write-Host "휴대폰 HTTPS 화면: $publicUrl"
    Write-Host '휴대폰에서 위 주소를 열고 마이크 권한을 허용하세요.'
    Write-Host '이 주소는 임시 공개 주소이므로 다른 사람에게 공유하지 마세요.'
    Write-Host '테스트가 끝나면 이 창에서 Ctrl+C를 눌러 HTTPS 주소를 닫으세요.'
    Write-Host "HTTPS PID: $($tunnelProcess.Id)"
    Wait-Process -Id $tunnelProcess.Id
} catch {
    throw
} finally {
    if ($tunnelProcess) { Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($backendProcess) { Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($frontendProcess) { Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue }
}
