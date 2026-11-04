<#
.SYNOPSIS
Configure metrics for local Claude Desktop Code and terminal sessions; restore only owned settings on removal.
.NOTES
Run with PowerShell 7 or Windows PowerShell 5.1. User settings are documented for Desktop,
but real delivery must be verified per installed version. Desktop/session/managed environment
values can override this file. Remote/cloud sessions need configuration on their execution host.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$BackendUrl,
  [string]$TrackerKey,
  [switch]$Remove,
  [string]$SettingsPath = (Join-Path $env:USERPROFILE '.claude\settings.json')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Convert-Map($Value) {
  if ($null -eq $Value) { return $null }
  if ($Value -is [System.Management.Automation.PSCustomObject]) {
    $result = @{}
    foreach ($property in $Value.PSObject.Properties) { $result[$property.Name] = Convert-Map $property.Value }
    return ,$result
  }
  if ($Value -is [System.Collections.IList]) {
    $items = @(); foreach ($item in $Value) { $items += ,(Convert-Map $item) }; return ,$items
  }
  return $Value
}
function Read-Map([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return ,@{} }
  $value = Convert-Map (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop)
  if ($value -isnot [hashtable]) { throw 'Settings must contain a JSON object. No changes made.' }
  return ,$value
}
function Save-Map([string]$Path, [hashtable]$Value) {
  $temp = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
  [IO.File]::WriteAllText($temp, ($Value | ConvertTo-Json -Depth 100), (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $temp -Destination $Path -Force
}
$SettingsPath = [IO.Path]::GetFullPath($SettingsPath)
$statePath = "$SettingsPath.usage-tracker-state.json"
if (-not $PSCmdlet.ShouldProcess($SettingsPath, $(if ($Remove) { 'Restore tracker-owned settings' } else { 'Back up and merge metrics configuration' }))) { return }
# Fail closed on malformed JSON BEFORE backing up or changing anything.
$settings = Read-Map $SettingsPath
if ($settings.ContainsKey('env') -and $settings.env -isnot [hashtable]) { throw 'Existing env must be an object. No changes made.' }
$hadEnv = $settings.ContainsKey('env')
if (-not $hadEnv) { $settings.env = @{} }
$state = Read-Map $statePath
if ($Remove) {
  if (-not $state.ContainsKey('installed')) { Write-Host 'No tracker ownership record. Nothing changed.'; return }
  $backup = "$SettingsPath.backup.$([guid]::NewGuid().ToString('N')).json"
  if (Test-Path -LiteralPath $SettingsPath) { Copy-Item -LiteralPath $SettingsPath -Destination $backup }
  foreach ($key in $state.installed.Keys) {
    if ($settings.env.ContainsKey($key) -and $settings.env[$key] -eq $state.installed[$key]) {
      if ($state.previous[$key].existed) { $settings.env[$key] = $state.previous[$key].value }
      else { $settings.env.Remove($key) }
    } else { Write-Warning "Preserved subsequently changed setting: $key" }
  }
  if ($settings.env.Count -eq 0 -and -not $state.hadEnv) { $settings.Remove('env') }
  Save-Map $SettingsPath $settings
  Remove-Item -LiteralPath $statePath
  Write-Host 'Tracker-owned settings restored. Start a new Desktop Code session; quit/reopen Desktop if needed. Revoke the device key in the dashboard.'
  return
}
if (-not $BackendUrl) { $BackendUrl = Read-Host 'Tracker backend URL' }
$BackendUrl = $BackendUrl.Trim()
if ($BackendUrl -match '^\[.*\]\(.*\)$') {
  throw 'Paste only the plain backend URL, not a Markdown [label](URL) link. Use Copy command in the dashboard.'
}
$uri = $null
if (-not [Uri]::TryCreate($BackendUrl, [UriKind]::Absolute, [ref]$uri) -or
    ($uri.Scheme -ne 'https' -and -not ($uri.Scheme -eq 'http' -and $uri.IsLoopback)) -or
    $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') {
  throw 'Use an HTTPS backend origin (HTTP allowed only for localhost), without path, query or credentials.'
}
$BackendUrl = $BackendUrl.TrimEnd('/')
if (-not $TrackerKey) {
  $secure = Read-Host 'Device tracker key (hidden)' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $TrackerKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
if ($TrackerKey -notmatch '^dkey_[a-f0-9]{64}$') { throw 'Invalid device tracker key format. No changes made.' }
$installed = @{
  CLAUDE_CODE_ENABLE_TELEMETRY = '1'
  OTEL_METRICS_EXPORTER = 'otlp'
  OTEL_LOGS_EXPORTER = 'none'
  OTEL_TRACES_EXPORTER = 'none'
  OTEL_EXPORTER_OTLP_METRICS_PROTOCOL = 'http/json'
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = "$BackendUrl/v1/metrics"
  OTEL_EXPORTER_OTLP_METRICS_HEADERS = "X-Tracker-Key=$TrackerKey"
  OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE = 'cumulative'
  OTEL_METRIC_EXPORT_INTERVAL = '60000'
  OTEL_METRICS_INCLUDE_SESSION_ID = 'true'
}
if (-not $state.ContainsKey('previous')) { $state = @{ previous = @{}; hadEnv = $hadEnv } }
foreach ($key in $installed.Keys) {
  if (-not $state.previous.ContainsKey($key)) {
    $state.previous[$key] = @{ existed = $settings.env.ContainsKey($key); value = $settings.env[$key] }
  }
  $settings.env[$key] = $installed[$key]
}
$state.installed = $installed
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SettingsPath) | Out-Null
if (Test-Path -LiteralPath $SettingsPath) {
  Copy-Item -LiteralPath $SettingsPath -Destination "$SettingsPath.backup.$([guid]::NewGuid().ToString('N')).json"
}
# Persist ownership first so removal can recover even if settings write is interrupted.
Save-Map $statePath $state
Save-Map $SettingsPath $settings
$TrackerKey = $null
Write-Host 'Metrics settings saved. Keys are stored locally in the settings and ownership backup; keep those files private.'
Write-Host 'Start a NEW local Desktop Code session. For a reliable first test, completely quit and reopen Desktop before starting it.'
Write-Host 'Run a short prompt, wait at least 60 seconds, then use Connect a PC > Check for a usage report.'
Write-Host 'A backend health response alone does not prove telemetry delivery. Check for environment overrides if reports are missing.'
Write-Host 'Remote/cloud sessions are not configured. Logs and traces are disabled for this configuration.'

Write-Host 'Updating an existing PC? Keep the same registered device and key. This script does not create a device or rotate its key.'
Write-Host 'If your admin enabled input history, also run the latest setup-history.py using that same device ID. Metrics setup alone does not enable input history.'
