#!/bin/bash
set -e

cd "$(dirname "$0")"

FAILED_REQUIREMENTS=()
PIP_OPTS=()
PIP_CONSTRAINTS=()
LANG_DIR="./lang"
LANG_CODE="${INSTALL_LANG:-}"

LANG_NAME=""
declare -A MSG=()

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

print_status() {
    local name="$1"
    local status="$2"
    if [ "$status" -eq 0 ]; then
        echo "[$(t ok)]     $name"
    else
        echo "[$(t error)] $name"
    fi
}

get_available_languages() {
    local files=()
    shopt -s nullglob
    files=("$LANG_DIR"/*.sh)
    shopt -u nullglob

    if [ "${#files[@]}" -eq 0 ]; then
        echo "Error: No language files found in $LANG_DIR"
        exit 1
    fi

    local file
    for file in "${files[@]}"; do
        basename "$file" .sh
    done | sort
}

get_language_name() {
    local code="$1"
    local file="$LANG_DIR/$code.sh"

    if [ ! -f "$file" ]; then
        printf '%s' "$code"
        return
    fi

    local name
    name="$(bash -c 'source "$1" >/dev/null 2>&1; printf "%s" "${LANG_NAME:-}"' _ "$file")"

    if [ -n "$name" ]; then
        printf '%s' "$name"
    else
        printf '%s' "$code"
    fi
}

load_language() {
    local file="$LANG_DIR/$1.sh"

    if [ ! -f "$file" ]; then
        echo "Error: Language file not found: $file"
        exit 1
    fi

    unset LANG_NAME
    unset MSG
    declare -gA MSG=()
    # shellcheck disable=SC1090
    source "$file"
}

choose_language_interactive() {
    local codes=()
    local names=()
    local i=1
    local code
    local choice

    while IFS= read -r code; do
        codes+=("$code")
        names+=("$(get_language_name "$code")")
    done < <(get_available_languages)

    echo "=================================================="
    echo "Please choose a language / Bitte Sprache wählen"
    echo "=================================================="

    for ((i=0; i<${#codes[@]}; i++)); do
        printf '  [%d] %s (%s)\n' "$((i + 1))" "${names[$i]}" "${codes[$i]}"
    done

    echo
    read -r -p "> " choice
    choice="$(trim "$choice")"

    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#codes[@]}" ]; then
        LANG_CODE="${codes[$((choice - 1))]}"
        return
    fi

    for code in "${codes[@]}"; do
        if [ "$choice" = "$code" ]; then
            LANG_CODE="$code"
            return
        fi
    done

    echo "Invalid selection / Ungültige Auswahl"
    exit 1
}

validate_language_code() {
    local code="$1"
    local available
    while IFS= read -r available; do
        if [ "$available" = "$code" ]; then
            return 0
        fi
    done < <(get_available_languages)
    return 1
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --lang)
                if [ -z "${2:-}" ]; then
                    echo "Error: --lang requires a value."
                    exit 1
                fi
                LANG_CODE="$2"
                shift 2
                ;;
            --help|-h)
                cat <<'HELP'
Usage:
  ./1_install.sh [--lang de|en|...]

Optional:
  INSTALL_LANG=en ./1_install.sh
HELP
                exit 0
                ;;
            *)
                echo "Unknown parameter: $1"
                exit 1
                ;;
        esac
    done
}

detect_sudo() {
    if [ "$(id -u)" -eq 0 ]; then
        SUDO=""
    elif command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo "$(t sudo_required_packages)"
        exit 1
    fi
}

get_python_minor_version() {
    python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'
}

apt_install_python_venv_for_current_version() {
    detect_sudo
    local py_ver
    py_ver="$(get_python_minor_version)"
    local venv_pkg="python${py_ver}-venv"

    echo "$(t install_missing_venv_pkg "$py_ver")"
    $SUDO apt-get update

    if $SUDO apt-get install -y "$venv_pkg" python3-pip; then
        print_status "$(t install_pkg_primary "$venv_pkg" "python3-pip")" 0
    else
        print_status "$(t install_pkg_primary "$venv_pkg" "python3-pip")" 1
        echo "$(t install_pkg_fallback_try "python3-venv")"
        if $SUDO apt-get install -y python3-venv python3-pip; then
            print_status "$(t install_pkg_primary "python3-venv" "python3-pip")" 0
        else
            print_status "$(t install_pkg_primary "python3-venv" "python3-pip")" 1
            exit 1
        fi
    fi
}

install_python() {
    echo "$(t python_install_try)"
    detect_sudo

    if command -v apt-get >/dev/null 2>&1; then
        $SUDO apt-get update
        $SUDO apt-get install -y python3 python3-pip
        print_status "$(t install_pkg_primary "python3" "python3-pip")" 0
        apt_install_python_venv_for_current_version

    elif command -v dnf >/dev/null 2>&1; then
        $SUDO dnf install -y python3 python3-pip
        print_status "$(t install_pkg_primary "python3" "python3-pip")" 0

    elif command -v yum >/dev/null 2>&1; then
        $SUDO yum install -y python3 python3-pip
        print_status "$(t install_pkg_primary "python3" "python3-pip")" 0

    elif command -v pacman >/dev/null 2>&1; then
        $SUDO pacman -Sy --noconfirm python python-pip
        print_status "$(t install_pkg_primary "python" "python-pip")" 0

    elif command -v zypper >/dev/null 2>&1; then
        $SUDO zypper install -y python3 python3-pip
        print_status "$(t install_pkg_primary "python3" "python3-pip")" 0

    elif command -v apk >/dev/null 2>&1; then
        $SUDO apk add --no-cache python3 py3-pip
        print_status "$(t install_pkg_primary "python3" "py3-pip")" 0

    elif command -v brew >/dev/null 2>&1; then
        brew install python
        print_status "$(t install_pkg_primary "python (brew)" "")" 0

    else
        echo "$(t unsupported_package_manager)"
        exit 1
    fi
}

create_or_repair_venv() {
    if [ -d "venv" ] && [ -x "venv/bin/python" ] && venv/bin/python -m pip --version >/dev/null 2>&1; then
        echo "$(t venv_exists_ok)"
        return
    fi

    if [ -d "venv" ]; then
        echo "$(t venv_incomplete_remove)"
        rm -rf venv
    fi

    echo "$(t venv_create)"
    if python3 -m venv venv; then
        print_status "$(t venv_create)" 0
        return
    fi

    print_status "$(t venv_create)" 1

    if command -v apt-get >/dev/null 2>&1; then
        echo "$(t venv_create_repair_try)"
        apt_install_python_venv_for_current_version
        rm -rf venv

        if python3 -m venv venv; then
            print_status "$(t venv_create)" 0
            return
        fi

        print_status "$(t venv_create)" 1
    fi

    echo "$(t venv_create_failed)"
    exit 1
}

ensure_pip_in_venv() {
    if venv/bin/python -m pip --version >/dev/null 2>&1; then
        print_status "$(t pip_in_venv_present)" 0
        return
    fi

    echo "$(t pip_missing_in_venv)"
    if venv/bin/python -m ensurepip --upgrade >/dev/null 2>&1; then
        print_status "$(t ensurepip_result)" 0
    else
        print_status "$(t ensurepip_result)" 1
    fi

    if venv/bin/python -m pip --version >/dev/null 2>&1; then
        print_status "$(t pip_in_venv_provided)" 0
        return
    fi

    if command -v apt-get >/dev/null 2>&1; then
        echo "$(t repair_debian_and_rebuild)"
        apt_install_python_venv_for_current_version
        rm -rf venv
        python3 -m venv venv
    fi

    if ! venv/bin/python -m pip --version >/dev/null 2>&1; then
        echo "$(t pip_setup_failed)"
        exit 1
    fi

    print_status "$(t pip_after_repair_present)" 0
}

process_requirements_file() {
    local reqfile="$1"

    if [ ! -f "$reqfile" ]; then
        printf '%s\n' "$(t requirements_file_missing "$reqfile")"
        exit 1
    fi

    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        line="$(trim "$line")"

        [ -z "$line" ] && continue
        case "$line" in \#*) continue ;; esac

        if [[ "$line" == -r\ * ]]; then
            local sub="$(trim "${line#-r }")"
            printf '%s\n' "$(t read_more_requirements "$sub")"
            process_requirements_file "$sub"
            continue
        fi

        if [[ "$line" == --requirement\ * ]]; then
            local sub="$(trim "${line#--requirement }")"
            printf '%s\n' "$(t read_more_requirements "$sub")"
            process_requirements_file "$sub"
            continue
        fi

        if [[ "$line" == -c\ * ]]; then
            local c="$(trim "${line#-c }")"
            PIP_CONSTRAINTS+=("-c" "$c")
            print_status "$(t constraint_set "$c")" 0
            continue
        fi

        if [[ "$line" == --constraint\ * ]]; then
            local c="$(trim "${line#--constraint }")"
            PIP_CONSTRAINTS+=("-c" "$c")
            print_status "$(t constraint_set "$c")" 0
            continue
        fi

        if [[ "$line" == --* ]]; then
            PIP_OPTS+=("$line")
            print_status "$(t pip_option_set "$line")" 0
            continue
        fi

        printf '%s\n' "$(t installing_pkg "$line")"
        if venv/bin/python -m pip install "${PIP_OPTS[@]}" "${PIP_CONSTRAINTS[@]}" "$line"; then
            print_status "$line" 0
        else
            print_status "$line" 1
            FAILED_REQUIREMENTS+=("$line")
        fi
    done < "$reqfile"
}

install_requirements() {
    echo "$(t upgrade_pip)"
    if venv/bin/python -m pip install --upgrade pip; then
        print_status "$(t pip_upgrade)" 0
    else
        print_status "$(t pip_upgrade)" 1
        exit 1
    fi

    echo "$(t install_requirements)"
    process_requirements_file "requirements.txt"

    if [ "${#FAILED_REQUIREMENTS[@]}" -ne 0 ]; then
        echo
        echo "$(t failed_dependencies)"
        local pkg
        for pkg in "${FAILED_REQUIREMENTS[@]}"; do
            echo " - $pkg"
        done
        exit 1
    fi
}

parse_args "$@"

if [ -z "$LANG_CODE" ]; then
    if [ -t 0 ]; then
        choose_language_interactive
    else
        LANG_CODE="$(get_available_languages | head -n 1)"
    fi
fi

if ! validate_language_code "$LANG_CODE"; then
    echo "Unknown language: $LANG_CODE"
    echo "Available: $(get_available_languages | paste -sd ', ' -)"
    exit 1
fi

load_language "$LANG_CODE"

echo "$(t check_python)"
if ! command -v python3 >/dev/null 2>&1; then
    install_python
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "$(t python_install_failed)"
    exit 1
fi

if [ ! -f "requirements.txt" ]; then
    echo "$(t requirements_missing)"
    exit 1
fi

create_or_repair_venv
ensure_pip_in_venv
install_requirements

echo
echo "$(t installation_finished)"
echo "$(t start_project_with)"
echo "$(t start_script_name)"
