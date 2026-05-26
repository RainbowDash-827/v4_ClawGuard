#!/usr/bin/env pwsh
# install.ps1 - Windows PowerShell equivalent of install.sh
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Error 'npx is required to install ClawGuard into OpenClaw'
    exit 1
}

Set-Location $PROJECT_DIR

Write-Host 'Installing ClawGuard plugin into OpenClaw...'
npx openclaw plugins install -l .

Write-Host ''
Write-Host 'ClawGuard is ready.'
Write-Host 'Try:'
Write-Host '  npx openclaw ClawGuard audit'
Write-Host '  npx openclaw ClawGuard harden'
Write-Host '  npx openclaw ClawGuard monitor'