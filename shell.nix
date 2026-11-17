{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = [ pkgs.nodejs_24 pkgs.pnpm ];
  # The Chromium the Seam 2 tests drive.
  GRAEAE_CHROMIUM = "${pkgs.chromium}/bin/chromium";
}
