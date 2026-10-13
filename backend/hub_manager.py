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
        if self.device_id == "local-node":
            return True
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
            "latest_vitals": self.latest_vitals if online else {},
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

    def mark_device_offline(self, device_id: str):
        if device_id in self.devices:
            self.devices[device_id].websocket = None
            self.devices[device_id].last_seen = 0.0

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
            is_master = admin_user.lower() in ["admin", "root", "master", "pulse-admin"]
            if not is_master:
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

    async def clear_all_connections(self):
        """Force closes all remote device WebSockets and resets status in Neon DB."""
        to_close = []
        for dev_id, dev in list(self.devices.items()):
            if dev_id != "local-node":
                if dev.websocket:
                    to_close.append(dev.websocket)
                del self.devices[dev_id]
        
        for ws in to_close:
            try:
                await ws.close(code=1001, reason="Connections cleared by administrator")
            except Exception:
                pass
        
        try:
            from database import db_clear_all_connections
            await db_clear_all_connections()
        except Exception:
            pass
            
        await self.broadcast_fleet_summary()

    # --- CLIENT APPROVAL REQUESTS (PING TO CONNECT) ---
    def create_pairing_request(self, hostname: str, ip: str, distro_name: str, distro_id: str, client_ip: str) -> Dict[str, Any]:
        import secrets
        req_id = f"req_{secrets.token_hex(6)}"
        req_item = {
            "req_id": req_id,
            "hostname": hostname or "New Linux Client",
            "ip": ip or client_ip,
            "distro_name": distro_name or "Linux",
            "distro_id": distro_id or "linux",
            "created_at": int(time.time()),
            "status": "pending"  # pending | approved | rejected
        }
        if not hasattr(self, "pairing_requests"):
            self.pairing_requests = {}
        self.pairing_requests[req_id] = req_item
        return req_item

    def get_pending_pairing_requests(self) -> List[Dict[str, Any]]:
        if not hasattr(self, "pairing_requests"):
            self.pairing_requests = {}
        return [r for r in self.pairing_requests.values() if r.get("status") == "pending"]

    def approve_pairing_request(self, req_id: str) -> Optional[str]:
        if not hasattr(self, "pairing_requests") or req_id not in self.pairing_requests:
            return None
        import secrets
        token = f"pulse_dev_{secrets.token_hex(12)}"
        self.pairing_requests[req_id]["status"] = "approved"
        self.pairing_requests[req_id]["token"] = token
        return token

    def reject_pairing_request(self, req_id: str) -> bool:
        if not hasattr(self, "pairing_requests") or req_id not in self.pairing_requests:
            return False
        self.pairing_requests[req_id]["status"] = "rejected"
        return True

    def is_valid_paired_token(self, token: str) -> bool:
        if not hasattr(self, "pairing_requests") or not token:
            return False
        for req in self.pairing_requests.values():
            if req.get("status") == "approved" and req.get("token") == token:
                return True
        return False

    # --- CHAT & NOTIFICATION STORE ---
    def add_chat_message(self, device_id: str, sender: str, text: str, is_admin: bool = False, is_alert: bool = False) -> Dict[str, Any]:
        if not hasattr(self, "chat_messages"):
            self.chat_messages = {}
        if device_id not in self.chat_messages:
            self.chat_messages[device_id] = []
        msg = {
            "id": f"msg_{int(time.time() * 1000)}_{len(self.chat_messages[device_id])}",
            "device_id": device_id,
            "sender": sender,
            "text": text,
            "is_admin": is_admin,
            "is_alert": is_alert,
            "timestamp": int(time.time())
        }
        self.chat_messages[device_id].append(msg)
        # Limit history to 200 items per device
        if len(self.chat_messages[device_id]) > 200:
            self.chat_messages[device_id] = self.chat_messages[device_id][-200:]
        return msg

    def get_chat_messages(self, device_id: str) -> List[Dict[str, Any]]:
        if not hasattr(self, "chat_messages"):
            self.chat_messages = {}
        return self.chat_messages.get(device_id, [])

# Global Fleet Hub Instance
fleet_hub = FleetHubManager()

