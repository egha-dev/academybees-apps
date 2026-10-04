#!/usr/bin/env bash
# Staging secrets helper (C-75). Generates each staging secret ONCE into a private folder and
# copies a value to the clipboard on request, so values never appear on screen, in a chat, in
# shell history or in the repo. Paste them into Railway or GitHub, then delete the folder.
#
#   scripts/staging/secrets.sh generate      # create the values (skips any that exist)
#   scripts/staging/secrets.sh copy NAME     # copy one value to the clipboard (WSL: clip.exe)
#   scripts/staging/secrets.sh gh NAME SECRET_NAME   # set a GitHub secret from a value (gh CLI)
#   scripts/staging/secrets.sh list          # names only
#   scripts/staging/secrets.sh wipe          # delete the folder when everything is set
set -euo pipefail

DIR="${ACADEMYBEE_SECRETS_DIR:-$HOME/.academybee-staging-secrets}"
NAMES=(DB_MIGRATOR_PASSWORD DB_APP_PASSWORD DB_PLATFORM_PASSWORD TRUSTED_PROXY_SECRET
  SECRETS_MASTER_KEY ANALYTICS_HASH_SALT AUTH_SIGNING_KEYS)

value_for() {
  case "$1" in
    # Hex: safe inside connection URLs without escaping.
    DB_*_PASSWORD) openssl rand -hex 24 ;;
    TRUSTED_PROXY_SECRET | ANALYTICS_HASH_SALT) openssl rand -hex 32 ;;
    SECRETS_MASTER_KEY) printf 's1:%s' "$(openssl rand -base64 32)" ;;
    AUTH_SIGNING_KEYS)
      node -e "const c=require('crypto');const k=c.generateKeyPairSync('ed25519').privateKey.export({format:'jwk'});process.stdout.write(JSON.stringify({current:'s1',keys:[{...k,kid:'s1',alg:'EdDSA'}]}))"
      ;;
    *) echo "unknown secret $1" >&2; exit 2 ;;
  esac
}

to_clipboard() {
  if command -v clip.exe >/dev/null 2>&1; then clip.exe
  elif command -v pbcopy >/dev/null 2>&1; then pbcopy
  elif command -v wl-copy >/dev/null 2>&1; then wl-copy
  elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard
  else echo "No clipboard tool found (clip.exe, pbcopy, wl-copy, xclip)." >&2; exit 1
  fi
}

case "${1:-}" in
  generate)
    umask 077
    mkdir -p "$DIR"
    for n in "${NAMES[@]}"; do
      if [ -s "$DIR/$n" ]; then echo "kept     $n"; else value_for "$n" | tr -d '\n' > "$DIR/$n"; echo "created  $n"; fi
    done
    echo "Stored in $DIR (only you can read it)."
    ;;
  copy)
    [ -s "$DIR/${2:-}" ] || { echo "No value named '${2:-}'. Run: $0 list" >&2; exit 1; }
    # clip.exe adds nothing; values have no trailing newline.
    to_clipboard < "$DIR/$2"
    echo "Copied $2 to the clipboard. Paste it, then copy something else to clear it."
    ;;
  gh)
    [ -s "$DIR/${2:-}" ] && [ -n "${3:-}" ] || { echo "Usage: $0 gh NAME SECRET_NAME" >&2; exit 1; }
    gh secret set "$3" --repo egha-dev/academybees-apps < "$DIR/$2"
    ;;
  list) ls -1 "$DIR" ;;
  wipe) rm -rf "$DIR" && echo "Deleted $DIR" ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
