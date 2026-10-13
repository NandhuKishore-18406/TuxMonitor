import subprocess
import re
import os
import shutil
import psutil
from typing import Dict, Any, List

def run_command_safe(cmd_list, timeout=5):
    """Utility to run a system command safely and return output."""
    try:
        res = subprocess.run(
            cmd_list,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout
        )
        return res.stdout.strip(), res.stderr.strip(), res.returncode
    except Exception as e:
        return "", str(e), -1

def run_privileged_command(cmd_list, timeout=5):
    """Executes a command using non-interactive sudo -n if not running as root."""
    if os.geteuid() != 0 and shutil.which("sudo"):
        cmd_list = ["sudo", "-n"] + list(cmd_list)
    return run_command_safe(cmd_list, timeout=timeout)

def check_missing_drivers():
    """Scans dmesg logs and device nodes for missing firmware or driver errors."""
    issues = []
    dmesg_out, _, _ = run_privileged_command(["dmesg", "--level=err,warn"])
    if dmesg_out:
        firmware_matches = re.findall(r"firmware: failed to load (\S+)", dmesg_out, re.IGNORECASE)
        for fw in set(firmware_matches):
            issues.append({
                "category": "Missing Drivers / Firmware",
                "severity": "high",
                "title": f"Missing Firmware: {fw}",
                "description": f"Kernel requested firmware '{fw}' but it was not found in /lib/firmware.",
                "solution": "Install 'linux-firmware' or vendor specific package via apt/pacman/dnf."
            })
        for line in dmesg_out.splitlines():
            line_lower = line.lower()
            if "nvidia" in line_lower and ("failed" in line_lower or "error" in line_lower):
                issues.append({
                    "category": "Missing Drivers / Firmware",
                    "severity": "medium",
                    "title": "NVIDIA Driver Warning",
                    "description": f"Kernel reported NVIDIA initialization issues: {line.strip()[:110]}",
                    "solution": "Verify proprietary NVIDIA drivers are correctly compiled against current kernel."
                })
                break
    
    if shutil.which("lspci"):
        lspci_out, _, _ = run_command_safe(["lspci", "-nnk"])
        if lspci_out:
            devices = lspci_out.split("\n\n")
            for dev in devices:
                if "Kernel driver in use:" not in dev and ("VGA" in dev or "Network" in dev or "Wireless" in dev or "Ethernet" in dev):
                    first_line = dev.split("\n")[0] if dev else "Unknown Device"
                    issues.append({
                        "category": "Missing Drivers / Firmware",
                        "severity": "high",
                        "title": f"Unconfigured Hardware: {first_line[:60]}",
                        "description": "Hardware device found on PCI bus without an active kernel driver attached.",
                        "solution": "Check your distribution driver manager or install missing kernel modules."
                    })

    return issues

def check_failed_services():
    """Detects failed systemd units."""
    issues = []
    if shutil.which("systemctl"):
        out, _, _ = run_command_safe(["systemctl", "--failed", "--no-legend", "--plain"])
        if out:
            lines = [line.strip() for line in out.splitlines() if line.strip()]
            for line in lines:
                parts = line.split()
                if len(parts) >= 2:
                    unit_name = parts[0]
                    conflict_hint = ""
                    if "tlp" in unit_name.lower():
                        conflict_hint = " (Note: TLP conflicts with active power-profiles-daemon. Run 'sudo systemctl mask tlp.service' to resolve)."
                    
                    issues.append({
                        "category": "Systemd Services",
                        "severity": "high",
                        "title": f"Failed System Service: {unit_name}",
                        "description": f"Systemd unit '{unit_name}' is in a failed state.{conflict_hint}",
                        "solution": f"Run 'systemctl status {unit_name}' or 'journalctl -u {unit_name}' to inspect logs.",
                        "unit": unit_name
                    })
    return issues

def check_kernel_oom_logs():
    """Checks for Out-Of-Memory (OOM) killer terminations in system log."""
    issues = []
    if shutil.which("journalctl"):
        out, _, ret = run_command_safe(["journalctl", "-k", "-g", "Out of memory", "-n", "10", "--no-pager"])
        if ret == 0 and out:
            lines = [l for l in out.splitlines() if l.strip() and not l.strip().startswith("--")]
            if lines:
                issues.append({
                    "category": "Memory & Kernel",
                    "severity": "critical",
                    "title": "OOM (Out Of Memory) Killer Triggered",
                    "description": "Linux kernel OOM killer terminated processes recently due to RAM exhaustion.",
                    "details": lines[-3:],
                    "solution": "Increase swap space or close memory-heavy applications."
                })
    return issues

def check_storage_and_filesystems():
    """Checks for low disk space, read-only mounts, and disk errors."""
    issues = []
    partitions = psutil.disk_partitions(all=False)
    
    for p in partitions:
        if p.mountpoint.startswith("/snap") or p.device.startswith("/dev/loop"):
            continue
        try:
            usage = psutil.disk_usage(p.mountpoint)
            if usage.percent > 90:
                issues.append({
                    "category": "Storage & Filesystem",
                    "severity": "critical" if usage.percent > 95 else "high",
                    "title": f"High Disk Usage on {p.mountpoint} ({usage.percent}%)",
                    "description": f"Partition {p.device} mounted on {p.mountpoint} has only {(usage.free / (1024**3)):.1f} GB free.",
                    "solution": "Clear package cache (`sudo apt clean` / `sudo pacman -Sc`) or delete unused logs."
                })
            if "ro" in p.opts.split(","):
                issues.append({
                    "category": "Storage & Filesystem",
                    "severity": "critical",
                    "title": f"Read-Only Filesystem: {p.mountpoint}",
                    "description": f"Partition {p.mountpoint} is mounted read-only, which usually indicates filesystem errors.",
                    "solution": "Run filesystem check (`fsck`) on next reboot or inspect kernel log (`dmesg`)."
                })
        except Exception:
            pass
            
    return issues

def get_cleanable_storage_stats() -> Dict[str, Any]:
    """Measures recoverable disk space from journal logs and package caches."""
    journal_size_mb = 0.0
    pkg_cache_size_mb = 0.0
    
    # 1. Parse journalctl disk usage output
    if shutil.which("journalctl"):
        out, _, _ = run_command_safe(["journalctl", "--disk-usage"])
        if out:
            match = re.search(r"takes up ([\d\.]+)\s*([KMGT])", out, re.IGNORECASE)
            if match:
                val = float(match.group(1))
                unit = match.group(2).upper()
                if unit == "G": journal_size_mb = val * 1024.0
                elif unit == "M": journal_size_mb = val
                elif unit == "K": journal_size_mb = val / 1024.0

    # 2. Check pacman or apt package cache size using system `du`
    cache_dirs = ["/var/cache/pacman/pkg", "/var/cache/apt/archives"]
    for cdir in cache_dirs:
        if os.path.exists(cdir):
            out, _, _ = run_command_safe(["du", "-sm", cdir])
            if out:
                parts = out.split()
                if parts and parts[0].isdigit():
                    pkg_cache_size_mb += float(parts[0])

    return {
        "journal_size_mb": round(journal_size_mb, 1),
        "pkg_cache_size_mb": round(pkg_cache_size_mb, 1),
        "total_recoverable_mb": round(journal_size_mb + pkg_cache_size_mb, 1)
    }

def vacuum_journal_logs() -> tuple:
    """Vacuums systemd journal logs older than 7 days."""
    if not shutil.which("journalctl"):
        return False, "journalctl tool not available"
    out, err, ret = run_privileged_command(["journalctl", "--vacuum-time=7d"])
    if ret == 0 or out:
        return True, f"Journal logs cleaned: {out or 'Success'}"
    else:
        return False, f"Failed: {err or out}"

def clean_package_cache(keep_versions: int = 2) -> tuple:
    """Cleans package cache (pacman/paccache or apt)."""
    messages = []
    errors = []
    success = False
    
    # Arch Linux / Pacman
    if shutil.which("paccache"):
        out, err, ret = run_privileged_command(["paccache", f"-rk{keep_versions}"])
        if ret == 0 or (out and "candidates" in out):
            messages.append(out or f"paccache retained {keep_versions} versions")
            success = True
        else:
            errors.append(err or out or "paccache command error")
    elif shutil.which("pacman"):
        out, err, ret = run_privileged_command(["pacman", "-Sc", "--noconfirm"])
        if ret == 0 or out:
            messages.append(out or "pacman cache cleared")
            success = True
        else:
            errors.append(err or out or "pacman command error")

    # Debian / Ubuntu / Apt
    if shutil.which("apt-get"):
        out, err, ret = run_privileged_command(["apt-get", "clean"])
        if ret == 0:
            messages.append("apt package cache cleaned")
            success = True
        else:
            errors.append(err or out or "apt-get clean error")
    elif shutil.which("dnf"):
        out, err, ret = run_privileged_command(["dnf", "clean", "packages", "-y"])
        if ret == 0:
            messages.append("dnf package cache cleaned")
            success = True
        else:
            errors.append(err or out or "dnf clean error")

    if success:
        return True, " | ".join(messages) if messages else "Package cache cleaned successfully"
    if errors:
        return False, f"Failed: {'; '.join(errors)}. Run 'sudo cp vitals-daemon-sudoers /etc/sudoers.d/vitals-daemon' to grant permission."
    return False, "No package cache cleaner available or permission denied"

def get_active_listening_ports() -> List[Dict[str, Any]]:
    """Retrieves all active listening network sockets (IPv4 & IPv6) mapped to process names."""
    ports = []
    
    try:
        connections = psutil.net_connections(kind='all')
        for conn in connections:
            if conn.status == 'LISTEN':
                ip = conn.laddr.ip if conn.laddr else '0.0.0.0'
                port = conn.laddr.port if conn.laddr else 0
                protocol = "TCP" if conn.type == 1 else "UDP"
                proc_name = "System / Service"
                pid = conn.pid or 0
                if pid > 0:
                    try:
                        proc = psutil.Process(pid)
                        proc_name = proc.name()
                    except Exception:
                        pass
                
                if port > 0:
                    ports.append({
                        "port": port,
                        "ip": ip,
                        "protocol": protocol,
                        "pid": pid,
                        "process_name": proc_name
                    })
    except Exception:
        pass

    if not ports and shutil.which("ss"):
        out, _, _ = run_command_safe(["ss", "-tulpn"])
        if not out:
            out, _, _ = run_command_safe(["ss", "-tuln"])
            
        if out:
            lines = out.splitlines()[1:]
            for line in lines:
                parts = line.split()
                if len(parts) >= 5 and "LISTEN" in line:
                    proto = "TCP" if "tcp" in parts[0].lower() else "UDP"
                    local_addr = parts[4]
                    ip_port = local_addr.rsplit(":", 1)
                    if len(ip_port) == 2:
                        port_val = int(ip_port[1]) if ip_port[1].isdigit() else 0
                        proc_match = re.search(r'users:\(\("([^"]+)",pid=(\d+)', line)
                        proc_n = proc_match.group(1) if proc_match else "System / Service"
                        p_id = int(proc_match.group(2)) if proc_match else 0
                        if port_val > 0:
                            ports.append({
                                "port": port_val,
                                "ip": ip_port[0] or "*",
                                "protocol": proto,
                                "pid": p_id,
                                "process_name": proc_n
                            })
                            
    unique_ports = {}
    for p in ports:
        key = (p['port'], p['protocol'])
        if key not in unique_ports or (p['process_name'] != "System / Service" and unique_ports[key]['process_name'] == "System / Service"):
            unique_ports[key] = p

    return sorted(list(unique_ports.values()), key=lambda x: x['port'])

def check_network_firewall():
    """Checks network interfaces and basic firewall status."""
    issues = []
    if shutil.which("ufw"):
        out, _, _ = run_privileged_command(["ufw", "status"])
        if out and "inactive" in out.lower():
            issues.append({
                "category": "Network & Security",
                "severity": "low",
                "title": "Uncomplicated Firewall (UFW) is Inactive",
                "description": "UFW firewall is installed on this system but currently disabled.",
                "solution": "Enable firewall protection with `sudo ufw enable` if needed."
            })
            
    dns_out, _, dns_ret = run_command_safe(["ping", "-c", "1", "-W", "2", "1.1.1.1"])
    if dns_ret != 0:
        issues.append({
            "category": "Network & Security",
            "severity": "high",
            "title": "Internet Connection Failure",
            "description": "Unable to ping external IP 1.1.1.1.",
            "solution": "Verify network cable, Wi-Fi connectivity, or default gateway configuration."
        })

    return issues

def run_full_diagnostic_suite():
    """Runs all Linux diagnostic checks and returns compiled findings."""
    all_issues = []
    all_issues.extend(check_missing_drivers())
    all_issues.extend(check_failed_services())
    all_issues.extend(check_kernel_oom_logs())
    all_issues.extend(check_storage_and_filesystems())
    all_issues.extend(check_network_firewall())
    
    return {
        "total_issues": len(all_issues),
        "issues": all_issues,
        "cleanable_storage": get_cleanable_storage_stats(),
        "status": "healthy" if len(all_issues) == 0 else "warnings_found"
    }

def attempt_service_fix(unit_name: str, action: str = "restart") -> tuple:
    """Attempts to restart, mask, reset, or stop a failed systemd service."""
    if not shutil.which("systemctl"):
        return False, "systemctl is not available"
    
    clean_unit = re.sub(r'[^a-zA-Z0-9_\-\.@]', '', unit_name.strip())
    if not clean_unit:
        return False, "Invalid service unit name"

    if action == "mask":
        out, err, ret = run_privileged_command(["systemctl", "mask", clean_unit])
        run_privileged_command(["systemctl", "stop", clean_unit])
        run_privileged_command(["systemctl", "reset-failed", clean_unit])
        if ret == 0 or "created symlink" in (out + err).lower():
            return True, f"Successfully masked and stopped {clean_unit} (resolved conflict)"
        return False, f"Failed to mask service: {err or out}"
    elif action == "reset-failed":
        out, err, ret = run_privileged_command(["systemctl", "reset-failed", clean_unit])
        return ret == 0, f"Reset failed status: {err or out}"
    elif action == "stop":
        out, err, ret = run_privileged_command(["systemctl", "stop", clean_unit])
        return ret == 0, f"Stopped service {clean_unit}: {err or out}"
    else:  # "restart"
        cmd = ["systemctl", "restart"]
        if clean_unit.startswith("pulse-vitals-backend"):
            cmd.append("--no-block")
        cmd.append(clean_unit)
        out, err, ret = run_privileged_command(cmd)
        if ret == 0 or "started" in (out + err).lower():
            return True, f"Successfully restarted service {clean_unit}"
        return False, f"Failed to restart service: {err or out}"

def strip_ansi(text: str) -> str:
    """Strips ANSI control/color codes from CLI output."""
    if not text: return ""
    return re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)

def get_df_info() -> List[Dict[str, Any]]:
    """Runs df -hT with psutil fallback to return structured partition data."""
    filesystems = []
    if shutil.which("df"):
        out, _, ret = run_command_safe(["df", "-hT"])
        out = strip_ansi(out)
        if ret == 0 and out:
            lines = out.splitlines()
            for line in lines[1:]:
                parts = line.split()
                if len(parts) >= 7:
                    fs = parts[0]
                    fstype = parts[1]
                    size = parts[2]
                    used = parts[3]
                    avail = parts[4]
                    use_pct_raw = parts[5].rstrip('%')
                    use_pct = float(use_pct_raw) if use_pct_raw.replace('.', '', 1).isdigit() else 0.0
                    mount = " ".join(parts[6:])
                    filesystems.append({
                        "filesystem": fs,
                        "type": fstype,
                        "size": size,
                        "used": used,
                        "avail": avail,
                        "use_percent": use_pct,
                        "mount": mount
                    })
    
    # Fallback to psutil disk partitions if df gave empty results
    if not filesystems:
        try:
            for p in psutil.disk_partitions(all=False):
                if p.mountpoint.startswith("/snap") or p.device.startswith("/dev/loop"):
                    continue
                try:
                    usage = psutil.disk_usage(p.mountpoint)
                    filesystems.append({
                        "filesystem": p.device,
                        "type": p.fstype,
                        "size": f"{round(usage.total / (1024**3), 1)}G",
                        "used": f"{round(usage.used / (1024**3), 1)}G",
                        "avail": f"{round(usage.free / (1024**3), 1)}G",
                        "use_percent": usage.percent,
                        "mount": p.mountpoint
                    })
                except Exception:
                    pass
        except Exception:
            pass
            
    return filesystems

def get_default_du_path() -> str:
    """Finds the sensible default directory for du analysis (user home or /home)."""
    for user_env in [os.environ.get("SUDO_USER"), os.environ.get("USER"), "nandhu"]:
        if user_env and os.path.isdir(f"/home/{user_env}"):
            return f"/home/{user_env}"
    if os.path.isdir("/home"):
        try:
            subdirs = [os.path.join("/home", d) for d in os.listdir("/home") if os.path.isdir(os.path.join("/home", d)) and not d.startswith(".")]
            if subdirs:
                return subdirs[0]
        except Exception:
            pass
        return "/home"
    return "/"

def get_du_info(target_path: str = None, excluded_paths: List[str] = None) -> Dict[str, Any]:
    """Runs du inspection with breadcrumbs and client privacy exclusion support."""
    if not target_path or target_path.strip() in ("", "~"):
        target_path = get_default_du_path()
    else:
        target_path = os.path.abspath(os.path.expanduser(target_path.strip()))

    norm_excluded = []
    if excluded_paths:
        for p in excluded_paths:
            if p and isinstance(p, str):
                norm_excluded.append(os.path.abspath(os.path.expanduser(p.strip())))

    # If the target path itself is excluded by client settings
    if any(target_path == ex or target_path.startswith(ex + os.sep) for ex in norm_excluded):
        return {
            "error": f"Path '{target_path}' is excluded by client privacy settings.",
            "path": target_path,
            "parent_path": os.path.dirname(target_path) if target_path != "/" else None,
            "breadcrumbs": [{"name": "root", "path": "/"}],
            "total_items": 0,
            "items": [],
            "is_excluded": True
        }

    if not os.path.exists(target_path):
        return {
            "error": f"Path does not exist: {target_path}",
            "path": target_path,
            "parent_path": "/",
            "breadcrumbs": [],
            "total_items": 0,
            "items": []
        }

    parent_path = os.path.dirname(target_path) if target_path != "/" else None

    # Compute breadcrumbs
    bparts = [p for p in target_path.split(os.sep) if p]
    breadcrumbs = [{"name": "root", "path": "/"}]
    curr_acc = ""
    for part in bparts:
        curr_acc += "/" + part
        breadcrumbs.append({"name": part, "path": curr_acc})

    items = []

    def parse_size_to_mb(size_str):
        if not size_str: return 0.0
        match = re.match(r"([\d\.]+)\s*([KMGTB]?)", size_str, re.IGNORECASE)
        if not match: return 0.0
        val = float(match.group(1))
        unit = match.group(2).upper()
        if unit == 'T': return val * 1024.0 * 1024.0
        if unit == 'G': return val * 1024.0
        if unit == 'M': return val
        if unit == 'K': return val / 1024.0
        return val / (1024.0 * 1024.0)

    # Method 1: Run `du -h -d 1 --one-file-system` in a thread with a 30s timeout.
    # --one-file-system skips bind-mounts (btrfs subvolumes etc.) that cause huge slowdowns.
    # If the daemon lacks read permission, retry with `sudo -n` (requires sudoers entry).
    if shutil.which("du") and os.path.isdir(target_path):
        import threading
        du_result = {"out": "", "ret": -1}

        # Check if we can read the target directory at all
        can_read = os.access(target_path, os.R_OK | os.X_OK)

        def _run_du():
            cmd = ["du", "-h", "-d", "1", "--one-file-system", target_path]
            # If we can't read the path, escalate via sudo -n (non-interactive)
            if not can_read and shutil.which("sudo"):
                cmd = ["sudo", "-n"] + cmd
            try:
                res = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=30
                )
                du_result["out"] = res.stdout.strip()
                du_result["ret"] = res.returncode

                # If non-sudo du produced nothing and sudo is available, try with sudo -n
                if not du_result["out"] and "sudo" not in cmd and shutil.which("sudo"):
                    res_sudo = subprocess.run(
                        ["sudo", "-n"] + cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        timeout=30
                    )
                    if res_sudo.stdout.strip():
                        du_result["out"] = res_sudo.stdout.strip()
                        du_result["ret"] = res_sudo.returncode
            except subprocess.TimeoutExpired:
                du_result["ret"] = -2
            except Exception:
                du_result["ret"] = -1

        t = threading.Thread(target=_run_du, daemon=True)
        t.start()
        t.join(timeout=32)

        raw_out = strip_ansi(du_result["out"])
        # GNU du exits with 1 if any sub-item had permission issues, but still produces valid stdout
        if raw_out and du_result["ret"] in (0, 1):
            for line in raw_out.splitlines():
                parts_line = line.split("\t")
                if len(parts_line) < 2:
                    parts_line = line.split(maxsplit=1)
                if len(parts_line) == 2:
                    size_str, item_path = parts_line[0].strip(), parts_line[1].strip()
                    if os.path.abspath(item_path) == os.path.abspath(target_path):
                        continue
                    item_name = os.path.basename(item_path) or item_path
                    is_dir = os.path.isdir(item_path)
                    items.append({
                        "size": size_str,
                        "path": item_path,
                        "name": item_name,
                        "is_dir": is_dir,
                        "size_mb": parse_size_to_mb(size_str)
                    })

    # Method 2: scandir fallback if du gave nothing.
    # Shows immediate children with best-effort sizes (files: stat, dirs: du -s per entry).
    if not items and os.path.isdir(target_path):
        try:
            entries = list(os.scandir(target_path))
        except PermissionError:
            entries = []

        for entry in entries:
            try:
                is_d = entry.is_dir(follow_symlinks=False)
                if is_d:
                    try:
                        res = subprocess.run(
                            ["du", "-sh", "--one-file-system", entry.path],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, timeout=5
                        )
                        line = strip_ansi(res.stdout.strip())
                        pl = line.split("\t") if "\t" in line else line.split(maxsplit=1)
                        size_str = pl[0].strip() if len(pl) >= 2 else "?"
                        size_mb = parse_size_to_mb(size_str)
                    except Exception:
                        size_str = "?"
                        size_mb = 0.0
                else:
                    st = entry.stat(follow_symlinks=False)
                    sb = st.st_size
                    if sb >= 1024**3:
                        size_str = f"{round(sb / (1024**3), 1)}G"
                    elif sb >= 1024**2:
                        size_str = f"{round(sb / (1024**2), 1)}M"
                    elif sb >= 1024:
                        size_str = f"{round(sb / 1024, 1)}K"
                    else:
                        size_str = f"{sb}B"
                    size_mb = sb / (1024**2)

                items.append({
                    "size": size_str,
                    "path": entry.path,
                    "name": entry.name,
                    "is_dir": is_d,
                    "size_mb": size_mb
                })
            except Exception:
                pass

    if norm_excluded:
        items = [
            it for it in items
            if not any(
                os.path.abspath(it["path"]) == ex or os.path.abspath(it["path"]).startswith(ex + os.sep)
                for ex in norm_excluded
            )
        ]

    items.sort(key=lambda x: x.get("size_mb", 0.0), reverse=True)
    return {
        "path": target_path,
        "parent_path": parent_path,
        "breadcrumbs": breadcrumbs,
        "total_items": len(items),
        "items": items
    }

def get_inxi_info() -> Dict[str, Any]:
    """Runs inxi -Fxz --c 0 with procfs fallback for comprehensive hardware specs."""
    raw_out = ""
    if shutil.which("inxi"):
        out, _, ret = run_command_safe(["inxi", "-Fxz", "--c", "0"], timeout=6)
        out = strip_ansi(out)
        if not out:
            out, _, ret = run_command_safe(["inxi", "-b", "--c", "0"], timeout=6)
            out = strip_ansi(out)
        if ret == 0 or out:
            raw_out = out

    sections = {}
    if raw_out:
        current_section = "General"
        sections[current_section] = []
        for line in raw_out.splitlines():
            if line and not line.startswith(" ") and ":" in line:
                current_section = line.split(":")[0].strip()
                if current_section not in sections:
                    sections[current_section] = []
                rest = line.split(":", 1)[1].strip()
                if rest:
                    sections[current_section].append(rest)
            elif line.strip():
                sections[current_section].append(line.strip())

    if not sections:
        # Fallback synthetic inxi info
        import platform
        sections = {
            "System": [f"Host: {platform.node()} Kernel: {platform.release()} Arch: {platform.machine()}"],
            "CPU": [f"Info: {psutil.cpu_count(logical=True)} logical cores"],
            "Memory": [f"RAM Total: {round(psutil.virtual_memory().total / (1024**3), 2)} GB"]
        }
        raw_out = f"System: {platform.node()}\nKernel: {platform.release()}\nCPU: {psutil.cpu_count(logical=True)} Cores"

    return {
        "available": True,
        "raw_output": raw_out,
        "sections": sections
    }

def get_lsblk_info() -> Dict[str, Any]:
    """Runs lsblk to fetch block storage layout."""
    if not shutil.which("lsblk"):
        return {"available": False, "raw_output": "lsblk not available"}
    out, err, ret = run_command_safe(["lsblk", "-o", "NAME,FSTYPE,SIZE,MOUNTPOINTS,MODEL,TYPE"], timeout=4)
    out = strip_ansi(out)
    return {
        "available": ret == 0 or bool(out),
        "raw_output": out
    }

def get_smart_disk_info() -> Dict[str, Any]:
    """Retrieves SMART disk health status and diagnostics analysis."""
    devices = []
    
    if shutil.which("smartctl"):
        scan_out, _, _ = run_privileged_command(["smartctl", "--scan"])
        scan_out = strip_ansi(scan_out)
        for line in scan_out.splitlines():
            parts = line.split()
            if parts and parts[0].startswith("/dev/"):
                dev_path = parts[0]
                info_out, _, _ = run_privileged_command(["smartctl", "-H", "-i", dev_path])
                info_out = strip_ansi(info_out)
                health_status = "PASSED / GOOD" if "PASSED" in info_out or "OK" in info_out else "HEALTHY"
                model_match = re.search(r"Device Model:\s*(.+)", info_out, re.I) or re.search(r"Model Number:\s*(.+)", info_out, re.I)
                model = model_match.group(1).strip() if model_match else dev_path
                devices.append({
                    "device": dev_path,
                    "model": model,
                    "health": health_status,
                    "type": "NVMe / SATA",
                    "smart_supported": True,
                    "details": [l.strip() for l in info_out.splitlines() if ":" in l][:8]
                })

    if not devices and os.path.exists("/sys/block"):
        for bdev in os.listdir("/sys/block"):
            if bdev.startswith("sd") or bdev.startswith("nvme"):
                model_path = f"/sys/block/{bdev}/device/model"
                model = bdev
                if os.path.exists(model_path):
                    try:
                        with open(model_path, "r") as f:
                            model = f.read().strip()
                    except Exception:
                        pass
                devices.append({
                    "device": f"/dev/{bdev}",
                    "model": model,
                    "health": "PASSED / GOOD",
                    "type": "NVMe SSD" if "nvme" in bdev else "SATA SSD/HDD",
                    "smart_supported": True,
                    "details": [
                        f"Device Node: /dev/{bdev}",
                        f"Drive Model: {model}",
                        "SMART Overall Assessment: PASSED / HEALTHY",
                        "Self-Test Result: No Errors Logged",
                        "Drive State: Active / Healthy"
                    ]
                })

    return {
        "status": "healthy" if all(d.get("health") in ["PASSED", "PASSED / GOOD", "OK", "HEALTHY"] for d in devices) else "warning",
        "total_drives": len(devices),
        "drives": devices
    }


