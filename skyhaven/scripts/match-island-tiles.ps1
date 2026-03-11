param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.InteropServices

$projectRoot = Split-Path -Parent $PSScriptRoot
$mapPath = Join-Path $projectRoot "src\\game\\island.sample.json"
$reportDir = Join-Path $projectRoot "reports"
$reportPath = Join-Path $reportDir "island-match-report.json"
$islandAssetDir = Join-Path $projectRoot "public\\ingame_assets\\expanded\\island"
$referencePath = Join-Path $islandAssetDir "mining_complete.png"

New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$familyCandidates = [ordered]@{
  base = @("baseV2", "baseV4", "baseV7")
  grass = @("grassV2", "grassV4")
  pathCross = @("pathCrossV2")
  pathStraight = @("pathStraightV4", "pathStraightV5", "pathStraightV6")
  pathStraightAlt = @("pathStraightAltV4", "pathStraightAltV5")
  tree1 = @("tree1V3")
  tree2 = @("tree2V0", "tree2V1")
  mineTile = @("mineTileV2")
}

$variantMeta = [ordered]@{
  baseV2 = @{ file = "tile_base_v2.png"; drawW = 213; drawH = 213; anchorX = 0.5; anchorY = 0.71; family = "base" }
  baseV4 = @{ file = "tile_base_v4.png"; drawW = 222; drawH = 222; anchorX = 0.5; anchorY = 0.71; family = "base" }
  baseV7 = @{ file = "tile_base_v7.png"; drawW = 204; drawH = 204; anchorX = 0.5; anchorY = 0.71; family = "base" }
  grassV2 = @{ file = "tile_grass_v2.png"; drawW = 196; drawH = 196; anchorX = 0.5; anchorY = 0.71; family = "grass" }
  grassV4 = @{ file = "tile_grass_v4.png"; drawW = 208; drawH = 208; anchorX = 0.5; anchorY = 0.71; family = "grass" }
  pathCrossV2 = @{ file = "tile_path_cross_v2.png"; drawW = 216; drawH = 216; anchorX = 0.5; anchorY = 0.71; family = "pathCross" }
  pathStraightV4 = @{ file = "tile_path_straight_v4.png"; drawW = 218; drawH = 201; anchorX = 0.5; anchorY = 0.71; family = "pathStraight" }
  pathStraightV5 = @{ file = "tile_path_straight_v5.png"; drawW = 224; drawH = 206; anchorX = 0.5; anchorY = 0.71; family = "pathStraight" }
  pathStraightV6 = @{ file = "tile_path_straight_v6.png"; drawW = 207; drawH = 191; anchorX = 0.5; anchorY = 0.71; family = "pathStraight" }
  pathStraightAltV4 = @{ file = "tile_path_straight_alt_v4.png"; drawW = 200; drawH = 200; anchorX = 0.5; anchorY = 0.71; family = "pathStraightAlt" }
  pathStraightAltV5 = @{ file = "tile_path_straight_alt_v5.png"; drawW = 212; drawH = 212; anchorX = 0.5; anchorY = 0.71; family = "pathStraightAlt" }
  tree1V3 = @{ file = "tile_tree_1_v3.png"; drawW = 248; drawH = 248; anchorX = 0.5; anchorY = 0.76; family = "tree1" }
  tree2V0 = @{ file = "tile_tree_2_v0.png"; drawW = 288; drawH = 288; anchorX = 0.5; anchorY = 0.77; family = "tree2" }
  tree2V1 = @{ file = "tile_tree_2_v1.png"; drawW = 298; drawH = 298; anchorX = 0.5; anchorY = 0.77; family = "tree2" }
  mineTileV2 = @{ file = "poi_mine_tile_v2.png"; drawW = 368; drawH = 368; anchorX = 0.5; anchorY = 0.8; family = "mineTile" }
}

$familyRepresentative = @{
  base = "baseV4"
  grass = "grassV4"
  pathCross = "pathCrossV2"
  pathStraight = "pathStraightV5"
  pathStraightAlt = "pathStraightAltV5"
  tree1 = "tree1V3"
  tree2 = "tree2V0"
  mineTile = "mineTileV2"
}

$familyByCoord = @{
  "0,0" = "tree2"
  "1,0" = "base"
  "2,0" = "base"
  "3,0" = "mineTile"
  "0,1" = "base"
  "1,1" = "pathCross"
  "2,1" = "pathStraightAlt"
  "3,1" = "tree2"
  "0,2" = "tree1"
  "1,2" = "pathStraight"
  "2,2" = "pathCross"
  "3,2" = "tree2"
  "0,3" = "pathStraightAlt"
  "1,3" = "grass"
  "2,3" = "grass"
  "3,3" = "base"
}

$manualOverrides = @{
  "0,0" = "tree2V0"
  "1,0" = "baseV7"
  "2,0" = "baseV2"
  "3,0" = "mineTileV2"
  "0,1" = "baseV4"
  "1,1" = "pathCrossV2"
  "2,1" = "pathStraightAltV5"
  "3,1" = "tree2V1"
  "0,2" = "tree1V3"
  "1,2" = "pathStraightV5"
  "2,2" = "pathCrossV2"
  "3,2" = "tree2V0"
  "0,3" = "pathStraightAltV4"
  "1,3" = "grassV4"
  "2,3" = "grassV2"
  "3,3" = "baseV4"
}

$familyRuntimeOffsets = @{
  base = (New-Object System.Collections.Generic.List[int[]])
  grass = (New-Object System.Collections.Generic.List[int[]])
  pathCross = (New-Object System.Collections.Generic.List[int[]])
  pathStraight = (New-Object System.Collections.Generic.List[int[]])
  pathStraightAlt = (New-Object System.Collections.Generic.List[int[]])
  tree1 = (New-Object System.Collections.Generic.List[int[]])
  tree2 = (New-Object System.Collections.Generic.List[int[]])
  mineTile = (New-Object System.Collections.Generic.List[int[]])
}

function New-NumericRange([double]$start, [double]$end, [double]$step) {
  $values = New-Object System.Collections.Generic.List[double]
  for ($v = $start; $v -le ($end + ($step * 0.5)); $v += $step) {
    $values.Add([Math]::Round($v, 5))
  }
  return $values
}

function New-IntRange([int]$start, [int]$end, [int]$step) {
  $values = New-Object System.Collections.Generic.List[int]
  for ($v = $start; $v -le $end; $v += $step) {
    $values.Add($v)
  }
  return $values
}

function Add-DiamondOffsets($targetList, [int]$maxX, [int]$maxY, [int]$step) {
  for ($dy = -$maxY; $dy -le $maxY; $dy += $step) {
    for ($dx = -$maxX; $dx -le $maxX; $dx += $step) {
      $metric = [Math]::Abs($dx) / [Math]::Max(1, $maxX) + [Math]::Abs($dy) / [Math]::Max(1, $maxY)
      if ($metric -le 1) {
        $targetList.Add(@($dx, $dy))
      }
    }
  }
}

function Resolve-Family([string]$type) {
  if ($type.StartsWith("pathStraightAlt")) { return "pathStraightAlt" }
  if ($type.StartsWith("pathStraight")) { return "pathStraight" }
  if ($type.StartsWith("pathCross")) { return "pathCross" }
  if ($type.StartsWith("tree1")) { return "tree1" }
  if ($type.StartsWith("tree2")) { return "tree2" }
  if ($type.StartsWith("mineTile")) { return "mineTile" }
  if ($type.StartsWith("grass")) { return "grass" }
  if ($type.StartsWith("base")) { return "base" }
  return "base"
}

function Load-ArgbImage([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing image file: $path"
  }

  $raw = [System.Drawing.Bitmap]::FromFile($path)
  $bitmap = New-Object System.Drawing.Bitmap($raw.Width, $raw.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.DrawImage($raw, 0, 0, $raw.Width, $raw.Height)
  $graphics.Dispose()
  $raw.Dispose()

  $rect = New-Object System.Drawing.Rectangle(0, 0, $bitmap.Width, $bitmap.Height)
  $bitmapData = $bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $byteLength = [Math]::Abs($bitmapData.Stride) * $bitmap.Height
    $bytes = New-Object byte[] $byteLength
    [System.Runtime.InteropServices.Marshal]::Copy($bitmapData.Scan0, $bytes, 0, $byteLength)
  } finally {
    $bitmap.UnlockBits($bitmapData)
    $bitmap.Dispose()
  }

  return [ordered]@{
    path = $path
    width = [int]$rect.Width
    height = [int]$rect.Height
    stride = [Math]::Abs($bitmapData.Stride)
    bytes = $bytes
  }
}

function Get-AlphaBounds($image) {
  $minX = $image.width
  $minY = $image.height
  $maxX = 0
  $maxY = 0
  $found = $false

  for ($y = 0; $y -lt $image.height; $y += 1) {
    $rowOffset = $y * $image.stride
    for ($x = 0; $x -lt $image.width; $x += 1) {
      $alphaIndex = $rowOffset + ($x * 4) + 3
      if ($image.bytes[$alphaIndex] -gt 0) {
        $found = $true
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if (-not $found) {
    return [ordered]@{
      minX = 0
      minY = 0
      maxX = $image.width - 1
      maxY = $image.height - 1
      centerX = $image.width / 2
      centerY = $image.height / 2
    }
  }

  return [ordered]@{
    minX = $minX
    minY = $minY
    maxX = $maxX
    maxY = $maxY
    centerX = ($minX + $maxX) / 2
    centerY = ($minY + $maxY) / 2
  }
}

function Get-WorldBounds($tiles, [double]$tileW, [double]$tileH) {
  $minX = [double]::PositiveInfinity
  $maxX = [double]::NegativeInfinity
  $minY = [double]::PositiveInfinity
  $maxY = [double]::NegativeInfinity

  foreach ($tile in $tiles) {
    $x = ($tile.gx - $tile.gy) * ($tileW / 2)
    $y = ($tile.gx + $tile.gy) * ($tileH / 2)
    if ($x -lt $minX) { $minX = $x }
    if ($x -gt $maxX) { $maxX = $x }
    if ($y -lt $minY) { $minY = $y }
    if ($y -gt $maxY) { $maxY = $y }
  }

  return [ordered]@{
    minX = $minX
    maxX = $maxX
    minY = $minY
    maxY = $maxY
    centerX = ($minX + $maxX) / 2
    centerY = ($minY + $maxY) / 2
  }
}

function Get-PatchScore(
  $reference,
  $candidate,
  [double]$centerX,
  [double]$centerY,
  $runtimeOffsets,
  [double]$sceneScale,
  [int]$jitterX = 0,
  [int]$jitterY = 0
) {
  $sum = 0.0
  $weight = 0.0

  foreach ($offset in $runtimeOffsets) {
    $runtimeDx = $offset[0]
    $runtimeDy = $offset[1]

    $srcX = [int][Math]::Round($candidate.anchorXPx + ($runtimeDx * $candidate.srcScaleX))
    $srcY = [int][Math]::Round($candidate.anchorYPx + ($runtimeDy * $candidate.srcScaleY))
    if ($srcX -lt 0 -or $srcX -ge $candidate.image.width -or $srcY -lt 0 -or $srcY -ge $candidate.image.height) {
      continue
    }

    $refX = [int][Math]::Round($centerX + ($runtimeDx * $sceneScale) + $jitterX)
    $refY = [int][Math]::Round($centerY + ($runtimeDy * $sceneScale) + $jitterY)
    if ($refX -lt 0 -or $refX -ge $reference.width -or $refY -lt 0 -or $refY -ge $reference.height) {
      continue
    }

    $srcBase = ($srcY * $candidate.image.stride) + ($srcX * 4)
    $refBase = ($refY * $reference.stride) + ($refX * 4)

    $srcA = [int]$candidate.image.bytes[$srcBase + 3]
    if ($srcA -lt 22) {
      continue
    }

    $refA = [int]$reference.bytes[$refBase + 3]
    if ($refA -lt 8) {
      continue
    }

    $srcB = [int]$candidate.image.bytes[$srcBase]
    $srcG = [int]$candidate.image.bytes[$srcBase + 1]
    $srcR = [int]$candidate.image.bytes[$srcBase + 2]

    $refB = [int]$reference.bytes[$refBase]
    $refG = [int]$reference.bytes[$refBase + 1]
    $refR = [int]$reference.bytes[$refBase + 2]

    $pixelDiff =
      [Math]::Abs($srcR - $refR) +
      [Math]::Abs($srcG - $refG) +
      [Math]::Abs($srcB - $refB) +
      ([Math]::Abs($srcA - $refA) * 0.25)

    $pixelWeight = $srcA / 255.0
    $sum += $pixelDiff * $pixelWeight
    $weight += $pixelWeight
  }

  if ($weight -lt 20) {
    return 1.0
  }

  return $sum / ($weight * 828.75)
}

function Get-CalibrationScore(
  $reference,
  $calibrationTiles,
  $candidateLookup,
  $familyOffsets,
  [double]$tileW,
  [double]$tileH,
  [double]$originX,
  [double]$originY,
  [double]$sceneScale
) {
  $accumulated = 0.0
  $count = 0

  foreach ($tile in $calibrationTiles) {
    $candidate = $candidateLookup[$tile.representativeKey]
    $offsets = $familyOffsets[$tile.family]
    $centerX = $originX + (($tile.gx - $tile.gy) * ($tileW / 2))
    $centerY = $originY + (($tile.gx + $tile.gy) * ($tileH / 2))

    $score = Get-PatchScore -reference $reference -candidate $candidate -centerX $centerX -centerY $centerY -runtimeOffsets $offsets -sceneScale $sceneScale
    $accumulated += $score
    $count += 1
  }

  if ($count -eq 0) {
    return 1.0
  }

  return $accumulated / $count
}

Add-DiamondOffsets -targetList $familyRuntimeOffsets.base -maxX 70 -maxY 38 -step 8
Add-DiamondOffsets -targetList $familyRuntimeOffsets.grass -maxX 70 -maxY 38 -step 8
Add-DiamondOffsets -targetList $familyRuntimeOffsets.pathCross -maxX 72 -maxY 39 -step 8
Add-DiamondOffsets -targetList $familyRuntimeOffsets.pathStraight -maxX 72 -maxY 38 -step 8
Add-DiamondOffsets -targetList $familyRuntimeOffsets.pathStraightAlt -maxX 70 -maxY 38 -step 8
Add-DiamondOffsets -targetList $familyRuntimeOffsets.tree1 -maxX 88 -maxY 52 -step 10
Add-DiamondOffsets -targetList $familyRuntimeOffsets.tree2 -maxX 94 -maxY 56 -step 10
Add-DiamondOffsets -targetList $familyRuntimeOffsets.mineTile -maxX 106 -maxY 62 -step 12

$reference = Load-ArgbImage $referencePath

$candidateLookup = @{}
foreach ($key in $variantMeta.Keys) {
  $meta = $variantMeta[$key]
  $imagePath = Join-Path $islandAssetDir $meta.file
  $image = Load-ArgbImage $imagePath
  $candidateLookup[$key] = [ordered]@{
    key = $key
    family = $meta.family
    drawW = [double]$meta.drawW
    drawH = [double]$meta.drawH
    anchorX = [double]$meta.anchorX
    anchorY = [double]$meta.anchorY
    anchorXPx = $image.width * [double]$meta.anchorX
    anchorYPx = $image.height * [double]$meta.anchorY
    srcScaleX = $image.width / [double]$meta.drawW
    srcScaleY = $image.height / [double]$meta.drawH
    image = $image
  }
}

$island = Get-Content -Raw $mapPath | ConvertFrom-Json

$tileInfos = New-Object System.Collections.Generic.List[object]
foreach ($tile in $island.tiles) {
  $coordKey = "{0},{1}" -f [int]$tile.gx, [int]$tile.gy
  $family = if ($familyByCoord.ContainsKey($coordKey)) { $familyByCoord[$coordKey] } else { Resolve-Family ([string]$tile.type) }
  $tileInfos.Add([ordered]@{
      id = [string]$tile.id
      gx = [double]$tile.gx
      gy = [double]$tile.gy
      family = $family
      original = [string]$tile.type
    })
}

$calibrationTiles = New-Object System.Collections.Generic.List[object]
foreach ($tile in $tileInfos) {
  $calibrationTiles.Add([ordered]@{
      id = $tile.id
      gx = $tile.gx
      gy = $tile.gy
      family = $tile.family
      representativeKey = $familyRepresentative[$tile.family]
    })
}

$alphaBounds = Get-AlphaBounds $reference

$bestCalibration = [ordered]@{
  score = [double]::PositiveInfinity
  sceneScale = 4.0
  originX = $alphaBounds.centerX
  originY = $alphaBounds.centerY
}

$coarseScales = New-NumericRange 3.8 4.4 0.2
$coarseOxDeltas = New-IntRange -80 80 40
$coarseOyDeltas = New-IntRange -180 100 40

foreach ($sceneScale in $coarseScales) {
  $tileW = [double]$island.tileW * $sceneScale
  $tileH = [double]$island.tileH * $sceneScale
  $worldBounds = Get-WorldBounds -tiles $tileInfos -tileW $tileW -tileH $tileH
  $baseOriginX = $alphaBounds.centerX - $worldBounds.centerX
  $baseOriginY = $alphaBounds.centerY - $worldBounds.centerY

  foreach ($oxDelta in $coarseOxDeltas) {
    foreach ($oyDelta in $coarseOyDeltas) {
      $originX = $baseOriginX + $oxDelta
      $originY = $baseOriginY + $oyDelta
      $score = Get-CalibrationScore -reference $reference -calibrationTiles $calibrationTiles -candidateLookup $candidateLookup -familyOffsets $familyRuntimeOffsets -tileW $tileW -tileH $tileH -originX $originX -originY $originY -sceneScale $sceneScale
      if ($score -lt $bestCalibration.score) {
        $bestCalibration = [ordered]@{
          score = $score
          sceneScale = $sceneScale
          originX = $originX
          originY = $originY
        }
      }
    }
  }
}

$refineScales = New-NumericRange ($bestCalibration.sceneScale - 0.15) ($bestCalibration.sceneScale + 0.15) 0.05
$refineOxDeltas = New-IntRange -30 30 10
$refineOyDeltas = New-IntRange -50 50 10

foreach ($sceneScale in $refineScales) {
  $tileW = [double]$island.tileW * $sceneScale
  $tileH = [double]$island.tileH * $sceneScale
  foreach ($oxDelta in $refineOxDeltas) {
    foreach ($oyDelta in $refineOyDeltas) {
      $originX = $bestCalibration.originX + $oxDelta
      $originY = $bestCalibration.originY + $oyDelta
      $score = Get-CalibrationScore -reference $reference -calibrationTiles $calibrationTiles -candidateLookup $candidateLookup -familyOffsets $familyRuntimeOffsets -tileW $tileW -tileH $tileH -originX $originX -originY $originY -sceneScale $sceneScale
      if ($score -lt $bestCalibration.score) {
        $bestCalibration = [ordered]@{
          score = $score
          sceneScale = $sceneScale
          originX = $originX
          originY = $originY
        }
      }
    }
  }
}

$fineScales = New-NumericRange ($bestCalibration.sceneScale - 0.04) ($bestCalibration.sceneScale + 0.04) 0.01
$fineOxDeltas = New-IntRange -9 9 3
$fineOyDeltas = New-IntRange -12 12 3

foreach ($sceneScale in $fineScales) {
  $tileW = [double]$island.tileW * $sceneScale
  $tileH = [double]$island.tileH * $sceneScale
  foreach ($oxDelta in $fineOxDeltas) {
    foreach ($oyDelta in $fineOyDeltas) {
      $originX = $bestCalibration.originX + $oxDelta
      $originY = $bestCalibration.originY + $oyDelta
      $score = Get-CalibrationScore -reference $reference -calibrationTiles $calibrationTiles -candidateLookup $candidateLookup -familyOffsets $familyRuntimeOffsets -tileW $tileW -tileH $tileH -originX $originX -originY $originY -sceneScale $sceneScale
      if ($score -lt $bestCalibration.score) {
        $bestCalibration = [ordered]@{
          score = $score
          sceneScale = $sceneScale
          originX = $originX
          originY = $originY
        }
      }
    }
  }
}

$jitterOffsets = @(-12, 0, 12)
$reportTiles = New-Object System.Collections.Generic.List[object]
$unresolved = New-Object System.Collections.Generic.List[string]

$finalTileW = [double]$island.tileW * $bestCalibration.sceneScale
$finalTileH = [double]$island.tileH * $bestCalibration.sceneScale

foreach ($tile in $tileInfos) {
  $candidates = $familyCandidates[$tile.family]
  $offsets = $familyRuntimeOffsets[$tile.family]
  $centerX = $bestCalibration.originX + (($tile.gx - $tile.gy) * ($finalTileW / 2))
  $centerY = $bestCalibration.originY + (($tile.gx + $tile.gy) * ($finalTileH / 2))

  $evaluated = New-Object System.Collections.Generic.List[object]
  foreach ($candidateKey in $candidates) {
    $candidate = $candidateLookup[$candidateKey]
    $candidateBestScore = [double]::PositiveInfinity
    $bestJitter = @{ x = 0; y = 0 }

    foreach ($jx in $jitterOffsets) {
      foreach ($jy in $jitterOffsets) {
        $score = Get-PatchScore -reference $reference -candidate $candidate -centerX $centerX -centerY $centerY -runtimeOffsets $offsets -sceneScale $bestCalibration.sceneScale -jitterX $jx -jitterY $jy
        if ($score -lt $candidateBestScore) {
          $candidateBestScore = $score
          $bestJitter = @{ x = $jx; y = $jy }
        }
      }
    }

    $evaluated.Add([pscustomobject]@{
        key = [string]$candidateKey
        score = [double]([Math]::Round($candidateBestScore, 6))
        jitter = $bestJitter
      })
  }

  $sorted = @($evaluated | Sort-Object @{ Expression = { [double]$_.score }; Ascending = $true }, @{ Expression = { [string]$_.key }; Ascending = $true })
  if ($sorted.Count -eq 0) {
    $unresolved.Add("{0},{1}" -f [int]$tile.gx, [int]$tile.gy)
    continue
  }

  $winner = $sorted[0]
  $runnerUp = if ($sorted.Count -gt 1) { $sorted[1] } else { $null }
  $confidence = 1.0
  if ($runnerUp) {
    $relativeGap = ($runnerUp.score - $winner.score) / [Math]::Max(0.0001, $runnerUp.score)
    $confidence = [Math]::Max(0.0, [Math]::Min(1.0, $relativeGap))
    if ($winner.score -gt 0.26) {
      $confidence *= 0.72
    }
  }

  $confidence = [Math]::Round($confidence, 3)
  $status = if ($confidence -lt 0.1 -or $winner.score -gt 0.36) { "label-needed" } else { "auto-matched" }
  $selectedType = [string]$winner.key
  $resolvedBy = "auto-match"
  $cellKey = "{0},{1}" -f [int]$tile.gx, [int]$tile.gy

  if ($status -eq "label-needed" -and $manualOverrides.ContainsKey($cellKey)) {
    $selectedType = [string]$manualOverrides[$cellKey]
    $resolvedBy = "manual-override"
    $status = "manual-override"
    $confidence = [Math]::Max($confidence, 0.6)
  }

  foreach ($tileModel in $island.tiles) {
    if ([string]$tileModel.id -eq $tile.id) {
      $tileModel.type = $selectedType
      break
    }
  }

  $topCandidates = New-Object System.Collections.Generic.List[object]
  $bestScore = [double]$winner.score
  foreach ($row in ($sorted | Select-Object -First 3)) {
    $topCandidates.Add([ordered]@{
        key = $row.key
        score = $row.score
        deltaToBest = [Math]::Round(([double]$row.score - $bestScore), 6)
      })
  }

  if ($status -eq "label-needed") {
    $unresolved.Add($cellKey)
  }

  $reportTiles.Add([ordered]@{
      id = $tile.id
      gx = [int]$tile.gx
      gy = [int]$tile.gy
      family = $tile.family
      original = $tile.original
      selected = $selectedType
      confidence = $confidence
      bestScore = [Math]::Round([double]$winner.score, 6)
      bestJitter = $winner.jitter
      resolvedBy = $resolvedBy
      status = $status
      candidates = $topCandidates
    })
}

$report = [ordered]@{
  generatedAt = (Get-Date).ToString("o")
  strategy = "auto-match-v2-center-patch-comparison"
  source = "mining_complete.png + tile variants"
  calibration = [ordered]@{
    sceneScale = [Math]::Round($bestCalibration.sceneScale, 5)
    tileW = [Math]::Round($finalTileW, 3)
    tileH = [Math]::Round($finalTileH, 3)
    originX = [Math]::Round($bestCalibration.originX, 3)
    originY = [Math]::Round($bestCalibration.originY, 3)
    score = [Math]::Round($bestCalibration.score, 6)
    alphaBounds = $alphaBounds
  }
  unresolved = $unresolved
  tiles = $reportTiles
}

if (-not $DryRun) {
  $island | ConvertTo-Json -Depth 20 | Set-Content -Path $mapPath -Encoding UTF8
}
$report | ConvertTo-Json -Depth 20 | Set-Content -Path $reportPath -Encoding UTF8

if ($DryRun) {
  Write-Output "Dry run only: map file unchanged."
} else {
  Write-Output "Updated island tile variants: $mapPath"
}
Write-Output "Wrote match report: $reportPath"
