#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${1:-${HERMES_SKILLS_DIR:-${HERMES_AGENT_DIR:-$HOME/.hermes}/skills}}"
TARGET_DIR="$TARGET_ROOT/contact_to_order"

mkdir -p "$TARGET_ROOT"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
for item in SKILL.md README.md read_file_guide.md model_routes.yaml DIFY_TO_HERMES_MAPPING.md \
  install.sh install.ps1 package.ps1 prompts schemas scripts examples; do
  if [ -e "$SRC_DIR/$item" ]; then
    cp -R "$SRC_DIR/$item" "$TARGET_DIR/"
  fi
done

echo "Installed contact_to_order skill to: $TARGET_DIR"
echo "Restart Hermes gateway/webui if the skill list does not refresh automatically."
