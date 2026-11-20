$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $repoRoot "bin"
New-Item -ItemType Directory -Path $binDir -Force | Out-Null

# Localiza as DLLs assinadas do Microsoft.Web.WebView2 instaladas no sistema
$wvSource = "C:\Program Files\Microsoft Office\root\Office16\ADDINS\Microsoft Power Query for Excel Integrated\bin"
if (-not (Test-Path (Join-Path $wvSource "Microsoft.Web.WebView2.WinForms.dll"))) {
    $found = Get-ChildItem -Path "C:\Program Files" -Recurse -Filter "Microsoft.Web.WebView2.WinForms.dll" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
        $wvSource = $found.DirectoryName
    } else {
        throw "Microsoft.Web.WebView2.WinForms.dll não encontrada no sistema."
    }
}

foreach ($dll in @("Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll")) {
    $srcDll = Join-Path $wvSource $dll
    $dstDll = Join-Path $binDir $dll
    if (Test-Path $srcDll) {
        Copy-Item -Path $srcDll -Destination $dstDll -Force
    }
}

Write-Host "[CifraFlow] Dependências nativas WebView2 preparadas em: $binDir" -ForegroundColor Green
Write-Host "[CifraFlow] Validando compilação nativa do Host C# (CifraFlowHost.cs)..." -ForegroundColor Cyan

powershell -STA -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-desktop.ps1") -SelfTest
if ($LASTEXITCODE -ne 0) {
    throw "Falha no auto-teste do CifraFlow Desktop."
}

Write-Host "[CifraFlow] Host Desktop Nativo validado com sucesso!" -ForegroundColor Green
