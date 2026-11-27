#!/usr/bin/env bash
# Stages demo incident INC-2041 so you can rehearse the skill:
# feature `new_checkout` exists and is ON in Production for every customer.
#
#   scripts/stage-incident.sh                 # local Flagsmith only
#   scripts/stage-incident.sh --allow-remote  # any other instance (you are sure it is a sandbox)
#
# Uses whatever the Flagsmith CLI is configured with (flagsmith.json or FLAGSMITH_* env vars).
# Re-running it resets the incident, including any override a previous run added.
set -euo pipefail

FLAG=new_checkout
API="${FLAGSMITH_API_URL:-https://api.flagsmith.com}"

case "$API" in
  http://localhost* | http://127.0.0.1*) ;;
  *)
    if [[ "${1:-}" != "--allow-remote" ]]; then
      echo "Refusing to stage a fake incident on $API. Pass --allow-remote if it is a sandbox." >&2
      exit 1
    fi
    ;;
esac

PROD=$(flagsmith env list --jq '.[] | select(.name == "Production") | .api_key')
if [[ -z "$PROD" ]]; then
  echo "This project has no environment named Production." >&2
  exit 1
fi

if flagsmith feature get "$FLAG" >/dev/null 2>&1; then
  flagsmith feature delete "$FLAG" --yes >/dev/null
fi
flagsmith feature create "$FLAG" --description "New checkout flow (3-D Secure v2 redirect)" >/dev/null
# --yes is fine here: this script only ever targets a sandbox (see the guard above).
flagsmith flag enable "$FLAG" -e "$PROD" --yes >/dev/null

echo "Staged INC-2041: $FLAG is ON in Production for every customer."
echo "Brief: demo/INC-2041.md   Code: demo/shop/"
