#!/bin/bash
# Refreshes Spotify API token every 50min to prevent expiration
# Only 1 API call per execution

TOKEN_FILE="/var/cache/spotifyd/spotify-api-token.json"
CLIENT_ID="63e10fa2802e4cf690f7045e79e32c00"
CLIENT_SECRET="8a0395cb2b2144caad9b6bf093d43996"
REFRESH_TOKEN="AQDZaVta2D6P_iDNp1QIpnVF9c-ajyZWS9UF6uqX64DycDhI_MBMmUiKGzce0pqQ_ypJTu3wL10HGjJdj17CKb3FH7By8T0tIX7bfdFOnmq6WkyK2M0UCjVkBYzd1XmPPTo"

response=$(curl -s -X POST https://accounts.spotify.com/api/token \
  -d "grant_type=refresh_token" \
  -d "refresh_token=${REFRESH_TOKEN}" \
  -u "${CLIENT_ID}:${CLIENT_SECRET}")

token=$(echo "$response" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$token" ]; then
  echo "$response" > "$TOKEN_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Token refreshed OK"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Token refresh FAILED: $response" >&2
fi
