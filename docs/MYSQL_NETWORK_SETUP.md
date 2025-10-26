# MySQL Network Setup for Two-Computer Configuration

## Overview

This feature allows you to easily configure MySQL for network access when using a two-computer setup for orienteering events:

- **Computer 1** (Check-in Station): Runs meos-entry-build and hosts the MySQL database
- **Computer 2** (Event Management): Runs MeOS and connects to the shared MySQL database

## Quick Start

### On Computer 1 (Check-in Station)

1. **Install MySQL Server** (if not already installed)
   - Download from: https://dev.mysql.com/downloads/mysql/
   - During installation, set root password to: `DVOArunner`

2. **Run Network Setup**
   - Open the meos-entry-build application
   - Go to menu: **Tools → Setup MySQL Network Access**
   - Click "Continue" in the dialog
   - Wait for the setup to complete

3. **Note Your IP Address**
   - The setup script will display your local IP address (e.g., `192.168.4.125`)
   - Write this down - you'll need it for Computer 2

### On Computer 2 (Event Management)

1. **Open MeOS**
2. **Configure Database Connection**
   - Go to MeOS settings/database configuration
   - Enter these connection details:
     - **MySQL Server:** `[IP address from Computer 1]` (e.g., `192.168.4.125`)
     - **Username:** `DVOA`
     - **Password:** `DVOArunner`
     - **Port:** `3306`

3. **Test Connection**
   - Verify that MeOS can connect to the database

## What the Setup Does

The automated setup performs these actions:

1. **Creates MySQL Users**
   - `DVOA@localhost` - for local connections on Computer 1
   - `DVOA@[network].%` - for connections from other computers on the same network
   - Both users have full database privileges

2. **Configures Windows Firewall**
   - Creates an inbound rule to allow MySQL traffic on port 3306
   - Applies to Domain and Private network profiles

3. **Verifies Configuration**
   - Checks that MySQL is listening on network interfaces
   - Displays your local IP address for reference

## Troubleshooting

### "MySQL not found" Error
- Ensure MySQL Server 8.0+ is installed
- The setup script checks these locations:
  - `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`
  - `C:\Program Files\MySQL\MySQL Server 8.1\bin\mysql.exe`
  - `C:\Program Files\MySQL\MySQL Server 9.0\bin\mysql.exe`

### Connection Refused (Error 10061)
1. **Verify both computers are on the same network**
   - Check that both have IPs like `192.168.x.x` or `10.x.x.x`

2. **Check Windows Firewall**
   - Ensure port 3306 is allowed
   - Run the setup script again to recreate the rule

3. **Verify MySQL is running**
   - On Computer 1, check Services (services.msc)
   - Look for "MySQL80" service - should be Running

### Cannot Connect from Network
If MySQL is only listening on `127.0.0.1`:

1. Find MySQL configuration file:
   - Usually at: `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini`

2. Edit the file and find/change:
   ```ini
   bind-address = 0.0.0.0
   ```
   (Change from `127.0.0.1` to `0.0.0.0`)

3. Restart MySQL service:
   ```powershell
   Restart-Service MySQL80
   ```

### Custom Passwords
If you're using different passwords, run the setup script manually:

```powershell
cd "path\to\meos-entry-build\public"
.\setup-mysql-network.ps1 -RootPassword "YourRootPassword" -DvoaPassword "YourDvoaPassword"
```

## Security Notes

- **Network Security**: The DVOA user has full privileges. Only use on trusted networks.
- **Firewall**: The setup only allows connections on Domain and Private networks, not Public.
- **Passwords**: Default passwords are `DVOArunner`. Change these for production use.

## Manual Setup (Alternative)

If the automated setup doesn't work, you can configure manually:

### 1. Create MySQL Users

```sql
-- Connect as root
mysql -u root -p

-- Create users
CREATE USER 'DVOA'@'localhost' IDENTIFIED BY 'DVOArunner';
CREATE USER 'DVOA'@'192.168.4.%' IDENTIFIED BY 'DVOArunner';

-- Grant privileges
GRANT ALL PRIVILEGES ON *.* TO 'DVOA'@'localhost';
GRANT ALL PRIVILEGES ON *.* TO 'DVOA'@'192.168.4.%';

-- Apply changes
FLUSH PRIVILEGES;
```

### 2. Configure Firewall

Open PowerShell as Administrator:

```powershell
New-NetFirewallRule -DisplayName "MySQL Server" `
                    -Direction Inbound `
                    -Protocol TCP `
                    -LocalPort 3306 `
                    -Action Allow `
                    -Profile Domain,Private
```

### 3. Get Your IP Address

```powershell
ipconfig | Select-String "IPv4"
```

## Architecture

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│   Computer 1 (Check-in)     │         │  Computer 2 (Event Mgmt)    │
│                             │         │                             │
│  ┌─────────────────────┐   │         │  ┌─────────────────────┐   │
│  │ meos-entry-build    │   │         │  │      MeOS           │   │
│  │  (Check-in UI)      │   │         │  │  (Event Mgmt)       │   │
│  └──────────┬──────────┘   │         │  └──────────┬──────────┘   │
│             │               │         │             │               │
│             │               │  LAN    │             │               │
│             ▼               │◄────────┤             ▼               │
│  ┌─────────────────────┐   │         │  MySQL Client Connection    │
│  │   MySQL Server      │   │         │  to 192.168.4.125:3306      │
│  │   Port 3306         │◄──┼─────────┼─────────────────────────────┤
│  │   (Shared DB)       │   │         │                             │
│  └─────────────────────┘   │         │                             │
│                             │         │                             │
└─────────────────────────────┘         └─────────────────────────────┘
```

## Related Documentation

- [MeOS Integration](../WARP.md#meos-integration-details)
- [Running the App](../RUNNING_THE_APP.md)
- [Development Setup](../DEV_SETUP_COMPLETE.md)
