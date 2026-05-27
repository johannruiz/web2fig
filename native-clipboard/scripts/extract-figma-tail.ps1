param(
  [Parameter(Mandatory = $true)]
  [string]$Name,

  [int]$TailOffset = 30872,

  [string]$ZstdPath = "C:\Program Files\PeaZip\res\bin\zstd\zstd.exe"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sampleDir = Join-Path $root "samples\$Name"
$bufferPath = Join-Path $sampleDir "figma-buffer.bin"

if (-not (Test-Path $bufferPath)) {
  throw "No existe figma-buffer.bin para la muestra '$Name'. Ejecuta extract-figma-html.ps1 primero."
}

if (-not (Test-Path $ZstdPath)) {
  throw "No se encontro zstd.exe en '$ZstdPath'. Ajusta -ZstdPath."
}

$buffer = [IO.File]::ReadAllBytes($bufferPath)
if ($buffer.Length -le ($TailOffset + 4)) {
  throw "El buffer es demasiado pequeno para TailOffset=$TailOffset."
}

$compressedSize = [BitConverter]::ToUInt32($buffer, $TailOffset)
$zstdStart = $TailOffset + 4
$zstdEnd = $zstdStart + [int]$compressedSize
if ($zstdEnd -gt $buffer.Length) {
  throw "El bloque variable declara $compressedSize bytes, pero excede el tamano del buffer."
}

$tail = New-Object byte[] ([int]$compressedSize)
[Array]::Copy($buffer, $zstdStart, $tail, 0, [int]$compressedSize)

$tailPath = Join-Path $sampleDir "figma-tail.zst"
$outPath = Join-Path $sampleDir "figma-tail.bin"

[IO.File]::WriteAllBytes($tailPath, $tail)
& $ZstdPath -d -f $tailPath -o $outPath | Out-Null

[pscustomobject]@{
  sample = $Name
  tailOffset = $TailOffset
  compressedBytes = $compressedSize
  inflatedBytes = (Get-Item $outPath).Length
  zstdPath = $tailPath
  outputPath = $outPath
}
