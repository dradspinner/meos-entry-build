# MySQL Network Setup Script for MeOS Entry Build
# This script configures MySQL for network access in a two-computer setup

param(
    [string]$RootPassword = "DVOArunner",
    [string]$DvoaPassword = "DVOArunner"
)

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  MySQL Network Setup for MeOS Entry" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Find MySQL installation
$mysqlPaths = @(
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 8.1\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 9.0\bin\mysql.exe",
    "C:\Program Files (x86)\MySQL\MySQL Server 8.0\bin\mysql.exe"
)

$mysqlExe = $null
foreach ($path in $mysqlPaths) {
    if (Test-Path $path) {
        $mysqlExe = $path
        break
    }
}

if (-not $mysqlExe) {
    Write-Host "ERROR: MySQL not found in standard installation paths" -ForegroundColor Red
    Write-Host "Please install MySQL Server first" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/4] Found MySQL at: $mysqlExe" -ForegroundColor Green

# Get local IP address
Write-Host "[2/4] Getting local IP address..." -ForegroundColor Yellow
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^192\.168\.\d+\.\d+$' -or $_.IPAddress -match '^10\.\d+\.\d+\.\d+$' }).IPAddress | Select-Object -First 1

if (-not $ipAddress) {
    Write-Host "WARNING: Could not detect local network IP" -ForegroundColor Yellow
    $ipAddress = Read-Host "Please enter your local IP address (e.g., 192.168.1.100)"
}

$networkPrefix = ($ipAddress -split '\.')[0..2] -join '.'
Write-Host "   Local IP: $ipAddress" -ForegroundColor Cyan
Write-Host "   Network: $networkPrefix.%" -ForegroundColor Cyan

# Create MySQL users with network access
Write-Host "[3/4] Configuring MySQL users..." -ForegroundColor Yellow

$sqlCommands = @"
-- Drop existing DVOA users if they exist
DROP USER IF EXISTS 'DVOA'@'localhost';
DROP USER IF EXISTS 'DVOA'@'$networkPrefix.%';

-- Create DVOA users for local and network access
CREATE USER 'DVOA'@'localhost' IDENTIFIED BY '$DvoaPassword';
CREATE USER 'DVOA'@'$networkPrefix.%' IDENTIFIED BY '$DvoaPassword';

-- Grant all privileges
GRANT ALL PRIVILEGES ON *.* TO 'DVOA'@'localhost';
GRANT ALL PRIVILEGES ON *.* TO 'DVOA'@'$networkPrefix.%';

-- Flush privileges
FLUSH PRIVILEGES;

-- Show created users
SELECT user, host FROM mysql.user WHERE user='DVOA';
"@

try {
    $output = & $mysqlExe -u root -p"$RootPassword" -e $sqlCommands 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to configure MySQL users" -ForegroundColor Red
        Write-Host $output -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "   MySQL users configured successfully" -ForegroundColor Green
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Configure Windows Firewall
Write-Host "[4/4] Configuring Windows Firewall..." -ForegroundColor Yellow

# Check if rule already exists
$existingRule = Get-NetFirewallRule -DisplayName "MySQL Server" -ErrorAction SilentlyContinue

if ($existingRule) {
    Write-Host "   Firewall rule already exists, removing old rules..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName "MySQL Server" -ErrorAction SilentlyContinue
}

try {
    New-NetFirewallRule -DisplayName "MySQL Server" `
                        -Direction Inbound `
                        -Protocol TCP `
                        -LocalPort 3306 `
                        -Action Allow `
                        -Profile Domain,Private `
                        -ErrorAction Stop | Out-Null
    Write-Host "   Firewall rule created successfully" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Could not create firewall rule (may need admin privileges)" -ForegroundColor Yellow
    Write-Host "   You may need to manually allow port 3306 in Windows Firewall" -ForegroundColor Yellow
}

# Verify MySQL is listening on network
Write-Host ""
Write-Host "Verifying MySQL network configuration..." -ForegroundColor Yellow
$listening = netstat -an | Select-String ":3306" | Select-String "LISTENING"

if ($listening -match "0.0.0.0:3306") {
    Write-Host "   MySQL is listening on all network interfaces" -ForegroundColor Green
} else {
    Write-Host "WARNING: MySQL may not be listening on network interfaces" -ForegroundColor Yellow
    Write-Host "   Check MySQL configuration file (my.ini) - bind-address should be 0.0.0.0" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Connection Details for Other Computer:" -ForegroundColor White
Write-Host "   MySQL Server:  $ipAddress" -ForegroundColor Cyan
Write-Host "   Username:      DVOA" -ForegroundColor Cyan
Write-Host "   Password:      $DvoaPassword" -ForegroundColor Cyan
Write-Host "   Port:          3306" -ForegroundColor Cyan
Write-Host ""
Write-Host "Use these settings in MeOS on the other computer" -ForegroundColor Yellow
Write-Host ""

Read-Host "Press Enter to close"
