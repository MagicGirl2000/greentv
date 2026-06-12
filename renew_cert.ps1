# renew_cert.ps1 — Let's Encrypt 自动续期 greensun3.com
# 由 Windows 计划任务每日调用。certbot 在剩余<30天时才真正续期；续期后把新证书拷到 greentv 目录。
# 仅占用 80 端口做验证，不动防火墙/3389。新证书在服务下次重启(重启/开机/手动)时生效。
$ErrorActionPreference = "Continue"
$py   = "C:\Program Files\Python312\python.exe"
$g    = "C:\Users\Administrator\Documents\ballbs\greentv"
$base = "C:\Users\Administrator\certbot"
$le   = "$base\config\live\greensun3.com"
$log  = "$g\renew_cert.log"

"[$(Get-Date -f 'yyyy-MM-dd HH:mm:ss')] 续期检查开始" | Out-File -Append -Encoding utf8 $log

$code = @"
import sys
from certbot.main import main
sys.argv=['certbot','renew','--standalone','--http-01-port','80','--non-interactive',
  '--config-dir',r'C:\Users\Administrator\certbot\config',
  '--work-dir',r'C:\Users\Administrator\certbot\work',
  '--logs-dir',r'C:\Users\Administrator\certbot\logs']
main()
"@
$out = ($code | & $py - 2>&1 | Out-String)
$out | Out-File -Append -Encoding utf8 $log

# 注意：443 现用 GlobalSign DV 证书(cert.pem)。LE 续期仅更新【备份】(*_le_backup.pem)，不覆盖现用证书。
# 如需切回 LE，把 cert_le_backup.pem/key_le_backup.pem 改名为 cert.pem/key.pem 再重启即可。
if (Test-Path "$le\fullchain.pem") {
    Copy-Item "$le\fullchain.pem" "$g\cert_le_backup.pem" -Force
    Copy-Item "$le\privkey.pem"  "$g\key_le_backup.pem"  -Force
    "[$(Get-Date -f 'HH:mm:ss')] LE 续期完成，已更新备份 *_le_backup.pem(未覆盖现用 GlobalSign 证书)" | Out-File -Append -Encoding utf8 $log
}
