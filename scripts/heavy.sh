#!/usr/bin/env bash
# `bash scripts/heavy.sh '<command>' [args…]`: runs a command that builds the app or drives
# browsers one at a time on this machine (7.5 GB of RAM), queueing behind whoever holds
# the lock. package.json runs test, test:browser, capture and perf through it. A command
# already inside the lock (a brief's own `flock` on the same file, or the pre-push hook
# under a locked `git push`) runs straight through. Where there is no flock (macOS), it
# runs unlocked. Extra args are appended to the command, as pnpm appends them to a script.
set -euo pipefail
lock="${GRAEAE_HEAVY_LOCK:-${XDG_RUNTIME_DIR:-/tmp}/graeae-heavy.lock}"
run() { if [ $# -eq 1 ]; then exec bash -c "$1"; else exec bash -c "$1 \"\$@\"" heavy "${@:2}"; fi; }
{ command -v flock >/dev/null && [ -r /proc/locks ]; } || run "$@"
: >>"$lock"
inode=$(stat -c %i "$lock")
holders=$(awk -v i=":$inode\$" '$2 == "FLOCK" && $6 ~ i { print $5 }' /proc/locks)
p=$$
while [ "$p" -gt 1 ]; do
  for h in $holders; do [ "$h" = "$p" ] && run "$@"; done
  p=$(awk '/^PPid:/ { print $2 }' "/proc/$p/status")
done
flock -n "$lock" true || echo "heavy.sh: waiting for $lock (held by PID ${holders:-?})" >&2
exec flock "$lock" bash "$0" "$@"
