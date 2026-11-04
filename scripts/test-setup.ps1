$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\.local\setup-tests'
New-Item -ItemType Directory -Path $root -Force | Out-Null
$path = Join-Path $root 'settings.json'
$script = Join-Path $PSScriptRoot '..\public\setup-pc.ps1'
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
$initial = '{"permissions":{"allow":["Read"]},"env":{"EXISTING":"keep","OTEL_METRICS_EXPORTER":"console"}}'
[IO.File]::WriteAllText($path,$initial)
$key = 'dkey_' + ('a' * 64)
& $script -NoHistory -BackendUrl 'http://127.0.0.1:4000' -TrackerKey $key -SettingsPath $path
$data = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
Assert ($data.env.EXISTING -eq 'keep') 'Existing env lost'
Assert ($data.permissions.allow[0] -eq 'Read') 'Existing permissions lost'
Assert ($data.env.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE -eq 'cumulative') 'Cumulative not set'
Assert ($data.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT -eq 'http://127.0.0.1:4000/v1/metrics') 'Incorrect endpoint'
Assert ($data.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS -eq "X-Tracker-Key=$key") 'Incorrect header'
# Reinstall/rotate must still restore original exporter on removal.
& $script -NoHistory -BackendUrl 'http://127.0.0.1:4000' -TrackerKey ('dkey_' + ('b' * 64)) -SettingsPath $path
& $script -Remove -SettingsPath $path
$data = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
Assert ($data.env.OTEL_METRICS_EXPORTER -eq 'console') 'Prior exporter not restored'
Assert ($data.env.EXISTING -eq 'keep') 'Unrelated setting lost on removal'
Assert (-not $data.env.PSObject.Properties['OTEL_EXPORTER_OTLP_METRICS_HEADERS']) 'Tracker key remained'
# Corrupt settings must remain byte-for-byte unchanged.
[IO.File]::WriteAllText($path,'{"env":broken')
$failed = $false
try { & $script -NoHistory -BackendUrl 'http://127.0.0.1:4000' -TrackerKey $key -SettingsPath $path } catch { $failed = $true }
Assert $failed 'Corrupt JSON accepted'
Assert ((Get-Content -LiteralPath $path -Raw) -eq '{"env":broken') 'Corrupt file overwritten'
[IO.File]::WriteAllText($path,$initial)
& $script -NoHistory -BackendUrl 'http://127.0.0.1:4000' -TrackerKey $key -SettingsPath $path -WhatIf
Assert ((Get-Content -LiteralPath $path -Raw) -eq $initial) 'WhatIf wrote settings'
# Markdown URLs must fail clearly without changing configuration.
$failed = $false
try { & $script -NoHistory -BackendUrl '[https://example.com](https://example.com)' -TrackerKey $key -SettingsPath $path }
catch { $failed = $_.Exception.Message -match 'Markdown' }
Assert $failed 'Markdown URL did not produce a clear plain-URL error'
Assert ((Get-Content -LiteralPath $path -Raw) -eq $initial) 'Invalid URL changed settings'
# Later user edits must survive removal.
& $script -NoHistory -BackendUrl 'http://127.0.0.1:4000' -TrackerKey $key -SettingsPath $path
$data = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
$data.env.OTEL_METRICS_EXPORTER = 'prometheus'
$data | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $path -Encoding UTF8
& $script -Remove -SettingsPath $path
$data = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
Assert ($data.env.OTEL_METRICS_EXPORTER -eq 'prometheus') 'Later user edit overwritten'
Write-Host 'PASS: setup merge, backup, rotation, removal, corrupt JSON, WhatIf, and later-edit preservation.'
