#!/usr/bin/env bash
# A virtual desktop for `pnpm real-media` on a headless Linux machine: an X display
# (Xvfb) with a window manager, so the browser's picker lists windows, and a sound server
# with a null output, so a tab's sound plays and can be captured. Not a test.
#
#   scripts/real-media/desktop.sh start [display] [WIDTHxHEIGHT]   # default :99 1920x1080
#   scripts/real-media/desktop.sh stop [display]
#
# then run members with `DISPLAY=:99 PULSE_SERVER=unix:<dir>/native` as it prints. The
# tools come from nixpkgs through `nix-shell -p`; elsewhere, have Xvfb, openbox and
# pulseaudio on the PATH and set GRAEAE_DESKTOP_NO_NIX=1.

set -euo pipefail

command="${1:-start}"
display="${2:-:99}"
size="${3:-1920x1080}"
number="${display#:}"
state="${XDG_RUNTIME_DIR:-/tmp}/graeae-real-media-$number"

tools() {
  if [ "${GRAEAE_DESKTOP_NO_NIX:-}" = 1 ]; then "$@"; return; fi
  nix-shell -p xorg-server openbox pulseaudio --run "$(printf '%q ' "$@")"
}

case "$command" in
  start)
    mkdir -p "$state/pulse"
    tools sh -c "
      Xvfb $display -screen 0 ${size}x24 -nolisten tcp >'$state/xvfb.log' 2>&1 & echo \$! >'$state/xvfb.pid'
      sleep 1
      DISPLAY=$display openbox >'$state/openbox.log' 2>&1 & echo \$! >'$state/openbox.pid'
      PULSE_RUNTIME_PATH='$state/pulse' pulseaudio --daemonize=no --exit-idle-time=-1 -n \
        --load='module-native-protocol-unix socket=$state/pulse/native auth-anonymous=1' \
        --load='module-null-sink sink_name=graeae' --load='module-always-sink' \
        >'$state/pulse.log' 2>&1 & echo \$! >'$state/pulse.pid'
      sleep 1
    "
    echo "DISPLAY=$display PULSE_SERVER=unix:$state/pulse/native"
    ;;
  stop)
    for name in pulse openbox xvfb; do
      if [ -f "$state/$name.pid" ]; then kill "$(cat "$state/$name.pid")" 2>/dev/null || true; rm -f "$state/$name.pid"; fi
    done
    ;;
  *)
    echo "usage: $0 start|stop [display] [WIDTHxHEIGHT]" >&2
    exit 2
    ;;
esac
