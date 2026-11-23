# 61: A tab sends on one media connection and receives on another

**Status:** ready-for-agent

**Blocked by:** none

**Why:** tickets 57, 58 and 60 had one cause: a section the tab narrowed for sending was later reused by the media server for a watch. ADR 0005 splits the tab's one media connection in two, a sending connection and a receiving connection. This ticket builds that. It supersedes 60.

## What to build

**The socket** (`src/shared/socket/media.ts`):
- `connect`, `connected`, `unavailable`, `renewed` and `dropped` each name the connection they are about, `"sending"` or `"receiving"`.
- `restart`, `restarted`, `restart-refused`, `faltering` and `recovered` are about the sending connection only.
- A receiving connection that the browser gave up, or that is on the relay when its credential is renewed, is replaced by a new request, for example `{ type: "replace" }`. The instance makes a new receiving connection, pulls each of the tab's watches onto it (`pulled`, in turn, as now), and then closes the old connection's pulls.
- `MediaState.connected` says which of the two the instance holds.

**The instance:**
- Add migration `0009`. `media_connection` is keyed by tab and purpose. A share names the tab's sending connection, a watch its receiving connection, and `usage_tab` holds the receiving connection's totals.
  - The migration drops the connections, shares and watches on record, since v1 is not released (ADR 0005, "No compatibility").
  - Test it as CLAUDE.md's Migrations section says.
- `shares.ts`:
  - `connect` takes a purpose.
  - `start` needs the sending connection.
  - a watch, a move and a quality change need the receiving connection.
  - `pull` goes from the sharer's sending connection to the watcher's receiving one.
  - the sweep, `letGo` and `recordedTabs` work per connection.
- `faltering.ts` and the 30-second rule: sending connection only.
- `usage.ts`: unchanged in what it does, but reset by a replacement of the receiving connection, not by a restart.

**The tab:**
- `MediaClient` (`client.ts`, `browser.ts`, `fake.ts`) holds two `RTCPeerConnection`s, each made on first use and each with its own health.
- `offer`, `accept`, `restart`, `abandonRestart`, `restarted` and `notes` use the sending connection. `pull`, `received`, `drop` and `transport` use the receiving one.
- `reset` and `renew` take the connection they are about.
- `receiving.ts` and `keepReceivingCodecs` go. So does `pull`'s step from `inactive` to `recvonly` if the receiving connection no longer needs it. Check this in the loopback: it is set when Chrome answers inactive (`docs/media-server.md`).
- The room client makes the receiving connection on the first watch and the sending connection on the first share. It replaces the receiving connection where it restarts the connection today, when the receiving connection is the one in question.

**Tests:**
- Seam 1:
  - a tab that shares and watches holds two connections;
  - a pull goes between the right two;
  - a replacement pulls every watch again and closes the old pulls;
  - usage counts the receiving connection only;
  - the sweep and the cut-off cover both connections.
- Loopback (`test/loopback`):
  - Keep 57's four checks on the sending connection.
  - Replace 58's two checks (a share or a restart after a watch, then a watch) with one that runs ticket 60's order: watch, share, stop, share, stop, watch, all on one page. It should pass with no codec handling in the tab.
  - The stand-in's copy of the reused-section codec lists (`test/loopback/page/media-server.ts`) can go once nothing relies on it.
- Journeys: the fake media client's two connections.

**Docs:**
- In `.scratch/v1-build/spec.md`, update lines 172 to 184, 222, 235 to 237, 279 to 281, 313 to 314, 320 to 321 and 328 to 332 to the two connections. Add a "Superseded along the way" entry for the one connection.
- In `docs/media-server.md`, say which behaviours still matter: reuse and codec lists now matter only on the sending connection, where nothing is watched. The rebuilt transport (57) and the failed close still matter.
- Update `client.ts`'s header and `media.ts`'s header.

## Done when

- `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
- Deploy to `graeae-test` and run the real-media check: with `scripts/real-media/repro-59.ts`, `--steps "cam share share cam" --runs 3` and `--steps "share share screen" --runs 2` both exit 0. Then run `repro-58.ts` (`share watch share watch`) once. Invite the members into files and remove them afterwards (CLAUDE.md).
- Run `pnpm perf` and confirm no move flashes a loading state. A first share after watching now waits on one more `sessions/new`.

## Not yet known

- Whether the media server answers a pull on a receiving connection with no tab offer at all as it answers the first watch now: a new section with its own five codecs, sent on 125. Ticket 59 saw it for a first watch. The real-media check above covers later ones.
- How long a replacement leaves a watched picture blank, on the relay at an 11-hour renewal. Measure it with `pnpm real-media` once; if it is over 2 seconds, record it here.
