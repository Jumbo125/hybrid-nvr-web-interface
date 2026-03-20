#!/bin/bash
set -e

URL="http://127.0.0.1:9500"
CHECK_INTERVAL=1
START_WAIT=0.5
SERVER_STARTED=0

cd "$(dirname "$0")"

# Chromium-Binary finden
if command -v chromium >/dev/null 2>&1; then
    BROWSER="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
    BROWSER="chromium-browser"
else
    echo "Chromium nicht gefunden."
    exit 1
fi

echo "Prüfe Server: $URL"

# Wenn Server nicht erreichbar ist, einmal start.sh versuchen
if ! curl -fsS "$URL" >/dev/null 2>&1; then
    if [ -f "./start.sh" ]; then
        echo "Server nicht erreichbar. Starte ./start.sh ..."
        bash ./start.sh >/tmp/hybrid_nvr_start.log 2>&1 &
        SERVER_STARTED=1

        # kurze Wartezeit, damit der Python-Server hochkommen kann
        sleep "$START_WAIT"
    else
        echo "Server nicht erreichbar und ./start.sh nicht gefunden."
    fi
fi

echo "Warte auf Server: $URL"

until curl -fsS "$URL" >/dev/null 2>&1; do
    sleep "$CHECK_INTERVAL"
done

if [ "$SERVER_STARTED" -eq 1 ]; then
    echo "Server wurde gestartet und ist jetzt erreichbar."
else
    echo "Server war bereits erreichbar."
fi

echo "Starte Chromium im Kiosk-Modus ..."

exec "$BROWSER" \
    --kiosk \
    --incognito \
    --no-first-run \
    --disable-infobars \
    --check-for-update-interval=31536000 \
    "$URL"