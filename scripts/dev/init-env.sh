#!/usr/bin/env bash
# Create local env files from the committed examples without overwriting existing ones.
set -euo pipefail
cd "$(dirname "$0")/../.."
while IFS= read -r example; do
  dir=$(dirname "$example")
  target="$dir/.env"
  [[ "$dir" == "apps/web" ]] && target="$dir/.env.local"
  if [[ -e "$target" ]]; then
    echo "kept    $target"
  else
    cp "$example" "$target"
    echo "created $target"
  fi
done < <(git ls-files '*.env.example' '**/.env.example')
