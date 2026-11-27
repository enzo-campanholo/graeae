# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a plain `Status: <role>` line near the top of each issue file (see `triage-labels.md` for the role strings), and blocking as a plain `Blocked by:` line; the pre-commit hook checks both.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Closing a ticket

The owner's standing instruction for every ticket that changes the app: deploy, check, clean up and
close, without asking first. A ticket that changes only docs or research skips steps 1 and 2.

1. Deploy to the test instance: `pnpm run deploy --name graeae-test --wait`. It returns once the
   instance serves the new release.
2. Run each real-media check the ticket names (`pnpm real-media`, or its `repro-NN.ts`).
3. Clean up: remove every member you invited (`pnpm as-owner remove <name>`), stop every process you
   started, and delete your scratch branches and worktrees.
4. Write the handoff under `## Comments`: what changed, how it was checked, the deployed version
   (the `Current Version ID` the deploy printed) and what is left.
5. Set `Status:`. Use `resolved` once every criterion in the ticket is checked. A criterion only the owner
   can check (a second machine, a Windows browser, a device in hand) goes under `## Not yet known`
   with the exact steps, and the ticket becomes `ready-for-human`.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
