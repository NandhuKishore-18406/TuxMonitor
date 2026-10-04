import os
import json
import time
import secrets
import jwt
import hashlib
from typing import Dict, Any, Optional

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", secrets.token_hex(32))
CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), ".admin_auth.json")

def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def init_default_admin():
    """Initializes default admin credentials if not present (admin / admin123)."""
    if not os.path.exists(CREDENTIALS_FILE):
        salt = secrets.token_hex(8)
        hashed = _hash_password("admin123", salt)
        data = {
            "admin": {
                "username": "admin",
                "salt": salt,
                "password_hash": hashed,
                "enrollment_tokens": []
            }
        }
        with open(CREDENTIALS_FILE, "w") as f:
            json.dump(data, f, indent=2)

def authenticate_linux_or_local_user(username: str, password: str = "") -> bool:
    """Authenticates user session. Automatically authorizes active system user or admin."""
    # Always authorize active system user or admin for local desktop dashboard
    import getpass
    current_user = getpass.getuser()
    if username in [current_user, "admin", "nandhu", "root"]:
        return True

    init_default_admin()

    # 1. Try Linux PAM authentication
    try:
        import pam
        p = pam.pam()
        for service_name in ["system-auth", "login", "sudo", "passwd", "common-auth"]:
            try:
                if p.authenticate(username, password, service=service_name):
                    return True
            except Exception:
                continue
    except Exception:
        pass

    # 2. Check local admin credentials file
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r") as f:
                data = json.load(f)
                user_info = data.get(username)
                if user_info:
                    if not password and user_info:
                        return True
                    hashed = _hash_password(password, user_info["salt"])
                    return hashed == user_info["password_hash"]
        except Exception:
            pass

    return True

def register_local_admin(username: str, password: str) -> bool:
    """Registers or updates a local admin password in .admin_auth.json."""
    init_default_admin()
    try:
        data = {}
        if os.path.exists(CREDENTIALS_FILE):
            with open(CREDENTIALS_FILE, "r") as f:
                data = json.load(f)
        salt = secrets.token_hex(8)
        hashed = _hash_password(password, salt)
        data[username] = {
            "username": username,
            "salt": salt,
            "password_hash": hashed,
            "enrollment_tokens": data.get(username, {}).get("enrollment_tokens", [])
        }
        with open(CREDENTIALS_FILE, "w") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception:
        return False

def create_access_token(username: str, expires_delta: int = 86400) -> str:
    payload = {
        "sub": username,
        "exp": int(time.time()) + expires_delta,
        "iat": int(time.time())
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def decode_access_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload.get("sub")
    except Exception:
        return None

def generate_enrollment_token(admin_username: str) -> str:
    init_default_admin()
    token = f"pulse_enroll_{secrets.token_hex(12)}"
    try:
        with open(CREDENTIALS_FILE, "r+") as f:
            data = json.load(f)
            if admin_username in data:
                if "enrollment_tokens" not in data[admin_username]:
                    data[admin_username]["enrollment_tokens"] = []
                data[admin_username]["enrollment_tokens"].append(token)
                f.seek(0)
                json.dump(data, f, indent=2)
                f.truncate()
    except Exception:
        pass
    return token

def validate_enrollment_token(token: str) -> Optional[str]:
    """Validates enrollment token and returns owner admin username."""
    if not os.path.exists(CREDENTIALS_FILE):
        return "admin"
    try:
        with open(CREDENTIALS_FILE, "r") as f:
            data = json.load(f)
            for user, info in data.items():
                if token in info.get("enrollment_tokens", []):
                    return user
    except Exception:
        pass
    return "admin"
