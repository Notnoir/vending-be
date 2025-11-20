# MQTT Broker Setup for Windows
# This script helps you install and configure Mosquitto MQTT Broker

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Mosquitto MQTT Broker Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if Chocolatey is installed
$chocoInstalled = Get-Command choco -ErrorAction SilentlyContinue

if (-not $chocoInstalled) {
    Write-Host "❌ Chocolatey is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Option 1: Install Chocolatey (Recommended)" -ForegroundColor Yellow
    Write-Host "  Run in Admin PowerShell:" -ForegroundColor Gray
    Write-Host '  Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString("https://community.chocolatey.org/install.ps1"))' -ForegroundColor Gray
    Write-Host ""
    Write-Host "Option 2: Manual Download" -ForegroundColor Yellow
    Write-Host "  Download from: https://mosquitto.org/download/" -ForegroundColor Gray
    Write-Host "  Install to: C:\Program Files\mosquitto" -ForegroundColor Gray
    Write-Host ""
    exit
}

Write-Host "✅ Chocolatey detected" -ForegroundColor Green
Write-Host ""

# Check if Mosquitto is already installed
$mosquittoInstalled = Get-Command mosquitto -ErrorAction SilentlyContinue

if ($mosquittoInstalled) {
    Write-Host "✅ Mosquitto is already installed" -ForegroundColor Green
    Write-Host "   Path: $($mosquittoInstalled.Source)" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "📦 Installing Mosquitto..." -ForegroundColor Yellow
    Write-Host "   This requires Administrator privileges" -ForegroundColor Gray
    Write-Host ""
    
    $install = Read-Host "Install Mosquitto now? (y/n)"
    if ($install -eq "y" -or $install -eq "Y") {
        # Check if running as admin
        $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        
        if (-not $isAdmin) {
            Write-Host "❌ Please run this script as Administrator" -ForegroundColor Red
            exit
        }
        
        choco install mosquitto -y
        
        # Refresh environment
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        Write-Host "✅ Mosquitto installed successfully" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "⏭️  Skipping installation" -ForegroundColor Yellow
        exit
    }
}

# Create config directory
$configDir = "C:\Program Files\mosquitto"
$configFile = "$configDir\mosquitto.conf"

Write-Host "📝 Configuring Mosquitto..." -ForegroundColor Yellow
Write-Host ""

# Check if config exists
if (Test-Path $configFile) {
    Write-Host "⚠️  Config file already exists: $configFile" -ForegroundColor Yellow
    $overwrite = Read-Host "Overwrite with development config? (y/n)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "⏭️  Keeping existing config" -ForegroundColor Yellow
    } else {
        # Backup existing config
        Copy-Item $configFile "$configFile.backup" -Force
        Write-Host "💾 Backed up to: $configFile.backup" -ForegroundColor Gray
        
        # Create new config
        $config = @"
# Mosquitto MQTT Broker Configuration
# Development Mode - Allows anonymous connections

# Network
listener 1883
protocol mqtt

# Allow anonymous (for development only!)
allow_anonymous true

# Logging
log_dest file C:/Program Files/mosquitto/logs/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information

# Persistence
persistence true
persistence_location C:/Program Files/mosquitto/data/

# For production, uncomment these:
# allow_anonymous false
# password_file C:/Program Files/mosquitto/passwd
"@
        
        Set-Content -Path $configFile -Value $config -Force
        Write-Host "✅ Config created: $configFile" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Config file not found: $configFile" -ForegroundColor Red
    Write-Host "   Please create it manually" -ForegroundColor Gray
}

# Create log directory
$logDir = "C:\Program Files\mosquitto\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Write-Host "✅ Created log directory: $logDir" -ForegroundColor Green
}

# Create data directory
$dataDir = "C:\Program Files\mosquitto\data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Write-Host "✅ Created data directory: $dataDir" -ForegroundColor Green
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Service Management" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check service status
$service = Get-Service -Name mosquitto -ErrorAction SilentlyContinue

if ($service) {
    Write-Host "Service Status: $($service.Status)" -ForegroundColor $(if ($service.Status -eq "Running") { "Green" } else { "Yellow" })
    Write-Host ""
    
    if ($service.Status -ne "Running") {
        $start = Read-Host "Start Mosquitto service now? (y/n)"
        if ($start -eq "y" -or $start -eq "Y") {
            Start-Service mosquitto
            Write-Host "✅ Mosquitto service started" -ForegroundColor Green
        }
    } else {
        $restart = Read-Host "Restart Mosquitto service to apply config? (y/n)"
        if ($restart -eq "y" -or $restart -eq "Y") {
            Restart-Service mosquitto
            Write-Host "✅ Mosquitto service restarted" -ForegroundColor Green
        }
    }
} else {
    Write-Host "⚠️  Mosquitto service not found" -ForegroundColor Yellow
    Write-Host "   Try reinstalling or check installation" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Testing" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test connection:" -ForegroundColor Yellow
Write-Host "  mosquitto_sub -h localhost -t test/topic" -ForegroundColor Gray
Write-Host ""
Write-Host "In another terminal:" -ForegroundColor Yellow
Write-Host "  mosquitto_pub -h localhost -t test/topic -m 'Hello MQTT'" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
