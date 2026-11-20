param(
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

try {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $binDir = Join-Path $repoRoot "bin"
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null

    $coreDll = Join-Path $binDir "Microsoft.Web.WebView2.Core.dll"
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

    $csSource = Join-Path $repoRoot "native-host\CifraFlowHost.cs"
    $isSta = ([System.Threading.Thread]::CurrentThread.GetApartmentState() -eq [System.Threading.ApartmentState]::STA)

    if (-not $isSta) {
        Write-Host "[CifraFlow] Reiniciando em modo STA..." -ForegroundColor Yellow
        & powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
        exit $LASTEXITCODE
    }

    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host " CifraFlow - Aplicativo Desktop Local (100% Offline)" -ForegroundColor Cyan
    Write-Host " Mantenha esta janela aberta enquanto utiliza o CifraFlow." -ForegroundColor Gray
    Write-Host "==========================================================" -ForegroundColor Cyan

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

    if (-not ("CifraFlow.CifraFlowForm" -as [type])) {
        $csCode = Get-Content -Path $csSource -Raw -Encoding UTF8
        Add-Type -TypeDefinition $csCode -ReferencedAssemblies $refs
    }

    if ($SelfTest) {
        [CifraFlow.CifraFlowForm]::Main(@("--self-test"))
    } else {
        [CifraFlow.CifraFlowForm]::Main(@())
    }
} catch {
    Write-Host ""
    Write-Host "[ERRO AO INICIAR CIFRAFLOW]: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    if (-not $SelfTest) {
        Read-Host "Pressione ENTER para fechar"
    }
    exit 1
}
