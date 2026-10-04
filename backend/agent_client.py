import asyncio
import json
import logging
import os
import platform
import socket
import uuid
import websockets
from typing import Dict, Any

from main import get_vitals_snapshot, get_os_details
from diagnostics import attempt_service_fix, vacuum_journal_logs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agent_client")

DEVICE_ID_FILE = os.path.join(os.path.dirname(__file__), ".device_id")

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
        raw_hub = hub_url or os.environ.get("HUB_URL") or "ws://127.0.0.1:8000"
        raw_token = enroll_token or os.environ.get("ENROLL_TOKEN") or ""
        self.hub_url = raw_hub.strip(' "\'')
        self.enroll_token = raw_token.strip(' "\'')
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
                async with websockets.connect(target_url) as ws:
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
                        while self.running:
                            snapshot = get_vitals_snapshot()
                            await ws.send(json.dumps(snapshot))
                            await asyncio.sleep(1.5)

                    async def listen_commands():
                        while self.running:
                            msg_str = await ws.recv()
                            try:
                                cmd = json.loads(msg_str)
                                action = cmd.get("action")
                                payload = cmd.get("payload", {})
                                logger.info(f"Received remote command: {action} with payload: {payload}")

                                if action == "fix_service":
                                    unit = payload.get("unit_name", "")
                                    if unit:
                                        attempt_service_fix(unit)
                                elif action == "vacuum_journal":
                                    vacuum_journal_logs()
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
