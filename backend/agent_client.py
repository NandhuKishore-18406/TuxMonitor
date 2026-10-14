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

        # GPU Telemetry
        gpu_vitals = {"available": False, "all_gpus": []}
        try:
            gpus = []
            if shutil.which("nvidia-smi"):
                try:
                    res = subprocess.run(
                        ["nvidia-smi", "--query-gpu=name,utilization.gpu,utilization.memory,memory.total,memory.used,temperature.gpu", "--format=csv,noheader,nounits"],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=1.5
                    )
                    if res.returncode == 0 and res.stdout.strip():
                        for line in res.stdout.strip().splitlines():
                            parts = [p.strip() for p in line.split(",")]
                            if len(parts) >= 6:
                                total_vram_mb = float(parts[3])
                                used_vram_mb = float(parts[4])
                                vram_percent = round((used_vram_mb / total_vram_mb) * 100.0, 1) if total_vram_mb > 0 else 0.0
                                gpus.append({
                                    "type": "nvidia",
                                    "name": parts[0],
                                    "usage_percent": float(parts[1]),
                                    "vram_percent": vram_percent,
                                    "vram_used_gb": round(used_vram_mb / 1024.0, 2),
                                    "vram_total_gb": round(total_vram_mb / 1024.0, 2),
                                    "vram_used_mb": round(used_vram_mb, 1),
                                    "vram_total_mb": round(total_vram_mb, 1),
                                    "temp_c": float(parts[5])
                                })
                except Exception:
                    pass

            drm_path = "/sys/class/drm"
            if os.path.exists(drm_path):
                for card in sorted(os.listdir(drm_path)):
                    if card.startswith("card") and not "-" in card:
                        card_dev = os.path.join(drm_path, card, "device")
                        busy_file = os.path.join(card_dev, "gpu_busy_percent")
                        usage = 0.0
                        if os.path.exists(busy_file):
                            try:
                                with open(busy_file, "r") as f:
                                    usage = float(f.read().strip())
                            except Exception:
                                pass

                        vram_total_bytes = 0
                        vram_used_bytes = 0
                        for t_name in ["mem_info_vram_total", "mem_info_gtt_total"]:
                            t_path = os.path.join(card_dev, t_name)
                            if os.path.exists(t_path):
                                try:
                                    with open(t_path, "r") as f:
                                        vram_total_bytes = int(f.read().strip())
                                        if vram_total_bytes > 0:
                                            break
                                except Exception:
                                    pass
                        for u_name in ["mem_info_vram_used", "mem_info_gtt_used"]:
                            u_path = os.path.join(card_dev, u_name)
                            if os.path.exists(u_path):
                                try:
                                    with open(u_path, "r") as f:
                                        vram_used_bytes = int(f.read().strip())
                                        if vram_used_bytes > 0:
                                            break
                                except Exception:
                                    pass

                        vram_total_mb = round(vram_total_bytes / (1024 * 1024), 1) if vram_total_bytes > 0 else 0.0
                        vram_used_mb = round(vram_used_bytes / (1024 * 1024), 1) if vram_used_bytes > 0 else 0.0
                        vram_total_gb = round(vram_total_bytes / (1024**3), 2) if vram_total_bytes > 0 else 0.0
                        vram_used_gb = round(vram_used_bytes / (1024**3), 2) if vram_used_bytes > 0 else 0.0
                        vram_percent = round((vram_used_bytes / vram_total_bytes) * 100.0, 1) if vram_total_bytes > 0 else 0.0

                        gpu_name = f"Integrated / Discrete GPU ({card})"
                        uevent_path = os.path.join(card_dev, "uevent")
                        if os.path.exists(uevent_path):
                            try:
                                with open(uevent_path, "r") as f:
                                    u_content = f.read()
                                    if "DRIVER=amdgpu" in u_content:
                                        gpu_name = f"AMD Radeon Graphics ({card})"
                                    elif "DRIVER=i915" in u_content or "DRIVER=xe" in u_content:
                                        gpu_name = f"Intel UHD/Iris Graphics ({card})"
                            except Exception:
                                pass

                        gpus.append({
                            "type": "amd_intel",
                            "name": gpu_name,
                            "usage_percent": usage,
                            "vram_percent": vram_percent,
                            "vram_used_gb": vram_used_gb,
                            "vram_total_gb": vram_total_gb,
                            "vram_used_mb": vram_used_mb,
                            "vram_total_mb": vram_total_mb,
                            "temp_c": 0.0
                        })

            if gpus:
                active_gpu = max(gpus, key=lambda g: (g["usage_percent"], g["vram_used_gb"]))
                gpu_vitals = {
                    "available": True,
                    "name": active_gpu["name"],
                    "usage_percent": active_gpu["usage_percent"],
                    "vram_percent": active_gpu["vram_percent"],
                    "vram_used_gb": active_gpu["vram_used_gb"],
                    "vram_total_gb": active_gpu["vram_total_gb"],
                    "vram_used_mb": active_gpu.get("vram_used_mb", round(active_gpu["vram_used_gb"] * 1024.0, 1)),
                    "vram_total_mb": active_gpu.get("vram_total_mb", round(active_gpu["vram_total_gb"] * 1024.0, 1)),
                    "temp_c": active_gpu["temp_c"],
                    "all_gpus": gpus
                }
        except Exception:
            pass

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
            "gpu": gpu_vitals,
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
    def __init__(self, hub_url: str = None, enroll_token: str = None, admin_user: str = None, admin_pass: str = None):
        raw_hub = hub_url or os.environ.get("HUB_URL") or "ws://127.0.0.1:15000"
        raw_token = enroll_token or os.environ.get("ENROLL_TOKEN") or get_persisted_token()
        self.admin_user = (admin_user or os.environ.get("ADMIN_USER") or "").strip(' "\'')
        self.admin_pass = (admin_pass or os.environ.get("ADMIN_PASS") or "").strip(' "\'')
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

        query_parts = []
        if self.enroll_token:
            query_parts.append(f"token={self.enroll_token}")
        if self.admin_user and self.admin_pass:
            import urllib.parse
            query_parts.append(f"admin_user={urllib.parse.quote(self.admin_user)}")
            query_parts.append(f"admin_pass={urllib.parse.quote(self.admin_pass)}")

        token_query = f"?{'&'.join(query_parts)}" if query_parts else ""
        target_url = f"{self.hub_url}/ws/agent/{self.device_id}{token_query}"

        while self.running:
            try:
                logger.info(f"Connecting to Central Fleet Hub at {target_url}...")
                async with websockets.connect(target_url, open_timeout=20, ping_interval=15, ping_timeout=45) as ws:
                    logger.info("Connected to Fleet Hub! Sending handshake registration...")
                    
                    handshake = {
                        "hostname": os_info.get("hostname", platform.node()),
                        "ip": ip_addr,
                        "distro_name": os_info.get("distro_name", "Linux"),
                        "distro_id": os_info.get("distro_id", "linux"),
                        "admin_user": self.admin_user,
                        "admin_pass": self.admin_pass
                    }
                    await ws.send(json.dumps(handshake))

                    # Start streaming vitals task and command listener task concurrently
                    async def stream_vitals():
                        count = 0
                        while self.running:
                            try:
                                snapshot = get_vitals_snapshot()
                                await ws.send(json.dumps(snapshot))
                                count += 1
                                if count == 1:
                                    logger.info("Handshake acknowledged! Real-time vitals streaming live to master hub.")
                                elif count % 20 == 0:
                                    logger.info(f"Streamed {count} vitals telemetry cycles to master hub.")
                            except Exception as e:
                                logger.warning(f"Transient error streaming vitals: {e}")
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
    import argparse
    parser = argparse.ArgumentParser(description="PulseLinux Fleet Telemetry Streamer Agent")
    parser.add_argument("--hub", default=os.environ.get("HUB_URL"), help="Master Hub WebSocket or HTTP URL")
    parser.add_argument("--token", default=os.environ.get("ENROLL_TOKEN"), help="Device enrollment token or PIN")
    parser.add_argument("--admin", default=os.environ.get("ADMIN_USER"), help="Admin username to bind device to")
    parser.add_argument("--password", default=os.environ.get("ADMIN_PASS"), help="Admin password for authentication")
    args = parser.parse_args()

    client = AgentClient(
        hub_url=args.hub,
        enroll_token=args.token,
        admin_user=args.admin,
        admin_pass=args.password
    )
    asyncio.run(client.start())
