import time
import asyncio
from typing import Dict, Any, List, Optional
from fastapi import WebSocket

class ConnectedDevice:
    def __init__(self, device_id: str, hostname: str, ip: str, distro_name: str, distro_id: str, websocket: WebSocket, owner_admin: str = "admin"):
        self.device_id = device_id
        self.hostname = hostname
        self.ip = ip
        self.distro_name = distro_name
        self.distro_id = distro_id
        self.websocket = websocket
        self.owner_admin = owner_admin
        self.last_seen = time.time()
        self.latest_vitals: Dict[str, Any] = {}

    def is_online(self, timeout: float = 10.0) -> bool:
        return (time.time() - self.last_seen) < timeout

    def to_dict(self) -> Dict[str, Any]:
        online = self.is_online()
        return {
            "device_id": self.device_id,
            "hostname": self.hostname,
            "ip": self.ip,
            "distro_name": self.distro_name,
            "distro_id": self.distro_id,
            "owner_admin": self.owner_admin,
            "status": "online" if online else "offline",
            "last_seen": int(self.last_seen),
            "vitals_summary": {
                "cpu": self.latest_vitals.get("cpu", {}).get("percent", 0),
                "ram": self.latest_vitals.get("memory", {}).get("percent", 0),
                "disk": self.latest_vitals.get("disk", {}).get("percent", 0),
                "temp": self.latest_vitals.get("thermal", {}).get("max_temp", 0),
                "alerts_count": len(self.latest_vitals.get("alerts", []))
            } if online else {}
        }


class FleetHubManager:
    def __init__(self):
        # Registered/Connected Devices: device_id -> ConnectedDevice
        self.devices: Dict[str, ConnectedDevice] = {}
        # Connected Admin WebSockets: ws -> admin_user
        self.admin_connections: Dict[WebSocket, str] = {}

    def register_or_update_device(self, device_id: str, hostname: str, ip: str, distro_name: str, distro_id: str, websocket: WebSocket, owner_admin: str = "admin") -> ConnectedDevice:
        if device_id in self.devices:
            dev = self.devices[device_id]
            dev.websocket = websocket
            dev.hostname = hostname
            dev.ip = ip
            dev.distro_name = distro_name
            dev.distro_id = distro_id
            dev.owner_admin = owner_admin
            dev.last_seen = time.time()
        else:
            dev = ConnectedDevice(device_id, hostname, ip, distro_name, distro_id, websocket, owner_admin=owner_admin)
            self.devices[device_id] = dev
        return dev

    def update_telemetry(self, device_id: str, snapshot: Dict[str, Any]):
        if device_id in self.devices:
            dev = self.devices[device_id]
            dev.latest_vitals = snapshot
            dev.last_seen = time.time()

    def remove_device(self, device_id: str):
        if device_id in self.devices:
            del self.devices[device_id]

    async def connect_admin(self, websocket: WebSocket, admin_user: str = "admin"):
        await websocket.accept()
        self.admin_connections[websocket] = admin_user

    def disconnect_admin(self, websocket: WebSocket):
        if websocket in self.admin_connections:
            del self.admin_connections[websocket]

    def get_fleet_summary(self, admin_user: Optional[str] = None) -> Dict[str, Any]:
        target_devices = list(self.devices.values())
        if admin_user:
            target_devices = [d for d in target_devices if d.owner_admin == admin_user or d.device_id == "local-node"]

        total_devices = len(target_devices)
        online_devices = [d.to_dict() for d in target_devices if d.is_online()]
        offline_devices = [d.to_dict() for d in target_devices if not d.is_online()]

        return {
            "total_count": total_devices,
            "online_count": len(online_devices),
            "offline_count": len(offline_devices),
            "devices": [d.to_dict() for d in target_devices]
        }

    async def broadcast_fleet_summary(self):
        if not self.admin_connections:
            return
        to_remove = []
        for ws, admin_user in self.admin_connections.items():
            try:
                summary = self.get_fleet_summary(admin_user)
                await ws.send_json(summary)
            except Exception:
                to_remove.append(ws)
        for ws in to_remove:
            self.disconnect_admin(ws)

    async def send_command_to_device(self, device_id: str, command: Dict[str, Any]) -> bool:
        dev = self.devices.get(device_id)
        if not dev or not dev.is_online():
            return False
        try:
            await dev.websocket.send_json(command)
            return True
        except Exception:
            return False

# Global Fleet Hub Instance
fleet_hub = FleetHubManager()
