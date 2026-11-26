#!/usr/bin/env bash
# The Linux partner of a Windows evidence run (ticket 65, steps 3 and 5): one unattended
# member.ts member on a virtual display of its own. It shares a tab titled "Linux tone"
# that plays 440 Hz with its audio on, watches one member's screen share by itself
# whenever one is live, and records what it receives. Not a test: it calls Cloudflare's
# media server. Run it from the repo root:
#
#   scripts/real-media/linux-partner.sh [--watch <name>] [--minutes <n>] [--url-file <file>]
#                                       [--name <label>] [--out <dir>]
#
# Defaults: --watch "Win Chrome", --minutes 110, --url-file .owner/invites/release-linux-a,
# --name "Linux A", --out .logs/linux-partner-<UTC time>. The invite is used once; given the
# same invite again, member.ts rejoins the room it led to.
#
# What it leaves in <out>:
#   member.log          every line member.ts printed: its streams every 5 seconds (frame rate,
#                       frames decoded, decoder, codec, the received tone's level) and each
#                       poll's "partner ..." state
#   samples-NN.jsonl    `sample 1000` readings, written every 10 minutes so a crash keeps them
#   statslines.jsonl    the page's own "stats" log lines, written at the end
#   run.txt             when it started and ended, in UTC, for `pnpm logs`
#
# It watches by polling: every 5 seconds it clicks "Watch <name>'s screen" if that icon is
# in the bar, since "Watch everything" is a one-off pick and following a name ends when the
# viewer changes anything else. If its own share has ended, it shares again.

set -uo pipefail

watch="Win Chrome"
minutes=110
url_file=".owner/invites/release-linux-a"
label="Linux A"
out=".logs/linux-partner-$(date -u +%Y%m%dT%H%M%SZ)"
while (($#)); do
  case "$1" in
    --watch) watch="$2"; shift 2 ;;
    --minutes) minutes="$2"; shift 2 ;;
    --url-file) url_file="$2"; shift 2 ;;
    --name) label="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    *) echo "unknown option $1 (see the header of $0)" >&2; exit 2 ;;
  esac
done
[[ -f "$url_file" ]] || { echo "no invite file $url_file" >&2; exit 2; }
[[ -d node_modules/@playwright/test ]] || { echo "node_modules is missing: nix-shell --run 'pnpm install'" >&2; exit 2; }
mkdir -p "$out"
log="$out/member.log"
say() { printf '%s partner: %s\n' "$(date -u +%T)" "$*" | tee -a "$out/run.txt"; }

# Set before the display starts, so a TERM at any point stops whatever has started.
member=""
fifo=""
display=""
stop() {
  if [[ -n "$member" ]] && kill -0 "$member" 2>/dev/null; then
    printf 'quit\n' >&3 2>/dev/null || true
    for _ in $(seq 10); do kill -0 "$member" 2>/dev/null || break; sleep 1; done
    kill -- "-$member" 2>/dev/null || kill "$member" 2>/dev/null || true
  fi
  pkill -f -- "graeae-real-media/$label" 2>/dev/null || true
  [[ -n "$fifo" ]] && { exec 3>&-; rm -rf "$(dirname "$fifo")"; }
  [[ -n "$display" ]] && scripts/real-media/desktop.sh stop "$display" >/dev/null 2>&1
  say "ended"
}
trap stop EXIT
trap 'exit 130' INT TERM

# A display nothing else uses.
number=97
while [[ -e "/tmp/.X${number}-lock" ]] && ((number > 80)); do number=$((number - 1)); done
display=":$number"
line=$(scripts/real-media/desktop.sh start "$display" 1920x1080 | tail -n 1)
pulse=""
for part in $line; do [[ "$part" == PULSE_SERVER=* ]] && pulse="${part#PULSE_SERVER=}"; done
[[ -n "$pulse" ]] || { echo "the virtual display did not start: $line" >&2; exit 1; }

fifo=$(mktemp -d)/in
mkfifo "$fifo"
exec 3<>"$fifo"
command="DISPLAY=$(printf '%q' "$display") PULSE_SERVER=$(printf '%q' "$pulse") node scripts/real-media/member.ts"
command+=" --url-file $(printf '%q' "$url_file") --name $(printf '%q' "$label") --pick $(printf '%q' "tab:Linux tone") --webcam fake --every 5 --size 1280x720"
setsid nix-shell --run "$command" <&3 >"$log" 2>&1 &
member=$!

send() { printf '%s\n' "$1" >&3; }
up() { kill -0 "$member" 2>/dev/null; }

say "started on $display, watching for \"$watch\", for $minutes minutes, into $out"
waited=0
until grep -q "in the room at" "$log" 2>/dev/null; do
  if ! up || ((waited >= 180)); then
    say "did not get into the room; the end of its log:"
    tail -n 15 "$log"
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done
say "in the room"

# One poll: watch the named member's screen if it is live and not watched, turn the share's
# audio on if it is off, and say whether this member shares and watches.
named() { printf '[...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent.trim()) === "%s")' "$1"; }
poll="eval (() => { const watchIt = $(named "Watch $watch's screen"); if (watchIt) watchIt.click(); const audioOff = $(named "Turn your screen audio on"); if (audioOff) audioOff.click(); const sharing = !!$(named "Stop sharing your screen"); const watching = !!$(named "Stop watching $watch's screen"); return \`partner sharing=\${sharing} watching=\${watching || !!watchIt} clicked=\${!!watchIt} audio=\${!audioOff}\`; })()"

share() {
  send 'content tone "Linux tone"'
  sleep 3
  send 'share screen'
  sleep 8
}

send 'sample 1000'
share
chunk=1
started=$(date +%s)
deadline=$((started + minutes * 60))
next_chunk=$((started + 600))
while up && (($(date +%s) < deadline)); do
  send "$poll"
  sleep 5
  state=$(grep -o '"partner [^"]*"' "$log" | tail -n 1)
  if [[ "$state" == *"sharing=false"* ]]; then
    say "its share has ended: sharing again"
    share
  fi
  if (($(date +%s) >= next_chunk)); then
    send "unsample \"$(printf '%s/samples-%02d.jsonl' "$out" "$chunk")\""
    send 'sample 1000'
    chunk=$((chunk + 1))
    next_chunk=$((next_chunk + 600))
  fi
done

if up; then
  say "time is up: stopping the share and writing the readings"
  send 'stop screen'
  send 'wait 2'
  send "unsample \"$(printf '%s/samples-%02d.jsonl' "$out" "$chunk")\""
  send "statslines \"$out/statslines.jsonl\""
  send 'wait 2'
  for _ in $(seq 30); do grep -q "stats lines to" "$log" && break; sleep 1; done
else
  say "member.ts exited early; the end of its log:"
  tail -n 15 "$log"
fi
