# Readings in the logs

Type: task
Status: claimed
Blocked by: none
Map: ../map.md

## Question

Not a decision: the work that lets later decisions rest on evidence from real evenings without the owner taking readings. Done by an agent alone.

Each tab's `stats` log line (built in `src/shared/log.ts`, read in `src/app/lib/media/stats.ts`) today carries direction, kind, mid, bitrate, packets lost, jitter, round trip and `limitedBy`. Add, on the sharer's side: the encoder's name (`encoderImplementation`), whether it is hardware (`powerEfficientEncoder`), the frame size and frame rate sent, the capture's surface and its size at each reading (`getSettings()`, not only at the start), `qualityLimitationResolutionChanges`, `targetBitrate`, Chrome's upload estimate (`availableOutgoingBitrate`), the codec, and key frames sent. On the watcher's side: the decoder's name where Chrome gives it, the frame size and frame rate received, freezes (`freezeCount`, `totalFreezesDuration`), key-frame requests (`pliCount`, `firCount`, `nackCount`), and the audio level of screen audio. Keep the line small: only fields that answer something this map asks. Keep `log.ts`'s rules on what is never logged.

Done when: the change is on `v1-build` with `pnpm test`, `pnpm typecheck` and `pnpm lint` passing; `graeae-test` runs it; and an agent has pulled one short `scripts/real-media/` share and watch (CLAUDE.md, Logs; the token by `request_secret`) and checked the new fields arrive. Record the version deployed, the fields and a sample line in the answer.
