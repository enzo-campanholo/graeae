#!/usr/bin/env bash
# Usage calculator for docs/research/media-transport.md.
# Every number here is an ASSUMPTION or a price read on 2026-11-15; edit the
# variables below and re-run:  bash docs/research/media-transport-calc.sh
#
# Model: every stream runs for the whole session; a viewer who watches a stream
# receives one copy of it. GB are decimal (1 GB = 1000 MB = 8000 Mb).
set -euo pipefail

awk '
function max(a,b){return a>b?a:b}
function usage(name, H, S, rS, vS, C, rC, vC, N,    secs, egress_mbps, ingress_mbps) {
  secs = H*3600
  egress_mbps  = S*rS*vS + C*rC*vC          # server -> viewers
  ingress_mbps = S*rS    + C*rC             # publishers -> server
  egress_gb  = secs*egress_mbps /8/1000
  ingress_gb = secs*ingress_mbps/8/1000
  minutes    = N*H*60                        # participant minutes
  mesh_up_both = rS*vS + rC*vC                # P2P mesh: member sharing screen + webcam
  mesh_up_cam  = rC*vC                        # P2P mesh: member sharing webcam only
  sfu_up_both  = rS + rC                      # SFU: same member
  viewer_down  = S*rS + (C-1)*rC              # one member watching every other stream
  printf "\n=== %s ===\n", name
  printf "assumptions: %d h/month, %d screens x %.1f Mbps x %d viewers, %d cams x %.1f Mbps x %d viewers, %d participants\n", H,S,rS,vS,C,rC,vC,N
  printf "server egress to viewers : %.1f Mbps  -> %.1f GB/month\n", egress_mbps, egress_gb
  printf "publisher ingress        : %.1f Mbps  -> %.1f GB/month\n", ingress_mbps, ingress_gb
  printf "participant minutes      : %d\n", minutes
  printf "member upload, P2P mesh  : %.1f Mbps (screen+cam), %.1f Mbps (cam only)   [assumed ceiling: 20 Mbps]\n", mesh_up_both, mesh_up_cam
  printf "member upload, with SFU  : %.1f Mbps (screen+cam)\n", sfu_up_both
  printf "member download (watches all other streams): %.1f Mbps\n", viewer_down
  printf "\n-- cost, USD/month --\n"
  # Cloudflare SFU (and TURN share the pool): $0.05/GB after 1000 GB
  printf "Cloudflare Realtime SFU           : %.2f   (%.1f GB billable of %.1f)\n", max(0,egress_gb-1000)*0.05, max(0,egress_gb-1000), egress_gb
  # P2P + Cloudflare TURN, fraction p of media relayed (mesh: relayed copies == viewer copies)
  split("0.10 0.25 0.50 1.00", P, " ")
  for (i=1;i<=4;i++) printf "P2P + Cloudflare TURN, %3d%% relayed : %.2f   (%.1f GB relayed)\n", P[i]*100, max(0,P[i]*egress_gb-1000)*0.05, P[i]*egress_gb
  printf "  break-even relayed share before any charge: %.1f%%\n", 100*1000/egress_gb
  printf "  Metered Open Relay free 20 GB covers a relayed share of: %.2f%%\n", 100*20/egress_gb
  # RealtimeKit: 10000 free minutes, $0.002/min (audio/video participant)
  printf "Cloudflare RealtimeKit            : %.2f   (%d billable minutes)\n", max(0,minutes-10000)*0.002, max(0,minutes-10000)
  # LiveKit Cloud
  printf "LiveKit Cloud Build (free)        : NOT USABLE  minutes %d / 5000 = %.0f%%, downstream %.1f GB / 50 GB = %.0f%% (hard cap, no overage)\n", minutes, 100*minutes/5000, egress_gb, 100*egress_gb/50
  printf "LiveKit Cloud Ship ($50 plan)     : %.2f   (minutes %.2f + data %.2f over 250 GB, base 50)\n", 50+max(0,minutes-150000)*0.0005+max(0,egress_gb-250)*0.12, max(0,minutes-150000)*0.0005, max(0,egress_gb-250)*0.12
  # Oracle Always Free, South America egress: first 10240 GB free, then $0.025/GB
  printf "Oracle Always Free (Sao Paulo)    : %.2f   (egress %.1f GB vs 10240 GB free; %.1f%% of allowance)\n", max(0,egress_gb-10240)*0.025, egress_gb, 100*egress_gb/10240
  # Linode / Akamai Sao Paulo (br-gru) prices from public API; overage $0.007/GB UNVERIFIED
  printf "Linode Sao Paulo Nanode 1GB  $7.00 (1000 GB pool)  : %.2f\n", 7.00+max(0,egress_gb-1000)*0.007
  printf "Linode Sao Paulo 2GB        $16.80 (2000 GB pool)  : %.2f\n", 16.80+max(0,egress_gb-2000)*0.007
  printf "Linode Sao Paulo 4GB        $33.60 (4000 GB pool)  : %.2f\n", 33.60+max(0,egress_gb-4000)*0.007
  # Vultr Sao Paulo: price and pool from public API; overage rate NOT verified, so show excess only
  printf "Vultr Sao Paulo 1c/1GB  $5  (1024 GB pool): excess %.1f GB at unverified overage rate\n", max(0,egress_gb-1024)
  printf "Vultr Sao Paulo 1c/2GB $10  (2048 GB pool): excess %.1f GB at unverified overage rate\n", max(0,egress_gb-2048)
  printf "Vultr Sao Paulo 2c/2GB $15  (3072 GB pool): excess %.1f GB at unverified overage rate\n", max(0,egress_gb-3072)
}
BEGIN {
  # name, hours, screens, Mbps, viewers, cams, Mbps, viewers, participants
  usage("WORKED EXAMPLE", 60, 2, 8, 3, 4, 1.5, 3, 4)
  usage("HEAVY CASE",     60, 4, 8, 5, 6, 1.5, 5, 6)
}'
