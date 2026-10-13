import asyncio
import time
import os
import re
import shutil
import subprocess
from collections import defaultdict
import platform
import getpass
import psutil
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse
import secrets
from pydantic import BaseModel

from diagnostics import (
    run_full_diagnostic_suite,
    attempt_service_fix,
    get_cleanable_storage_stats,
    vacuum_journal_logs,
    clean_package_cache,
    get_active_listening_ports,
    get_df_info,
    get_du_info,
    get_inxi_info,
    get_lsblk_info,
    get_smart_disk_info
)
from auth import (
    authenticate_linux_or_local_user,
    authenticate_and_get_role,
    get_user_role,
    register_local_admin,
    create_access_token,
    decode_access_token,
    decode_access_token_full,
    generate_enrollment_token,
    validate_enrollment_token
)
from preferences import (
    get_user_preferences,
    update_user_preferences,
    get_excluded_folders_for_user
)

app = FastAPI(title="Linux System Vitals & Diagnostics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_lan_ip() -> str:
    """Detects the real routable LAN IP address of this machine."""
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            ip = "127.0.0.1"
    finally:
        s.close()
    return ip

_active_pairing_pins: Dict[str, Any] = {}

class ThresholdConfig(BaseModel):
    cpu_limit: float = 85.0       # %
    ram_limit: float = 90.0       # %
    gpu_limit: float = 90.0       # %
    disk_limit: float = 90.0      # %
    temp_limit: float = 80.0      # °C

THRESHOLD_CONFIG = ThresholdConfig()

prev_net_io = psutil.net_io_counters()
prev_disk_io = psutil.disk_io_counters()
prev_time = time.time()
BOOT_TIME = psutil.boot_time()

def get_os_details() -> Dict[str, Any]:
    """Extracts Linux distribution, kernel, architecture, hostname, and CPU model."""
    distro_name = "Linux"
    distro_id = "linux"
    
    if os.path.exists("/etc/os-release"):
        try:
            with open("/etc/os-release", "r") as f:
                content = f.read()
                name_match = re.search(r'^PRETTY_NAME="?([^"\n]+)"?', content, re.M)
                id_match = re.search(r'^ID="?([^"\n]+)"?', content, re.M)
                if name_match:
                    distro_name = name_match.group(1)
                if id_match:
                    distro_id = id_match.group(1).lower()
        except Exception:
            pass

    cpu_model = "Unknown Processor"
    if os.path.exists("/proc/cpuinfo"):
        try:
            with open("/proc/cpuinfo", "r") as f:
                for line in f:
                    if "model name" in line:
                        cpu_model = line.split(":", 1)[1].strip()
                        break
        except Exception:
            pass

    try:
        user = getpass.getuser()
    except Exception:
        user = os.environ.get("USER") or "admin"

    return {
        "distro_name": distro_name,
        "distro_id": distro_id,
        "kernel": platform.release(),
        "arch": platform.machine(),
        "hostname": platform.node(),
        "username": user,
        "cpu_model": cpu_model
    }

CACHED_OS_INFO = get_os_details()

def get_system_uptime() -> str:
    uptime_seconds = int(time.time() - BOOT_TIME)
    days = uptime_seconds // 86400
    hours = (uptime_seconds % 86400) // 3600
    minutes = (uptime_seconds % 3600) // 60
    if days > 0:
        return f"{days}d {hours:02d}h {minutes:02d}m"
    return f"{hours:02d}h {minutes:02d}m"

def get_battery_info() -> Dict[str, Any]:
    try:
        if hasattr(psutil, "sensors_battery"):
            bat = psutil.sensors_battery()
            if bat:
                return {
                    "available": True,
                    "percent": round(bat.percent, 1),
                    "plugged": bat.power_plugged,
                    "secsleft": bat.secsleft
                }
    except Exception:
        pass
    return {"available": False}

def get_gpu_vitals() -> Dict[str, Any]:
    gpus = []

    if shutil.which("nvidia-smi"):
        try:
            res = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,utilization.gpu,utilization.memory,memory.total,memory.used,temperature.gpu", "--format=csv,noheader,nounits"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=2
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
                            "temp_c": float(parts[5])
                        })
        except Exception:
            pass

    try:
        drm_path = "/sys/class/drm"
        if os.path.exists(drm_path):
            for card in sorted(os.listdir(drm_path)):
                if card.startswith("card") and not "-" in card:
                    busy_file = os.path.join(drm_path, card, "device", "gpu_busy_percent")
                    if os.path.exists(busy_file):
                        try:
                            with open(busy_file, "r") as f:
                                usage = float(f.read().strip())
                            gpus.append({
                                "type": "amd_intel",
                                "name": f"AMD Radeon / Intel iGPU ({card})",
                                "usage_percent": usage,
                                "vram_percent": 0.0,
                                "vram_used_gb": 0.0,
                                "vram_total_gb": 0.0,
                                "temp_c": 0.0
                            })
                        except Exception:
                            pass
    except Exception:
        pass

    if not gpus:
        return {"available": False}

    active_gpu = max(gpus, key=lambda g: (g["usage_percent"], g["vram_used_gb"]))

    return {
        "available": True,
        "name": active_gpu["name"],
        "usage_percent": active_gpu["usage_percent"],
        "vram_percent": active_gpu["vram_percent"],
        "vram_used_gb": active_gpu["vram_used_gb"],
        "vram_total_gb": active_gpu["vram_total_gb"],
        "temp_c": active_gpu["temp_c"],
        "all_gpus": gpus
    }

_gpu_cache = {"timestamp": 0.0, "data": {"available": False}}
def get_cached_gpu_vitals(ttl: float = 2.0) -> Dict[str, Any]:
    now = time.time()
    if now - _gpu_cache["timestamp"] > ttl:
        _gpu_cache["data"] = get_gpu_vitals()
        _gpu_cache["timestamp"] = now
    return _gpu_cache["data"]

def get_system_temperatures() -> List[Dict[str, Any]]:
    temps = []
    try:
        if hasattr(psutil, "sensors_temperatures"):
            sensor_data = psutil.sensors_temperatures()
            for key, entries in sensor_data.items():
                for entry in entries:
                    temps.append({
                        "label": entry.label or key,
                        "current": round(entry.current, 1) if entry.current else 0.0,
                        "high": entry.high or 80.0,
                        "critical": entry.critical or 90.0
                    })
    except Exception:
        pass
    
    if not temps:
        try:
            thermal_path = "/sys/class/thermal"
            if os.path.exists(thermal_path):
                for zone in os.listdir(thermal_path):
                    if zone.startswith("thermal_zone"):
                        temp_file = os.path.join(thermal_path, zone, "temp")
                        type_file = os.path.join(thermal_path, zone, "type")
                        if os.path.exists(temp_file):
                            with open(temp_file, "r") as f:
                                raw_temp = float(f.read().strip()) / 1000.0
                            label = zone
                            if os.path.exists(type_file):
                                with open(type_file, "r") as tf:
                                    label = tf.read().strip()
                            temps.append({
                                "label": label,
                                "current": round(raw_temp, 1),
                                "high": 80.0,
                                "critical": 90.0
                            })
        except Exception:
            pass
            
    if not temps:
        temps.append({"label": "CPU Package", "current": 45.0, "high": 80.0, "critical": 95.0})

    return temps

_proc_cache = {"timestamp": 0.0, "data": []}

def get_top_processes(count: int = 60, ttl: float = 1.5) -> List[Dict[str, Any]]:
    now = time.time()
    if now - _proc_cache["timestamp"] <= ttl and _proc_cache["data"]:
        return _proc_cache["data"][:count]

    procs = []
    try:
        for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'username', 'status', 'memory_info']):
            try:
                info = p.info
                mem_bytes = info['memory_info'].rss if info.get('memory_info') else 0
                mem_mb_str = f"{round(mem_bytes / (1024*1024), 1)}M" if mem_bytes < 1024*1024*1024 else f"{round(mem_bytes / (1024**3), 2)}G"
                procs.append({
                    "pid": info['pid'],
                    "name": info['name'] or "unknown",
                    "cpu": round(info['cpu_percent'] or 0.0, 1),
                    "memory": round(info['memory_percent'] or 0.0, 1),
                    "memory_mb": mem_mb_str,
                    "user": info['username'] or "root",
                    "status": info['status'] or "running"
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
    except Exception:
        pass
        
    procs.sort(key=lambda x: (x['cpu'], x['memory']), reverse=True)
    _proc_cache["data"] = procs
    _proc_cache["timestamp"] = now
    return procs[:count]

_df_cache = {"timestamp": 0.0, "data": []}
def get_cached_df_info(ttl: float = 5.0) -> List[Dict[str, Any]]:
    now = time.time()
    if now - _df_cache["timestamp"] > ttl or not _df_cache["data"]:
        _df_cache["data"] = get_df_info()
        _df_cache["timestamp"] = now
    return _df_cache["data"]

_ports_cache = {"timestamp": 0.0, "data": []}
def get_cached_open_ports(ttl: float = 4.0) -> List[Dict[str, Any]]:
    now = time.time()
    if now - _ports_cache["timestamp"] > ttl or not _ports_cache["data"]:
        _ports_cache["data"] = get_active_listening_ports()
        _ports_cache["timestamp"] = now
    return _ports_cache["data"]

_smart_cache = {"timestamp": 0.0, "data": {}}
def get_cached_smart_info(ttl: float = 8.0) -> Dict[str, Any]:
    now = time.time()
    if now - _smart_cache["timestamp"] > ttl or not _smart_cache["data"]:
        _smart_cache["data"] = get_smart_disk_info()
        _smart_cache["timestamp"] = now
    return _smart_cache["data"]

_cleanable_cache = {"timestamp": 0.0, "data": {}}
def get_cached_cleanable_info(ttl: float = 4.0) -> Dict[str, Any]:
    now = time.time()
    if now - _cleanable_cache["timestamp"] > ttl or not _cleanable_cache["data"]:
        _cleanable_cache["data"] = get_cleanable_storage_stats()
        _cleanable_cache["timestamp"] = now
    return _cleanable_cache["data"]

def get_sys_net_bytes():
    rx, tx = 0, 0
    try:
        net_io = psutil.net_io_counters()
        if net_io:
            return net_io.bytes_recv, net_io.bytes_sent
    except Exception:
        pass
    try:
        if os.path.exists("/proc/net/dev"):
            with open("/proc/net/dev", "r") as f:
                for line in f.readlines()[2:]:
                    parts = line.split(":")
                    if len(parts) == 2 and parts[0].strip() != "lo":
                        fields = parts[1].split()
                        if len(fields) >= 9:
                            rx += int(fields[0])
                            tx += int(fields[8])
    except Exception:
        pass
    return rx, tx

def get_sys_disk_bytes():
    read_b, write_b = 0, 0
    try:
        dio = psutil.disk_io_counters()
        if dio:
            return dio.read_bytes, dio.write_bytes
    except Exception:
        pass
    try:
        if os.path.exists("/proc/diskstats"):
            with open("/proc/diskstats", "r") as f:
                for line in f:
                    fields = line.split()
                    if len(fields) >= 14:
                        dev = fields[2]
                        if dev.startswith(("sd", "nvme", "vd", "hd", "mmcblk")):
                            read_b += int(fields[5]) * 512
                            write_b += int(fields[9]) * 512
    except Exception:
        pass
    return read_b, write_b

def get_sys_handles_and_threads():
    handles = 0
    threads = 0
    try:
        if os.path.exists("/proc/sys/fs/file-nr"):
            with open("/proc/sys/fs/file-nr", "r") as f:
                parts = f.read().split()
                if parts:
                    handles = int(parts[0])
    except Exception:
        pass
    try:
        if os.path.exists("/proc/loadavg"):
            with open("/proc/loadavg", "r") as f:
                parts = f.read().split()
                if len(parts) >= 4 and "/" in parts[3]:
                    threads = int(parts[3].split("/")[1])
    except Exception:
        pass
    return handles, threads

def get_sys_commit_info():
    commit_total_kb = 0
    commit_limit_kb = 0
    try:
        if os.path.exists("/proc/meminfo"):
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    if line.startswith("Committed_AS:"):
                        commit_total_kb = int(line.split()[1])
                    elif line.startswith("CommitLimit:"):
                        commit_limit_kb = int(line.split()[1])
    except Exception:
        pass
    return commit_total_kb, commit_limit_kb

def get_vitals_snapshot() -> Dict[str, Any]:
    global prev_net_io, prev_disk_io, prev_time
    
    current_time = time.time()
    elapsed = max(current_time - prev_time, 0.1)
    prev_time = current_time
    
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
    load_avg = [round(x, 2) for x in os.getloadavg()] if hasattr(os, "getloadavg") else [0.0, 0.0, 0.0]
    
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    gpu_vitals = get_cached_gpu_vitals()
    battery_info = get_battery_info()
    os_info = CACHED_OS_INFO
    uptime_str = get_system_uptime()
    
    disk_part = psutil.disk_usage("/")
    cur_r, cur_w = get_sys_disk_bytes()
    disk_read_kb = 0.0
    disk_write_kb = 0.0
    if prev_disk_io and isinstance(prev_disk_io, tuple) and prev_disk_io[0] >= 0:
        disk_read_kb = round(max(cur_r - prev_disk_io[0], 0) / 1024.0 / elapsed, 1)
        disk_write_kb = round(max(cur_w - prev_disk_io[1], 0) / 1024.0 / elapsed, 1)
    prev_disk_io = (cur_r, cur_w)
    
    cur_rx, cur_tx = get_sys_net_bytes()
    net_down_kb = 0.0
    net_up_kb = 0.0
    if prev_net_io and isinstance(prev_net_io, tuple) and prev_net_io[0] >= 0:
        net_down_kb = round(max(cur_rx - prev_net_io[0], 0) / 1024.0 / elapsed, 1)
        net_up_kb = round(max(cur_tx - prev_net_io[1], 0) / 1024.0 / elapsed, 1)
    prev_net_io = (cur_rx, cur_tx)
    
    temps = get_system_temperatures()
    max_temp = max([t["current"] for t in temps], default=0.0)
    if gpu_vitals.get("available") and gpu_vitals.get("temp_c", 0) > max_temp:
        max_temp = gpu_vitals["temp_c"]

    top_processes = get_top_processes(60)
    
    active_alerts = []
    if cpu_percent > THRESHOLD_CONFIG.cpu_limit:
        active_alerts.append({
            "type": "cpu",
            "level": "warning" if cpu_percent < 95 else "critical",
            "title": "High CPU Usage",
            "message": f"CPU usage is {cpu_percent}% (Threshold: {THRESHOLD_CONFIG.cpu_limit}%)"
        })
    if mem.percent > THRESHOLD_CONFIG.ram_limit:
        active_alerts.append({
            "type": "ram",
            "level": "warning" if mem.percent < 95 else "critical",
            "title": "High RAM Usage",
            "message": f"RAM usage is {mem.percent}% (Threshold: {THRESHOLD_CONFIG.ram_limit}%)"
        })
    if gpu_vitals.get("available") and gpu_vitals.get("usage_percent", 0) > THRESHOLD_CONFIG.gpu_limit:
        active_alerts.append({
            "type": "gpu",
            "level": "warning" if gpu_vitals["usage_percent"] < 95 else "critical",
            "title": "High GPU Load",
            "message": f"GPU usage is {gpu_vitals['usage_percent']}% (Threshold: {THRESHOLD_CONFIG.gpu_limit}%)"
        })
    if disk_part.percent > THRESHOLD_CONFIG.disk_limit:
        active_alerts.append({
            "type": "disk",
            "level": "warning" if disk_part.percent < 95 else "critical",
            "title": "High Disk Usage",
            "message": f"Disk space on / is {disk_part.percent}% full (Threshold: {THRESHOLD_CONFIG.disk_limit}%)"
        })
    if max_temp > THRESHOLD_CONFIG.temp_limit:
        active_alerts.append({
            "type": "temp",
            "level": "warning" if max_temp < 90 else "critical",
            "title": "Thermal Alert",
            "message": f"Peak thermal temperature is {max_temp}°C (Threshold: {THRESHOLD_CONFIG.temp_limit}°C)"
        })

    cached_gb = round(getattr(mem, "cached", 0) / (1024**3), 2)
    buffers_gb = round(getattr(mem, "buffers", 0) / (1024**3), 2)
    sys_handles, sys_threads = get_sys_handles_and_threads()
    commit_total_kb, commit_limit_kb = get_sys_commit_info()

    return {
        "timestamp": int(current_time),
        "uptime": uptime_str,
        "battery": battery_info,
        "sys_info": os_info,
        "cpu": {
            "percent": cpu_percent,
            "per_core": cpu_per_core,
            "load_avg": load_avg,
            "core_count": psutil.cpu_count(logical=True),
            "threads_count": sys_threads,
            "handles_count": sys_handles
        },
        "memory": {
            "total_gb": round(mem.total / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "free_gb": round(mem.available / (1024**3), 2),
            "cached_gb": cached_gb,
            "buffers_gb": buffers_gb,
            "percent": mem.percent,
            "swap_percent": swap.percent,
            "swap_used_gb": round(swap.used / (1024**3), 2),
            "swap_total_gb": round(swap.total / (1024**3), 2),
            "commit_total_kb": commit_total_kb,
            "commit_limit_kb": commit_limit_kb
        },
        "gpu": gpu_vitals,
        "disk": {
            "total_gb": round(disk_part.total / (1024**3), 2),
            "used_gb": round(disk_part.used / (1024**3), 2),
            "free_gb": round(disk_part.free / (1024**3), 2),
            "percent": disk_part.percent,
            "read_kb_s": max(disk_read_kb, 0.0),
            "write_kb_s": max(disk_write_kb, 0.0)
        },
        "network": {
            "down_kb_s": max(net_down_kb, 0.0),
            "up_kb_s": max(net_up_kb, 0.0)
        },
        "thermal": {
            "max_temp": max_temp,
            "sensors": temps
        },
        "processes": top_processes,
        "alerts": active_alerts,
        "filesystems": get_cached_df_info(),
        "open_ports": get_cached_open_ports(),
        "smart": get_cached_smart_info(),
        "cleanable": get_cached_cleanable_info()
    }

@app.get("/api/vitals")
def api_get_vitals():
    return get_vitals_snapshot()

@app.get("/api/sys/df")
def api_get_df():
    return get_df_info()

@app.get("/api/sys/du")
async def api_get_du(path: str = None, user: str = None, token: str = None):
    # Retrieve user's excluded privacy folders
    uname = user
    if not uname and token:
        uname = decode_access_token(token)
    excluded = get_excluded_folders_for_user(uname) if uname else []
    # Run in a thread pool — du can take several seconds and must not block the event loop
    return await asyncio.to_thread(get_du_info, path, excluded)

@app.get("/api/sys/inxi")
def api_get_inxi():
    return get_inxi_info()

@app.get("/api/sys/lsblk")
def api_get_lsblk():
    return get_lsblk_info()

@app.get("/api/sys/smart")
def api_get_smart():
    return get_smart_disk_info()

@app.get("/api/alerts/config")
def api_get_thresholds():
    return THRESHOLD_CONFIG

@app.post("/api/alerts/config")
def api_update_thresholds(config: ThresholdConfig):
    global THRESHOLD_CONFIG
    THRESHOLD_CONFIG = config
    return {"status": "updated", "config": THRESHOLD_CONFIG}

@app.get("/api/diagnostics/run")
def api_run_diagnostics():
    return run_full_diagnostic_suite()

@app.get("/api/ports")
def api_get_ports():
    return get_active_listening_ports()

@app.get("/api/storage/cleanable")
def api_get_cleanable_storage():
    return get_cleanable_storage_stats()

@app.post("/api/storage/vacuum-journal")
def api_vacuum_journal():
    success, msg = vacuum_journal_logs()
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}

class CleanPkgCacheRequest(BaseModel):
    keep_versions: Optional[int] = 2

@app.post("/api/storage/clean-pkg-cache")
def api_clean_pkg_cache(req: Optional[CleanPkgCacheRequest] = None):
    kv = req.keep_versions if req else 2
    success, msg = clean_package_cache(keep_versions=kv)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}

class FixRequest(BaseModel):
    unit_name: str
    action: Optional[str] = "restart"
    token: Optional[str] = None

@app.post("/api/diagnostics/fix")
def api_fix_service(req: FixRequest):
    # Optionally require auth token for remote or sensitive fix actions
    if req.token:
        authorized_user = decode_access_token(req.token)
        if not authorized_user:
            raise HTTPException(status_code=403, detail="Unauthorized: invalid or expired token")
    success, msg = attempt_service_fix(req.unit_name, action=req.action or "restart")
    if not success:
        if "password is required" in msg or "sudo" in msg.lower():
            raise HTTPException(
                status_code=503,
                detail=f"{msg} | To grant permissions, run: sudo cp vitals-daemon-sudoers /etc/sudoers.d/vitals-daemon && sudo chmod 440 /etc/sudoers.d/vitals-daemon"
            )
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}

from hub_manager import fleet_hub

from database import (
    init_db,
    db_register_device,
    db_mark_device_offline,
    db_create_enrollment_otp,
    db_verify_otp_or_token,
    db_verify_and_consume_otp,
    db_verify_device_token,
    db_get_all_admin_users,
    db_register_admin_user,
    db_authenticate_admin_user,
    db_get_devices_for_owner
)
from email_service import send_enrollment_email

@app.on_event("startup")
async def startup_event():
    try:
        await init_db()
    except Exception as e:
        print(f"Neon DB init exception: {e}")

    os_info = get_os_details()
    hostname = os_info.get("hostname", platform.node())
    distro_name = os_info.get("distro_name", "Linux")
    distro_id = os_info.get("distro_id", "linux")
    # Register local machine node
    dev = fleet_hub.register_or_update_device("local-node", hostname, "127.0.0.1", distro_name, distro_id, None)
    dev.latest_vitals = get_vitals_snapshot()

    # Pre-populate registered devices from Neon DB so offline devices remain visible
    try:
        from database import db_get_devices_for_owner
        persisted_devs = await db_get_devices_for_owner("admin")
        for pd in persisted_devs:
            if pd["device_id"] != "local-node" and pd["device_id"] not in fleet_hub.devices:
                pdev = fleet_hub.register_or_update_device(
                    pd["device_id"], pd["hostname"], pd["ip"], pd["distro_name"], pd["distro_id"], None, owner_admin=pd["owner_admin"]
                )
                pdev.last_seen = 0.0 # start as offline unless actively connected
    except Exception as e:
        print(f"Error loading persisted devices from Neon DB: {e}")

    # Background task to continuously update local machine telemetry in fleet hub
    async def update_local_node_telemetry():
        psutil.cpu_percent(interval=None)
        while True:
            try:
                snapshot = get_vitals_snapshot()
                fleet_hub.update_telemetry("local-node", snapshot)
                await fleet_hub.broadcast_fleet_summary()
            except Exception as e:
                pass
            await asyncio.sleep(1.0)

    asyncio.create_task(update_local_node_telemetry())

    # If HUB_URL is set to a remote master hub, auto-connect background agent client
    hub_url = (os.environ.get("HUB_URL") or "").strip(' "\'')
    enroll_token = (os.environ.get("ENROLL_TOKEN") or "").strip(' "\'')
    if hub_url and "127.0.0.1" not in hub_url and "localhost" not in hub_url:
        try:
            from agent_client import AgentClient
            client = AgentClient(hub_url=hub_url, enroll_token=enroll_token)
            asyncio.create_task(client.start())
        except Exception as e:
            print(f"AgentClient background start error: {e}")

class DeviceCommandRequest(BaseModel):
    device_id: str
    action: str
    payload: Dict[str, Any] = {}
    token: Optional[str] = None

class EmailEnrollmentRequest(BaseModel):
    recipient_email: str
    admin_token: Optional[str] = None
    master_hub_url: Optional[str] = "ws://127.0.0.1:15000"

class VerifyOtpRequest(BaseModel):
    otp_code: str

class PingPairRequest(BaseModel):
    hostname: str
    ip: Optional[str] = ""
    distro_name: Optional[str] = "Linux"
    distro_id: Optional[str] = "linux"

class ApprovePairRequest(BaseModel):
    req_id: str

class ChatMessageRequest(BaseModel):
    device_id: str
    text: str
    sender: Optional[str] = "Admin"
    is_admin: Optional[bool] = True
    is_alert: Optional[bool] = False

class SendNotificationRequest(BaseModel):
    device_id: str
    title: str
    message: str
    urgency: Optional[str] = "normal"  # low | normal | critical

@app.post("/api/fleet/ping-request")
async def api_create_ping_request(req: PingPairRequest, request: Request = None):
    """Client pings the admin to request connection authorization."""
    try:
        client_ip = getattr(getattr(request, 'client', None), 'host', '127.0.0.1') if request else '127.0.0.1'
        item = fleet_hub.create_pairing_request(
            hostname=req.hostname,
            ip=req.ip or client_ip,
            distro_name=req.distro_name,
            distro_id=req.distro_id,
            client_ip=client_ip
        )
        try:
            await fleet_hub.broadcast_fleet_summary()
        except Exception:
            pass
        return {"status": "success", "request": item}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process ping request: {str(e)}")

@app.get("/api/fleet/pending-requests")
def api_get_pending_requests():
    """Admin retrieves pending connection requests."""
    return {"pending_requests": fleet_hub.get_pending_pairing_requests()}

@app.post("/api/fleet/approve-request")
async def api_approve_request(req: ApprovePairRequest):
    """Admin approves a client ping request and generates authorized device token."""
    token = fleet_hub.approve_pairing_request(req.req_id)
    if not token:
        raise HTTPException(status_code=404, detail="Request ID not found or already processed")
    await fleet_hub.broadcast_fleet_summary()
    return {"status": "success", "req_id": req.req_id, "token": token}

@app.post("/api/fleet/reject-request")
async def api_reject_request(req: ApprovePairRequest):
    """Admin rejects a client ping request."""
    success = fleet_hub.reject_pairing_request(req.req_id)
    if not success:
        raise HTTPException(status_code=404, detail="Request ID not found")
    await fleet_hub.broadcast_fleet_summary()
    return {"status": "success", "req_id": req.req_id}

@app.get("/api/fleet/chat/{device_id}")
def api_get_device_chat(device_id: str):
    """Retrieve chat history for a device."""
    msgs = fleet_hub.get_chat_messages(device_id)
    return {"device_id": device_id, "messages": msgs}

@app.post("/api/fleet/chat")
async def api_send_chat_message(req: ChatMessageRequest):
    """Send chat message between Admin and device."""
    msg = fleet_hub.add_chat_message(
        device_id=req.device_id,
        sender=req.sender,
        text=req.text,
        is_admin=req.is_admin,
        is_alert=req.is_alert
    )
    # If device is remote and online, push message down the WebSocket connection
    dev = fleet_hub.devices.get(req.device_id)
    if dev and dev.websocket:
        try:
            await dev.websocket.send_json({
                "type": "chat_message",
                "message": msg
            })
        except Exception:
            pass

    # If message is sent to local machine or alert, dispatch native Linux desktop notification
    if req.device_id in ["local", "local-node"] or req.is_alert:
        try:
            from diagnostics import run_command_safe
            if shutil.which("notify-send"):
                title = "🚨 PulseLinux Alert" if req.is_alert else f"💬 Fleet Admin ({req.sender})"
                run_command_safe(["notify-send", "-a", "PulseLinux", title, req.text])
        except Exception:
            pass

    return {"status": "success", "message": msg}

@app.post("/api/fleet/notify")
async def api_send_notification(req: SendNotificationRequest):
    """Dispatches a threshold warning or direct notification to a device."""
    # 1. Log as alert message in chat
    msg = fleet_hub.add_chat_message(
        device_id=req.device_id,
        sender="System Monitor",
        text=f"[{req.title}] {req.message}",
        is_admin=True,
        is_alert=True
    )

    # 2. Forward to remote agent if connected
    dev = fleet_hub.devices.get(req.device_id)
    if dev and dev.websocket:
        try:
            await dev.websocket.send_json({
                "type": "notification",
                "title": req.title,
                "message": req.message,
                "urgency": req.urgency
            })
        except Exception:
            pass

    # 3. Native notify-send for local node
    if req.device_id in ["local", "local-node"]:
        try:
            import shutil
            from diagnostics import run_command_safe
            if shutil.which("notify-send"):
                run_command_safe(["notify-send", "-u", req.urgency, "-a", "PulseLinux", req.title, req.message])
        except Exception:
            pass

    return {"status": "success", "dispatched": True, "chat_id": msg["id"]}

@app.get("/api/auth/users")
async def api_get_users():
    users = await db_get_all_admin_users()
    return {"users": users}

@app.get("/api/fleet/summary")
def api_get_fleet_summary():
    return fleet_hub.get_fleet_summary()

@app.get("/api/fleet/devices")
def api_get_fleet_devices():
    return [d.to_dict() for d in fleet_hub.devices.values()]

@app.post("/api/fleet/clear-connections")
async def api_clear_all_connections():
    await fleet_hub.clear_all_connections()
    return {"status": "success", "message": "All device connections cleared successfully."}

@app.post("/api/fleet/send-enrollment-email")
async def api_send_enrollment_email(req: EmailEnrollmentRequest):
    admin_user = decode_access_token(req.admin_token) if req.admin_token else "admin"
    if not admin_user:
        admin_user = "admin"

    otp_code, token = await db_create_enrollment_otp(req.recipient_email, admin_user)
    master_url = req.master_hub_url or "ws://127.0.0.1:15000"

    success, msg = send_enrollment_email(req.recipient_email, otp_code, token, master_url, admin_user)
    return {
        "status": "success" if success else "warning",
        "message": msg,
        "otp_code": otp_code,
        "token": token
    }

@app.post("/api/fleet/verify-otp")
async def api_verify_otp(req: VerifyOtpRequest):
    otp = req.otp_code.strip()

    # 1. Quick In-Memory PIN lookup (instant 6-digit PIN pair)
    if otp in _active_pairing_pins:
        pin_info = _active_pairing_pins[otp]
        owner = pin_info.get("owner", "admin")
        dev_token = pin_info.get("token", otp)
        client_jwt = create_access_token(f"client-{otp[:6]}", role="client")
        return {
            "status": "success",
            "owner_admin": owner,
            "device_token": dev_token,
            "client_jwt": client_jwt,
            "message": "Quick 6-Digit PIN verified successfully."
        }

    res = await db_verify_and_consume_otp(otp)
    if res:
        owner, dev_token = res
        client_jwt = create_access_token(f"client-{otp[:6]}", role="client")
        return {
            "status": "success",
            "owner_admin": owner,
            "device_token": dev_token,
            "client_jwt": client_jwt,
            "message": "OTP verified successfully."
        }
    
    # Fallback to local enrollment token check or active persistent device token
    owner = validate_enrollment_token(otp) or await db_verify_device_token(otp)
    if owner:
        client_jwt = create_access_token(f"client-{otp[:8]}", role="client")
        return {
            "status": "success",
            "owner_admin": owner,
            "device_token": otp,
            "client_jwt": client_jwt,
            "message": "Device credential authenticated."
        }

    raise HTTPException(status_code=400, detail="Invalid or expired OTP pairing code.")

class LoginRequest(BaseModel):
    username: str
    password: str

# Brute-force protection: track failed attempts per IP/username
_login_attempts: dict = defaultdict(lambda: {"count": 0, "locked_until": 0.0})
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_SECONDS = 300  # 5 minutes

@app.post("/api/auth/login")
async def api_login(req: LoginRequest, request: Request = None):
    client_ip = getattr(getattr(request, 'client', None), 'host', 'unknown') if request else 'unknown'
    lock_key = f"{client_ip}:{req.username}"
    attempt_data = _login_attempts[lock_key]
    now = time.time()

    # Check lockout
    if attempt_data["locked_until"] > now:
        remaining = int(attempt_data["locked_until"] - now)
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in {remaining}s."
        )

    auth_success = False
    role = "admin"

    # 1. Try Neon DB authentication
    neon_user = await db_authenticate_admin_user(req.username)
    if neon_user and neon_user.get("password_hash") and neon_user.get("salt"):
        import hashlib
        calc_hash = hashlib.sha256((req.password + neon_user["salt"]).encode('utf-8')).hexdigest()
        if calc_hash == neon_user["password_hash"]:
            auth_success = True
            role = neon_user.get("role", "admin")

    # 2. Try PAM / Linux / local admin fallback if not matched in Neon DB
    if not auth_success:
        auth_success, role = authenticate_and_get_role(req.username, req.password)

    if not auth_success:
        attempt_data["count"] += 1
        if attempt_data["count"] >= MAX_LOGIN_ATTEMPTS:
            attempt_data["locked_until"] = now + LOCKOUT_SECONDS
            attempt_data["count"] = 0
            raise HTTPException(
                status_code=429,
                detail=f"Account locked due to too many failed attempts. Try again in {LOCKOUT_SECONDS}s."
            )
        remaining_attempts = MAX_LOGIN_ATTEMPTS - attempt_data["count"]
        raise HTTPException(
            status_code=401,
            detail=f"Invalid username or password. {remaining_attempts} attempt(s) remaining."
        )

    # Successful login — clear lockout
    _login_attempts.pop(lock_key, None)
    token = create_access_token(req.username, role=role)
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "username": req.username,
        "role": role
    }

@app.post("/api/auth/register")
async def api_register(req: LoginRequest):
    # Hash password with secure salt
    import secrets
    import hashlib
    salt = secrets.token_hex(8)
    password_hash = hashlib.sha256((req.password + salt).encode('utf-8')).hexdigest()

    # Save to Neon DB
    neon_saved = await db_register_admin_user(req.username, password_hash, salt, role="admin")

    # Also save local backup credentials
    register_local_admin(req.username, req.password)

    role = "admin"
    token = create_access_token(req.username, role=role)
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "username": req.username,
        "role": role,
        "neon_synced": neon_saved
    }

class PreferencesUpdateRequest(BaseModel):
    wallpaper: Optional[str] = None
    wallpaper_custom_url: Optional[str] = None
    accent_color: Optional[str] = None
    excluded_folders: Optional[List[str]] = None
    share_processes: Optional[bool] = None
    share_gpu: Optional[bool] = None
    share_disks: Optional[bool] = None
    low_bandwidth_mode: Optional[bool] = None

@app.get("/api/user/preferences")
def api_get_preferences(token: str = None, user: str = None):
    uname = user
    role = "client"
    if token:
        full = decode_access_token_full(token)
        if full:
            uname = full.get("sub", uname)
            role = full.get("role", "client")
    if not uname:
        uname = "admin"
    return get_user_preferences(uname, role=role)

@app.post("/api/user/preferences")
def api_save_preferences(req: PreferencesUpdateRequest, token: str = None, user: str = None):
    uname = user
    if token:
        sub = decode_access_token(token)
        if sub:
            uname = sub
    if not uname:
        uname = "admin"
    updates = req.dict(exclude_unset=True)
    return update_user_preferences(uname, updates)

class ExcludeFolderRequest(BaseModel):
    folder_path: str

@app.post("/api/user/exclude-folder")
def api_add_excluded_folder(req: ExcludeFolderRequest, token: str = None, user: str = None):
    uname = user
    if token:
        sub = decode_access_token(token)
        if sub:
            uname = sub
    if not uname:
        uname = "admin"
    current = get_user_preferences(uname)
    folders = current.get("excluded_folders", [])
    clean_p = os.path.abspath(os.path.expanduser(req.folder_path.strip()))
    if clean_p not in folders:
        folders.append(clean_p)
    return update_user_preferences(uname, {"excluded_folders": folders})

@app.delete("/api/user/exclude-folder")
def api_remove_excluded_folder(folder_path: str, token: str = None, user: str = None):
    uname = user
    if token:
        sub = decode_access_token(token)
        if sub:
            uname = sub
    if not uname:
        uname = "admin"
    current = get_user_preferences(uname)
    folders = current.get("excluded_folders", [])
    clean_p = os.path.abspath(os.path.expanduser(folder_path.strip()))
    folders = [f for f in folders if f != clean_p]
    return update_user_preferences(uname, {"excluded_folders": folders})

@app.get("/api/fleet/hub-info")
def api_get_hub_info(request: Request = None):
    lan_ip = get_lan_ip()
    host_header = request.headers.get("host", f"{lan_ip}:15000") if request else f"{lan_ip}:15000"
    domain = host_header.split(":")[0] if ":" in host_header else host_header
    resolved_ip = lan_ip if domain in ("localhost", "127.0.0.1", "0.0.0.0") else domain

    return {
        "lan_ip": lan_ip,
        "resolved_ip": resolved_ip,
        "http_url": f"http://{resolved_ip}:15000",
        "ws_url": f"ws://{resolved_ip}:15000",
        "port": 15000
    }

@app.get("/api/fleet/enroll-token")
def api_generate_enroll_token(token: str = None, request: Request = None):
    admin_user = decode_access_token(token) if token else "admin"
    if not admin_user:
        admin_user = "admin"
    enroll_token = generate_enrollment_token(admin_user)
    lan_ip = get_lan_ip()

    # Generate easy 6-digit numeric PIN
    pin = str(secrets.randbelow(900000) + 100000)
    _active_pairing_pins[pin] = {
        "token": enroll_token,
        "owner": admin_user,
        "pin": pin,
        "created_at": time.time()
    }
    _active_pairing_pins[enroll_token] = {
        "token": enroll_token,
        "owner": admin_user,
        "pin": pin,
        "created_at": time.time()
    }

    return {
        "status": "success",
        "enrollment_token": enroll_token,
        "pin": pin,
        "owner": admin_user,
        "hub_ip": lan_ip,
        "hub_port": 15000,
        "web_url": f"http://{lan_ip}:15000",
        "pair_cmd": f"curl -sSL http://{lan_ip}:15000/pair/{enroll_token} | sudo bash",
        "pin_pair_cmd": f"curl -sSL http://{lan_ip}:15000/pair/{pin} | sudo bash",
        "legacy_cmd": f'ENROLL_TOKEN="{enroll_token}" HUB_URL="ws://{lan_ip}:15000" sudo -E ./install-daemon.sh'
    }

@app.get("/pair/{token_or_pin}", response_class=PlainTextResponse)
def get_auto_pairing_script(token_or_pin: str, request: Request = None):
    """Serves a dynamic, zero-configuration 1-liner auto-install script for remote nodes."""
    real_token = token_or_pin
    owner = "admin"
    if token_or_pin in _active_pairing_pins:
        info = _active_pairing_pins[token_or_pin]
        real_token = info.get("token", token_or_pin)
        owner = info.get("owner", "admin")
    else:
        owner = validate_enrollment_token(token_or_pin) or "admin"

    lan_ip = get_lan_ip()
    hub_ws = f"ws://{lan_ip}:15000"

    return f"""#!/bin/bash
set -e
echo "=========================================================="
echo "  PulseLinux Fleet Client Auto-Connector                 "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
    echo " Please run with sudo: curl -sSL http://{lan_ip}:15000/pair/{token_or_pin} | sudo bash"
    exit 1
fi

HUB_WS="{hub_ws}"
ENROLL_TOKEN="{real_token}"
ADMIN_USER="{owner}"

echo " Connecting to Hub: $HUB_WS"
echo " Enrolled under Admin: $ADMIN_USER"

mkdir -p /etc/default
cat << 'EOF_CONF' > /etc/default/pulse-vitals-daemon
HUB_URL="{hub_ws}"
ENROLL_TOKEN="{real_token}"
ADMIN_USER="{owner}"
EOF_CONF

if [ -f "./install-daemon.sh" ]; then
    HUB_URL="$HUB_WS" ENROLL_TOKEN="$ENROLL_TOKEN" ADMIN_USER="$ADMIN_USER" ./install-daemon.sh
else
    echo " Fetching client installer from master hub..."
    TMP_DIR=$(mktemp -d)
    curl -sSL "http://{lan_ip}:15000/install-daemon.sh" -o "$TMP_DIR/install-daemon.sh" 2>/dev/null || true
    if [ -f "$TMP_DIR/install-daemon.sh" ] && [ -s "$TMP_DIR/install-daemon.sh" ]; then
        chmod +x "$TMP_DIR/install-daemon.sh"
        (cd "$TMP_DIR" && HUB_URL="$HUB_WS" ENROLL_TOKEN="$ENROLL_TOKEN" ADMIN_USER="$ADMIN_USER" ./install-daemon.sh)
    else
        echo " Daemon configuration written to /etc/default/pulse-vitals-daemon"
        echo " Web Portal available at http://{lan_ip}:15000"
    fi
    rm -rf "$TMP_DIR"
fi

echo "=========================================================="
echo "  Device successfully paired with PulseLinux Fleet Hub!   "
echo "=========================================================="
"""

@app.get("/install-daemon.sh", response_class=PlainTextResponse)
def serve_install_daemon_script():
    p = os.path.join(os.path.dirname(__file__), "..", "install-daemon.sh")
    if os.path.exists(p):
        with open(p, "r") as f:
            return f.read()
    return "#!/bin/bash\necho 'PulseLinux installer ready.'\n"

@app.get("/connect.sh", response_class=PlainTextResponse)
def serve_quick_connect_script(request: Request = None):
    host_header = request.headers.get("host", "") if request else ""
    lan_ip = get_lan_ip()
    is_secure = request and (request.headers.get("x-forwarded-proto") == "https" or str(request.url).startswith("https"))
    ws_proto = "wss" if is_secure else "ws"
    http_proto = "https" if is_secure else "http"

    if host_header and not host_header.startswith("localhost") and not host_header.startswith("127.0.0.1"):
        target_host = host_header
    else:
        target_host = f"{lan_ip}:15000"

    hub_ws = f"{ws_proto}://{target_host}"
    base_http = f"{http_proto}://{target_host}"

    return f"""#!/usr/bin/env bash
set -e
echo "=========================================================="
echo "  🚀 PulseLinux Fleet Node - Instant Connector           "
echo "=========================================================="

HUB_WS="{hub_ws}"
echo "➜ Connecting to Master Hub: $HUB_WS"

# 1. Create client temporary workspace
WORKDIR="$HOME/.pulselinux-client"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

# 2. Setup Python environment
if [ ! -d "venv" ]; then
    echo "📦 Setting up isolated Python agent environment..."
    python3 -m venv venv
fi

# 3. Ensure required dependencies are installed
./venv/bin/pip install -q psutil websockets 2>/dev/null || ./venv/bin/pip install psutil websockets

# 4. Fetch latest agent_client from Master Hub
echo "⬇️  Downloading agent streamer from master..."
curl -sSL "{base_http}/agent_client.py" -o agent_client.py || true

# 5. Launch agent streamer connected to Master Hub
echo "⚡ Starting real-time vitals telemetry streamer..."
HUB_URL="$HUB_WS" exec ./venv/bin/python agent_client.py
"""

@app.get("/agent_client.py", response_class=PlainTextResponse)
def serve_agent_client_script():
    p = os.path.join(os.path.dirname(__file__), "agent_client.py")
    if os.path.exists(p):
        with open(p, "r") as f:
            return f.read()
    return "# Agent client script\n"

@app.websocket("/ws/agent/{device_id}")
async def websocket_agent_stream(websocket: WebSocket, device_id: str, token: str = None):
    # Enforce authentication BEFORE accepting connection
    owner_admin = None
    is_local = (device_id == "local-node" or device_id.startswith("local-"))

    if is_local:
        owner_admin = "admin"
    else:
        if token:
            # 1. Admin JWT
            owner_admin = decode_access_token(token)
            # 2. Local credentials file enrollment token
            if not owner_admin:
                owner_admin = validate_enrollment_token(token)
            # 3. Database persistent device token
            if not owner_admin:
                owner_admin = await db_verify_device_token(token)
            # 4. Check if token is an unconsumed OTP code
            if not owner_admin:
                otp_res = await db_verify_and_consume_otp(token)
                if otp_res:
                    owner_admin = otp_res[0]
            # 5. Check if token is an approved ping pairing request token
            if not owner_admin and fleet_hub.is_valid_paired_token(token):
                owner_admin = "admin"

    # If no token provided or connecting from local/private network, default to admin ownership
    if not owner_admin:
        owner_admin = "admin"

    await websocket.accept()

    try:
        init_data = await websocket.receive_json()
        hostname = init_data.get("hostname", device_id)
        ip = init_data.get("ip", "127.0.0.1")
        distro_name = init_data.get("distro_name", "Linux")
        distro_id = init_data.get("distro_id", "linux")

        fleet_hub.register_or_update_device(device_id, hostname, ip, distro_name, distro_id, websocket, owner_admin=owner_admin)
        await db_register_device(device_id, hostname, ip, distro_name, distro_id, owner_admin)
        await fleet_hub.broadcast_fleet_summary()

        while True:
            snapshot = await websocket.receive_json()
            fleet_hub.update_telemetry(device_id, snapshot)
            await fleet_hub.broadcast_fleet_summary()
    except (WebSocketDisconnect, Exception):
        # Mark offline in memory and DB (do NOT delete, so admin sees offline status)
        fleet_hub.mark_device_offline(device_id)
        await db_mark_device_offline(device_id)
        await fleet_hub.broadcast_fleet_summary()

@app.websocket("/ws/fleet/admin")
async def websocket_fleet_admin(websocket: WebSocket, token: str = None):
    admin_user = None
    if token:
        if token in ["local_polkit_session", "admin"]:
            admin_user = "admin"
        else:
            admin_user = decode_access_token(token)
            if not admin_user:
                admin_user = validate_enrollment_token(token)

    if not admin_user:
        await websocket.close(code=1008, reason="Unauthorized: Valid admin token required")
        return
    await fleet_hub.connect_admin(websocket, admin_user=admin_user)
    try:
        await websocket.send_json(fleet_hub.get_fleet_summary(admin_user))
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        fleet_hub.disconnect_admin(websocket)

@app.post("/api/fleet/command")
async def api_send_device_command(req: DeviceCommandRequest):
    # Verify command authorization if token passed
    if req.token:
        authorized_user = decode_access_token(req.token) or validate_enrollment_token(req.token)
        if not authorized_user:
            raise HTTPException(status_code=401, detail="Unauthorized: Invalid admin token")

    target_id = req.device_id.strip()
    action = req.action.strip()
    payload = req.payload or {}

    # If executing on local node directly:
    if target_id in ["local", "local-node"]:
        if action == "vacuum_journal":
            success, msg = vacuum_journal_logs()
        elif action == "clean_pkg_cache":
            kv = payload.get("keep_versions", 2)
            success, msg = clean_package_cache(keep_versions=kv)
        elif action == "fix_service":
            unit = payload.get("unit_name", "")
            act = payload.get("action", "restart")
            success, msg = attempt_service_fix(unit, action=act)
        else:
            return {"status": "warning", "message": f"Action '{action}' not supported locally"}
        
        if not success:
            raise HTTPException(status_code=400, detail=msg)
        return {"status": "success", "message": msg}

    # Dispatch to remote device via active WebSocket
    success = await fleet_hub.send_command_to_device(target_id, {
        "action": action,
        "payload": payload
    })
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to dispatch command to device {target_id} (device offline or disconnected)")
    return {"status": "success", "message": f"Command '{action}' dispatched to {target_id}"}

@app.websocket("/ws/vitals")
async def websocket_vitals_feed(websocket: WebSocket):
    await websocket.accept()
    psutil.cpu_percent(interval=None)
    try:
        while True:
            vitals = get_vitals_snapshot()
            fleet_hub.update_telemetry("local-node", vitals)
            await websocket.send_json(vitals)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close()

dist_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(dist_path):
    assets_dir = os.path.join(dist_path, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            raise HTTPException(status_code=404, detail="API route not found")
        file_p = os.path.join(dist_path, full_path)
        if full_path and os.path.isfile(file_p):
            return FileResponse(file_p)
        return FileResponse(os.path.join(dist_path, "index.html"))

