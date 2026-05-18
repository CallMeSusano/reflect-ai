[CmdletBinding()]
param(
    [switch]$InstallDependencies,
    [switch]$ShowHelp
)

$ErrorActionPreference = 'Stop'

function Write-Usage {
    @'
Usage:
  .\start-backend.ps1
  .\start-backend.ps1 -InstallDependencies

What it does:
  - uses backend\.venv\Scripts\python.exe when available
  - creates the virtual environment if it is missing
  - optionally reinstalls backend dependencies
  - starts uvicorn on 127.0.0.1:8000
'@ | Write-Host
}

if ($ShowHelp) {
    Write-Usage
    exit 0
}

$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backendDir

$venvDir = Join-Path $backendDir '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$requirementsPath = Join-Path $backendDir 'requirements.txt'

function Get-BootstrapPython {
    foreach ($candidate in @('py', 'python', 'python3')) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }

    return $null
}

function Invoke-PipInstall {
    param(
        [string]$PythonExecutable,
        [string]$RequirementsFile
    )

    Write-Host "Installing backend dependencies from $RequirementsFile ..."
    & $PythonExecutable -m pip install --upgrade pip
    & $PythonExecutable -m pip install -r $RequirementsFile
}

if (-not (Test-Path $venvPython)) {
    $bootstrapPython = Get-BootstrapPython
    if (-not $bootstrapPython) {
        throw 'No Python launcher was found. Install Python 3 or create backend\.venv manually.'
    }

    Write-Host 'Virtual environment not found. Creating backend\.venv ...'
    if ($bootstrapPython -eq 'py') {
        & $bootstrapPython -3 -m venv $venvDir
    }
    else {
        & $bootstrapPython -m venv $venvDir
    }

    if (-not (Test-Path $venvPython)) {
        throw 'Virtual environment creation finished, but backend\.venv\Scripts\python.exe was not created.'
    }

    Invoke-PipInstall -PythonExecutable $venvPython -RequirementsFile $requirementsPath
}
elseif ($InstallDependencies) {
    Invoke-PipInstall -PythonExecutable $venvPython -RequirementsFile $requirementsPath
}

Write-Host 'Starting FastAPI backend on http://127.0.0.1:8000 ...'
& $venvPython -m uvicorn app:app --reload --host 127.0.0.1 --port 8000

