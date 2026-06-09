# deploy_uk.ps1 — 在【英国 Windows 服务器】上运行：装 Python+依赖、拉探针代码、跑起来。
# 用法：RDP 登入 8.208.127.130 → 打开 PowerShell(管理员) → 粘贴运行本脚本。
# 探针只抓国际频道、算维度，暴露 http://本机:8781/dims（只回数字，不回内容）。
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$dir = "C:\greentv"
$repo = "https://raw.githubusercontent.com/MagicGirl2000/greentv/main"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Location $dir

Write-Host "==> 1/5 检查 Python..." -ForegroundColor Cyan
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "    安装 Python 3.11..."
    $u = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
    Invoke-WebRequest $u -OutFile "$env:TEMP\py311.exe"
    Start-Process "$env:TEMP\py311.exe" -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait
    $env:Path = "C:\Program Files\Python311;C:\Program Files\Python311\Scripts;" + $env:Path
}
python --version

Write-Host "==> 2/5 安装依赖(flask numpy imageio-ffmpeg)..." -ForegroundColor Cyan
python -m pip install --quiet --upgrade pip
python -m pip install --quiet flask numpy imageio-ffmpeg

Write-Host "==> 3/5 下载探针代码..." -ForegroundColor Cyan
foreach ($f in "agent.py", "dimension.py", "feat.py", "realm_data.py", "channels_intl.json", "feat_db.npz") {
    Invoke-WebRequest "$repo/$f" -OutFile (Join-Path $dir $f)
    Write-Host "    ✓ $f"
}

Write-Host "==> 4/5 预下载 ffmpeg + 放行防火墙 8781..." -ForegroundColor Cyan
python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
New-NetFirewallRule -DisplayName "GreenTV Agent 8781" -Direction Inbound -LocalPort 8781 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null

Write-Host "==> 5/5 启动探针(后台, 端口8781)..." -ForegroundColor Cyan
Start-Process python -ArgumentList "agent.py" -WorkingDirectory $dir -WindowStyle Hidden
Start-Sleep -Seconds 6
try {
    $r = Invoke-WebRequest "http://127.0.0.1:8781/dims" -TimeoutSec 8 -UseBasicParsing
    Write-Host "✓ 探针已运行！ http://8.208.127.130:8781/dims" -ForegroundColor Green
    Write-Host ("   " + ($r.Content.Substring(0, [Math]::Min(160, $r.Content.Length))))
} catch {
    Write-Host "探针启动中，稍等几秒再访问 http://8.208.127.130:8781/dims" -ForegroundColor Yellow
}
Write-Host "`n完成。深圳主服务器会自动每5秒来拉它的维度数字并合并进 GreenIndex。" -ForegroundColor Green
