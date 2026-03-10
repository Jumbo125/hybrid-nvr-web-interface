#!/bin/bash
set -e

URL="http://127.0.0.1:9500"
CHECK_INTERVAL=1

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

echo "Warte auf Server: $URL"

until curl -fsS "$URL" >/dev/null 2>&1; do
    sleep "$CHECK_INTERVAL"
done

echo "Server erreichbar. Starte Chromium..."

exec "$BROWSER" \
    --kiosk \
    --incognito \
    --no-first-run \
    --disable-infobars \
    --check-for-update-interval=31536000 \
    "$URL"