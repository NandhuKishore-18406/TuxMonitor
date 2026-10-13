# 🖥️ PulseLinux System Vitals & Diagnostics Monitor

A lightweight Linux hardware telemetry monitor, diagnostic suite, and multi-node fleet management dashboard with a retro monochrome window-manager interface.

---

## 🌟 Key Features

* **Hardware & System Vitals**:
  * **CPU & Per-Core Load**: Total percentage, per-core breakdown, core counts, and load averages.
  * **Memory & Swap**: Physical memory, swap usage, cached/buffered RAM, and real Linux kernel commit charges (`/proc/meminfo`).
  * **GPU Monitoring**: Dedicated NVIDIA GPU utilization & VRAM tracking (`nvidia-smi`) and AMD/Intel iGPU telemetry (`/sys/class/drm`).
  * **Storage & Throughput**: Partition utilization (`df -hT`), directory sizing (`du -sh`), SMART drive health analysis (`smartctl`), and disk I/O throughput (`/proc/diskstats`).
  * **Network Traffic & Ports**: Inbound/outbound throughput (`/proc/net/dev`), active socket listeners, and process-to-port mapping.
  * **Thermals & Battery**: Multi-zone temperature monitoring and battery charge state.

* **Linux Diagnostic & Self-Healing Suite**:
  * Scans for failed systemd units (`systemctl --failed`) with one-click restart capability.
  * Detects missing firmware or driver warnings from kernel ring buffer (`dmesg --level=err,warn`).
  * Monitors kernel Out-Of-Memory (OOM) killer events (`journalctl -k`).
  * Measures recoverable system log space and provides one-click journal vacuuming (`journalctl --vacuum-time=7d`).

* **Multi-Node Fleet Management**:
  * Centralized master hub (`/ws/fleet/admin`) supporting real-time streaming from remote nodes (`/ws/agent/{device_id}`).
  * Node pairing via 6-digit OTP codes and enrollment tokens, with optional email dispatch via Resend.
  * Multi-device switcher directly in the desktop Start menu.
  * Remote diagnostics and maintenance commands.

* **Retro Monochrome Desktop Interface**:
  * Nostalgic window manager supporting dragging, minimizing, maximizing, and stacking.
  * Real-time SVG sparklines for live CPU, RAM, GPU, network, and disk activity.
  * Distro-specific ASCII art for Arch, CachyOS, Ubuntu, and generic Linux.
  * Configurable alert thresholds with live status indicators.

---

## 🏗️ Architecture

```
system-vitals-monitor/
├── backend/                  # FastAPI Backend API & WebSocket Daemon (Port 15000)
│   ├── main.py               # API endpoints, telemetry collector, and static SPA server
│   ├── diagnostics.py        # Systemd, dmesg, SMART, df, du, and journal vacuuming
│   ├── hub_manager.py        # Fleet hub WebSocket manager and device registry
│   ├── agent_client.py       # Client daemon that connects and streams to master hub
│   ├── auth.py               # Credentials, Linux PAM, and JWT session handling
│   ├── database.py           # Optional Neon PostgreSQL persistence (devices, users, OTPs)
│   └── email_service.py      # Optional Resend email dispatch for device enrollment OTPs
│
├── frontend/                 # React 19 + Vite Retro Desktop Dashboard (Port 3000)
│   ├── src/App.jsx           # Window manager, taskbar, Start menu, and applications
│   ├── src/index.css         # Retro monochrome design system and window styles
│   └── vite.config.js        # Vite dev server with reverse proxy to port 15000
│
├── install-daemon.sh         # Systemd service installer with dedicated vitals-daemon user
├── pulse-vitals-backend.service # Systemd service unit template
├── vitals-daemon-sudoers     # Granular least-privilege sudo rules for daemon
└── start.sh                  # Interactive runner launching both backend and frontend
```

---

## 🚀 Getting Started

### Prerequisites

* Linux OS (Arch Linux, CachyOS, Ubuntu, Debian, Fedora, etc.)
* Python 3.12+ (or [uv](https://github.com/astral-sh/uv))
* Node.js 18+ and `npm`

### 1. Launching Locally (Development / Standalone)

Run the launcher script to start both the backend API and frontend dev server:

```bash
./start.sh
```

* **Dashboard**: [http://localhost:3000](http://localhost:3000)
* **Backend API**: [http://localhost:15000](http://localhost:15000)
* **Default Admin Credentials**: `admin` / `admin123` (or sign in with your active Linux user).

### 2. Installing as a Background Systemd Daemon

For continuous, low-privilege background monitoring with resource limits (120M RAM cap, 15% CPU cap):

```bash
sudo ./install-daemon.sh
```

Check daemon status anytime:
```bash
systemctl status pulse-vitals-backend.service
journalctl -u pulse-vitals-backend.service -f
```

---

## ⚙️ Environment Configuration

Create or modify `backend/.env` for cloud integrations:

```env
# Optional: Neon PostgreSQL Cloud Database URL
DATABASE_URL="postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require"

# Optional: Clerk OAuth Authentication (Google & GitHub)
VITE_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# Optional: Resend API Key for Email OTP Pairing
RESEND_API_KEY="re_..."
RESEND_SENDER_EMAIL="onboarding@resend.dev"
```

---

## 🔒 Security & Least-Privilege

The backend daemon does not require root execution:
1. Runs under a dedicated system user: `vitals-daemon`.
2. Hardware inspection and remediation commands are granted explicitly through `/etc/sudoers.d/vitals-daemon` without password prompts:
   * `/usr/bin/smartctl` (SMART health checks)
   * `/usr/bin/systemctl restart <unit>` (Restarting failed services)
   * `/usr/bin/journalctl --vacuum-time=*` (Cleaning old journal logs)
   * `/usr/bin/dmesg --level=*` (Checking driver and firmware errors)
   * `/usr/bin/ufw status` (Checking firewall status)
