import os
import json
import logging
from typing import Dict, Any, List

logger = logging.getLogger("preferences")
PREFERENCES_FILE = os.path.join(os.path.dirname(__file__), ".user_preferences.json")

DEFAULT_WALLPAPERS = [
    {"id": "grid", "name": "Cyber Grid (Default)", "bg": "#0d0d0f", "image": "linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)", "size": "40px 40px"},
    {"id": "matrix", "name": "Emerald Matrix", "bg": "#031408", "image": "radial-gradient(ellipse at 50% 50%, rgba(16, 185, 129, 0.12) 0%, transparent 70%), linear-gradient(to right, rgba(16, 185, 129, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(16, 185, 129, 0.04) 1px, transparent 1px)", "size": "32px 32px"},
    {"id": "space", "name": "Deep Space Nebula", "bg": "#060814", "image": "radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.15) 0%, transparent 60%), radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.12) 0%, transparent 60%)", "size": "auto"},
    {"id": "cyberpunk", "name": "Cyberpunk Neon", "bg": "#120b18", "image": "radial-gradient(circle at 85% 15%, rgba(244, 63, 94, 0.15) 0%, transparent 50%), linear-gradient(to right, rgba(217, 70, 239, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(217, 70, 239, 0.04) 1px, transparent 1px)", "size": "48px 48px"},
    {"id": "oled", "name": "Minimal OLED Black", "bg": "#000000", "image": "none", "size": "auto"}
]

DEFAULT_ACCENT_COLORS = [
    {"name": "Emerald Green", "hex": "#4ade80"},
    {"name": "Cyan Sky", "hex": "#38bdf8"},
    {"name": "Amber Gold", "hex": "#fbbf24"},
    {"name": "Rose Pink", "hex": "#fb7185"},
    {"name": "Violet Neon", "hex": "#c084fc"}
]

def load_all_preferences() -> Dict[str, Any]:
    if os.path.exists(PREFERENCES_FILE):
        try:
            with open(PREFERENCES_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read preferences: {e}")
    return {}

def save_all_preferences(data: Dict[str, Any]) -> bool:
    try:
        with open(PREFERENCES_FILE, "w") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Failed to save preferences: {e}")
        return False

def get_user_preferences(username: str, role: str = "client") -> Dict[str, Any]:
    """Retrieves user settings with defaults tailored for admin vs client."""
    all_prefs = load_all_preferences()
    user_prefs = all_prefs.get(username, {})

    # Default common paths to exclude for privacy
    default_exclusions = []
    home_dir = os.path.expanduser(f"~{username}") if username != "admin" else os.path.expanduser("~")
    if os.path.exists(os.path.join(home_dir, ".gnupg")):
        default_exclusions.append(os.path.join(home_dir, ".gnupg"))
    if os.path.exists(os.path.join(home_dir, ".ssh")):
        default_exclusions.append(os.path.join(home_dir, ".ssh"))

    return {
        "username": username,
        "role": user_prefs.get("role", role),
        "theme": "dark",
        "excluded_folders": user_prefs.get("excluded_folders", default_exclusions),
        "share_processes": user_prefs.get("share_processes", True),
        "share_gpu": user_prefs.get("share_gpu", True),
        "share_disks": user_prefs.get("share_disks", True),
        "low_bandwidth_mode": user_prefs.get("low_bandwidth_mode", False),
        "preferred_hub_url": user_prefs.get("preferred_hub_url", "")
    }

def update_user_preferences(username: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Updates user-specific preferences safely."""
    all_prefs = load_all_preferences()
    current = get_user_preferences(username)

    # Allowed keys to update
    allowed_fields = [
        "excluded_folders", "share_processes", "share_gpu",
        "share_disks", "low_bandwidth_mode", "preferred_hub_url"
    ]

    for k in allowed_fields:
        if k in updates:
            current[k] = updates[k]

    # Clean excluded_folders: strip whitespaces and convert to absolute paths
    if "excluded_folders" in current and isinstance(current["excluded_folders"], list):
        cleaned = []
        for p in current["excluded_folders"]:
            if isinstance(p, str) and p.strip():
                clean_p = os.path.abspath(os.path.expanduser(p.strip()))
                if clean_p not in cleaned:
                    cleaned.append(clean_p)
        current["excluded_folders"] = cleaned

    all_prefs[username] = current
    save_all_preferences(all_prefs)
    return current

def get_excluded_folders_for_user(username: str) -> List[str]:
    """Helper to fetch excluded folder paths for a specific user."""
    prefs = get_user_preferences(username)
    return prefs.get("excluded_folders", [])
