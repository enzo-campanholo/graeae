# 04: Unique member names per journey

Status: needs-triage
Blocked by: none

**What was seen:** journeys share one instance, so member names collide across journeys, and only review keeps them apart (`CODING_STANDARDS.md`, "Tests and docs").

**What to build:** a helper in `test/browser/app.ts` that hands each journey unique member names, or a registry it checks, so a collision fails at once.
