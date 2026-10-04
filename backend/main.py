import asyncio
import time
import os
import re
import shutil
import subprocess
import platform
import getpass
import psutil
from typing import Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from diagnostics import (
    run_full_diagnostic_suite,
    attempt_service_fix,
    get_cleanable_storage_stats,
    vacuum_journal_logs,
    get_active_listening_ports,
    get_df_info,
    get_du_info,
    get_inxi_info,
    get_lsblk_info,
    get_smart_disk_info
)

app = FastAPI(title="Linux System Vitals & Diagnostics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        user = os.environ.get("USER", "nandhu")

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
    current_disk_io = psutil.disk_io_counters()
    disk_read_kb = 0.0
    disk_write_kb = 0.0
    if current_disk_io and prev_disk_io:
        disk_read_kb = round((current_disk_io.read_bytes - prev_disk_io.read_bytes) / 1024.0 / elapsed, 1)
        disk_write_kb = round((current_disk_io.write_bytes - prev_disk_io.write_bytes) / 1024.0 / elapsed, 1)
    prev_disk_io = current_disk_io
    
    current_net_io = psutil.net_io_counters()
    net_down_kb = 0.0
    net_up_kb = 0.0
    if current_net_io and prev_net_io:
        net_down_kb = round((current_net_io.bytes_recv - prev_net_io.bytes_recv) / 1024.0 / elapsed, 1)
        net_up_kb = round((current_net_io.bytes_sent - prev_net_io.bytes_sent) / 1024.0 / elapsed, 1)
    prev_net_io = current_net_io
    
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

    return {
        "timestamp": int(current_time),
        "uptime": uptime_str,
        "battery": battery_info,
        "sys_info": os_info,
        "cpu": {
            "percent": cpu_percent,
            "per_core": cpu_per_core,
            "load_avg": load_avg,
            "core_count": psutil.cpu_count(logical=True)
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
            "swap_total_gb": round(swap.total / (1024**3), 2)
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
        "filesystems": get_cached_df_info()
    }

@app.get("/api/vitals")
def api_get_vitals():
    return get_vitals_snapshot()

@app.get("/api/sys/df")
def api_get_df():
    return get_df_info()

@app.get("/api/sys/du")
def api_get_du(path: str = None):
    return get_du_info(path)

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

class FixRequest(BaseModel):
    unit_name: str

@app.post("/api/diagnostics/fix")
def api_fix_service(req: FixRequest):
    success, msg = attempt_service_fix(req.unit_name)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}

from hub_manager import fleet_hub

@app.on_event("startup")
async def startup_event():
    os_info = get_os_details()
    hostname = os_info.get("hostname", platform.node())
    distro_name = os_info.get("distro_name", "Linux")
    distro_id = os_info.get("distro_id", "linux")
    # Register local machine node
    dev = fleet_hub.register_or_update_device("local-node", hostname, "127.0.0.1", distro_name, distro_id, None)
    dev.latest_vitals = get_vitals_snapshot()

    # If HUB_URL is set to a remote master hub, auto-connect background agent client
    hub_url = os.environ.get("HUB_URL")
    if hub_url and "127.0.0.1" not in hub_url and "localhost" not in hub_url:
        try:
            from agent_client import AgentClient
            client = AgentClient(hub_url=hub_url, enroll_token=os.environ.get("ENROLL_TOKEN"))
            asyncio.create_task(client.start())
        except Exception as e:
            pass

class DeviceCommandRequest(BaseModel):
    device_id: str
    action: str
    payload: Dict[str, Any] = {}

@app.get("/api/fleet/summary")
def api_get_fleet_summary():
    return fleet_hub.get_fleet_summary()

@app.get("/api/fleet/devices")
def api_get_fleet_devices():
    return [d.to_dict() for d in fleet_hub.devices.values()]

from auth import (
    authenticate_linux_or_local_user,
    register_local_admin,
    create_access_token,
    decode_access_token,
    generate_enrollment_token,
    validate_enrollment_token
)

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
def api_login(req: LoginRequest):
    if not authenticate_linux_or_local_user(req.username, req.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(req.username)
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "username": req.username
    }

@app.post("/api/auth/register")
def api_register(req: LoginRequest):
    if not register_local_admin(req.username, req.password):
        raise HTTPException(status_code=400, detail="Failed to register account")
    token = create_access_token(req.username)
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "username": req.username
    }

@app.get("/api/fleet/enroll-token")
def api_generate_enroll_token(token: str = None):
    admin_user = decode_access_token(token) if token else "admin"
    if not admin_user:
        admin_user = "admin"
    enroll_token = generate_enrollment_token(admin_user)
    return {"status": "success", "enrollment_token": enroll_token, "owner": admin_user}

@app.websocket("/ws/agent/{device_id}")
async def websocket_agent_stream(websocket: WebSocket, device_id: str, token: str = None):
    await websocket.accept()
    owner_admin = validate_enrollment_token(token) if token else "admin"
    try:
        init_data = await websocket.receive_json()
        hostname = init_data.get("hostname", device_id)
        ip = init_data.get("ip", "127.0.0.1")
        distro_name = init_data.get("distro_name", "Linux")
        distro_id = init_data.get("distro_id", "linux")

        fleet_hub.register_or_update_device(device_id, hostname, ip, distro_name, distro_id, websocket, owner_admin=owner_admin)
        await fleet_hub.broadcast_fleet_summary()

        while True:
            snapshot = await websocket.receive_json()
            fleet_hub.update_telemetry(device_id, snapshot)
            await fleet_hub.broadcast_fleet_summary()
    except (WebSocketDisconnect, Exception):
        fleet_hub.remove_device(device_id)
        await fleet_hub.broadcast_fleet_summary()

@app.websocket("/ws/fleet/admin")
async def websocket_fleet_admin(websocket: WebSocket, token: str = None):
    admin_user = decode_access_token(token) if token else "admin"
    if not admin_user:
        admin_user = "admin"
    await fleet_hub.connect_admin(websocket, admin_user=admin_user)
    try:
        await websocket.send_json(fleet_hub.get_fleet_summary(admin_user))
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        fleet_hub.disconnect_admin(websocket)

@app.post("/api/fleet/command")
async def api_send_device_command(req: DeviceCommandRequest):
    success = await fleet_hub.send_command_to_device(req.device_id, {
        "action": req.action,
        "payload": req.payload
    })
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to send command to device {req.device_id} (device offline or disconnected)")
    return {"status": "success", "message": f"Command '{req.action}' dispatched to {req.device_id}"}

@app.websocket("/ws/vitals")
async def websocket_vitals_feed(websocket: WebSocket):
    await websocket.accept()
    psutil.cpu_percent(interval=None)
    try:
        while True:
            vitals = get_vitals_snapshot()
            await websocket.send_json(vitals)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close()
