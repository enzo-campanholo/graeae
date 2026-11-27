#!/usr/bin/env bash
# `bash scripts/without-fix.sh [--base <rev>] <path>… -- <command…>`: shows that new tests
# catch the bug, by running them on the code without the fix. Run it inside `nix-shell --run`.
#
# It makes a temporary worktree at <rev> (default HEAD), copies each <path> into it from this
# checkout (the new tests, plus any harness change they need), links node_modules to this
# checkout's and copies dist/ (so a build there leaves this checkout's alone), then runs the
# command there through scripts/heavy.sh. It prints `RED without the fix (exit N)` or
# `GREEN without the fix: the test does not catch it`, exits with the command's status and
# removes the worktree. This checkout, its stash and its index are never touched.
#
# The fix is what differs between <rev> and the working tree: commit the fix first and give
# `--base <the commit before it>`, or leave the fix uncommitted and use the default. The
# command's words are joined with spaces and run by bash, so `&&` may be quoted or not. A
# journey's command starts with `pnpm exec vite build --mode fake-media &&` to build the
# old code, e.g.
#   bash scripts/without-fix.sh test/x.test.ts -- pnpm exec vitest run test/x.test.ts
set -euo pipefail

usage() {
  echo "usage: bash scripts/without-fix.sh [--base <rev>] <path>… -- <command…>" >&2
  exit 2
}

base=HEAD
if [ "${1:-}" = --base ]; then
  [ $# -ge 2 ] || usage
  base=$2
  shift 2
fi
paths=()
while [ $# -gt 0 ] && [ "$1" != -- ]; do
  paths+=("$1")
  shift
done
{ [ "${1:-}" = -- ] && [ $# -ge 2 ] && [ ${#paths[@]} -gt 0 ]; } || usage
shift
command="$*"

root=$(git rev-parse --show-toplevel)
heavy="$root/scripts/heavy.sh"
relative=()
for path in "${paths[@]}"; do
  [ -e "$path" ] || { echo "without-fix: no $path in this checkout" >&2; exit 2; }
  relative+=("$(realpath --relative-to="$root" "$path")")
done

wt=$(mktemp -d)
git worktree add --quiet --detach "$wt" "$base"
trap 'rm -f "$wt/node_modules"; git -C "$root" worktree remove --force "$wt"' EXIT

for path in "${relative[@]}"; do
  mkdir -p "$wt/$(dirname "$path")"
  rm -rf "${wt:?}/$path"
  cp -R "$root/$path" "$wt/$path"
done
ln -s "$root/node_modules" "$wt/node_modules"
[ -d "$root/dist" ] && cp -R "$root/dist" "$wt/dist"

# pnpm would otherwise "install" before `pnpm exec` in a checkout whose node_modules is a
# link, rewriting this checkout's node_modules/.bin to point at the temporary worktree.
export pnpm_config_verify_deps_before_run=false
status=0
(cd "$wt" && bash "$heavy" "$command") || status=$?
if [ "$status" -ne 0 ]; then
  echo "RED without the fix (exit $status)"
else
  echo "GREEN without the fix: the test does not catch it"
fi
exit "$status"
