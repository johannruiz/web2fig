. "$PSScriptRoot\ClipboardNative.ps1"

[ClipboardNative]::ListFormats() |
  Sort-Object Id |
  Select-Object Id, Name, Size |
  Format-Table -AutoSize
