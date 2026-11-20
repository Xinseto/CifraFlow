param(
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $repoRoot "bin"
New-Item -ItemType Directory -Path $binDir -Force | Out-Null

# Garante que as DLLs assinadas do Microsoft.Web.WebView2 estejam na pasta bin/
$coreDll = Join-Path $binDir "Microsoft.Web.WebView2.Core.dll"
$winFormsDll = Join-Path $binDir "Microsoft.Web.WebView2.WinForms.dll"
$loaderDll = Join-Path $binDir "WebView2Loader.dll"

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

$csSource = Join-Path $repoRoot "native-host\CifraFlowHost.cs"

if ($SelfTest) {
    Set-Location $repoRoot
    $env:PATH = "$binDir;$env:PATH"
    [System.Reflection.Assembly]::LoadFrom($coreDll) | Out-Null
    [System.Reflection.Assembly]::LoadFrom($winFormsDll) | Out-Null
    $refs = @(
        "System.dll",
        "System.Core.dll",
        "System.Drawing.dll",
        "System.Windows.Forms.dll",
        "System.Web.Extensions.dll",
        $coreDll,
        $winFormsDll
    )
    Add-Type -Path $csSource -ReferencedAssemblies $refs
    [CifraFlow.CifraFlowForm]::Main(@("--self-test"))
} else {
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $repoRoot -WindowStyle Hidden -ArgumentList @(
        "-STA",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        "Set-Location '$repoRoot'; `$env:PATH = '$binDir;' + `$env:PATH; [System.Reflection.Assembly]::LoadFrom('$coreDll') | Out-Null; [System.Reflection.Assembly]::LoadFrom('$winFormsDll') | Out-Null; `$refs = @('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','$coreDll','$winFormsDll'); Add-Type -Path '$csSource' -ReferencedAssemblies `$refs; [CifraFlow.CifraFlowForm]::Main(@())"
    )
    Write-Host "[CifraFlow] Aplicativo Desktop Nativo iniciado com sucesso!" -ForegroundColor Green
}
