#!/usr/bin/env bash
# Keeps its session open while a unit runs, since WSL stops the distribution
# once no session is left. A crash the unit restarts from does not end it.
set -euo pipefail

unit="$1"

stopped() {
  case "$(systemctl --user show --property=ActiveState --value "$unit")" in
    inactive | failed) return 0 ;;
    *) return 1 ;;
  esac
}

# A restart passes through failed, so one reading is not the end.
until stopped && sleep 2 && stopped; do
  sleep 3
done
