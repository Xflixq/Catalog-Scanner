# Locate Inno Setup compiler (ISCC.exe)
$ErrorActionPreference = 'SilentlyContinue'
Write-Host 'Searching for ISCC.exe ...'
$paths = @()
$paths += Get-ChildItem 'C:\Program Files','C:\Program Files (x86)',"$env:LOCALAPPDATA\Programs" -Filter ISCC.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
$paths += Get-ChildItem 'C:\' -Filter ISCC.exe -Recurse -Depth 4 -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'Inno' } | Select-Object -ExpandProperty FullName
$paths = $paths | Select-Object -Unique
if (-not $paths) {
  Write-Host 'NOT FOUND'
  Write-Host 'Install from https://jrsoftware.org/isdl.php (full install)'
  exit 1
}
$paths | ForEach-Object { Write-Host $_ }
Write-Host ''
Write-Host 'Pin with:'
Write-Host ('$env:INNO_SETUP_ISCC = "{0}"' -f $paths[0])
