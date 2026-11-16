#!/usr/bin/env bash
# PROTOTYPE runner: no Node on this machine, so borrow one from Nix.
cd "$(dirname "$0")"
exec nix shell nixpkgs#nodejs_22 nixpkgs#pnpm -c sh -c 'pnpm install --silent && pnpm dev --open "$@"' -- "$@"
