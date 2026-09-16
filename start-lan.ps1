$ErrorActionPreference = 'Stop'

$workspaceRoot = $PSScriptRoot
$backendDirectory = Join-Path $workspaceRoot 'backend'
$frontendDirectory = Join-Path $workspaceRoot 'frontend'
$pythonExecutable = Join-Path $backendDirectory '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    throw 'backend 가상환경이 없습니다. backend에서 python -m venv .venv 후 requirements.txt를 설치해주세요.'
}
if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory 'node_modules'))) {
    throw 'frontend/node_modules가 없습니다. frontend에서 npm install을 먼저 실행해주세요.'
}

$occupied = Get-NetTCPConnection -State Listen -LocalPort 5173, 8000 -ErrorAction SilentlyContinue
if ($occupied) {
    $ports = ($occupied.LocalPort | Sort-Object -Unique) -join ', '
    throw "이미 사용 중인 포트가 있습니다: $ports. 해당 개발 서버를 종료한 뒤 다시 실행해주세요."
}

$backendProcess = Start-Process -FilePath $pythonExecutable `
    -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload' `
    -WorkingDirectory $backendDirectory -WindowStyle Hidden -PassThru

$frontendProcess = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList 'run', 'dev' `
    -WorkingDirectory $frontendDirectory -WindowStyle Hidden -PassThru

$network = Get-NetIPConfiguration | Where-Object {
    $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up'
} | Select-Object -First 1

if ($network) {
    $address = $network.IPv4Address.IPAddress
    Write-Host "LAN 화면: http://${address}:5173"
} else {
    Write-Host 'LAN IP를 찾지 못했습니다. ipconfig에서 Wi-Fi IPv4 주소를 확인해주세요.'
}
Write-Host "백엔드 PID: $($backendProcess.Id), 프론트엔드 PID: $($frontendProcess.Id)"
