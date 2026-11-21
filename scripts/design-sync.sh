#!/usr/bin/env bash
# Writes the accepted board frames that canon/design/frames.json maps into
# canon/design/. Pass --check to write nothing and exit 14 on any drift.
#
# The board is gitignored and lives at the main worktree root alone, so a
# linked worktree reads it from there.
set -euo pipefail

if ! command -v frameboard >/dev/null 2>&1; then
  echo "design:sync needs the frameboard command, which only the owner's computer has." >&2
  exit 1
fi

main_root="$(git worktree list --porcelain | grep -m 1 '^worktree ' | cut -d' ' -f2-)"
board="$main_root/.canon/board"

if [ ! -f "$board/board.json" ]; then
  echo "design:sync found no board at $board. The board lives only on the owner's computer." >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"
frameboard references sync canon/design --root "$board" "$@"
