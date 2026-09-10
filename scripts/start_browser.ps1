# Start the browser V.A.R.M.A will drive, with the DevTools Protocol enabled.
#
# The agent's CDP transport needs a browser listening on 127.0.0.1:9222. A browser
# that was launched normally cannot be "upgraded" into one, and asking the
# default profile to open a debug port is a security hole, so this script always
# starts a SEPARATE profile dedicated to agent runs. Your everyday Brave window
# is a different process and is left alone.
#
# Usage:
#   powershell -File scripts/start_browser.ps1
#   powershell -File scripts/start_browser.ps1 -Port 9333 -Url "https://www.google.com"
#   powershell -File scripts/start_browser.ps1 -Browser chrome
#
# Load the built extension into this window once, from chrome://extensions
# ("Load unpacked" -> extension/dist); it is remembered for this profile.

[CmdletBinding()]
param(
    # Port the DevTools Protocol listens on. Must match CDP_URL in server/.env.
    [int]$Port = 9222,

    # Page to open on start.
    [string]$Url = "about:blank",

    # Which Chromium browser to launch: brave, chrome, or edge.
    [ValidateSet("brave", "chrome", "edge")]
    [string]$Browser = "brave",

    # Where the dedicated agent profile lives. Deleted-and-recreated is safe;
    # it only holds extension state and a scratch browsing history.
    [string]$ProfileDir = "$env:LOCALAPPDATA\VarmaCdpProfile"
)

$ErrorActionPreference = "Stop"

$candidates = @{
    brave  = @(
        "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
        "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
    )
    chrome = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    edge   = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
}

$exe = $candidates[$Browser] | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
    Write-Host "[browser] could not find $Browser in the usual locations." -ForegroundColor Red
    Write-Host "[browser] install it, or pass -Browser with one that is installed."
    exit 1
}

# Refuse to stack a second debug instance on the same port: the agent would
# attach to whichever process won the race, which is not a useful failure mode.
$inUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($inUse) {
    $owner = (Get-Process -Id $inUse[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
    Write-Host "[browser] port $Port is already listening (process: $owner)." -ForegroundColor Yellow
    Write-Host "[browser] reusing it - the agent will attach to that browser."
    exit 0
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

Write-Host "[browser] launching $Browser"
Write-Host "[browser]   executable : $exe"
Write-Host "[browser]   debug port : $Port"
Write-Host "[browser]   profile    : $ProfileDir"
Write-Host "[browser]   opening    : $Url"

Start-Process -FilePath $exe -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=`"$ProfileDir`"",
    "--no-first-run",
    "--no-default-browser-check",
    $Url
) | Out-Null

# Wait for the endpoint to actually answer rather than sleeping a fixed guess:
# Chromium opens the socket a little after the process appears.
$deadline = (Get-Date).AddSeconds(25)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $probe = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
        $ready = $true
        Write-Host ""
        Write-Host "[browser] DevTools Protocol is up." -ForegroundColor Green
        Write-Host "[browser]   $($probe.Browser)"
        Write-Host "[browser]   webSocketDebuggerUrl: $($probe.webSocketDebuggerUrl)"
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if (-not $ready) {
    Write-Host "[browser] the browser started but never answered on port $Port." -ForegroundColor Red
    Write-Host "[browser] another instance of this profile may already be running."
    exit 1
}

Write-Host ""
Write-Host "[browser] next steps:"
Write-Host "[browser]   1. load the extension: chrome://extensions -> Load unpacked -> extension/dist"
Write-Host "[browser]   2. open the V.A.R.M.A side panel and start a task"
Write-Host "[browser]   3. the receiver already expects CDP at http://localhost:$Port"
