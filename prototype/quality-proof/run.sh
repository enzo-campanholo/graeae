#!/usr/bin/env bash
# PROTOTYPE runner. No Node on this machine, so borrow one from Nix.
#   ./run.sh            deploy to Cloudflare and print the link to send to friends
#   ./run.sh secrets    (re)enter the media server and relay secrets
#   ./run.sh delete     remove the Worker when the proof is done
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null; then
  exec nix shell nixpkgs#nodejs_22 -c "$0" "$@"
fi
wrangler() { npx --yes wrangler@4 "$@"; }

put_secret() { # name, prompt
  local value
  read -r -s -p "$2: " value; echo
  if [ -n "$value" ]; then printf '%s' "$value" | wrangler secret put "$1" >/dev/null && echo "  $1 saved"; else echo "  $1 skipped"; fi
}

enter_secrets() {
  echo "Paste each value and press Enter. Nothing is shown or stored on this machine."
  put_secret CF_APP_ID "Realtime SFU application ID"
  put_secret CF_APP_SECRET "Realtime SFU application secret"
  echo "Optional, for the relay tests (dashboard > Realtime > TURN Server > create a key). Enter to skip."
  put_secret TURN_KEY_ID "TURN key ID"
  put_secret TURN_KEY_TOKEN "TURN key API token"
}

case "${1:-deploy}" in
  delete)
    wrangler delete
    ;;
  secrets)
    enter_secrets
    ;;
  deploy)
    wrangler whoami >/dev/null 2>&1 || wrangler login
    [ -f .access-key ] || head -c 18 /dev/urandom | base64 | tr -d '/+=' > .access-key
    out=$(wrangler deploy 2>&1 | tee /dev/stderr)
    printf '%s' "$(cat .access-key)" | wrangler secret put ACCESS_KEY >/dev/null
    if ! wrangler secret list 2>/dev/null | grep -q CF_APP_SECRET; then enter_secrets; fi
    url=$(printf '%s\n' "$out" | grep -o 'https://[^ ]*workers\.dev' | head -1)
    echo
    echo "Send this link to whoever is testing (it contains the key):"
    echo "  ${url:-https://graeae-quality-proof.<your-subdomain>.workers.dev}/?k=$(cat .access-key)"
    ;;
  *)
    echo "usage: ./run.sh [deploy|secrets|delete]"; exit 1
    ;;
esac
