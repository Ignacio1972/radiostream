#!/bin/bash
# Spotify Kickstart — Starts playback on RadioStream device via Spotify Web API
# Usage: spotify-kickstart.sh [playlist_uri]
# Minimizes API calls to avoid rate limits: 1 refresh + 1 shuffle + 1 play

set -euo pipefail

TOKEN_FILE="/var/cache/spotifyd/spotify-api-token.json"
CLIENT_ID="63e10fa2802e4cf690f7045e79e32c00"
CLIENT_SECRET="8a0395cb2b2144caad9b6bf093d43996"
REFRESH_TOKEN="AQDZaVta2D6P_iDNp1QIpnVF9c-ajyZWS9UF6uqX64DycDhI_MBMmUiKGzce0pqQ_ypJTu3wL10HGjJdj17CKb3FH7By8T0tIX7bfdFOnmq6WkyK2M0UCjVkBYzd1XmPPTo"
DEVICE_ID="c0a45e8d2c94afecb53476a5dfc18e6df33c2c37"

# Default playlist — always needed for cold start (spotifyd has no context after reboot)
DEFAULT_PLAYLIST="spotify:playlist:0RQw6M2qrCw68ZLQVAcvst"
PLAYLIST_URI="${1:-$DEFAULT_PLAYLIST}"

log() { echo "[$(date '+%H:%M:%S')] $*" >&2; }

# Get fresh access token (1 API call)
refresh_token() {
  log "Refreshing access token..."
  local response
  response=$(curl -s -X POST https://accounts.spotify.com/api/token \
    -d "grant_type=refresh_token" \
    -d "refresh_token=${REFRESH_TOKEN}" \
    -u "${CLIENT_ID}:${CLIENT_SECRET}")

  local token
  token=$(echo "$response" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$token" ]; then
    log "ERROR: Failed to refresh token: $response"
    exit 1
  fi

  echo "$response" > "$TOKEN_FILE"
  echo "$token"
}

# Start playback (1 API call)
start_playback() {
  local token="$1"
  local body="{}"

  if [ -n "$PLAYLIST_URI" ]; then
    body="{\"context_uri\":\"${PLAYLIST_URI}\"}"
  fi

  log "Starting playback on RadioStream..."
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "https://api.spotify.com/v1/me/player/play?device_id=${DEVICE_ID}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "$body")

  if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
    log "Playback started (HTTP $http_code)"
  elif [ "$http_code" = "404" ]; then
    log "Device not found — is spotifyd running?"
    exit 1
  else
    log "WARNING: Unexpected response (HTTP $http_code)"
  fi
}

# Enable shuffle (1 API call)
enable_shuffle() {
  local token="$1"
  log "Enabling shuffle..."
  curl -s -o /dev/null -w "" \
    -X PUT "https://api.spotify.com/v1/me/player/shuffle?state=true&device_id=${DEVICE_ID}" \
    -H "Authorization: Bearer ${token}"
}

# Enable repeat (1 API call)
enable_repeat() {
  local token="$1"
  log "Enabling repeat..."
  curl -s -o /dev/null -w "" \
    -X PUT "https://api.spotify.com/v1/me/player/repeat?state=context&device_id=${DEVICE_ID}" \
    -H "Authorization: Bearer ${token}"
}

# Main
ACCESS_TOKEN=$(refresh_token)
enable_shuffle "$ACCESS_TOKEN"
start_playback "$ACCESS_TOKEN"
enable_repeat "$ACCESS_TOKEN"
