# MySQL Network Setup - Quick Reference Card

## Two-Computer Setup for Orienteering Events

### Computer 1: Check-in Station (meos-entry-build)

**One-Time Setup:**
1. Install MySQL Server 8.0+ with root password: `DVOArunner`
2. In meos-entry-build: **Tools → Setup MySQL Network Access**
3. Click "Continue" and wait for completion
4. **Write down the IP address shown** (e.g., 192.168.4.125)

**On Event Day:**
- Run meos-entry-build for check-ins
- MySQL database runs in background

---

### Computer 2: Event Management (MeOS)

**MeOS Database Settings:**
```
MySQL Server:  [IP from Computer 1]
Username:      DVOA
Password:      DVOArunner
Port:          3306
```

**Example:**
```
MySQL Server:  192.168.4.125
Username:      DVOA
Password:      DVOArunner
Port:          3306
```

---

## Quick Troubleshooting

### ❌ "Cannot connect" (Error 10061)
- ✅ Check both computers are on same network
- ✅ Verify MySQL service is running on Computer 1
- ✅ Re-run setup: Tools → Setup MySQL Network Access

### ❌ "Access denied"
- ✅ Username must be: `DVOA` (all caps)
- ✅ Password must be: `DVOArunner`
- ✅ Re-run setup to recreate users

### ❌ "MySQL not found"
- ✅ Install MySQL Server 8.0+ on Computer 1
- ✅ Download from: dev.mysql.com/downloads/mysql/

---

## Network Requirements

- Both computers must be on the same local network
- Typical IP patterns: `192.168.x.x` or `10.x.x.x`
- Port 3306 must be accessible (firewall configured automatically)

---

## Default Passwords

| What | Password |
|------|----------|
| MySQL Root | DVOArunner |
| DVOA User | DVOArunner |

*Change these for production use*

---

## Support

Full documentation: `docs/MYSQL_NETWORK_SETUP.md`

---

**Print this card and keep it with your event equipment!**
