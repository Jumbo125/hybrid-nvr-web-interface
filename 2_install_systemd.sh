#!/bin/bash
set -e

CURRENT_USER=$(whoami)
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="nvr-ui"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
START_SCRIPT="${PROJECT_DIR}/start.sh"

if [ ! -f "$START_SCRIPT" ]; then
    echo "start.sh nicht gefunden: $START_SCRIPT"
    exit 1
fi

if [ ! -x "$PROJECT_DIR/venv/bin/python" ]; then
    echo "Virtuelle Umgebung nicht gefunden: $PROJECT_DIR/venv/bin/python"
    exit 1
fi

chmod +x "$START_SCRIPT"

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=NVR UI FastAPI Service
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/bin/bash $START_SCRIPT
Restart=always
RestartSec=5

# optional etwas sauberer beim Stoppen
KillSignal=SIGINT
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "Service installiert und gestartet."
echo
echo "Status prüfen mit:"
echo "  sudo systemctl status $SERVICE_NAME"
echo
echo "Logs ansehen mit:"
echo "  journalctl -u $SERVICE_NAME -f"