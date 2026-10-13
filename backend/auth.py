import os
import json
import time
import secrets
import jwt
import hashlib
from typing import Dict, Any, Optional

_raw_jwt = (os.environ.get("JWT_SECRET_KEY") or "").strip(' "\'')
SECRET_KEY = _raw_jwt if _raw_jwt else "pulse_sec_token_key_7f8a92b3c4d5e6f1a2b3c4d5"
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

def get_user_role(username: str) -> str:
    """Detects whether user has admin privileges via Linux PAM groups (wheel, sudo, root) or local config."""
    if not username:
        return "client"
    if username in ("root", "admin"):
        return "admin"

    # 1. Check Linux user groups using pwd and grp
    try:
        import pwd, grp
        p = pwd.getpwnam(username)
        if p.pw_uid == 0:
            return "admin"
        groups = [g.gr_name for g in grp.getgrall() if username in g.gr_mem]
        try:
            primary_group = grp.getgrgid(p.pw_gid).gr_name
            if primary_group not in groups:
                groups.append(primary_group)
        except Exception:
            pass
        if any(g in ("wheel", "sudo", "root", "adm") for g in groups):
            return "admin"
    except Exception:
        pass

    # 2. Check local credentials file
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r") as f:
                data = json.load(f)
                if username in data:
                    return data[username].get("role", "admin" if username == "admin" else "client")
        except Exception:
            pass

    return "client"

def authenticate_linux_or_local_user(username: str, password: str = "") -> bool:
    """Authenticates user session against local credentials or Linux PAM."""
    auth, _ = authenticate_and_get_role(username, password)
    return auth

def authenticate_and_get_role(username: str, password: str = "") -> tuple:
    """Authenticates credentials and returns (success: bool, role: 'admin'|'client')."""
    if not username:
        return False, "guest"

    init_default_admin()
    role = get_user_role(username)

    # 1. Try Linux PAM authentication first if password is provided
    if password:
        is_linux_user = False
        try:
            import pwd
            pwd.getpwnam(username)
            is_linux_user = True
        except (KeyError, Exception):
            is_linux_user = False

        if is_linux_user:
            try:
                import pam
                p = pam.pam()
                # On Linux distributions (Arch/CachyOS, Ubuntu/Debian, Fedora/RHEL), try standard PAM services
                for svc in ["system-auth", "system-login", "login", "sudo", "su"]:
                    try:
                        if p.authenticate(username, password, service=svc):
                            return True, role
                    except Exception:
                        continue
            except Exception:
                pass

    # 2. Check local admin credentials file (.admin_auth.json)
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r") as f:
                data = json.load(f)
                user_info = data.get(username)
                if user_info and password:
                    hashed = _hash_password(password, user_info["salt"])
                    if hashed == user_info["password_hash"]:
                        return True, user_info.get("role", role)
        except Exception:
            pass

    return False, "guest"

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
            "role": get_user_role(username),
            "enrollment_tokens": data.get(username, {}).get("enrollment_tokens", [])
        }
        with open(CREDENTIALS_FILE, "w") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception:
        return False

def create_access_token(username: str, role: str = None, expires_delta: int = 86400) -> str:
    if not role:
        role = get_user_role(username)
    payload = {
        "sub": username,
        "role": role,
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

def decode_access_token_full(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
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
    if not token or not os.path.exists(CREDENTIALS_FILE):
        return None
    try:
        with open(CREDENTIALS_FILE, "r") as f:
            data = json.load(f)
            for user, info in data.items():
                if token in info.get("enrollment_tokens", []):
                    return user
    except Exception:
        pass
    return None
