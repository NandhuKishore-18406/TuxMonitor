import asyncio
import json
import logging
import os
import platform
import socket
import uuid
import websockets
from typing import Dict, Any

import time
import subprocess
import shutil
import psutil

try:
    from main import get_vitals_snapshot, get_os_details
except ImportError:
    # Standalone mode: gather telemetry directly with standard library & psutil
    BOOT_TIME = psutil.boot_time()
    _prev_net_io = psutil.net_io_counters()
    _prev_disk_io = psutil.disk_io_counters()
    _prev_time = time.time()

    def get_os_details() -> Dict[str, Any]:
        distro_name = "Linux"
        distro_id = "linux"
        if os.path.exists("/etc/os-release"):
            try:
                import re
                with open("/etc/os-release", "r") as f:
                    content = f.read()
                    name_match = re.search(r'^PRETTY_NAME="?([^"\n]+)"?', content, re.M)
                    id_match = re.search(r'^ID="?([^"\n]+)"?', content, re.M)
                    if name_match: distro_name = name_match.group(1)
                    if id_match: distro_id = id_match.group(1).lower()
            except Exception: pass

        cpu_model = platform.processor() or "Linux Processor"
        if os.path.exists("/proc/cpuinfo"):
            try:
                with open("/proc/cpuinfo", "r") as f:
                    for line in f:
                        if "model name" in line:
                            cpu_model = line.split(":", 1)[1].strip()
                            break
            except Exception: pass

        return {
            "distro_name": distro_name,
            "distro_id": distro_id,
            "kernel": platform.release(),
            "arch": platform.machine(),
            "hostname": platform.node(),
            "username": os.environ.get("USER", "client"),
            "cpu_model": cpu_model
        }

    def get_vitals_snapshot() -> Dict[str, Any]:
        global _prev_net_io, _prev_disk_io, _prev_time
        curr_time = time.time()
        elapsed = max(curr_time - _prev_time, 0.1)
        _prev_time = curr_time

        cpu_percent = psutil.cpu_percent(interval=None)
        cpu_cores = psutil.cpu_percent(interval=None, percpu=True)
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        uptime_sec = int(time.time() - BOOT_TIME)
        uptime_str = f"{uptime_sec // 86400}d {(uptime_sec % 86400) // 3600}h"

        disk_part = psutil.disk_usage("/")
        cur_r = psutil.disk_io_counters().read_bytes if psutil.disk_io_counters() else 0
        cur_w = psutil.disk_io_counters().write_bytes if psutil.disk_io_counters() else 0
        read_kb = round(max(cur_r - _prev_disk_io.read_bytes, 0) / 1024.0 / elapsed, 1) if _prev_disk_io else 0.0
        write_kb = round(max(cur_w - _prev_disk_io.write_bytes, 0) / 1024.0 / elapsed, 1) if _prev_disk_io else 0.0
        _prev_disk_io = psutil.disk_io_counters()

        cur_rx = psutil.net_io_counters().bytes_recv if psutil.net_io_counters() else 0
        cur_tx = psutil.net_io_counters().bytes_sent if psutil.net_io_counters() else 0
        down_kb = round(max(cur_rx - _prev_net_io.bytes_recv, 0) / 1024.0 / elapsed, 1) if _prev_net_io else 0.0
        up_kb = round(max(cur_tx - _prev_net_io.bytes_sent, 0) / 1024.0 / elapsed, 1) if _prev_net_io else 0.0
        _prev_net_io = psutil.net_io_counters()

        # Thermal
        temp = 0.0
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                temp = max([e.current for entries in temps.values() for e in entries if hasattr(e, 'current')], default=0.0)
        except Exception: pass

        # Top processes
        procs = []
        for p in sorted(psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'username']), key=lambda x: (x.info.get('cpu_percent') or 0), reverse=True)[:15]:
            try:
                info = p.info
                procs.append({
                    "pid": info.get("pid", 0),
                    "name": info.get("name", "Unknown"),
                    "cpu": round(info.get("cpu_percent") or 0.0, 1),
                    "memory": round(info.get("memory_percent") or 0.0, 1),
                    "user": info.get("username", ""),
                    "status": "running"
                })
            except Exception: pass

        # Filesystems
        filesystems = []
        try:
            for part in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    filesystems.append({
                        "filesystem": part.device,
                        "type": part.fstype,
                        "size": f"{round(usage.total / (1024**3), 1)}G",
                        "used": f"{round(usage.used / (1024**3), 1)}G",
                        "avail": f"{round(usage.free / (1024**3), 1)}G",
                        "use_percent": usage.percent,
                        "mount": part.mountpoint
                    })
                except Exception:
                    pass
        except Exception: pass

        os_info = get_os_details()

        return {
            "timestamp": curr_time,
            "os": os_info,
            "sys_info": os_info,
            "uptime": uptime_str,
            "cpu": {
                "percent": cpu_percent,
                "cores": cpu_cores,
                "per_core": cpu_cores,
                "count": psutil.cpu_count(logical=True),
                "core_count": psutil.cpu_count(logical=True),
                "load_avg": [round(x, 2) for x in os.getloadavg()] if hasattr(os, "getloadavg") else [0.0, 0.0, 0.0]
            },
            "memory": {
                "total_gb": round(mem.total / (1024**3), 2),
                "used_gb": round(mem.used / (1024**3), 2),
                "free_gb": round(mem.available / (1024**3), 2),
                "total_mb": round(mem.total / 1024 / 1024),
                "used_mb": round(mem.used / 1024 / 1024),
                "available_mb": round(mem.available / 1024 / 1024),
                "percent": mem.percent
            },
            "swap": {
                "total_mb": round(swap.total / 1024 / 1024),
                "used_mb": round(swap.used / 1024 / 1024),
                "percent": swap.percent
            },
            "disk": {
                "total_gb": round(disk_part.total / 1024 / 1024 / 1024, 1),
                "used_gb": round(disk_part.used / 1024 / 1024 / 1024, 1),
                "percent": disk_part.percent,
                "read_kb_s": read_kb,
                "write_kb_s": write_kb
            },
            "network": {
                "down_kb_s": down_kb,
                "up_kb_s": up_kb,
                "download_kb_s": down_kb,
                "upload_kb_s": up_kb
            },
            "thermal": {
                "max_temp": temp,
                "sensors": []
            },
            "processes": procs,
            "filesystems": filesystems,
            "alerts": []
        }

try:
    from diagnostics import attempt_service_fix, vacuum_journal_logs, clean_package_cache
except ImportError:
    def attempt_service_fix(*args, **kwargs): return False, "diagnostics package not installed"
    def vacuum_journal_logs(): return False, "not supported in standalone client"
    def clean_package_cache(*args, **kwargs): return False, "not supported in standalone client"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agent_client")

DEVICE_ID_FILE = os.path.join(os.path.dirname(__file__), ".device_id")
DEVICE_TOKEN_FILE = os.path.join(os.path.dirname(__file__), ".device_token")

def get_or_create_device_id() -> str:
    """Gets or generates a unique, persistent Device ID for this machine."""
    if os.path.exists(DEVICE_ID_FILE):
        try:
            with open(DEVICE_ID_FILE, "r") as f:
                dev_id = f.read().strip()
                if dev_id:
                    return dev_id
        except Exception:
            pass

    # Try system machine-id or generate UUID
    new_id = ""
    for mid_path in ["/etc/machine-id", "/var/lib/dbus/machine-id"]:
        if os.path.exists(mid_path):
            try:
                with open(mid_path, "r") as f:
                    new_id = f.read().strip()[:16]
                    if new_id:
                        break
            except Exception:
                pass

    if not new_id:
        new_id = f"node-{uuid.uuid4().hex[:12]}"
    else:
        new_id = f"node-{new_id}"

    try:
        with open(DEVICE_ID_FILE, "w") as f:
            f.write(new_id)
    except Exception:
        pass

    return new_id

def get_persisted_token() -> str:
    """Retrieves saved device enrollment token if present."""
    if os.path.exists(DEVICE_TOKEN_FILE):
        try:
            with open(DEVICE_TOKEN_FILE, "r") as f:
                tok = f.read().strip()
                if tok:
                    return tok
        except Exception:
            pass
    return ""

def persist_device_token(token: str):
    """Saves device enrollment token for seamless reboots."""
    if token:
        try:
            with open(DEVICE_TOKEN_FILE, "w") as f:
                f.write(token.strip())
        except Exception:
            pass

def get_device_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class AgentClient:
    def __init__(self, hub_url: str = None, enroll_token: str = None):
        raw_hub = hub_url or os.environ.get("HUB_URL") or "ws://127.0.0.1:15000"
        raw_token = enroll_token or os.environ.get("ENROLL_TOKEN") or get_persisted_token()
        hub = raw_hub.strip(' "\'')
        if hub.startswith("http://"):
            hub = "ws://" + hub[7:]
        elif hub.startswith("https://"):
            hub = "wss://" + hub[8:]
        elif not (hub.startswith("ws://") or hub.startswith("wss://")):
            hub = f"ws://{hub}"
        self.hub_url = hub.rstrip('/')
        self.enroll_token = raw_token.strip(' "\'')
        if self.enroll_token:
            persist_device_token(self.enroll_token)
        self.device_id = get_or_create_device_id()
        self.running = True

    async def start(self):
        logger.info(f"Starting Agent Client for Device ID: {self.device_id}")
        os_info = get_os_details()
        ip_addr = get_device_ip()

        token_query = f"?token={self.enroll_token}" if self.enroll_token else ""
        target_url = f"{self.hub_url}/ws/agent/{self.device_id}{token_query}"

        while self.running:
            try:
                logger.info(f"Connecting to Central Fleet Hub at {target_url}...")
                async with websockets.connect(target_url, open_timeout=20, ping_interval=20, ping_timeout=20) as ws:
                    logger.info("Connected to Fleet Hub! Sending handshake registration...")
                    
                    handshake = {
                        "hostname": os_info.get("hostname", platform.node()),
                        "ip": ip_addr,
                        "distro_name": os_info.get("distro_name", "Linux"),
                        "distro_id": os_info.get("distro_id", "linux")
                    }
                    await ws.send(json.dumps(handshake))

                    # Start streaming vitals task and command listener task concurrently
                    async def stream_vitals():
                        count = 0
                        while self.running:
                            snapshot = get_vitals_snapshot()
                            await ws.send(json.dumps(snapshot))
                            count += 1
                            if count == 1:
                                logger.info("Handshake acknowledged! Real-time vitals streaming live to master hub.")
                            elif count % 20 == 0:
                                logger.info(f"Streamed {count} vitals telemetry cycles to master hub.")
                            await asyncio.sleep(1.5)

                    async def listen_commands():
                        while self.running:
                            msg_str = await ws.recv()
                            try:
                                cmd = json.loads(msg_str)
                                msg_type = cmd.get("type")
                                if msg_type == "notification":
                                    title = cmd.get("title", "PulseLinux Notification")
                                    msg = cmd.get("message", "")
                                    urgency = cmd.get("urgency", "normal")
                                    if shutil.which("notify-send"):
                                        try:
                                            subprocess.run(["notify-send", "-u", urgency, "-a", "PulseLinux", title, msg], check=False)
                                        except Exception:
                                            pass
                                    continue
                                elif msg_type == "chat_message":
                                    m = cmd.get("message", {})
                                    txt = m.get("text", "")
                                    sender = m.get("sender", "Admin")
                                    if shutil.which("notify-send"):
                                        try:
                                            subprocess.run(["notify-send", "-a", "PulseLinux", f"💬 {sender}", txt], check=False)
                                        except Exception:
                                            pass
                                    continue

                                action = cmd.get("action")
                                payload = cmd.get("payload", {})
                                logger.info(f"Received remote command: {action} with payload: {payload}")

                                if action == "fix_service":
                                    unit = payload.get("unit_name", "")
                                    act = payload.get("action", "restart")
                                    if unit:
                                        attempt_service_fix(unit, action=act)
                                elif action == "vacuum_journal":
                                    vacuum_journal_logs()
                                elif action == "clean_pkg_cache":
                                    kv = payload.get("keep_versions", 2)
                                    clean_package_cache(keep_versions=kv)
                            except Exception as e:
                                logger.error(f"Error handling remote command: {e}")

                    vitals_task = asyncio.create_task(stream_vitals())
                    listen_task = asyncio.create_task(listen_commands())

                    done, pending = await asyncio.wait(
                        [vitals_task, listen_task],
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    for t in pending:
                        t.cancel()

            except (websockets.exceptions.ConnectionClosed, OSError, Exception) as err:
                logger.warning(f"Connection lost ({err}). Retrying in 4 seconds...")
                await asyncio.sleep(4.0)

if __name__ == "__main__":
    client = AgentClient()
    asyncio.run(client.start())
