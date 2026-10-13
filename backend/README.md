# ⚙️ PulseLinux Backend Daemon & Fleet Hub

The FastAPI backend runs on port `15000` and serves as both the local telemetry engine and the central master hub for remote monitoring nodes.

## 🏃 Running the Backend

Using `uv`:
```bash
uv run uvicorn main:app --host 0.0.0.0 --port 15000
```
Or via the package script:
```bash
uv run backend
```

## 📡 Key API Endpoints

* `GET /api/vitals` - Real-time snapshot of system CPU, RAM, GPU, Disk I/O, Network I/O, Thermals, and active alerts.
* `GET /api/ports` - Active listening sockets and associated process names.
* `GET /api/sys/df` - Partition capacity and mount details.
* `GET /api/sys/du?path=<path>` - Directory disk space analysis.
* `GET /api/sys/smart` - S.M.A.R.T. drive health analysis.
* `GET /api/sys/inxi` - Hardware inventory.
* `GET /api/diagnostics/run` - Diagnostic checks (failed systemd units, dmesg driver errors, OOM events, firewall state).
* `POST /api/diagnostics/fix` - Restart failed systemd units.
* `POST /api/storage/vacuum-journal` - Clear journal logs older than 7 days.
* `GET /api/alerts/config` & `POST /api/alerts/config` - Inspect and update resource warning threshold limits.
* `POST /api/auth/login` & `POST /api/auth/register` - Local credential and Linux PAM authentication.
* `GET /api/fleet/summary` & `GET /api/fleet/devices` - Registered fleet devices status.
* `POST /api/fleet/send-enrollment-email` - Send OTP pairing email via Resend.
* `POST /api/fleet/verify-otp` - Verify device pairing OTP.

## 🔌 WebSockets

* `ws://<host>:15000/ws/vitals` - Continuous 1-second interval vitals telemetry stream for local node.
* `ws://<host>:15000/ws/fleet/admin?token=<token>` - Real-time fleet overview stream for admin dashboard.
* `ws://<host>:15000/ws/agent/{device_id}?token=<token>` - Device connection stream for remote nodes.
