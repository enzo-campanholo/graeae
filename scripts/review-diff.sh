#!/usr/bin/env bash
# `bash scripts/review-diff.sh <base> <out-dir>`: a change, ready to read a file at a time.
# Prints `git diff --stat` of the working tree against <base> (any rev: a commit,
# `origin/main`, a merge-base), then writes one patch per changed tracked file and one per
# untracked, non-ignored file to <out-dir>/<path with / replaced by __>.patch. `.scratch/`
# is left out: the Spec reviewer reads the ticket file itself. Needs only git and bash.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: bash scripts/review-diff.sh <base> <out-dir>" >&2
  exit 2
fi
base=$1
out=$2
git rev-parse --verify --quiet "$base^{commit}" >/dev/null || { echo "review-diff: $base is not a commit" >&2; exit 2; }
mkdir -p "$out"
if [ -n "$(ls -A "$out")" ]; then
  echo "review-diff: $out is not empty" >&2
  exit 2
fi
cd "$(git rev-parse --show-toplevel)"
out=$(cd "$OLDPWD" && cd "$out" && pwd)

git diff --stat "$base" -- . ':(exclude).scratch'

patch_of() { printf '%s/%s.patch' "$out" "${1//\//__}"; }

while IFS= read -r -d '' path; do
  git diff "$base" -- "$path" >"$(patch_of "$path")"
done < <(git diff -z --name-only "$base" -- . ':(exclude).scratch')

while IFS= read -r -d '' path; do
  # A nested repository (another checkout's worktree) is listed as a directory: not part of the change.
  [[ $path == */ ]] && { echo "review-diff: left out $path, a repository of its own" >&2; continue; }
  git diff --no-index -- /dev/null "$path" >"$(patch_of "$path")" || [ $? -eq 1 ]
done < <(git ls-files -z --others --exclude-standard -- . ':(exclude).scratch')
