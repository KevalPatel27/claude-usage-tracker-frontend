<# One file configures metrics and captured-input history; Python 3.8+ required. #>
[CmdletBinding(SupportsShouldProcess)]
param([string]$BackendUrl, [string]$DeviceId, [string]$TrackerKey, [switch]$NoHistory, [switch]$Remove, [switch]$Status, [switch]$Flush, [string]$SettingsPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $SettingsPath) { $base = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR }else { Join-Path $env:USERPROFILE '.claude' }; $SettingsPath = Join-Path $base 'settings.json' }
if (-not $PSCmdlet.ShouldProcess($SettingsPath, 'Install/update or remove tracker metrics and input history')) { return }
$python = Get-Command python.exe -ErrorAction SilentlyContinue
$prefix = @()
if (-not $python) { $python = Get-Command py.exe -ErrorAction SilentlyContinue; $prefix = @('-3') }
if (-not $python) { throw 'Python 3.8+ is required. Install it using your organization-approved method, then rerun this same file. Nothing changed.' }
& $python.Source @prefix -c 'import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.8+ is required. Nothing changed.' }
if (-not $Remove -and -not $Status -and -not $Flush -and -not $BackendUrl) { $BackendUrl = Read-Host 'Tracker backend URL' }
$options = @('--settings-path', $SettingsPath)
if ($BackendUrl) { $options += @('--backend-url', $BackendUrl) }
if ($DeviceId) { $options += @('--device-id', $DeviceId) }
if ($NoHistory) { $options += '--no-history' }
if ($Remove) { $options += '--remove' }
if ($Status) { $options += '--status' }
if ($Flush) { $options += '--flush' }
$file = Join-Path ([IO.Path]::GetTempPath()) ('usage-ledger-setup-' + [guid]::NewGuid().ToString('N') + '.py')
try {
    [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String('__SOURCE__'))
    if ($TrackerKey) { $options += '--key-stdin'; $TrackerKey | & $python.Source @prefix $file @options }else { & $python.Source @prefix $file @options }
    if ($LASTEXITCODE -ne 0) { throw 'Tracker setup failed. Review the message above; use a plain URL without Markdown and keep private backups.' }
}
finally { $TrackerKey = $null; if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file } }
