# Allowance Tracker

A family allowance tracking web app. Supports parent and child logins, weekly automatic credits, deductions, and payouts.

## Quick Start (Linux Server)

### 1. Install Node.js (if needed)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Copy files to server and install dependencies
```bash
cd /opt/allowance   # or wherever you want it
npm install
```

### 3. Create the first parent account
```bash
npm run setup
```

### 4. Start the server
```bash
npm start
# App is now at http://0.0.0.0:3000
```

Access from other devices at `http://<server-ip>:3000`

---

## Running as a systemd service (auto-start on boot)

Create `/etc/systemd/system/allowance.service`:

```ini
[Unit]
Description=Allowance Tracker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/allowance
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=PORT=3000
Environment=SESSION_SECRET=replace-with-a-long-random-string

[Install]
WantedBy=multi-user.target
```

Then enable it:
```bash
sudo systemctl daemon-reload
sudo systemctl enable allowance
sudo systemctl start allowance
```

---

## Features

- **Parent dashboard**: see all children's balances at a glance
- **Child detail**: full transaction history, add deductions/payouts/bonuses
- **Child login**: kids can view their own balance and history (read-only)
- **Auto credit**: allowances are credited every **Saturday at 8:00 AM** automatically
- **Manual credit**: parents can credit any child (or all) manually at any time
- **Transaction delete**: parents can remove erroneous transactions
- **User management**: add/remove parent or child accounts, change passwords

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `SESSION_SECRET` | random | Set a stable secret so sessions survive restarts |
| `DB_PATH` | `./allowance.db` | Path to SQLite database file |
