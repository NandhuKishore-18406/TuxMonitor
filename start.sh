#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# Ensure PATH includes common uv locations
export PATH="$HOME/.cargo/bin:/usr/bin:/usr/local/bin:$PATH"

echo "=========================================================="
echo "         🚀 PulseLinux System Monitor Launcher            "
echo "=========================================================="

# Check if systemd daemon is enabled & active
DAEMON_SERVICE="pulse-vitals-backend.service"
IS_ENABLED=$(systemctl is-enabled "$DAEMON_SERVICE" 2>/dev/null || echo "disabled")
IS_ACTIVE=$(systemctl is-active "$DAEMON_SERVICE" 2>/dev/null || echo "inactive")

BACKEND_PID=""
FRONTEND_PID=""

# Cleanup function on Ctrl+C (SIGINT) or termination (SIGTERM)
cleanup() {
    echo ""
    echo "🛑 Stopping frontend server..."
    if [ -n "$FRONTEND_PID" ]; then
        kill -9 "$FRONTEND_PID" 2>/dev/null || true
    fi
    if [ -n "$BACKEND_PID" ]; then
        kill -9 "$BACKEND_PID" 2>/dev/null || true
    fi
    fuser -k 3000/tcp >/dev/null 2>&1 || true
    if [ "$IS_ACTIVE" != "active" ]; then
        fuser -k 8000/tcp >/dev/null 2>&1 || true
    fi
    echo "✓ Stopped cleanly."
    exit 0
}

trap cleanup INT TERM

if [ "$IS_ACTIVE" = "active" ]; then
    echo "✓ Daemon is active and running as 'vitals-daemon' service ($DAEMON_SERVICE)."
elif [ "$IS_ENABLED" = "enabled" ]; then
    echo "⚠️ Daemon is enabled but not currently active. Starting daemon..."
    sudo systemctl start "$DAEMON_SERVICE" 2>/dev/null || true
    sleep 1
    if systemctl is-active "$DAEMON_SERVICE" >/dev/null 2>&1; then
        echo "✓ Started $DAEMON_SERVICE daemon successfully!"
    fi
else
    echo "⚠️ Backend daemon ($DAEMON_SERVICE) is NOT enabled or installed."
    echo "➜ To enable the daemon with dedicated user & low-privilege access, run:"
    echo "   sudo ./install-daemon.sh"
    echo ""
    read -p "Would you like to start temporary standalone backend instead? [Y/n] " -n 1 -r REPLY
    echo ""
    if [[ "$REPLY" =~ ^[Nn]$ ]]; then
        echo "Exiting. Please run 'sudo ./install-daemon.sh' to enable the daemon."
        exit 1
    fi

    echo "⚡ Starting temporary standalone backend on http://localhost:8000..."
    fuser -k 8000/tcp >/dev/null 2>&1 || true
    cd "$BACKEND_DIR"
    uv run uvicorn main:app --host 0.0.0.0 --port 8000 --no-access-log --workers 1 &
    BACKEND_PID=$!

    # Wait for backend port 8000 to become active
    for i in {1..10}; do
        if nc -z localhost 8000 2>/dev/null || curl -s http://localhost:8000/api/vitals >/dev/null 2>&1; then
            echo "✓ Standalone backend API is ready!"
            break
        fi
        sleep 0.5
    done
fi

# Kill any existing orphaned instance on frontend port 3000
fuser -k 3000/tcp >/dev/null 2>&1 || true

# Start React Vite Frontend and show npm run dev result
echo ""
echo "💻 Starting React Vite Frontend (npm run dev)..."
cd "$FRONTEND_DIR"
npm run dev -- --host 0.0.0.0 --port 3000 &
FRONTEND_PID=$!

echo ""
echo "=========================================================="
echo " 🎉 PulseLinux Dashboard is running!"
echo " ➜ Dashboard: http://localhost:3000"
echo " ➜ Backend:   http://localhost:8000"
echo " ➜ Press Ctrl+C to stop frontend."
echo "=========================================================="

wait
