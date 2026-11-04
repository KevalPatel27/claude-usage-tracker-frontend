$ErrorActionPreference='Stop'
$root=Join-Path $PSScriptRoot '..\.local\unified-windows'
New-Item -ItemType Directory -Force -Path $root | Out-Null
$path=Join-Path $root ('settings-'+[guid]::NewGuid().ToString('N')+'.json')
$setup=Join-Path $PSScriptRoot '..\public\setup-pc.ps1'
$key='dkey_'+('a'*64)
$id='1'*24
$initial='{"env":{"KEEP":"yes"},"statusLine":{"command":"keep-status"}}'
[IO.File]::WriteAllText($path,$initial)
function Assert($value,$message){if(-not $value){throw $message}}
& $setup -BackendUrl 'http://127.0.0.1:4001' -DeviceId $id -TrackerKey $key -SettingsPath $path
$value=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
Assert ($value.env.KEEP -eq 'yes') 'Existing setting lost'
Assert ($value.env.OTEL_METRICS_EXPORTER -eq 'otlp') 'Metrics missing from combined install'
Assert ($value.hooks.UserPromptSubmit.Count -eq 1) 'History missing from combined install'
$diag=(& $setup -Status -SettingsPath $path | Out-String) | ConvertFrom-Json
Assert $diag.configured 'Status failed after combined install'
& $setup -Flush -SettingsPath $path
& $setup -BackendUrl 'http://127.0.0.1:4001' -DeviceId $id -SettingsPath $path
$value=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
Assert ($value.hooks.UserPromptSubmit.Count -eq 1) 'Upgrade duplicated history hook'
Assert ($value.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS -eq ('X-Tracker-Key='+$key)) 'Existing key not reused'
& $setup -BackendUrl 'http://127.0.0.1:4001' -NoHistory -SettingsPath $path
$value=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
Assert ($null -eq $value.hooks) 'Metrics-only update retained history hooks'
Assert ($value.env.OTEL_METRICS_EXPORTER -eq 'otlp') 'Metrics-only update removed metrics'
& $setup -Remove -SettingsPath $path
$value=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
Assert ($value.env.KEEP -eq 'yes') 'Removal lost original setting'
Assert ($null -eq $value.env.OTEL_METRICS_EXPORTER) 'Removal retained tracker metrics'
Assert ($value.statusLine.command -eq 'keep-status') 'Removal lost status line'
Write-Host 'PASS: standalone Windows combined installer, repeat update without key prompt, metrics-only switch and removal.'
