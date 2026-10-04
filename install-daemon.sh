#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="pulse-vitals-backend.service"
SUDOERS_FILE="vitals-daemon"
DAEMON_USER="vitals-daemon"
ENV_FILE="/etc/default/pulse-vitals-daemon"

echo "=========================================================="
echo " ⚙️  PulseLinux System Vitals Daemon Installer            "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run this script with sudo: sudo ./install-daemon.sh"
    exit 1
fi

# Parse Flags & Attributes
INPUT_HUB_URL="${HUB_URL:-}"
INPUT_TOKEN="${ENROLL_TOKEN:-}"
INPUT_ADMIN="${ADMIN_USER:-}"

for arg in "$@"; do
    case $arg in
        --hub-url=*)
            INPUT_HUB_URL="${arg#*=}"
            shift
            ;;
        --token=*)
            INPUT_TOKEN="${arg#*=}"
            shift
            ;;
        --admin=*)
            INPUT_ADMIN="${arg#*=}"
            shift
            ;;
    esac
done

# Interactive Prompts if attributes are empty and running in interactive terminal
if [ -t 0 ] && [ -z "$INPUT_HUB_URL" ]; then
    read -p "🌐 Master Hub WebSocket URL [default ws://127.0.0.1:8000]: " USER_HUB
    INPUT_HUB_URL="${USER_HUB:-ws://127.0.0.1:8000}"
fi

if [ -z "$INPUT_HUB_URL" ]; then
    INPUT_HUB_URL="ws://127.0.0.1:8000"
fi

if [ -t 0 ] && [ -z "$INPUT_TOKEN" ]; then
    read -p "🔑 Device Enrollment Token (press Enter to skip for local): " USER_TOK
    INPUT_TOKEN="${USER_TOK:-}"
fi

echo ""
echo "📋 Configuration Summary:"
echo " ➜ Hub URL:          $INPUT_HUB_URL"
echo " ➜ Enrollment Token: ${INPUT_TOKEN:-[None / Local]}"
echo " ➜ Admin User:       ${INPUT_ADMIN:-[Default]}"
echo ""

# Write configuration to /etc/default/pulse-vitals-daemon
mkdir -p /etc/default
cat <<EOF > "$ENV_FILE"
HUB_URL="$INPUT_HUB_URL"
ENROLL_TOKEN="$INPUT_TOKEN"
ADMIN_USER="$INPUT_ADMIN"
EOF
chmod 0644 "$ENV_FILE"

# 1. Create dedicated system user & group if not existing
if ! id "$DAEMON_USER" >/dev/null 2>&1; then
    echo "👤 Creating dedicated system user '$DAEMON_USER'..."
    useradd -r -s /usr/sbin/nologin -d /var/lib/vitals-daemon -m "$DAEMON_USER"
else
    echo "✓ System user '$DAEMON_USER' already exists."
fi

# Add to systemd-journal and disk groups for hardware & log access
usermod -aG systemd-journal,disk "$DAEMON_USER" 2>/dev/null || true

# Grant traverse access to /home/nandhu and read access to backend for vitals-daemon user
echo "🔑 Setting ACL permissions for '$DAEMON_USER'..."
setfacl -m u:"$DAEMON_USER":x /home/nandhu 2>/dev/null || chmod o+x /home/nandhu
setfacl -m u:"$DAEMON_USER":x /home/nandhu/projects 2>/dev/null || true
setfacl -R -m u:"$DAEMON_USER":rX "$PROJECT_DIR/backend" 2>/dev/null || chmod -R o+rX "$PROJECT_DIR/backend"

# 2. Install Sudoers rule with granular least-privilege
echo "🔒 Configuring granular sudoers rules in /etc/sudoers.d/$SUDOERS_FILE..."
cp "$PROJECT_DIR/vitals-daemon-sudoers" "/etc/sudoers.d/$SUDOERS_FILE"
chmod 0440 "/etc/sudoers.d/$SUDOERS_FILE"

# Validate sudoers file syntax
if visudo -cf "/etc/sudoers.d/$SUDOERS_FILE" >/dev/null 2>&1; then
    echo "✓ Sudoers rule syntax validated successfully."
else
    echo "❌ Sudoers syntax error detected! Removing rules file..."
    rm -f "/etc/sudoers.d/$SUDOERS_FILE"
    exit 1
fi

# 3. Install Systemd Service Unit
echo "🚀 Installing Systemd service /etc/systemd/system/$SERVICE_NAME..."
cp "$PROJECT_DIR/$SERVICE_NAME" "/etc/systemd/system/$SERVICE_NAME"

systemctl daemon-reload
echo "⚡ Enabling and starting $SERVICE_NAME..."
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo ""
echo "=========================================================="
echo " 🎉 PulseLinux Daemon Service Installation Complete!"
echo "=========================================================="
echo " ➜ Configuration:   $ENV_FILE"
echo " ➜ Service Status:  systemctl status $SERVICE_NAME"
echo " ➜ Daemon Logs:      journalctl -u $SERVICE_NAME -f"
echo "=========================================================="
systemctl status "$SERVICE_NAME" --no-pager || true
