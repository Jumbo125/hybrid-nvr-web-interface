#!/bin/bash
set -e

cd "$(dirname "$0")"

FAILED_REQUIREMENTS=()
PIP_OPTS=()
PIP_CONSTRAINTS=()

detect_sudo() {
    if [ "$(id -u)" -eq 0 ]; then
        SUDO=""
    elif command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo "Fehler: Root-Rechte oder sudo werden benötigt, um Pakete zu installieren."
        exit 1
    fi
}

print_status() {
    local name="$1"
    local status="$2"
    if [ "$status" -eq 0 ]; then
        echo "[OK]     $name"
    else
        echo "[FEHLER] $name"
    fi
}

trim() {
    local s="$1"
    s="${s#"${s%%[![:space:]]*}"}"
    s="${s%"${s##*[![:space:]]}"}"
    printf '%s' "$s"
}

get_python_minor_version() {
    python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'
}

apt_install_python_venv_for_current_version() {
    detect_sudo
    local py_ver
    py_ver="$(get_python_minor_version)"
    local venv_pkg="python${py_ver}-venv"

    echo "Installiere fehlendes venv-Paket für Python $py_ver ..."
    $SUDO apt-get update

    if $SUDO apt-get install -y "$venv_pkg" python3-pip; then
        print_status "Installation: $venv_pkg, python3-pip" 0
    else
        print_status "Installation: $venv_pkg, python3-pip" 1
        echo "Fallback: versuche python3-venv ..."
        if $SUDO apt-get install -y python3-venv python3-pip; then
            print_status "Installation: python3-venv, python3-pip" 0
        else
            print_status "Installation: python3-venv, python3-pip" 1
            exit 1
        fi
    fi
}

install_python() {
    echo "Python3 nicht gefunden. Versuche automatische Installation..."
    detect_sudo

    if command -v apt-get >/dev/null 2>&1; then
        $SUDO apt-get update
        $SUDO apt-get install -y python3 python3-pip
        print_status "Installation: python3, python3-pip" 0
        apt_install_python_venv_for_current_version

    elif command -v dnf >/dev/null 2>&1; then
        $SUDO dnf install -y python3 python3-pip
        print_status "Installation: python3, python3-pip" 0

    elif command -v yum >/dev/null 2>&1; then
        $SUDO yum install -y python3 python3-pip
        print_status "Installation: python3, python3-pip" 0

    elif command -v pacman >/dev/null 2>&1; then
        $SUDO pacman -Sy --noconfirm python python-pip
        print_status "Installation: python, python-pip" 0

    elif command -v zypper >/dev/null 2>&1; then
        $SUDO zypper install -y python3 python3-pip
        print_status "Installation: python3, python3-pip" 0

    elif command -v apk >/dev/null 2>&1; then
        $SUDO apk add --no-cache python3 py3-pip
        print_status "Installation: python3, py3-pip" 0

    elif command -v brew >/dev/null 2>&1; then
        brew install python
        print_status "Installation: python (brew)" 0

    else
        echo "Fehler: Kein unterstützter Paketmanager gefunden."
        exit 1
    fi
}

create_or_repair_venv() {
    if [ -d "venv" ] && [ -x "venv/bin/python" ] && venv/bin/python -m pip --version >/dev/null 2>&1; then
        echo "Virtuelle Umgebung existiert bereits und ist nutzbar."
        return
    fi

    if [ -d "venv" ]; then
        echo "Vorhandene venv ist unvollständig oder defekt. Entferne sie..."
        rm -rf venv
    fi

    echo "Erstelle virtuelle Umgebung..."
    if python3 -m venv venv; then
        print_status "Erstellung der virtuellen Umgebung" 0
        return
    fi

    print_status "Erstellung der virtuellen Umgebung" 1

    if command -v apt-get >/dev/null 2>&1; then
        echo "Versuche automatische Reparatur für Debian/Ubuntu..."
        apt_install_python_venv_for_current_version
        rm -rf venv

        if python3 -m venv venv; then
            print_status "Erstellung der virtuellen Umgebung (2. Versuch)" 0
            return
        fi

        print_status "Erstellung der virtuellen Umgebung (2. Versuch)" 1
    fi

    echo "Fehler: Die virtuelle Umgebung konnte nicht erstellt werden."
    exit 1
}

ensure_pip_in_venv() {
    if venv/bin/python -m pip --version >/dev/null 2>&1; then
        print_status "pip in venv vorhanden" 0
        return
    fi

    echo "pip fehlt in der venv. Versuche ensurepip..."
    if venv/bin/python -m ensurepip --upgrade >/dev/null 2>&1; then
        print_status "ensurepip (venv)" 0
    else
        print_status "ensurepip (venv)" 1
    fi

    if venv/bin/python -m pip --version >/dev/null 2>&1; then
        print_status "pip in venv bereitgestellt" 0
        return
    fi

    if command -v apt-get >/dev/null 2>&1; then
        echo "Repariere Debian/Ubuntu-Pakete und baue venv neu..."
        apt_install_python_venv_for_current_version
        rm -rf venv
        python3 -m venv venv
    fi

    if ! venv/bin/python -m pip --version >/dev/null 2>&1; then
        echo "Fehler: pip konnte nicht eingerichtet werden."
        exit 1
    fi

    print_status "pip nach Reparatur vorhanden" 0
}

process_requirements_file() {
    local reqfile="$1"

    if [ ! -f "$reqfile" ]; then
        echo "Fehler: Requirements-Datei nicht gefunden: $reqfile"
        exit 1
    fi

    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        line="$(trim "$line")"

        [ -z "$line" ] && continue
        case "$line" in \#*) continue ;; esac

        if [[ "$line" == -r\ * ]]; then
            local sub="$(trim "${line#-r }")"
            echo "Lese weitere Requirements: $sub"
            process_requirements_file "$sub"
            continue
        fi

        if [[ "$line" == --requirement\ * ]]; then
            local sub="$(trim "${line#--requirement }")"
            echo "Lese weitere Requirements: $sub"
            process_requirements_file "$sub"
            continue
        fi

        if [[ "$line" == -c\ * ]]; then
            local c="$(trim "${line#-c }")"
            PIP_CONSTRAINTS+=("-c" "$c")
            print_status "Constraint gesetzt: $c" 0
            continue
        fi

        if [[ "$line" == --constraint\ * ]]; then
            local c="$(trim "${line#--constraint }")"
            PIP_CONSTRAINTS+=("-c" "$c")
            print_status "Constraint gesetzt: $c" 0
            continue
        fi

        if [[ "$line" == --* ]]; then
            PIP_OPTS+=("$line")
            print_status "pip Option gesetzt: $line" 0
            continue
        fi

        echo "Installiere: $line"
        if venv/bin/python -m pip install "${PIP_OPTS[@]}" "${PIP_CONSTRAINTS[@]}" "$line"; then
            print_status "$line" 0
        else
            print_status "$line" 1
            FAILED_REQUIREMENTS+=("$line")
        fi
    done < "$reqfile"
}

install_requirements() {
    echo "Upgrade pip..."
    if venv/bin/python -m pip install --upgrade pip; then
        print_status "pip Upgrade" 0
    else
        print_status "pip Upgrade" 1
        exit 1
    fi

    echo "Installiere Abhängigkeiten aus requirements.txt ..."
    process_requirements_file "requirements.txt"

    if [ "${#FAILED_REQUIREMENTS[@]}" -ne 0 ]; then
        echo
        echo "Folgende Abhängigkeiten konnten nicht installiert werden:"
        for pkg in "${FAILED_REQUIREMENTS[@]}"; do
            echo " - $pkg"
        done
        exit 1
    fi
}

echo "Prüfe Python..."
if ! command -v python3 >/dev/null 2>&1; then
    install_python
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "Fehler: Python3 konnte nicht installiert werden."
    exit 1
fi

if [ ! -f "requirements.txt" ]; then
    echo "Fehler: requirements.txt wurde nicht gefunden."
    exit 1
fi

create_or_repair_venv
ensure_pip_in_venv
install_requirements

echo
echo "Installation abgeschlossen."
echo "Starte dein Projekt mit:"
echo "start.sh"