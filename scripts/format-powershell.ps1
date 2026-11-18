[CmdletBinding()]
param([switch]$Check)

$ErrorActionPreference = 'Stop'
Import-Module PSScriptAnalyzer -RequiredVersion 1.24.0 -ErrorAction Stop
$root = Split-Path -Parent $PSScriptRoot
$changed = $false
$files = Get-ChildItem -LiteralPath $PSScriptRoot, (Join-Path $root 'public') -Filter '*.ps1' -File
foreach ($file in $files) {
    $source = [IO.File]::ReadAllText($file.FullName)
    $formatted = (Invoke-Formatter -ScriptDefinition $source -Settings CodeFormatting).Replace("`r`n", "`n").TrimEnd() + "`n"
    if ($source -cne $formatted) {
        $changed = $true
        Write-Output $file.Name
        if (-not $Check) {
            [IO.File]::WriteAllText($file.FullName, $formatted, [Text.UTF8Encoding]::new($false))
        }
    }
}
if ($Check -and $changed) {
    exit 1
}
