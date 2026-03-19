#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -x "venv/bin/python" ]; then
    echo "Bitte zuerst install.sh ausführen."
    exit 1
fi

exec "$(pwd)/venv/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port 9500 --workers 1