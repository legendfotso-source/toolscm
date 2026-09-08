#!/usr/bin/env bash
# Stops any Next server this project left running, then starts a fresh one.
# Used by the test harness so a stale build never serves the new chunk names.
set -u
PORT="${1:-3711}"
for p in $(ls /proc 2>/dev/null | grep -E '^[0-9]+$'); do
  cmd=$(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null || true)
  case "$cmd" in
    *next-server*) kill -9 "$p" 2>/dev/null ;;
  esac
done
sleep 1
exec npx next start -p "$PORT"
