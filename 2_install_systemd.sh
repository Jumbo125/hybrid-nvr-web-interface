#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LANG_DIR="${PROJECT_DIR}/lang"
SERVICE_NAME="nvr-ui"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
START_SCRIPT="${PROJECT_DIR}/start.sh"
VENV_PYTHON="${PROJECT_DIR}/venv/bin/python"

declare -A MSG=()
LANG_NAME=""

if [ -n "${SUDO_USER:-}" ]; then
    CURRENT_USER="$SUDO_USER"
else
    CURRENT_USER="$(id -un)"
fi

LANG_CODE="${INSTALL_LANG:-}"

trim() {
    local s="$1"
    s="${s#"${s%%[![:space:]]*}"}"
    s="${s%"${s##*[![:space:]]}"}"
    printf '%s' "$s"
}

t() {
    local key="$1"
    shift || true

    if [[ -v MSG["$key"] ]]; then
        printf "${MSG[$key]}" "$@"
    else
        printf '%s' "$key"
    fi
}

detect_sudo() {
    if [ "$(id -u)" -eq 0 ]; then
        SUDO=""
    elif command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo "$(t sudo_required)"
        exit 1
    fi
}

load_language() {
    local file="$LANG_DIR/$1.sh"

    if [ ! -f "$file" ]; then
        echo "Language file not found: $file"
        exit 1
    fi

    unset LANG_NAME
    unset MSG
    declare -gA MSG=()
    # shellcheck disable=SC1090
    source "$file"
}

choose_language_interactive() {
    local files=()
    local codes=()
    local names=()
    local i=1
    local choice

    shopt -s nullglob
    files=("$LANG_DIR"/*.sh)
    shopt -u nullglob

    if [ "${#files[@]}" -eq 0 ]; then
        echo "No language files found in $LANG_DIR"
        exit 1
    fi

    echo "Please choose language / Bitte Sprache wählen:"
    echo

    for file in "${files[@]}"; do
        local code name
        code="$(basename "$file" .sh)"
        name="$code"

        unset LANG_NAME
        # shellcheck disable=SC1090
        source "$file"
        [ -n "${LANG_NAME:-}" ] && name="$LANG_NAME"

        codes+=("$code")
        names+=("$name")

        echo "  [$i] $name ($code)"
        i=$((i + 1))
    done

    echo
    read -r -p "Selection / Auswahl: " choice

    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#codes[@]}" ]; then
        LANG_CODE="${codes[$((choice - 1))]}"
        return
    fi

    choice="$(trim "$choice")"
    for code in "${codes[@]}"; do
        if [ "$choice" = "$code" ]; then
            LANG_CODE="$choice"
            return
        fi
    done

    echo "Invalid selection / Ungültige Auswahl"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --lang)
            [ -z "${2:-}" ] && { echo "Error: --lang requires a value"; exit 1; }
            LANG_CODE="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

if [ -z "$LANG_CODE" ]; then
    choose_language_interactive
fi

load_language "$LANG_CODE"
detect_sudo

if [ ! -f "$START_SCRIPT" ]; then
    echo "$(t start_script_missing "$START_SCRIPT")"
    exit 1
fi

if [ ! -x "$VENV_PYTHON" ]; then
    echo "$(t venv_python_missing "$VENV_PYTHON")"
    exit 1
fi

chmod +x "$START_SCRIPT"

echo "$(t service_installing "$SERVICE_NAME")"

$SUDO tee "$SERVICE_FILE" > /dev/null <<EOF
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
KillSignal=SIGINT
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable "$SERVICE_NAME"
$SUDO systemctl restart "$SERVICE_NAME"

echo
echo "$(t service_installed_started)"
echo
echo "$(t status_check_with)"
echo "  sudo systemctl status $SERVICE_NAME"
echo
echo "$(t logs_view_with)"
echo "  journalctl -u $SERVICE_NAME -f"
