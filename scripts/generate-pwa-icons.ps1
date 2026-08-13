# Generate PWA / favicon PNGs from the canonical SIDEBURNS logo (Logo.png).
# Run from repo root: powershell -File scripts/generate-pwa-icons.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "Logo.png"
$imagesDir = Join-Path $root "public/images"
$iconsDir = Join-Path $root "public/icons"

if (-not (Test-Path $srcPath)) {
  throw "Missing Logo.png at repo root."
}

New-Item -ItemType Directory -Force -Path $imagesDir, $iconsDir | Out-Null
Copy-Item -Force $srcPath (Join-Path $imagesDir "sideburn-logo.png")

function New-SquareIcon {
  param(
    [System.Drawing.Image]$Source,
    [int]$Size,
    [double]$ContentScale = 0.86
  )
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Black)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  $maxW = [int]([math]::Floor($Size * $ContentScale))
  $maxH = [int]([math]::Floor($Size * $ContentScale))
  $scale = [math]::Min($maxW / $Source.Width, $maxH / $Source.Height)
  $w = [int]([math]::Round($Source.Width * $scale))
  $h = [int]([math]::Round($Source.Height * $scale))
  $x = [int](($Size - $w) / 2)
  $y = [int](($Size - $h) / 2)
  $g.DrawImage($Source, $x, $y, $w, $h)
  $g.Dispose()
  return $bmp
}

$src = [System.Drawing.Image]::FromFile($srcPath)
try {
  foreach ($size in @(192, 512)) {
    $any = New-SquareIcon -Source $src -Size $size -ContentScale 0.9
    $any.Save((Join-Path $iconsDir "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $any.Dispose()

    $maskable = New-SquareIcon -Source $src -Size $size -ContentScale 0.72
    $maskable.Save((Join-Path $iconsDir "icon-$size-maskable.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $maskable.Dispose()
  }

  $apple = New-SquareIcon -Source $src -Size 180 -ContentScale 0.86
  $apple.Save((Join-Path $iconsDir "apple-touch-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $apple.Dispose()

  $fav = New-SquareIcon -Source $src -Size 64 -ContentScale 0.92
  $fav.Save((Join-Path $imagesDir "sideburn-favicon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $fav.Dispose()
}
finally {
  $src.Dispose()
}

Write-Host "Wrote SIDEBURNS logo assets to public/images/ and public/icons/"
