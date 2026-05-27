param(
  [Parameter(Mandatory = $true)]
  [string]$Name
)

. "$PSScriptRoot\ClipboardNative.ps1"

$root = Split-Path -Parent $PSScriptRoot
$sampleDir = Join-Path $root "samples\$Name"
$manifestPath = Join-Path $sampleDir "manifest.json"

if (!(Test-Path -LiteralPath $manifestPath)) {
  throw "Sample manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$names = New-Object 'System.Collections.Generic.List[string]'
$payloads = New-Object 'System.Collections.Generic.List[byte[]]'

foreach ($entry in $manifest) {
  $filePath = Join-Path $sampleDir $entry.file
  if (!(Test-Path -LiteralPath $filePath)) {
    throw "Sample payload not found: $filePath"
  }

  $names.Add([string]$entry.name)
  $payloads.Add([System.IO.File]::ReadAllBytes($filePath))
}

[ClipboardNative]::WriteFormats($names.ToArray(), $payloads.ToArray())
Write-Host "Restored clipboard sample: $sampleDir"
