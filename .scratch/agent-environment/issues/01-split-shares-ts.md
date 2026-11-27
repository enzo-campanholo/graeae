# 01: Split shares.ts along its seams

Status: needs-triage
Blocked by: none

**What was seen:** `src/instance/shares.ts` is 88 KB. Every ticket that touches sharing reads it whole or in 15 KB slices, and reviewers pull its diff the same way.

**What to build:** split it along its seams (watch, move, replacement, block, sweep) into modules small enough to read whole, with no behaviour change: `pnpm test` stays green.

An architecture ticket: start it with `/codebase-design`.
