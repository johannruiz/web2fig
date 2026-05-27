param(
  [Parameter(Mandatory = $true)]
  [string]$Name
)

. "$PSScriptRoot\ClipboardNative.ps1"

$root = Split-Path -Parent $PSScriptRoot
$sampleDir = Join-Path $root "samples\$Name"
New-Item -ItemType Directory -Path $sampleDir -Force | Out-Null

$formats = [ClipboardNative]::ListFormats() | Sort-Object Id
$manifest = @()

foreach ($format in $formats) {
  $safeName = ($format.Name -replace '[^a-zA-Z0-9_.-]', '_')
  $fileName = "{0:D5}-{1}.bin" -f $format.Id, $safeName
  $filePath = Join-Path $sampleDir $fileName
  $bytes = [ClipboardNative]::ReadFormat([uint32]$format.Id)
  [System.IO.File]::WriteAllBytes($filePath, $bytes)

  $manifest += [pscustomobject]@{
    id = $format.Id
    name = $format.Name
    file = $fileName
    size = $bytes.Length
  }
}

$manifest |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath (Join-Path $sampleDir "manifest.json") -Encoding UTF8

Write-Host "Saved clipboard sample: $sampleDir"
