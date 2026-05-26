#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v npx >/dev/null 2>&1; then
  printf 'npx is required to install ClawGuard into OpenClaw\n' >&2
  exit 1
fi

cd "${PROJECT_DIR}"

printf 'Installing ClawGuard plugin into OpenClaw...\n'
npx openclaw plugins install -l . --dangerously-force-unsafe-install


printf '\nClawGuard is ready.\n'
printf 'Try:\n'
printf '  npx openclaw ClawGuard audit\n'
printf '  npx openclaw ClawGuard harden\n'
printf '  npx openclaw ClawGuard monitor\n'
