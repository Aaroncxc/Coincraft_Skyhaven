param(
  [int]$Fps = 24,
  [int]$FrameCount = 27
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $projectRoot "..")
$assetsRoot = Join-Path $repoRoot "assets\\Ingame_Assets\\Main_Char"
$movRoot = Join-Path $assetsRoot "Lauf_Animation_Mainchar"
$outputRoot = Join-Path $projectRoot "public\\ingame_assets\\characters\\main_char"
$walkLeft = Join-Path $outputRoot "walk_left_v2"
$walkRight = Join-Path $outputRoot "walk_right_v2"
$fallbackPng = Join-Path $assetsRoot "MiningOutfit_MainChar.png"

New-Item -ItemType Directory -Force -Path $walkLeft | Out-Null
New-Item -ItemType Directory -Force -Path $walkRight | Out-Null

function Export-WithFfmpeg {
  $ffmpegPath = Resolve-FfmpegPath
  if (-not $ffmpegPath) {
    return $false
  }

  $leftMov = Join-Path $movRoot "Laufen_links.mov"
  $rightMov = Join-Path $movRoot "Laufen_Rechts.mov"
  if (-not (Test-Path $leftMov) -or -not (Test-Path $rightMov)) {
    return $false
  }

  & $ffmpegPath -y -i $leftMov -vf "fps=$Fps,scale=512:-1:flags=lanczos" -frames:v $FrameCount (Join-Path $walkLeft "frame_%04d.png") | Out-Null
  & $ffmpegPath -y -i $rightMov -vf "fps=$Fps,scale=512:-1:flags=lanczos" -frames:v $FrameCount (Join-Path $walkRight "frame_%04d.png") | Out-Null
  return $true
}

function Resolve-FfmpegPath {
  $fromPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $toolsDir = Join-Path $projectRoot "tools"
  if (-not (Test-Path $toolsDir)) {
    return $null
  }

  $candidates = Get-ChildItem $toolsDir -Directory -Filter "ffmpeg*" -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName "bin\\ffmpeg.exe" } |
    Where-Object { Test-Path $_ }

  if ($candidates.Count -eq 0) {
    return $null
  }

  return $candidates | Sort-Object -Descending | Select-Object -First 1
}

function Save-Frame {
  param(
    [System.Drawing.Bitmap]$Source,
    [string]$Path,
    [double]$Phase,
    [bool]$Mirror
  )

  $canvasW = 512
  $canvasH = 512
  $bmp = New-Object System.Drawing.Bitmap($canvasW, $canvasH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  $drawW = 256
  $drawH = [int][Math]::Round($Source.Height * ($drawW / [double]$Source.Width))
  $x = [int](($canvasW - $drawW) / 2 + [Math]::Round([Math]::Cos($Phase) * 3))
  $y = [int](($canvasH - $drawH) / 2 + [Math]::Round([Math]::Sin($Phase) * 6))

  if ($Mirror) {
    $g.TranslateTransform($canvasW, 0)
    $g.ScaleTransform(-1, 1)
    $x = $canvasW - $x - $drawW
  }

  $g.DrawImage($Source, (New-Object System.Drawing.Rectangle($x, $y, $drawW, $drawH)))
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

function Export-Placeholder {
  if (-not (Test-Path $fallbackPng)) {
    throw "Main char fallback PNG not found: $fallbackPng"
  }

  $source = New-Object System.Drawing.Bitmap($fallbackPng)
  $cropped = $source

  for ($i = 1; $i -le $FrameCount; $i++) {
    $phase = (($i - 1) / [double]$FrameCount) * [Math]::PI * 2
    $name = "frame_{0}.png" -f ($i.ToString("0000"))
    Save-Frame -Source $cropped -Path (Join-Path $walkRight $name) -Phase $phase -Mirror:$false
    Save-Frame -Source $cropped -Path (Join-Path $walkLeft $name) -Phase $phase -Mirror:$true
  }

  $cropped.Dispose()
}

if (Export-WithFfmpeg) {
  Write-Output "Exported main character walk frames via ffmpeg."
} else {
  Export-Placeholder
  Write-Output "Generated placeholder character frames (ffmpeg not available)."
}
