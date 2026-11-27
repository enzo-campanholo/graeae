#!/usr/bin/env bash
# `bash scripts/check-tickets.sh <file>…`: checks the triage lines of each ticket among the
# files given (`.scratch/<feature>/issues/*.md`; other files are skipped). A ticket has
# exactly one plain `Status: <role>` line, and no bold `**Status:**`, `**Blocked by:**` or
# `**Type:**` line. The form is documented in docs/agents/issue-tracker.md, the roles in
# docs/agents/triage-labels.md. Prints `<file>: <problem>` for each failure and exits 1 if
# any. The pre-commit hook runs it on the staged files.
set -euo pipefail

status='^Status: (needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix|claimed|resolved)( .*)?$'
failed=0
for file in "$@"; do
  [[ $file == .scratch/*/issues/*.md ]] || continue
  [ -f "$file" ] || continue
  count=$(grep -c -E "$status" "$file" || true)
  if [ "$count" -ne 1 ]; then
    echo "$file: has $count Status lines; it needs exactly one 'Status: <role>' (docs/agents/triage-labels.md)"
    failed=1
  fi
  while IFS= read -r line; do
    echo "$file: bold triage line '$line'; write it plain, as 'Status: …', 'Blocked by: …', 'Type: …'"
    failed=1
  done < <(grep -E '^\*\*(Status|Blocked by|Type):\*\*' "$file" || true)
done
exit "$failed"
