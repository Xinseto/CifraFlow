$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $repoRoot "dist"
$binDir = Join-Path $repoRoot "bin"
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $binDir -Force | Out-Null

# 1. Garante que as DLLs WebView2 estejam em bin/
$winFormsDll = Join-Path $binDir "Microsoft.Web.WebView2.WinForms.dll"
if (-not (Test-Path $winFormsDll)) {
    $wvSource = "C:\Program Files\Microsoft Office\root\Office16\ADDINS\Microsoft Power Query for Excel Integrated\bin"
    if (-not (Test-Path (Join-Path $wvSource "Microsoft.Web.WebView2.WinForms.dll"))) {
        $found = Get-ChildItem -Path "C:\Program Files" -Recurse -Filter "Microsoft.Web.WebView2.WinForms.dll" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { $wvSource = $found.DirectoryName }
    }
    foreach ($dll in @("Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll")) {
        $srcDll = Join-Path $wvSource $dll
        if (Test-Path $srcDll) {
            Copy-Item -Path $srcDll -Destination (Join-Path $binDir $dll) -Force
        }
    }
}

# 2. Cria script instalador automático Windows (Instalar-CifraFlow.bat) dentro do pacote
$stageDir = Join-Path $distDir "stage_win"
if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
$appStage = Join-Path $stageDir "CifraFlow"
New-Item -ItemType Directory -Path $appStage -Force | Out-Null

Copy-Item -Path (Join-Path $repoRoot "CifraFlow.bat") -Destination $appStage -Force
Copy-Item -Path (Join-Path $repoRoot "README.md") -Destination $appStage -Force
Copy-Item -Path (Join-Path $repoRoot "src") -Destination (Join-Path $appStage "src") -Recurse -Force
Copy-Item -Path (Join-Path $repoRoot "native-host") -Destination (Join-Path $appStage "native-host") -Recurse -Force
Copy-Item -Path (Join-Path $repoRoot "scripts") -Destination (Join-Path $appStage "scripts") -Recurse -Force
Copy-Item -Path (Join-Path $repoRoot "sample-cifras") -Destination (Join-Path $appStage "sample-cifras") -Recurse -Force
Copy-Item -Path $binDir -Destination (Join-Path $appStage "bin") -Recurse -Force

$installPs1 = @'
$ErrorActionPreference = "Stop"
$sourceDir = $PSScriptRoot
$installDir = Join-Path $env:LOCALAPPDATA "Programs\CifraFlow"
Write-Host "Instalando CifraFlow - Leitor de Cifras em $installDir ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -Path "$sourceDir\*" -Destination $installDir -Recurse -Force

$wsh = New-Object -ComObject WScript.Shell
foreach ($dest in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))) {
    $lnkPath = Join-Path $dest "CifraFlow - Leitor de Cifras.lnk"
    $shortcut = $wsh.CreateShortcut($lnkPath)
    $shortcut.TargetPath = Join-Path $installDir "CifraFlow.bat"
    $shortcut.WorkingDirectory = $installDir
    $shortcut.IconLocation = Join-Path $installDir "src\assets\icon.ico"
    $shortcut.Description = "CifraFlow - Leitor de Cifras"
    $shortcut.Save()
}
Write-Host "CifraFlow instalado com sucesso! Atalho criado na Area de Trabalho e no Menu Iniciar." -ForegroundColor Green
'@
[System.IO.File]::WriteAllText((Join-Path $appStage "install-windows.ps1"), $installPs1, [System.Text.Encoding]::UTF8)

$installBat = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0install-windows.ps1`"`r`npause`r`n"
[System.IO.File]::WriteAllText((Join-Path $appStage "Instalar-CifraFlow.bat"), $installBat, [System.Text.Encoding]::ASCII)

$zipPath = Join-Path $distDir "CifraFlow-v1.0.0-win-x64-portable.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $appStage -DestinationPath $zipPath -Force
Remove-Item $stageDir -Recurse -Force
Write-Host "[Windows ZIP] Gerado com sucesso: $zipPath" -ForegroundColor Green

# 3. Se o Inno Setup (ISCC.exe) estiver disponível, compila também o CifraFlow-Setup-v1.0.0-win-x64.exe
$iscc = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
if (-not $iscc -and (Test-Path "C:\Program Files (x86)\Inno Setup 6\ISCC.exe")) {
    $iscc = Get-Item "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
}
if ($iscc) {
    & $iscc.FullName (Join-Path $repoRoot "installer\CifraFlow.iss")
    Write-Host "[Windows Setup EXE] Compilado via Inno Setup em $distDir" -ForegroundColor Green
}
