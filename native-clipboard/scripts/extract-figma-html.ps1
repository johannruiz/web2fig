param(
  [Parameter(Mandatory = $true)]
  [string]$Name
)

$root = Split-Path -Parent $PSScriptRoot
$sampleDir = Join-Path $root "samples\$Name"
$htmlPath = Join-Path $sampleDir "49403-HTML_Format.bin"

if (!(Test-Path -LiteralPath $htmlPath)) {
  throw "HTML Format payload not found: $htmlPath"
}

$html = Get-Content -LiteralPath $htmlPath -Encoding UTF8 -Raw
$metaMatch = [regex]::Match($html, '\(figmeta\)(.*?)\(/figmeta\)')
$bufferMatch = [regex]::Match($html, '\(figma\)(.*?)\(/figma\)')

if (!$metaMatch.Success -or !$bufferMatch.Success) {
  throw "Figma markers not found in sample: $Name"
}

$metaBytes = [Convert]::FromBase64String($metaMatch.Groups[1].Value)
$bufferBytes = [Convert]::FromBase64String($bufferMatch.Groups[1].Value)
$metaText = [System.Text.Encoding]::UTF8.GetString($metaBytes)

$metaPath = Join-Path $sampleDir "figmeta.json"
$bufferPath = Join-Path $sampleDir "figma-buffer.bin"
$previewPath = Join-Path $sampleDir "figma-buffer.head.hex.txt"

Set-Content -LiteralPath $metaPath -Value $metaText -Encoding UTF8
[System.IO.File]::WriteAllBytes($bufferPath, $bufferBytes)

$head = $bufferBytes[0..([Math]::Min(255, $bufferBytes.Length - 1))]
($head | ForEach-Object { $_.ToString("X2") }) -join " " |
  Set-Content -LiteralPath $previewPath -Encoding ASCII

[pscustomobject]@{
  sample = $Name
  meta = $metaText
  bufferBytes = $bufferBytes.Length
  bufferHeader = [System.Text.Encoding]::ASCII.GetString($bufferBytes, 0, [Math]::Min(16, $bufferBytes.Length))
  metaPath = $metaPath
  bufferPath = $bufferPath
}
